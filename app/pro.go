package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

// ---------- Matchs pros via Ballchasing ----------
// Un "tournoi" = un groupe Ballchasing racine. Son arbre (jours > séries > games) est enregistré,
// chaque replay est téléchargé puis analysé par le même moteur que tes games.

type ProNode struct {
	ID       string     `json:"id"`
	Name     string     `json:"name"`
	Children []*ProNode `json:"children,omitempty"`
	Replays  []string   `json:"replays,omitempty"`
}

type ProTournament struct {
	ID       string   `json:"id"`
	URL      string   `json:"url"`
	Name     string   `json:"name"`
	AddedAt  int64    `json:"addedAt"`
	LastSync int64    `json:"lastSync"`
	Error    string   `json:"error,omitempty"`
	Tree     *ProNode `json:"tree,omitempty"`
}

type ProMatch struct {
	ID            string          `json:"id"`
	Tournament    string          `json:"tournament"`
	Path          []string        `json:"path"`   // noms : Jour 1 > KC vs GK
	Series        string          `json:"series"` // id du groupe série
	Info          json.RawMessage `json:"info"`   // entrée de la liste Ballchasing (titre, date, équipes, joueurs)
	Date          int64           `json:"date"`
	ReplayFile    string          `json:"replayFile,omitempty"`
	ReplayStatus  string          `json:"replayStatus"` // none | downloaded | failed
	ReplayError   string          `json:"replayError,omitempty"`
	BCStats       json.RawMessage `json:"bcStats,omitempty"` // repli : stats calculées par Ballchasing
	Analysis      json.RawMessage `json:"analysis,omitempty"`
	AnalysisError string          `json:"analysisError,omitempty"`
	AnalyzerVer   int             `json:"analyzerVersion,omitempty"`
}

type Pro struct {
	mu      sync.RWMutex
	dir     string
	store   *Store
	tours   map[string]*ProTournament
	matches map[string]*ProMatch
	running bool
	status  string
	trigger chan bool
	last    time.Time
}

func NewPro(store *Store) *Pro {
	p := &Pro{dir: filepath.Join(store.dir, "pro"), store: store, tours: map[string]*ProTournament{}, matches: map[string]*ProMatch{}, trigger: make(chan bool, 1)}
	for _, d := range []string{p.dir, filepath.Join(p.dir, "matches"), filepath.Join(p.dir, "replays")} {
		_ = os.MkdirAll(d, 0o755)
	}
	readJSON(filepath.Join(p.dir, "tournaments.json"), &p.tours)
	if p.tours == nil {
		p.tours = map[string]*ProTournament{}
	}
	entries, _ := os.ReadDir(filepath.Join(p.dir, "matches"))
	for _, e := range entries {
		var m ProMatch
		readJSON(filepath.Join(p.dir, "matches", e.Name()), &m)
		if m.ID != "" {
			p.matches[m.ID] = &m
		}
	}
	return p
}

func (p *Pro) saveTours() { _ = writeJSONAtomic(filepath.Join(p.dir, "tournaments.json"), p.tours) }
func (p *Pro) saveMatch(m *ProMatch) {
	_ = writeJSONAtomic(filepath.Join(p.dir, "matches", safeName(m.ID)+".json"), m)
}

var groupIDRe = regexp.MustCompile(`[a-z0-9-]+-[a-z0-9]{10}`)

func parseGroupID(s string) string {
	s = strings.TrimSpace(s)
	if u, err := url.Parse(s); err == nil && u.Host != "" {
		parts := strings.Split(strings.Trim(u.Path, "/"), "/")
		if len(parts) >= 2 && parts[0] == "group" {
			return parts[1]
		}
	}
	if groupIDRe.MatchString(s) {
		return groupIDRe.FindString(s)
	}
	return ""
}

// ---------- Client Ballchasing ----------

var bcHTTP = &http.Client{Timeout: 60 * time.Second}

