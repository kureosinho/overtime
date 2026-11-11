package main

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

type API struct {
	pro   *Pro
	store *Store
	auth  *Auth
	sync  *Syncer
	url   string
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(v)
}

func httpErr(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

// Protection basique : l'interface ne doit être appelée que depuis la page locale.
func (a *API) guard(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if o := r.Header.Get("Origin"); o != "" && !strings.HasPrefix(o, strings.TrimSuffix(a.url, "/")) {
			httpErr(w, 403, "origine refusée")
			return
		}
		h(w, r)
	}
}

func (a *API) Routes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/state", a.guard(a.state))
	mux.HandleFunc("POST /api/auth/device", a.guard(a.authDevice))
	mux.HandleFunc("GET /api/auth/device", a.guard(a.authDeviceStatus))
	mux.HandleFunc("GET /api/auth/url", a.guard(a.authURL))
	mux.HandleFunc("POST /api/auth/code", a.guard(a.authCode))
	mux.HandleFunc("POST /api/auth/logout", a.guard(a.logout))
	mux.HandleFunc("POST /api/sync", a.guard(a.syncNow))
	mux.HandleFunc("GET /api/matches", a.guard(a.listMatches))
	mux.HandleFunc("GET /api/matches/{guid}", a.guard(a.getMatch))
	mux.HandleFunc("DELETE /api/matches/{guid}", a.guard(a.deleteMatch))
	mux.HandleFunc("POST /api/matches/delete", a.guard(a.deleteMany))
	mux.HandleFunc("POST /api/deleted/clear", a.guard(a.clearDeleted))
	mux.HandleFunc("GET /api/replay/{guid}", a.guard(a.getReplay))
	mux.HandleFunc("GET /api/pending", a.guard(a.pending))
	mux.HandleFunc("POST /api/matches/{guid}/analysis", a.guard(a.postAnalysis))
	mux.HandleFunc("POST /api/matches/{guid}/analysis-error", a.guard(a.postAnalysisError))
	mux.HandleFunc("POST /api/import", a.guard(a.importUpload))
	mux.HandleFunc("GET /api/skills", a.guard(a.skills))
	mux.HandleFunc("GET /api/settings", a.guard(a.getSettings))
	mux.HandleFunc("POST /api/settings", a.guard(a.postSettings))
	mux.HandleFunc("POST /api/open", a.guard(a.open))
	mux.HandleFunc("POST /api/quit", a.guard(a.quit))
	mux.HandleFunc("POST /api/shortcut", a.guard(a.shortcut))
	a.proRoutes(mux)
}

func (a *API) state(w http.ResponseWriter, r *http.Request) {
	ok, name, acc := a.auth.LoggedIn()
	st := a.store.Settings()
	all := a.store.All()
	analyzed, pending := 0, 0
	for _, m := range all {
		if len(m.Analysis) > 0 {
			analyzed++
		} else if m.ReplayStatus == "downloaded" && m.AnalysisError == "" {
			pending++
		}
	}
	writeJSON(w, map[string]any{
		"version": appVersion,
		"mobile":  mobileMode,
		"exe":     exePathCached(),
		"auth":    map[string]any{"loggedIn": ok, "displayName": name, "accountId": acc},
		"sync":    a.sync.State(),
		"myIds":   st.MyIDs,
		"counts":  map[string]int{"matches": len(all), "analyzed": analyzed, "pending": pending},
		"dataDir": a.store.dir,
		"now":     time.Now().Unix(),
	})
}

func (a *API) authDevice(w http.ResponseWriter, r *http.Request) {
	d, err := a.auth.StartDevice()
	if err != nil {
		httpErr(w, 502, err.Error())
		return
	}
	uri := d.VerificationURI
	if uri == "" {
		uri = "https://www.epicgames.com/activate"
	}
	writeJSON(w, map[string]any{"userCode": d.UserCode, "verificationUri": uri, "expiresIn": d.ExpiresIn})
}

func (a *API) authDeviceStatus(w http.ResponseWriter, r *http.Request) {
	pending, ok, msg := a.auth.DeviceStatus()
	if ok {
		a.sync.Trigger(false)
	}
	writeJSON(w, map[string]any{"pending": pending, "ok": ok, "error": msg})
}

func (a *API) authURL(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]string{"url": a.auth.AuthURL()})
}

func (a *API) authCode(w http.ResponseWriter, r *http.Request) {
	var body struct{ Code string }
	_ = json.NewDecoder(r.Body).Decode(&body)
	code := strings.TrimSpace(body.Code)
	// accepte aussi le JSON complet copié depuis la page Epic
	if strings.Contains(code, "authorizationCode") {
		var j struct {
			AuthorizationCode string `json:"authorizationCode"`
		}
		if json.Unmarshal([]byte(code), &j) == nil {
			code = j.AuthorizationCode
		}
	}
	code = strings.Trim(code, `"' `)
	if code == "" {
		httpErr(w, 400, "code vide")
		return
	}
	if err := a.auth.LoginWithCode(code); err != nil {
		httpErr(w, 400, err.Error())
		return
	}
	a.sync.Trigger(false)
	writeJSON(w, map[string]bool{"ok": true})
}

