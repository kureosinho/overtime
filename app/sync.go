package main

import (
	"bufio"
	"context"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/dank/rlapi"
	ps "github.com/mitchellh/go-ps"
)

type SyncState struct {
	Running      bool   `json:"running"`
	LastSync     int64  `json:"lastSync"`
	LastResult   string `json:"lastResult"`
	LastError    string `json:"lastError"`
	GameRunning  bool   `json:"gameRunning"`
	NewMatches   int    `json:"newMatches"`
	HistoryCount int    `json:"historyCount"`
	VersionUsed  string `json:"versionUsed"`
	DemosFolder  string `json:"demosFolder"`
}

type Syncer struct {
	store   *Store
	auth    *Auth
	mu      sync.Mutex
	state   SyncState
	trigger chan bool
	wasGame bool
}

func NewSyncer(s *Store, a *Auth) *Syncer {
	return &Syncer{store: s, auth: a, trigger: make(chan bool, 1)}
}

func (y *Syncer) State() SyncState {
	y.mu.Lock()
	defer y.mu.Unlock()
	return y.state
}

func (y *Syncer) set(fn func(*SyncState)) {
	y.mu.Lock()
	fn(&y.state)
	y.mu.Unlock()
}

// Trigger demande une synchro immédiate. force = ignorer le jeu lancé.
func (y *Syncer) Trigger(force bool) {
	select {
	case y.trigger <- force:
	default:
	}
}

func (y *Syncer) Loop() {
	first := true
	for {
		force := false
		interval := time.Duration(y.store.Settings().SyncIntervalMinutes) * time.Minute
		if first {
			interval = 2 * time.Second
			first = false
		}
		select {
		case force = <-y.trigger:
		case <-time.After(interval):
		}
		// la boucle surveille aussi le jeu toutes les 20 s pour synchroniser dès sa fermeture
		y.runOnce(force)
	}
}

func (y *Syncer) GameWatch() {
	for {
		running := isGameRunning()
		y.set(func(s *SyncState) { s.GameRunning = running })
		if y.wasGame && !running {
			log.Println("Rocket League fermé -> synchro")
			time.Sleep(20 * time.Second) // laisser le serveur enregistrer la dernière game
			y.Trigger(false)
		}
		y.wasGame = running
		time.Sleep(15 * time.Second)
	}
}

func (y *Syncer) runOnce(force bool) {
	y.mu.Lock()
	if y.state.Running {
		y.mu.Unlock()
		return
	}
	y.state.Running = true
	y.mu.Unlock()
	defer y.set(func(s *SyncState) { s.Running = false })

	settings := y.store.Settings()
	if settings.ImportDemosFolder {
		y.importDemos()
	}

	if ok, _, _ := y.auth.LoggedIn(); !ok {
		y.set(func(s *SyncState) { s.LastResult = "Non connecté à Epic" })
		return
	}
	if isGameRunning() && !settings.SyncWhileGameRunning && !force {
		y.set(func(s *SyncState) {
			s.GameRunning = true
			s.LastResult = "Rocket League est lancé : synchro à la fermeture du jeu"
		})
		return
	}
	n, total, ver, err := y.syncPsyNet()
	y.set(func(s *SyncState) {
		s.LastSync = time.Now().Unix()
		s.VersionUsed = ver
		if err != nil {
			s.LastError = err.Error()
			s.LastResult = "Échec de la synchro"
			log.Println("sync:", err)
		} else {
			s.LastError = ""
			s.NewMatches = n
			s.HistoryCount = total
			s.LastResult = fmt.Sprintf("%d nouvelle(s) game(s)", n)
		}
	})
}

// ---------- Version du jeu ----------

type versionInfo struct {
	GameVersion string `json:"game_version"`
	FeatureSet  string `json:"feature_set"`
	BuildSecret string `json:"build_secret,omitempty"`
	From        string `json:"-"`
}