func (p *Pro) bcGet(path string) (*http.Response, error) {
	key := strings.TrimSpace(p.store.Settings().BallchasingKey)
	if key == "" {
		return nil, errors.New("clé API Ballchasing manquante (Réglages)")
	}
	for attempt := 0; attempt < 6; attempt++ {
		// ~2 requêtes par seconde maximum
		if wait := 600*time.Millisecond - time.Since(p.last); wait > 0 {
			time.Sleep(wait)
		}
		p.last = time.Now()
		base := "https://ballchasing.com/api"
		if b := os.Getenv("OVERTIME_BC_BASE"); b != "" {
			base = b // tests
		}
		req, _ := http.NewRequest("GET", base+path, nil)
		req.Header.Set("Authorization", key)
		req.Header.Set("User-Agent", "Overtime/"+appVersion)
		resp, err := bcHTTP.Do(req)
		if err != nil {
			return nil, err
		}
		if resp.StatusCode == 429 {
			resp.Body.Close()
			time.Sleep(time.Duration(2+attempt*3) * time.Second)
			continue
		}
		if resp.StatusCode == 401 || resp.StatusCode == 403 {
			b, _ := io.ReadAll(io.LimitReader(resp.Body, 500))
			resp.Body.Close()
			return nil, fmt.Errorf("Ballchasing refuse l'accès (%d) : %s", resp.StatusCode, strings.TrimSpace(string(b)))
		}
		if resp.StatusCode >= 300 {
			b, _ := io.ReadAll(io.LimitReader(resp.Body, 500))
			resp.Body.Close()
			return nil, fmt.Errorf("Ballchasing %d : %s", resp.StatusCode, strings.TrimSpace(string(b)))
		}
		return resp, nil
	}
	return nil, errors.New("Ballchasing : trop de requêtes, réessaie plus tard")
}

func (p *Pro) bcJSON(path string, v any) error {
	resp, err := p.bcGet(path)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return json.NewDecoder(resp.Body).Decode(v)
}

func (p *Pro) TestKey() (string, error) {
	var me struct {
		Name string `json:"name"`
		Type string `json:"type"`
	}
	if err := p.bcJSON("/", &me); err != nil {
		return "", err
	}
	return me.Name + " (" + me.Type + ")", nil
}

type bcList struct {
	List []json.RawMessage `json:"list"`
	Next string            `json:"next"`
}

func (p *Pro) bcListAll(path string) ([]json.RawMessage, error) {
	var out []json.RawMessage
	next := path
	for i := 0; next != "" && i < 30; i++ {
		var l bcList
		if err := p.bcJSON(next, &l); err != nil {
			return out, err
		}
		out = append(out, l.List...)
		next = ""
		if l.Next != "" {
			if u, err := url.Parse(l.Next); err == nil {
				next = strings.TrimPrefix(u.Path, "/api") + "?" + u.RawQuery
			}
		}
	}
	return out, nil
}

// ---------- Synchro ----------

func (p *Pro) Add(raw string) (*ProTournament, error) {
	id := parseGroupID(raw)
	if id == "" {
		return nil, errors.New("lien de groupe Ballchasing non reconnu (ex. : https://ballchasing.com/group/coupe-de-france-slash-2026-t1xa88me7e)")
	}
	p.mu.Lock()
	t, ok := p.tours[id]
	if !ok {
		t = &ProTournament{ID: id, URL: "https://ballchasing.com/group/" + id, Name: id, AddedAt: time.Now().Unix()}
		p.tours[id] = t
		p.saveTours()
	}
	p.mu.Unlock()
	p.Trigger()
	return t, nil
}

func (p *Pro) Remove(id string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	delete(p.tours, id)
	for mid, m := range p.matches {
		if m.Tournament == id {
			if m.ReplayFile != "" {
				_ = os.Remove(filepath.Join(p.dir, "replays", m.ReplayFile))
			}
			_ = os.Remove(filepath.Join(p.dir, "matches", safeName(mid)+".json"))
			delete(p.matches, mid)
		}
	}
	p.saveTours()
}