func (a *API) logout(w http.ResponseWriter, r *http.Request) {
	a.auth.Logout()
	writeJSON(w, map[string]bool{"ok": true})
}

func (a *API) syncNow(w http.ResponseWriter, r *http.Request) {
	a.sync.Trigger(r.URL.Query().Get("force") == "1")
	writeJSON(w, map[string]bool{"ok": true})
}

// liteAnalysis retire les données lourdes (heatmaps, courbes) pour la liste.
func liteAnalysis(raw json.RawMessage) any {
	if len(raw) == 0 {
		return nil
	}
	var m map[string]any
	if json.Unmarshal(raw, &m) != nil {
		return nil
	}
	if ps, ok := m["players"].([]any); ok {
		for _, p := range ps {
			if pm, ok := p.(map[string]any); ok {
				delete(pm, "boostCurve")
			}
		}
	}
	return m
}

func analysisMatchGUID(raw json.RawMessage) string {
	var a struct {
		Meta struct {
			MatchGUID string `json:"matchGuid"`
		} `json:"meta"`
	}
	_ = json.Unmarshal(raw, &a)
	return strings.ToUpper(strings.ReplaceAll(a.Meta.MatchGUID, "-", ""))
}

func (a *API) listMatches(w http.ResponseWriter, r *http.Request) {
	all := a.store.All()
	psy := map[string]bool{}
	for _, m := range all {
		if m.Source == "psynet" {
			psy[m.GUID] = true
		}
	}
	out := make([]map[string]any, 0, len(all))
	for _, m := range all {
		if m.Source == "local" && len(m.Analysis) > 0 && psy[analysisMatchGUID(m.Analysis)] {
			continue // doublon d'une game déjà synchronisée
		}
		out = append(out, map[string]any{
			"guid": m.GUID, "source": m.Source, "startTime": m.StartTime, "replayStatus": m.ReplayStatus,
			"replayError": m.ReplayError, "analysisError": m.AnalysisError, "history": m.History,
			"analysis": liteAnalysis(m.Analysis), "localSource": m.LocalSource,
		})
	}
	writeJSON(w, out)
}

func (a *API) getMatch(w http.ResponseWriter, r *http.Request) {
	m, ok := a.store.Get(r.PathValue("guid"))
	if !ok {
		httpErr(w, 404, "game introuvable")
		return
	}
	writeJSON(w, m)
}

func (a *API) removeRec(m *MatchRecord) {
	keys := []string{}
	if len(m.Analysis) > 0 {
		keys = append(keys, analysisMatchGUID(m.Analysis))
	}
	a.store.Remove(m.GUID, keys...)
}

func (a *API) deleteMatch(w http.ResponseWriter, r *http.Request) {
	if m, ok := a.store.Get(r.PathValue("guid")); ok {
		a.removeRec(m)
	}
	writeJSON(w, map[string]bool{"ok": true})
}