func rlDocumentsDirs() []string {
	home, _ := os.UserHomeDir()
	cands := []string{
		filepath.Join(home, "Documents", "My Games", "Rocket League", "TAGame"),
		filepath.Join(home, "OneDrive", "Documents", "My Games", "Rocket League", "TAGame"),
		filepath.Join(home, "OneDrive", "Documents", "My Games", "Rocket League", "TAGame"),
	}
	if od := os.Getenv("OneDrive"); od != "" {
		cands = append(cands, filepath.Join(od, "Documents", "My Games", "Rocket League", "TAGame"))
	}
	// OneDrive "Documents" localisé
	for _, m := range globAll(filepath.Join(home, "OneDrive*", "*", "My Games", "Rocket League", "TAGame")) {
		cands = append(cands, m)
	}
	out := []string{}
	seen := map[string]bool{}
	for _, c := range cands {
		if seen[c] {
			continue
		}
		seen[c] = true
		if st, err := os.Stat(c); err == nil && st.IsDir() {
			out = append(out, c)
		}
	}
	return out
}

func globAll(p string) []string { m, _ := filepath.Glob(p); return m }

func versionFromLaunchLog() (versionInfo, error) {
	var best versionInfo
	var bestTime time.Time
	for _, d := range rlDocumentsDirs() {
		p := filepath.Join(d, "Logs", "Launch.log")
		st, err := os.Stat(p)
		if err != nil || st.ModTime().Before(bestTime) {
			continue
		}
		f, err := os.Open(p)
		if err != nil {
			continue
		}
		var v versionInfo
		sc := bufio.NewScanner(f)
		sc.Buffer(make([]byte, 1024*1024), 1024*1024)
		for sc.Scan() {
			line := sc.Text()
			if strings.Contains(line, "GPsyonixBuildID") {
				parts := strings.Split(line, " ")
				if len(parts) == 3 && parts[1] == "GPsyonixBuildID" {
					v.GameVersion = parts[2]
				}
			}
			if strings.Contains(line, "Using feature set") {
				parts := strings.Split(line, " ")
				if len(parts) == 6 && parts[3] == "feature" && parts[4] == "set" {
					v.FeatureSet = parts[5]
				}
			}
		}
		f.Close()
		if v.GameVersion != "" && v.FeatureSet != "" {
			v.From = "Launch.log"
			best, bestTime = v, st.ModTime()
		}
	}
	if best.GameVersion == "" {
		return best, errors.New("Launch.log introuvable")
	}
	return best, nil
}

func fetchRemoteVersion() (versionInfo, error) {
	var v versionInfo
	c := &http.Client{Timeout: 10 * time.Second}
	resp, err := c.Get("https://lexore.ca/rocky/api/rockpload/game-version")
	if err != nil {
		return v, err
	}
	defer resp.Body.Close()
	err = json.NewDecoder(resp.Body).Decode(&v)
	v.From = "serveur communautaire"
	return v, err
}

func (y *Syncer) versionCandidates() []versionInfo {
	st := y.store.Settings()
	def := rlapi.NewPsyNet()
	gv, fs := def.GetVersion()
	secret := def.GetBuildSecret()
	if st.BuildSecret != "" {
		secret = st.BuildSecret
	}
	var out []versionInfo
	if st.GameVersion != "" && st.FeatureSet != "" {
		out = append(out, versionInfo{st.GameVersion, st.FeatureSet, secret, "réglages"})
	}
	if v, err := versionFromLaunchLog(); err == nil {
		v.BuildSecret = secret
		out = append(out, v)
	}
	out = append(out, versionInfo{gv, fs, secret, "rlapi"})
	return out
}

func newPsyNet(v versionInfo) *rlapi.PsyNet {
	p := rlapi.NewPsyNet()
	p.SetVersion(v.GameVersion, v.FeatureSet)
	if v.BuildSecret != "" {
		p.SetBuildSecret(v.BuildSecret)
	}
	return p
}

// ---------- Synchro PsyNet ----------