func (p *Pro) Trigger() {
	select {
	case p.trigger <- true:
	default:
	}
}

func (p *Pro) Loop() {
	for {
		select {
		case <-p.trigger:
		case <-time.After(20 * time.Minute):
		}
		p.syncAll()
	}
}

func (p *Pro) setStatus(s string) { p.mu.Lock(); p.status = s; p.mu.Unlock() }

func (p *Pro) syncAll() {
	p.mu.Lock()
	if p.running || len(p.tours) == 0 || p.store.Settings().BallchasingKey == "" {
		p.mu.Unlock()
		return
	}
	p.running = true
	ids := make([]string, 0, len(p.tours))
	for id := range p.tours {
		ids = append(ids, id)
	}
	p.mu.Unlock()
	defer func() { p.mu.Lock(); p.running = false; p.status = ""; p.mu.Unlock() }()
	for _, id := range ids {
		if err := p.syncTournament(id); err != nil {
			log.Println("pro sync", id, err)
			p.mu.Lock()
			if t := p.tours[id]; t != nil {
				t.Error = err.Error()
			}
			p.saveTours()
			p.mu.Unlock()
		}
	}
}

type bcGroup struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

func (p *Pro) walk(id, name string, depth int, path []string, tour string, seen map[string]bool) (*ProNode, error) {
	node := &ProNode{ID: id, Name: name}
	if depth > 6 {
		return node, nil
	}
	p.setStatus("Lecture de " + name)
	// sous-groupes
	subs, err := p.bcListAll("/groups?group=" + url.QueryEscape(id) + "&count=200")
	if err != nil {
		return node, err
	}
	var groups []bcGroup
	for _, raw := range subs {
		var g bcGroup
		if json.Unmarshal(raw, &g) == nil && g.ID != "" {
			groups = append(groups, g)
		}
	}
	sort.SliceStable(groups, func(i, j int) bool { return natLess(groups[i].Name, groups[j].Name) })
	for _, g := range groups {
		child, err := p.walk(g.ID, g.Name, depth+1, append(append([]string{}, path...), g.Name), tour, seen)
		if err != nil {
			return node, err
		}
		node.Children = append(node.Children, child)
	}
	// replays directs
	reps, err := p.bcListAll("/replays?group=" + url.QueryEscape(id) + "&count=200&sort-by=replay-date&sort-dir=asc")
	if err != nil {
		return node, err
	}
	for _, raw := range reps {
		var r struct {
			ID   string `json:"id"`
			Date string `json:"date"`
		}
		if json.Unmarshal(raw, &r) != nil || r.ID == "" {
			continue
		}
		node.Replays = append(node.Replays, r.ID)
		seen[r.ID] = true
		ts := int64(0)
		if t, err := time.Parse(time.RFC3339, r.Date); err == nil {
			ts = t.Unix()
		}
		p.mu.Lock()
		m, ok := p.matches[r.ID]
		if !ok {
			m = &ProMatch{ID: r.ID, ReplayStatus: "none"}
			p.matches[r.ID] = m
		}
		m.Tournament, m.Path, m.Series, m.Info, m.Date = tour, path, id, raw, ts
		p.saveMatch(m)
		p.mu.Unlock()
	}
	return node, nil
}