// deleteMany : par liste, par date (avant), ou par source ("local" / "all")
func (a *API) deleteMany(w http.ResponseWriter, r *http.Request) {
	var body struct {
		GUIDs  []string `json:"guids"`
		Before int64    `json:"before"`
		Source string   `json:"source"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpErr(w, 400, err.Error())
		return
	}
	set := map[string]bool{}
	for _, g := range body.GUIDs {
		set[g] = true
	}
	n := 0
	for _, m := range a.store.All() {
		hit := set[m.GUID] ||
			(body.Before > 0 && m.StartTime > 0 && m.StartTime < body.Before) ||
			(body.Source == "all") || (body.Source != "" && body.Source == m.Source)
		if hit {
			a.removeRec(m)
			n++
		}
	}
	writeJSON(w, map[string]any{"ok": true, "deleted": n})
}

func (a *API) clearDeleted(w http.ResponseWriter, r *http.Request) {
	a.store.ClearDeleted()
	writeJSON(w, map[string]bool{"ok": true})
}

func (a *API) getReplay(w http.ResponseWriter, r *http.Request) {
	m, ok := a.store.Get(r.PathValue("guid"))
	if !ok {
		httpErr(w, 404, "game introuvable")
		return
	}
	p, err := a.store.ReplayPath(m)
	if err != nil {
		httpErr(w, 404, err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	http.ServeFile(w, r, p)
}

const analyzerVersion = 2

func (a *API) pending(w http.ResponseWriter, r *http.Request) {
	var out []string
	for _, m := range a.store.All() {
		if m.ReplayStatus == "downloaded" && m.AnalysisError == "" && (len(m.Analysis) == 0 || m.AnalyzerVer < analyzerVersion) {
			out = append(out, m.GUID)
		}
	}
	writeJSON(w, out)
}

func (a *API) postAnalysis(w http.ResponseWriter, r *http.Request) {
	g := r.PathValue("guid")
	m, ok := a.store.Get(g)
	if !ok {
		httpErr(w, 404, "game introuvable")
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 20<<20))
	if err != nil || !json.Valid(body) {
		httpErr(w, 400, "analyse invalide")
		return
	}
	var meta struct {
		Meta struct {
			StartEpoch int64 `json:"startEpoch"`
		} `json:"meta"`
	}
	_ = json.Unmarshal(body, &meta)
	mg := analysisMatchGUID(body)

	if m.Source == "local" && mg != "" && a.store.IsDeleted(mg) {
		a.store.Remove(g)
		writeJSON(w, map[string]any{"ok": true, "deleted": true})
		return
	}
	// Replay importé depuis Demos qui correspond à une game synchronisée : on fusionne
	if m.Source == "local" && mg != "" {
		if target := a.store.FindByMatchGUID(mg); target != nil && target.GUID != g {
			if len(target.Analysis) == 0 {
				_ = a.store.Upsert(target.GUID, func(t *MatchRecord) {
					t.Analysis, t.AnalyzerVer, t.AnalysisError = body, analyzerVersion, ""
					if t.ReplayStatus != "downloaded" {
						t.ReplayFile, t.ReplayStatus = m.ReplayFile, "downloaded"
					}
				})
			}
			a.store.Delete(g)
			writeJSON(w, map[string]any{"ok": true, "mergedInto": target.GUID})
			return
		}
	}
	_ = a.store.Upsert(g, func(t *MatchRecord) {
		t.Analysis, t.AnalyzerVer, t.AnalysisError = body, analyzerVersion, ""
		if t.Source == "local" && meta.Meta.StartEpoch > 0 {
			t.StartTime = meta.Meta.StartEpoch
		}
	})
	// Game synchronisée : on supprime les doublons importés depuis Demos
	if m.Source == "psynet" {
		for _, o := range a.store.All() {
			if o.Source == "local" && len(o.Analysis) > 0 && analysisMatchGUID(o.Analysis) == g {
				a.store.Delete(o.GUID)
			}
		}
	}
	writeJSON(w, map[string]bool{"ok": true})
}

func (a *API) postAnalysisError(w http.ResponseWriter, r *http.Request) {
	var body struct{ Error string }
	_ = json.NewDecoder(r.Body).Decode(&body)
	if body.Error == "" {
		body.Error = "erreur inconnue"
	}
	_ = a.store.Upsert(r.PathValue("guid"), func(t *MatchRecord) { t.AnalysisError = body.Error })
	writeJSON(w, map[string]bool{"ok": true})
}

func (a *API) importUpload(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(200 << 20); err != nil {
		httpErr(w, 400, err.Error())
		return
	}
	var guids []string
	for _, fh := range r.MultipartForm.File["files"] {
		f, err := fh.Open()
		if err != nil {
			continue
		}
		b, _ := io.ReadAll(f)
		f.Close()
		if g, err := a.sync.ImportReplayBytes(b, "Import", fh.Filename, time.Now().Unix()); err == nil {
			guids = append(guids, g)
		}
	}
	writeJSON(w, map[string]any{"ok": true, "guids": guids})
}

func (a *API) skills(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, a.store.Skills())
}

func (a *API) getSettings(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]any{"settings": a.store.Settings(), "autostart": autostartEnabled()})
}

func (a *API) postSettings(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Settings  *Settings `json:"settings"`
		Autostart *bool     `json:"autostart"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpErr(w, 400, err.Error())
		return
	}
	if body.Settings != nil {
		ns := *body.Settings
		_ = a.store.UpdateSettings(func(s *Settings) {
			ids := s.MyIDs
			sc, st, bk := s.ShortcutCreated, s.ShortcutTarget, s.BallchasingKey
			*s = ns
			s.ShortcutCreated, s.ShortcutTarget, s.BallchasingKey = sc, st, bk
			if len(ns.MyIDs) == 0 && !ns.MyIDsManual {
				s.MyIDs = ids
			}
			if s.SyncIntervalMinutes <= 0 {
				s.SyncIntervalMinutes = 3
			}
			if s.ImportMaxAgeDays < 0 {
				s.ImportMaxAgeDays = 0
			}
		})
	}
	if body.Autostart != nil {
		if err := setAutostart(*body.Autostart); err != nil {
			httpErr(w, 500, err.Error())
			return
		}
	}
	writeJSON(w, map[string]bool{"ok": true})
}

func (a *API) open(w http.ResponseWriter, r *http.Request) {
	var body struct{ URL string }
	_ = json.NewDecoder(r.Body).Decode(&body)
	if strings.HasPrefix(body.URL, "https://") {
		openExternal(body.URL)
	} else if body.URL == "data" {
		openExternal(a.store.dir)
	}
	writeJSON(w, map[string]bool{"ok": true})
}

func (a *API) shortcut(w http.ResponseWriter, r *http.Request) {
	if err := createShortcut(); err != nil {
		httpErr(w, 500, err.Error())
		return
	}
	writeJSON(w, map[string]bool{"ok": true})
}

func (a *API) quit(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]bool{"ok": true})
	go func() {
		time.Sleep(200 * time.Millisecond)
		os.Exit(0)
	}()
}
