package main

import (
	"embed"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

//go:embed web
var webFS embed.FS

const appVersion = "2.6.0"

var mobileMode bool

func main() {
	port := flag.Int("port", 51283, "port local de l'interface")
	noBrowser := flag.Bool("nobrowser", false, "ne pas ouvrir la fenêtre")
	background := flag.Bool("background", false, "démarrage silencieux (au lancement de Windows)")
	dataFlag := flag.String("data", "", "dossier de données")
	mobileFlag := flag.Bool("mobile", false, "mode téléphone : uniquement les matchs pros")
	flag.Parse()

	dir := dataDir()
	if *dataFlag != "" {
		dir = *dataFlag
	}
	_ = os.MkdirAll(dir, 0o755)
	if lf, err := os.OpenFile(filepath.Join(dir, "app.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644); err == nil {
		log.SetOutput(io.MultiWriter(lf, os.Stderr))
	}
	log.Printf("Overtime %s - données: %s", appVersion, dir)

	url := fmt.Sprintf("http://127.0.0.1:%d/", *port)
	addr := fmt.Sprintf("127.0.0.1:%d", *port)
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		// déjà lancé : si c'est le même exe, on rouvre juste la fenêtre ;
		// sinon (nouvelle version), on remplace l'ancienne instance.
		if *background || sameInstance(url) {
			log.Println("déjà lancé, ouverture de la fenêtre")
			if !*background {
				openWindow(url)
			}
			return
		}
		log.Println("autre version en cours, remplacement")
		ln = takeOver(url, addr)
		if ln == nil {
			openWindow(url)
			return
		}
	}

	store, err := OpenStore(dir)
	if err != nil {
		log.Fatal(err)
	}
	auth := NewAuth(dir)
	// premier lancement : raccourci sur le bureau
	exePath, _ := os.Executable()
	mobileMode = *mobileFlag
	if *mobileFlag {
		*noBrowser = true
	}
	if !mobileMode && runtime.GOOS == "windows" && (!store.Settings().ShortcutCreated || store.Settings().ShortcutTarget != exePath) {
		go func() {
			if err := createShortcut(); err != nil {
				log.Println("raccourci bureau:", err)
				return
			}
			_ = store.UpdateSettings(func(s *Settings) { s.ShortcutCreated = true; s.ShortcutTarget = exePath })
		}()
	}
	syncer := NewSyncer(store, auth)
	if !mobileMode {
		go syncer.Loop()
		go syncer.GameWatch()
	}

	sub, _ := fs.Sub(webFS, "web")
	pro := NewPro(store)
	go pro.Loop()
	pro.Trigger()
	api := &API{store: store, auth: auth, sync: syncer, url: url, pro: pro}
	mux := http.NewServeMux()
	api.Routes(mux)
	mux.Handle("/", noCache(http.FileServer(http.FS(sub))))

	srv := &http.Server{Handler: mux, ReadHeaderTimeout: 10 * time.Second}
	if !*noBrowser && !*background {
		go func() {
			time.Sleep(300 * time.Millisecond)
			openWindow(url)
		}()
	}
	log.Fatal(srv.Serve(ln))
}

var exeOnce = func() string { p, _ := os.Executable(); return p }()

func exePathCached() string { return exeOnce }

// sameInstance : l'instance en cours tourne-t-elle depuis le même exe ?
func sameInstance(url string) bool {
	c := &http.Client{Timeout: 2 * time.Second}
	resp, err := c.Get(url + "api/state")
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	var st struct {
		Version string `json:"version"`
		Exe     string `json:"exe"`
	}
	if json.NewDecoder(resp.Body).Decode(&st) != nil {
		return false
	}
	return st.Exe != "" && strings.EqualFold(st.Exe, exeOnce) && st.Version == appVersion
}

// takeOver demande à l'ancienne instance de se fermer puis reprend le port.
func takeOver(url, addr string) net.Listener {
	c := &http.Client{Timeout: 2 * time.Second}
	if resp, err := c.Post(url+"api/quit", "application/json", nil); err == nil {
		resp.Body.Close()
	}
	for i := 0; i < 25; i++ {
		time.Sleep(200 * time.Millisecond)
		if ln, err := net.Listen("tcp", addr); err == nil {
			return ln
		}
	}
	return nil
}

func noCache(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if filepath.Ext(r.URL.Path) == ".wasm" {
			w.Header().Set("Content-Type", "application/wasm")
		}
		w.Header().Set("Cache-Control", "no-cache")
		h.ServeHTTP(w, r)
	})
}
