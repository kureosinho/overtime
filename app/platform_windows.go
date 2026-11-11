//go:build windows

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
)

func hidden(cmd *exec.Cmd) *exec.Cmd {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
	return cmd
}

// openWindow ouvre l'interface dans une fenêtre "application" (Edge/Chrome en mode app), sinon le navigateur par défaut.
func openWindow(url string) {
	cands := []string{
		filepath.Join(os.Getenv("ProgramFiles(x86)"), "Microsoft", "Edge", "Application", "msedge.exe"),
		filepath.Join(os.Getenv("ProgramFiles"), "Microsoft", "Edge", "Application", "msedge.exe"),
		filepath.Join(os.Getenv("ProgramFiles"), "Google", "Chrome", "Application", "chrome.exe"),
		filepath.Join(os.Getenv("ProgramFiles(x86)"), "Google", "Chrome", "Application", "chrome.exe"),
		filepath.Join(os.Getenv("LOCALAPPDATA"), "Google", "Chrome", "Application", "chrome.exe"),
	}
	for _, c := range cands {
		if _, err := os.Stat(c); err == nil {
			if exec.Command(c, "--app="+url, "--window-size=1440,920").Start() == nil {
				return
			}
		}
	}
	_ = hidden(exec.Command("rundll32", "url.dll,FileProtocolHandler", url)).Start()
}

func openExternal(url string) {
	_ = hidden(exec.Command("rundll32", "url.dll,FileProtocolHandler", url)).Start()
}

func setAutostart(on bool) error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	key := `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
	if on {
		return hidden(exec.Command("reg", "add", key, "/v", "RLTracker", "/t", "REG_SZ", "/d", `"`+exe+`" -background`, "/f")).Run()
	}
	return hidden(exec.Command("reg", "delete", key, "/v", "RLTracker", "/f")).Run()
}

// createShortcut crée (ou remplace) le raccourci Overtime sur le bureau, avec l'icône de l'exe.
func createShortcut() error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	q := func(s string) string { return strings.ReplaceAll(s, "'", "''") }
	ps := "$d=[Environment]::GetFolderPath('Desktop'); " +
		"$s=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $d 'Overtime.lnk')); " +
		"$s.TargetPath='" + q(exe) + "'; $s.WorkingDirectory='" + q(filepath.Dir(exe)) + "'; " +
		"$s.IconLocation='" + q(exe) + ",0'; $s.Description='Overtime - Rocket League'; $s.Save()"
	out, err := hidden(exec.Command("powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", ps)).CombinedOutput()
	if err != nil {
		return fmt.Errorf("%v: %s", err, strings.TrimSpace(string(out)))
	}
	return nil
}

func autostartEnabled() bool {
	err := hidden(exec.Command("reg", "query", `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, "/v", "RLTracker")).Run()
	return err == nil
}
