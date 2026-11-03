// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package middleware

// Adapted from ADK Go v2.6.0's internal/originguard. Keep Host checks separate
// from Origin checks: requests without Origin still need loopback protection.

import (
	"errors"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strings"
)

var ErrHostNotAllowed = errors.New("host not allowed")

var ErrOriginNotAllowed = errors.New("origin not allowed")

type OriginConfig struct {
	BindHost string

	AllowedOrigins []string
}

type OriginPolicy struct {
	allowAll        bool
	bindDeclared    bool
	boundToLoopback bool
	bindWildcard    bool
	origins         map[string]bool
	hosts           map[string]bool
}

func NewOriginPolicy(cfg OriginConfig) *OriginPolicy {
	p := &OriginPolicy{
		bindDeclared:    cfg.BindHost != "",
		boundToLoopback: cfg.BindHost != "" && isLoopbackAddr(cfg.BindHost),
		bindWildcard:    cfg.BindHost != "" && isWildcardAddr(cfg.BindHost),
		origins:         make(map[string]bool),
		hosts:           make(map[string]bool),
	}
	for _, raw := range cfg.AllowedOrigins {
		origin := strings.TrimSpace(raw)
		if origin == "" {
			continue
		}
		if origin == "*" {
			p.allowAll = true
			continue
		}
		origin = NormalizeOrigin(origin)
		p.origins[origin] = true
		if u, err := url.Parse(origin); err == nil && u.Hostname() != "" {
			p.hosts[bareHost(u.Hostname())] = true
		}
	}
	return p
}

func NormalizeOrigin(addr string) string {
	addr = strings.TrimSpace(addr)
	if addr == "" || addr == "*" {
		return addr
	}
	if !strings.Contains(addr, "://") {
		addr = "http://" + addr
	}
	u, err := url.Parse(addr)
	if err != nil || u.Host == "" {
		return addr
	}
	return strings.ToLower(u.Scheme) + "://" + strings.ToLower(u.Host)
}

func (p *OriginPolicy) Check(r *http.Request) error {
	if p.allowAll {
		return nil
	}
	if p.isDNSRebinding(r) {
		return ErrHostNotAllowed
	}
	if origin := firstHeaderValue(r, "Origin"); origin != "" && !p.originAllowed(r, origin) {
		return ErrOriginNotAllowed
	}
	return nil
}

const maxOriginLen = 2048

func (p *OriginPolicy) originAllowed(r *http.Request, rawOrigin string) bool {
	if len(rawOrigin) > maxOriginLen {
		return false
	}
	origin := NormalizeOrigin(rawOrigin)
	if p.origins[origin] {
		return true
	}
	if p.servesOnlyThisMachine(r) && !isLoopbackAddr(originHost(origin)) {
		return false
	}
	requestOrigin := effectiveRequestOrigin(r)
	return requestOrigin != "" && origin == requestOrigin
}

func (p *OriginPolicy) servesOnlyThisMachine(r *http.Request) bool {
	if p.bindDeclared && !p.bindWildcard {
		return p.boundToLoopback
	}
	return isLoopbackAddr(serverHost(r))
}

func (p *OriginPolicy) isDNSRebinding(r *http.Request) bool {
	if !p.boundToLoopback {
		return false
	}
	host := r.Host
	if host == "" {
		return false
	}
	if strings.Contains(host, ",") {
		return true
	}
	if isLoopbackAddr(host) {
		return false
	}
	return !p.hosts[bareHost(host)]
}

func (p *OriginPolicy) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := p.Check(r); err != nil {
			http.Error(w, "Forbidden: "+err.Error(), http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func serverHost(r *http.Request) string {
	addr, ok := r.Context().Value(http.LocalAddrContextKey).(net.Addr)
	if !ok || addr == nil {
		return ""
	}
	return addr.String()
}

func originHost(origin string) string {
	u, err := url.Parse(origin)
	if err != nil {
		return ""
	}
	return u.Hostname()
}

func effectiveRequestOrigin(r *http.Request) string {
	if proto, host, ok := forwardedProtoHost(r); ok {
		return originScheme(proto) + "://" + strings.ToLower(host)
	}
	host := firstHeaderValue(r, "X-Forwarded-Host")
	if host == "" {
		host = r.Host
	}
	if host == "" {
		return ""
	}
	proto := firstHeaderValue(r, "X-Forwarded-Proto")
	if proto == "" {
		proto = requestScheme(r)
	}
	return originScheme(proto) + "://" + strings.ToLower(host)
}

func forwardedProtoHost(r *http.Request) (proto, host string, ok bool) {
	forwarded := r.Header.Get("Forwarded")
	if forwarded == "" {
		return "", "", false
	}
	first, _, _ := strings.Cut(forwarded, ",")
	for element := range strings.SplitSeq(first, ";") {
		name, value, found := strings.Cut(element, "=")
		if !found {
			continue
		}
		value = unquote(strings.TrimSpace(value))
		switch strings.ToLower(strings.TrimSpace(name)) {
		case "proto":
			proto = value
		case "host":
			host = value
		}
	}
	if proto == "" || host == "" {
		return "", "", false
	}
	return proto, host, true
}

func requestScheme(r *http.Request) string {
	if r.TLS != nil {
		return "https"
	}
	if r.URL != nil && r.URL.Scheme != "" {
		return r.URL.Scheme
	}
	return "http"
}

func originScheme(scheme string) string {
	switch strings.ToLower(scheme) {
	case "ws":
		return "http"
	case "wss":
		return "https"
	default:
		return strings.ToLower(scheme)
	}
}

func firstHeaderValue(r *http.Request, name string) string {
	value := r.Header.Get(name)
	if value == "" {
		return ""
	}
	first, _, _ := strings.Cut(value, ",")
	return strings.TrimSpace(first)
}

func unquote(value string) string {
	if len(value) >= 2 && value[0] == '"' && value[len(value)-1] == '"' {
		return value[1 : len(value)-1]
	}
	return value
}

func isLoopbackAddr(host string) bool {
	bare := bareHost(host)
	if bare == "" {
		return false
	}
	if bare == "localhost" {
		return true
	}
	addr, err := netip.ParseAddr(bare)
	return err == nil && addr.IsLoopback()
}

func isWildcardAddr(host string) bool {
	bare := bareHost(host)
	if bare == "" {
		return true
	}
	addr, err := netip.ParseAddr(bare)
	return err == nil && addr.IsUnspecified()
}

func bareHost(host string) string {
	return strings.TrimRight(strings.ToLower(stripPort(host)), ".")
}

func stripPort(host string) string {
	var bare, suffix string
	switch {
	case strings.HasPrefix(host, "["): // [addr] or [addr]:port
		end := strings.Index(host, "]")
		if end < 0 {
			return host
		}
		bare, suffix = host[1:end], host[end+1:]
	case strings.Count(host, ":") == 1: // host:port; a bracketless IPv6 has more
		bare, suffix, _ = strings.Cut(host, ":")
		suffix = ":" + suffix
	default:
		return host
	}
	if suffix == "" {
		return bare
	}
	port, ok := strings.CutPrefix(suffix, ":")
	if !ok || port == "" {
		return host
	}
	for _, c := range []byte(port) {
		if c < '0' || c > '9' {
			return host
		}
	}
	return bare
}
