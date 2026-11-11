package main

import (
	"errors"
	"fmt"
	"log"
	"path/filepath"
	"sync"
	"time"

	"github.com/dank/rlapi"
)

// Gestion de la connexion au compte Epic (jetons EGS / EOS), sauvegardés dans auth.json.

type savedAuth struct {
	EGSRefresh        string `json:"egsRefresh,omitempty"`
	EGSRefreshExpires string `json:"egsRefreshExpires,omitempty"`
	EOSRefresh        string `json:"eosRefresh,omitempty"`
	EOSRefreshExpires string `json:"eosRefreshExpires,omitempty"`
	AccountID         string `json:"accountId,omitempty"`
	DisplayName       string `json:"displayName,omitempty"`
}

type Auth struct {
	mu     sync.Mutex
	path   string
	egs    *rlapi.EGS
	saved  savedAuth
	eos    *rlapi.EOSTokenResponse
	device *rlapi.DeviceAuthResponse
	devErr string
	devOK  bool
}

func NewAuth(dir string) *Auth {
	a := &Auth{path: filepath.Join(dir, "auth.json"), egs: rlapi.NewEGS()}
	readJSON(a.path, &a.saved)
	return a
}

func (a *Auth) save() {
	if err := writeJSONAtomic(a.path, a.saved); err != nil {
		log.Println("auth save:", err)
	}
}

func (a *Auth) LoggedIn() (bool, string, string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	ok := a.saved.EGSRefresh != "" || a.saved.EOSRefresh != ""
	return ok, a.saved.DisplayName, a.saved.AccountID
}

func (a *Auth) Logout() {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.eos != nil {
		_ = a.egs.RevokeEOSToken(a.eos.AccessToken)
	}
	a.saved = savedAuth{}
	a.eos = nil
	a.save()
}

func (a *Auth) setEOS(t *rlapi.EOSTokenResponse) {
	a.eos = t
	a.saved.EOSRefresh = t.RefreshToken
	a.saved.EOSRefreshExpires = t.RefreshExpiresAt
	if t.AccountID != "" {
		a.saved.AccountID = t.AccountID
	}
	a.save()
}

// --- Connexion par code d'autorisation (copier/coller) ---

func (a *Auth) AuthURL() string { return a.egs.GetAuthURL() }

func (a *Auth) LoginWithCode(code string) error {
	tok, err := a.egs.AuthenticateWithCode(code)
	if err != nil {
		return err
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	a.saved.EGSRefresh = tok.RefreshToken
	a.saved.AccountID = tok.AccountID
	a.saved.DisplayName = tok.DisplayName
	if err := a.eosFromEGSLocked(tok.AccessToken); err != nil {
		return err
	}
	a.save()
	return nil
}

func (a *Auth) eosFromEGSLocked(egsAccess string) error {
	ex, err := a.egs.GetExchangeCode(egsAccess)
	if err != nil {
		return fmt.Errorf("échange EGS: %w", err)
	}
	eos, err := a.egs.ExchangeEOSToken(ex)
	if err != nil {
		return fmt.Errorf("jeton EOS: %w", err)
	}
	a.setEOS(eos)
	return nil
}

// --- Connexion par appareil (code à saisir sur epicgames.com) ---

func (a *Auth) StartDevice() (*rlapi.DeviceAuthResponse, error) {
	d, err := a.egs.AuthenticateWithDevice()
	if err != nil {
		return nil, err
	}
	a.mu.Lock()
	a.device, a.devErr, a.devOK = d, "", false
	a.mu.Unlock()
	go func(dev *rlapi.DeviceAuthResponse) {
		tok, err := a.egs.WaitForDeviceAuthorization(dev)
		a.mu.Lock()
		defer a.mu.Unlock()
		if a.device != dev {
			return
		}
		if err != nil {
			a.devErr = err.Error()
			return
		}
		a.setEOS(tok)
		a.devOK = true
	}(d)
	return d, nil
}

func (a *Auth) DeviceStatus() (pending bool, ok bool, errMsg string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.device != nil && !a.devOK && a.devErr == "", a.devOK, a.devErr
}

// ValidEOS renvoie un jeton EOS valide (rafraîchi si besoin).
func (a *Auth) ValidEOS() (*rlapi.EOSTokenResponse, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.eos != nil {
		if exp, err := time.Parse(time.RFC3339, a.eos.ExpiresAt); err == nil && time.Now().Add(2*time.Minute).Before(exp) {
			return a.eos, nil
		}
	}
	var lastErr error
	if a.saved.EOSRefresh != "" {
		t, err := a.egs.RefreshEOSToken(a.saved.EOSRefresh)
		if err == nil {
			a.setEOS(t)
			return a.eos, nil
		}
		lastErr = err
	}
	if a.saved.EGSRefresh != "" {
		tok, err := a.egs.AuthenticateWithRefreshToken(a.saved.EGSRefresh)
		if err == nil {
			a.saved.EGSRefresh = tok.RefreshToken
			if tok.DisplayName != "" {
				a.saved.DisplayName = tok.DisplayName
			}
			if err := a.eosFromEGSLocked(tok.AccessToken); err == nil {
				return a.eos, nil
			} else {
				lastErr = err
			}
		} else {
			lastErr = err
		}
	}
	if lastErr == nil {
		lastErr = errors.New("non connecté")
	}
	return nil, lastErr
}

func (a *Auth) SetDisplayName(n string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if n != "" && a.saved.DisplayName != n {
		a.saved.DisplayName = n
		a.save()
	}
}
