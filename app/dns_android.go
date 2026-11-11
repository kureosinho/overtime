//go:build android

package main

import (
	"context"
	"net"
	"time"
)

// Sur Android, Go sans cgo ne trouve pas /etc/resolv.conf : on interroge
// directement des résolveurs publics.
func init() {
	servers := []string{"1.1.1.1:53", "8.8.8.8:53", "9.9.9.9:53"}
	net.DefaultResolver = &net.Resolver{
		PreferGo: true,
		Dial: func(ctx context.Context, network, _ string) (net.Conn, error) {
			d := net.Dialer{Timeout: 4 * time.Second}
			var err error
			for _, s := range servers {
				var c net.Conn
				if c, err = d.DialContext(ctx, "udp", s); err == nil {
					return c, nil
				}
			}
			return nil, err
		},
	}
}