func (p *Pro) syncTournament(id string) error {
	var g struct {
		Name string `json:"name"`
	}
	if err := p.bcJSON("/groups/"+url.PathEscape(id), &g); err != nil {
		return err
	}
	seen := map[string]bool{}
	tree, err := p.walk(id, g.Name, 0, nil, id, seen)
	if err != nil {
		return err
	}
	p.mu.Lock()
	if t := p.tours[id]; t != nil {
		t.Name, t.Tree, t.LastSync, t.Error = g.Name, tree, time.Now().Unix(), ""
	}
	p.saveTours()
	var todo []*ProMatch
	for _, m := range p.matches {
		if m.Tournament == id && m.ReplayStatus != "downloaded" && len(m.BCStats) == 0 {
			todo = append(todo, m)
		}
	}
	p.mu.Unlock()

	for i, m := range todo {
		p.setStatus(fmt.Sprintf("Téléchargement des replays %d/%d", i+1, len(todo)))
		fn := safeName(m.ID) + ".replay"
		err := p.download(m.ID, filepath.Join(p.dir, "replays", fn))
		p.mu.Lock()
		if err == nil {
			m.ReplayFile, m.ReplayStatus, m.ReplayError = fn, "downloaded", ""
		} else {
			m.ReplayStatus, m.ReplayError = "failed", err.Error()
		}
		p.saveMatch(m)
		p.mu.Unlock()
		if err != nil {
			// repli : les stats déjà calculées par Ballchasing
			var raw json.RawMessage
			if e2 := p.bcJSON("/replays/"+url.PathEscape(m.ID), &raw); e2 == nil {
				p.mu.Lock()
				m.BCStats = raw
				p.saveMatch(m)
				p.mu.Unlock()
			}
		}
	}
	return nil
}

func (p *Pro) download(id, dest string) error {
	resp, err := p.bcGet("/replays/" + url.PathEscape(id) + "/file")
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	tmp := dest + ".part"
	f, err := os.Create(tmp)
	if err != nil {
		return err
	}
	n, err := io.Copy(f, resp.Body)
	f.Close()
	if err != nil {
		return err
	}
	if n < 1000 {
		return errors.New("fichier replay vide")
	}
	return os.Rename(tmp, dest)
}

// natLess : "Jour 2" < "Jour 10"
func natLess(a, b string) bool {
	re := regexp.MustCompile(`\d+`)
	na, nb := re.FindString(a), re.FindString(b)
	pa, pb := re.ReplaceAllString(a, "#"), re.ReplaceAllString(b, "#")
	if pa == pb && na != "" && nb != "" && len(na) != len(nb) {
		return len(na) < len(nb)
	}
	return a < b
}

// ---------- API ----------

func (p *Pro) State() map[string]any {
	p.mu.RLock()
	defer p.mu.RUnlock()
	tours := []*ProTournament{}
	for _, t := range p.tours {
		tours = append(tours, t)
	}
	sort.Slice(tours, func(i, j int) bool { return tours[i].AddedAt > tours[j].AddedAt })
	ms := make([]map[string]any, 0, len(p.matches))
	for _, m := range p.matches {
		ms = append(ms, map[string]any{
			"id": m.ID, "tournament": m.Tournament, "path": m.Path, "series": m.Series, "info": m.Info, "date": m.Date,
			"replayStatus": m.ReplayStatus, "replayError": m.ReplayError, "analysisError": m.AnalysisError,
			"analysis": liteAnalysis(m.Analysis), "bc": len(m.BCStats) > 0,
		})
	}
	return map[string]any{"hasKey": p.store.Settings().BallchasingKey != "", "running": p.running, "status": p.status, "tournaments": tours, "matches": ms}
}

func (p *Pro) Get(id string) (*ProMatch, bool) {
	p.mu.RLock()
	defer p.mu.RUnlock()
	m, ok := p.matches[id]
	if !ok {
		return nil, false
	}
	c := *m
	return &c, true
}

func (p *Pro) Pending() []string {
	p.mu.RLock()
	defer p.mu.RUnlock()
	out := []string{}
	for _, m := range p.matches {
		if m.ReplayStatus == "downloaded" && m.AnalysisError == "" && (len(m.Analysis) == 0 || m.AnalyzerVer < analyzerVersion) {
			out = append(out, m.ID)
		}
	}
	return out
}