func (y *Syncer) connect() (*rlapi.PsyNetRPC, string, error) {
	tok, err := y.auth.ValidEOS()
	if err != nil {
		return nil, "", fmt.Errorf("connexion Epic expirée, reconnecte-toi (%v)", err)
	}
	_, name, _ := y.auth.LoggedIn()
	tried := y.versionCandidates()
	var lastErr error
	for _, v := range tried {
		rpc, err := newPsyNet(v).AuthPlayer(tok.AccessToken, tok.AccountID, name)
		if err == nil {
			return rpc, v.GameVersion + " (" + v.From + ")", nil
		}
		lastErr = err
		log.Printf("PsyNet avec version %s (%s): %v", v.GameVersion, v.From, err)
	}
	if y.store.Settings().UseRemoteVersion {
		if v, err := fetchRemoteVersion(); err == nil && v.GameVersion != "" {
			rpc, err := newPsyNet(v).AuthPlayer(tok.AccessToken, tok.AccountID, name)
			if err == nil {
				// on garde cette version pour la prochaine fois
				_ = y.store.UpdateSettings(func(s *Settings) {
					s.GameVersion, s.FeatureSet = v.GameVersion, v.FeatureSet
					if v.BuildSecret != "" {
						s.BuildSecret = v.BuildSecret
					}
				})
				return rpc, v.GameVersion + " (" + v.From + ")", nil
			}
			lastErr = err
		}
	}
	return nil, "", fmt.Errorf("impossible de se connecter aux serveurs Rocket League (une mise à jour du jeu a peut-être changé la version) : %v", lastErr)
}

func normID(id string) string {
	parts := strings.Split(id, "|")
	if len(parts) >= 2 {
		return parts[0] + "|" + parts[1]
	}
	return id
}

func (y *Syncer) syncPsyNet() (int, int, string, error) {
	rpc, ver, err := y.connect()
	if err != nil {
		return 0, 0, ver, err
	}
	defer rpc.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	hist, err := rpc.GetMatchHistory(ctx)
	if err != nil {
		return 0, 0, ver, fmt.Errorf("historique: %w", err)
	}
	newCount := 0
	for _, e := range hist {
		g := strings.ToUpper(strings.ReplaceAll(e.Match.MatchGUID, "-", ""))
		if g == "" || y.store.IsDeleted(g) {
			continue
		}
		raw, _ := json.Marshal(e.Match)
		_, existed := y.store.Get(g)
		if !existed {
			newCount++
		}
		_ = y.store.Upsert(g, func(m *MatchRecord) {
			m.Source = "psynet"
			m.History = raw
			if e.Match.RecordStartTimestamp > 0 {
				m.StartTime = e.Match.RecordStartTimestamp
			}
		})
		m, _ := y.store.Get(g)
		if m.ReplayStatus != "downloaded" && e.ReplayUrl != "" {
			fn := safeName(g) + ".replay"
			if err := downloadTo(e.ReplayUrl, filepath.Join(y.store.dir, "replays", fn)); err != nil {
				_ = y.store.Upsert(g, func(m *MatchRecord) { m.ReplayStatus = "failed"; m.ReplayError = err.Error() })
			} else {
				_ = y.store.Upsert(g, func(m *MatchRecord) { m.ReplayStatus = "downloaded"; m.ReplayFile = fn; m.ReplayError = "" })
			}
		}
	}

	// Qui suis-je ? -> l'identifiant présent dans toutes mes games
	y.detectMe()
	st := y.store.Settings()
	ids := append([]string{}, st.MyIDs...)
	if len(ids) == 0 {
		_, _, acc := y.auth.LoggedIn()
		ids = []string{string(rlapi.NewPlayerID(rlapi.PlatformEpic, acc))}
	}
	for _, id := range ids {
		pid := rlapi.PlayerID(id)
		if strings.Count(id, "|") == 1 {
			pid = rlapi.PlayerID(id + "|0")
		}
		ctx2, c2 := context.WithTimeout(context.Background(), 15*time.Second)
		sk, err := rpc.GetPlayerSkill(ctx2, pid)
		c2()
		if err == nil && sk != nil && len(sk.Skills) > 0 {
			raw, _ := json.Marshal(sk)
			_ = y.store.AddSkills(SkillSnapshot{Time: time.Now().Unix(), PlayerID: normID(id), Skills: raw})
			break
		}
	}
	return newCount, len(hist), ver, nil
}

