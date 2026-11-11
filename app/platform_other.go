//go:build !windows

package main

import (
	"errors"
	"os/exec"
)

func openWindow(url string)   { _ = exec.Command("xdg-open", url).Start() }
func openExternal(url string) { _ = exec.Command("xdg-open", url).Start() }
func setAutostart(on bool) error {
	return errors.New("disponible uniquement sous Windows")
}
func autostartEnabled() bool { return false }

func createShortcut() error { return errors.New("disponible uniquement sous Windows") }