func (p *Pro) SetAnalysis(id string, body json.RawMessage, errMsg string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	m, ok := p.matches[id]
	if !ok {
		return
	}
	if errMsg != "" {
		m.AnalysisError = errMsg
	} else {
		m.Analysis, m.AnalyzerVer, m.AnalysisError = body, analyzerVersion, ""
	}
	p.saveMatch(m)
}

func (a *API) proRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/pro", a.guard(func(w http.ResponseWriter, r *http.Request) { writeJSON(w, a.pro.State()) }))
	mux.HandleFunc("POST /api/pro/tournaments", a.guard(func(w http.ResponseWriter, r *http.Request) {
		var b struct{ URL string }
		_ = json.NewDecoder(r.Body).Decode(&b)
		t, err := a.pro.Add(b.URL)
		if err != nil {
			httpErr(w, 400, err.Error())
			return
		}
		writeJSON(w, t)
	}))
	mux.HandleFunc("DELETE /api/pro/tournaments/{id}", a.guard(func(w http.ResponseWriter, r *http.Request) {
		a.pro.Remove(r.PathValue("id"))
		writeJSON(w, map[string]bool{"ok": true})
	}))
	mux.HandleFunc("POST /api/pro/sync", a.guard(func(w http.ResponseWriter, r *http.Request) {
		a.pro.Trigger()
		writeJSON(w, map[string]bool{"ok": true})
	}))
	mux.HandleFunc("POST /api/pro/key", a.guard(func(w http.ResponseWriter, r *http.Request) {
		var b struct{ Key string }
		_ = json.NewDecoder(r.Body).Decode(&b)
		_ = a.store.UpdateSettings(func(s *Settings) { s.BallchasingKey = strings.TrimSpace(b.Key) })
		if strings.TrimSpace(b.Key) == "" {
			writeJSON(w, map[string]bool{"ok": true})
			return
		}
		who, err := a.pro.TestKey()
		if err != nil {
			httpErr(w, 400, err.Error())
			return
		}
		a.pro.Trigger()
		writeJSON(w, map[string]any{"ok": true, "account": who})
	}))
	mux.HandleFunc("GET /api/pro/pending", a.guard(func(w http.ResponseWriter, r *http.Request) { writeJSON(w, a.pro.Pending()) }))
	mux.HandleFunc("GET /api/pro/match/{id}", a.guard(func(w http.ResponseWriter, r *http.Request) {
		m, ok := a.pro.Get(r.PathValue("id"))
		if !ok {
			httpErr(w, 404, "match introuvable")
			return
		}
		writeJSON(w, m)
	}))
	mux.HandleFunc("GET /api/pro/replay/{id}", a.guard(func(w http.ResponseWriter, r *http.Request) {
		m, ok := a.pro.Get(r.PathValue("id"))
		if !ok || m.ReplayFile == "" {
			httpErr(w, 404, "replay introuvable")
			return
		}
		w.Header().Set("Content-Type", "application/octet-stream")
		http.ServeFile(w, r, filepath.Join(a.pro.dir, "replays", m.ReplayFile))
	}))
	mux.HandleFunc("POST /api/pro/match/{id}/analysis", a.guard(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 20<<20))
		if err != nil || !json.Valid(body) {
			httpErr(w, 400, "analyse invalide")
			return
		}
		a.pro.SetAnalysis(r.PathValue("id"), body, "")
		writeJSON(w, map[string]bool{"ok": true})
	}))
	mux.HandleFunc("POST /api/pro/match/{id}/analysis-error", a.guard(func(w http.ResponseWriter, r *http.Request) {
		var b struct{ Error string }
		_ = json.NewDecoder(r.Body).Decode(&b)
		if b.Error == "" {
			b.Error = "erreur inconnue"
		}
		a.pro.SetAnalysis(r.PathValue("id"), nil, b.Error)
		writeJSON(w, map[string]bool{"ok": true})
	}))
}
