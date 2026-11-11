package main

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// MatchRecord est ce qu'on garde sur disque pour chaque game.
type MatchRecord struct {
	GUID          string          `json:"guid"`
	Source        string          `json:"source"` // "psynet" ou "local"
	AddedAt       int64           `json:"addedAt"`
	StartTime     int64           `json:"startTime"` // epoch secondes
	History       json.RawMessage `json:"history,omitempty"`
	ReplayFile    string          `json:"replayFile,omitempty"`
	ReplayStatus  string          `json:"replayStatus"` // none | downloaded | failed
	ReplayError   string          `json:"replayError,omitempty"`
	Analysis      json.RawMessage `json:"analysis,omitempty"`
	AnalysisError string          `json:"analysisError,omitempty"`
	AnalyzerVer   int             `json:"analyzerVersion,omitempty"`
	LocalSource   string          `json:"localSource,omitempty"`
}

type SkillSnapshot struct {
	Time     int64           `json:"time"`
	PlayerID string          `json:"playerId"`
	Skills   json.RawMessage `json:"skills"`
}

type Settings struct {
	SyncWhileGameRunning bool     `json:"syncWhileGameRunning"`
	SyncIntervalMinutes  int      `json:"syncIntervalMinutes"`
	ImportDemosFolder    bool     `json:"importDemosFolder"`
	UseRemoteVersion     bool     `json:"useRemoteVersion"`
	BuildSecret          string   `json:"buildSecret"`
	GameVersion          string   `json:"gameVersion"`
	FeatureSet           string   `json:"featureSet"`
	MyIDs                []string `json:"myIds"`
	MyIDsManual          bool     `json:"myIdsManual"`
	ImportMaxAgeDays     int      `json:"importMaxAgeDays"`
	ShortcutCreated      bool     `json:"shortcutCreated"`
	ShortcutTarget       string   `json:"shortcutTarget"`
	BallchasingKey       string   `json:"ballchasingKey"`
}

type Store struct {
	mu       sync.RWMutex
	dir      string
	matches  map[string]*MatchRecord
	skills   []SkillSnapshot
	settings Settings
	imported map[string]string // fichier Demos -> guid
	deleted  map[string]bool   // games supprimées (ne pas réimporter)
}

func defaultSettings() Settings {
	return Settings{SyncIntervalMinutes: 3, ImportDemosFolder: true, UseRemoteVersion: true, ImportMaxAgeDays: 30}
}

func dataDir() string {
	base := os.Getenv("LOCALAPPDATA")
	if base == "" {
		h, _ := os.UserHomeDir()
		base = filepath.Join(h, ".local", "share")
	}
	if d := os.Getenv("RLTRACKER_DATA"); d != "" {
		return d
	}
	return filepath.Join(base, "RLTracker")
}

func OpenStore(dir string) (*Store, error) {
	s := &Store{dir: dir, matches: map[string]*MatchRecord{}, settings: defaultSettings(), imported: map[string]string{}, deleted: map[string]bool{}}
	for _, d := range []string{dir, filepath.Join(dir, "matches"), filepath.Join(dir, "replays")} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			return nil, err
		}
	}
	entries, _ := os.ReadDir(filepath.Join(dir, "matches"))
	for _, e := range entries {
		if !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		b, err := os.ReadFile(filepath.Join(dir, "matches", e.Name()))
		if err != nil {
			continue
		}
		var m MatchRecord
		if json.Unmarshal(b, &m) == nil && m.GUID != "" {
			s.matches[m.GUID] = &m
		}
	}
	readJSON(filepath.Join(dir, "skills.json"), &s.skills)
	readJSON(filepath.Join(dir, "settings.json"), &s.settings)
	readJSON(filepath.Join(dir, "imported.json"), &s.imported)
	readJSON(filepath.Join(dir, "deleted.json"), &s.deleted)
	if s.deleted == nil {
		s.deleted = map[string]bool{}
	}
	if s.settings.SyncIntervalMinutes <= 0 {
		s.settings.SyncIntervalMinutes = 3
	}
	return s, nil
}