// detectMe : l'identifiant joueur commun à (presque) toutes les games synchronisées.
func (y *Syncer) detectMe() {
	st := y.store.Settings()
	if st.MyIDsManual && len(st.MyIDs) > 0 {
		return
	}
	counts := map[string]int{}
	names := map[string]string{}
	total := 0
	for _, m := range y.store.All() {
		if len(m.History) == 0 {
			continue
		}
		var h rlapi.Match
		if json.Unmarshal(m.History, &h) != nil {
			continue
		}
		total++
		for _, p := range h.Players {
			id := normID(p.PlayerID)
			counts[id]++
			names[id] = p.PlayerName
		}
	}
	if total == 0 {
		return
	}
	type kv struct {
		k string
		v int
	}
	var arr []kv
	for k, v := range counts {
		arr = append(arr, kv{k, v})
	}
	sort.Slice(arr, func(i, j int) bool { return arr[i].v > arr[j].v })
	var ids []string
	for _, e := range arr {
		if float64(e.v) >= float64(total)*0.9 || (len(ids) == 0 && e.v == arr[0].v) {
			ids = append(ids, e.k)
		}
	}
	// Plusieurs candidats (ex : un coéquipier présent dans toutes les games) : priorité au compte Epic connecté
	if len(ids) > 1 {
		_, _, acc := y.auth.LoggedIn()
		mine := "Epic|" + acc
		for _, id := range ids {
			if id == mine {
				ids = []string{id}
				break
			}
		}
	}
	if len(ids) > 0 {
		if len(ids) == 1 {
			y.auth.SetDisplayName(names[ids[0]])
		}
		_ = y.store.UpdateSettings(func(s *Settings) { s.MyIDs = ids })
	}
}

func downloadTo(url, dest string) error {
	c := &http.Client{Timeout: 60 * time.Second}
	resp, err := c.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("téléchargement: %s", resp.Status)
	}
	tmp := dest + ".part"
	f, err := os.Create(tmp)
	if err != nil {
		return err
	}
	if _, err := io.Copy(f, resp.Body); err != nil {
		f.Close()
		return err
	}
	f.Close()
	return os.Rename(tmp, dest)
}

// ---------- Import du dossier Demos (replays sauvegardés à la main) ----------

func (y *Syncer) importDemos() {
	dirs := rlDocumentsDirs()
	maxAge := y.store.Settings().ImportMaxAgeDays
	for _, d := range dirs {
		demos := filepath.Join(d, "Demos")
		y.set(func(s *SyncState) { s.DemosFolder = demos })
		entries, err := os.ReadDir(demos)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if e.IsDir() || !strings.HasSuffix(strings.ToLower(e.Name()), ".replay") {
				continue
			}
			info, err := e.Info()
			if err != nil {
				continue
			}
			key := fmt.Sprintf("%s|%d", e.Name(), info.Size())
			if y.store.IsImported(key) || y.store.IsDeleted(key) {
				continue
			}
			if maxAge > 0 && time.Since(info.ModTime()) > time.Duration(maxAge)*24*time.Hour {
				continue // trop ancien : on ne l'importe pas (sans le marquer, pour pouvoir changer d'avis)
			}
			src := filepath.Join(demos, e.Name())
			if guid, err := y.ImportReplayFile(src, "Demos"); err == nil {
				_ = y.store.MarkImported(key, guid)
			}
		}
	}
}

func (y *Syncer) ImportReplayFile(src, from string) (string, error) {
	b, err := os.ReadFile(src)
	if err != nil {
		return "", err
	}
	return y.ImportReplayBytes(b, from, filepath.Base(src), modTime(src))
}

func modTime(p string) int64 {
	if st, err := os.Stat(p); err == nil {
		return st.ModTime().Unix()
	}
	return time.Now().Unix()
}

func (y *Syncer) ImportReplayBytes(b []byte, from, name string, when int64) (string, error) {
	if len(b) < 100 {
		return "", errors.New("fichier trop petit")
	}
	h := sha1.Sum(b)
	guid := "LOCAL-" + strings.ToUpper(hex.EncodeToString(h[:8]))
	if _, ok := y.store.Get(guid); ok {
		return guid, nil
	}
	if y.store.IsDeleted(guid) && from == "Demos" {
		return guid, nil
	}
	fn := safeName(guid) + ".replay"
	if err := os.WriteFile(filepath.Join(y.store.dir, "replays", fn), b, 0o644); err != nil {
		return "", err
	}
	err := y.store.Upsert(guid, func(m *MatchRecord) {
		m.Source = "local"
		m.ReplayFile = fn
		m.ReplayStatus = "downloaded"
		m.StartTime = when
		m.LocalSource = from + ": " + name
	})
	return guid, err
}

func isGameRunning() bool {
	procs, err := ps.Processes()
	if err != nil {
		return false
	}
	for _, p := range procs {
		if strings.EqualFold(p.Executable(), "RocketLeague.exe") {
			return true
		}
	}
	return false
}