func readJSON(path string, v any) {
	b, err := os.ReadFile(path)
	if err == nil {
		_ = json.Unmarshal(b, v)
	}
}

func writeJSONAtomic(path string, v any) error {
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func safeName(guid string) string {
	r := strings.NewReplacer("/", "_", "\\", "_", ":", "_", "..", "_")
	return r.Replace(guid)
}

func (s *Store) saveMatchLocked(m *MatchRecord) error {
	return writeJSONAtomic(filepath.Join(s.dir, "matches", safeName(m.GUID)+".json"), m)
}

func (s *Store) Get(guid string) (*MatchRecord, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	m, ok := s.matches[guid]
	if !ok {
		return nil, false
	}
	c := *m
	return &c, true
}

func (s *Store) Upsert(guid string, fn func(m *MatchRecord)) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	m, ok := s.matches[guid]
	if !ok {
		m = &MatchRecord{GUID: guid, AddedAt: time.Now().Unix(), ReplayStatus: "none"}
		s.matches[guid] = m
	}
	fn(m)
	return s.saveMatchLocked(m)
}

func (s *Store) Delete(guid string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.matches, guid)
	_ = os.Remove(filepath.Join(s.dir, "matches", safeName(guid)+".json"))
}

// Remove supprime une game, son replay, et la met sur liste noire pour qu'elle ne revienne pas.
func (s *Store) Remove(guid string, extraKeys ...string) {
	s.mu.Lock()
	m, ok := s.matches[guid]
	if ok {
		if m.ReplayFile != "" {
			_ = os.Remove(filepath.Join(s.dir, "replays", m.ReplayFile))
		}
		delete(s.matches, guid)
		_ = os.Remove(filepath.Join(s.dir, "matches", safeName(guid)+".json"))
	}
	s.deleted[guid] = true
	for _, k := range extraKeys {
		if k != "" {
			s.deleted[k] = true
		}
	}
	_ = writeJSONAtomic(filepath.Join(s.dir, "deleted.json"), s.deleted)
	s.mu.Unlock()
}

func (s *Store) IsDeleted(key string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.deleted[key]
}

func (s *Store) ClearDeleted() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.deleted = map[string]bool{}
	_ = writeJSONAtomic(filepath.Join(s.dir, "deleted.json"), s.deleted)
}

func (s *Store) All() []*MatchRecord {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]*MatchRecord, 0, len(s.matches))
	for _, m := range s.matches {
		c := *m
		out = append(out, &c)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].StartTime > out[j].StartTime })
	return out
}

func (s *Store) FindByMatchGUID(g string) *MatchRecord {
	g = strings.ToUpper(strings.ReplaceAll(g, "-", ""))
	s.mu.RLock()
	defer s.mu.RUnlock()
	if m, ok := s.matches[g]; ok {
		c := *m
		return &c
	}
	return nil
}

func (s *Store) Settings() Settings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.settings
}

func (s *Store) UpdateSettings(fn func(*Settings)) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	fn(&s.settings)
	return writeJSONAtomic(filepath.Join(s.dir, "settings.json"), s.settings)
}

func (s *Store) AddSkills(snap SkillSnapshot) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if n := len(s.skills); n > 0 && string(s.skills[n-1].Skills) == string(snap.Skills) {
		return nil // rien de nouveau
	}
	s.skills = append(s.skills, snap)
	return writeJSONAtomic(filepath.Join(s.dir, "skills.json"), s.skills)
}

func (s *Store) Skills() []SkillSnapshot {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return append([]SkillSnapshot(nil), s.skills...)
}

func (s *Store) IsImported(key string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	_, ok := s.imported[key]
	return ok
}

func (s *Store) MarkImported(key, guid string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.imported[key] = guid
	return writeJSONAtomic(filepath.Join(s.dir, "imported.json"), s.imported)
}

func (s *Store) ReplayPath(m *MatchRecord) (string, error) {
	if m.ReplayFile == "" {
		return "", errors.New("pas de replay")
	}
	return filepath.Join(s.dir, "replays", m.ReplayFile), nil
}
