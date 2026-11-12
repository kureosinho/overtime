// Overtime — interface
import { computeBaselines, rate, ratingTier, SUBS, SCALE } from "./rating.js";
import { seriesCard as seriesImage, gameCard as gameImage, shareModal } from "./share.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const view = $("#view");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nf = (v, d = 0) => (v == null || Number.isNaN(v) ? "—" : Number(v).toLocaleString("fr-FR", { maximumFractionDigits: d, minimumFractionDigits: d }));
const pct = (v) => (v == null ? "—" : nf(v, 0) + " %");
const kmh = (uu) => (uu == null ? "—" : nf(uu * 0.036, 0) + " km/h");
const r2 = (v) => (v == null ? "—" : nf(v, 2));

async function api(path, opts = {}) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}
function toast(msg, ms = 3800) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg; document.body.append(t);
  setTimeout(() => t.remove(), ms);
}
function modal(title, text, okLabel = "Confirmer", danger = false) {
  return new Promise((resolve) => {
    const bg = document.createElement("div");
    bg.className = "modal-bg";
    bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><h3>${esc(title)}</h3><p>${text}</p><div class="row" style="justify-content:flex-end"><button class="btn ghost" data-a="0">Annuler</button><button class="btn ${danger ? "danger" : "hot"}" data-a="1">${esc(okLabel)}</button></div></div>`;
    const close = (v) => { bg.remove(); document.removeEventListener("keydown", onKey); resolve(v); };
    const onKey = (e) => { if (e.key === "Escape") close(false); };
    bg.addEventListener("click", (e) => { if (e.target === bg) close(false); const a = e.target.closest("[data-a]"); if (a) close(a.dataset.a === "1"); });
    document.addEventListener("keydown", onKey);
    document.body.append(bg);
    bg.querySelector('[data-a="1"]').focus();
  });
}

function askText(title, text, def) {
  return new Promise((resolve) => {
    const bg = document.createElement("div");
    bg.className = "modal-bg";
    bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><h3>${esc(title)}</h3><p>${esc(text)}</p><input type="text" id="askin" value="${esc(def)}" style="width:100%;margin-bottom:20px"><div class="row" style="justify-content:flex-end"><button class="btn ghost" data-a="0">Annuler</button><button class="btn hot" data-a="1">Analyser</button></div></div>`;
    const inp = bg.querySelector("#askin");
    const close = (ok) => { const v = inp.value.trim() || def; bg.remove(); resolve(ok ? v : null); };
    bg.addEventListener("click", (e) => { if (e.target === bg) close(false); const a = e.target.closest("[data-a]"); if (a) close(a.dataset.a === "1"); });
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") close(true); if (e.key === "Escape") close(false); });
    document.body.append(bg); inp.select(); inp.focus();
  });
}

const ICON = {
  camera: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>`,
  trophy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="18" height="18"><path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M9 20h6"/></svg>`,
  back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>`,
  chev: `<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l5 5 9-10"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>`,
  sync: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 11a8 8 0 0 0-14.5-4M4 13a8 8 0 0 0 14.5 4"/><path d="M5 3v4h4M19 21v-4h-4"/></svg>`,
  select: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 12l3 3 5-6"/></svg>`,
};

// ---------------- Référentiels ----------------
const PLAYLISTS = { 0: "Casual", 1: "Duel", 2: "Doubles", 3: "Standard", 4: "Chaos", 6: "Partie privée", 10: "Duel classé", 11: "Doubles classé", 13: "Standard classé", 15: "Snow Day", 17: "Hoops", 18: "Rumble", 22: "Tournoi", 23: "Dropshot", 27: "Hoops classé", 28: "Rumble classé", 29: "Dropshot classé", 30: "Snow Day classé", 34: "Tournoi", 54: "Knockout" };
const plName = (id) => PLAYLISTS[id] ?? (id == null ? "Mode inconnu" : `Mode ${id}`);
const RANKED = [10, 11, 13, 27, 28, 29, 30];
const TIERS = ["Non classé", "Bronze I", "Bronze II", "Bronze III", "Argent I", "Argent II", "Argent III", "Or I", "Or II", "Or III", "Platine I", "Platine II", "Platine III", "Diamant I", "Diamant II", "Diamant III", "Champion I", "Champion II", "Champion III", "Grand Champion I", "Grand Champion II", "Grand Champion III", "Supersonic Legend"];
const TIER_COLORS = ["#6e73a6", "#c1844f", "#c1844f", "#c1844f", "#c9d0dc", "#c9d0dc", "#c9d0dc", "#f2c84b", "#f2c84b", "#f2c84b", "#6fd6e3", "#6fd6e3", "#6fd6e3", "#4f9cff", "#4f9cff", "#4f9cff", "#b678ff", "#b678ff", "#b678ff", "#ff4f6d", "#ff4f6d", "#ff4f6d", "#f5f2ff"];
const tierName = (t) => (t == null ? "—" : TIERS[t] || `Rang ${t}`);
const divName = (d) => `Div ${["I", "II", "III", "IV"][d] || d + 1}`;
const MAPS = { stadium: "DFH Stadium", eurostadium: "Mannfield", park: "Beckwith Park", utopiastadium: "Utopia Coliseum", cs: "Champions Field", trainstation: "Urban Central", wasteland: "Wasteland", neotokyo: "Neo Tokyo", beach: "Salty Shores", arc: "Starbase ARC", farm: "Farmstead", underwater: "AquaDome", street: "Sovereign Heights", forbiddentemple: "Forbidden Temple", outlaw: "Deadeye Canyon", ff_dusk: "Estadio Vida", chn_stadium: "Forbidden Temple", music: "Neon Fields", hoopsstadium: "Dunk House", shattershot: "Core 707", throwbackstadium: "Throwback Stadium", labs: "Rocket Labs", fni_stadium: "Futura Garden", woods: "Drift Woods", uf: "Urban Fields", bb: "Champions Field (NFL)", et: "Estadio Vida" };
function mapName(raw) {
  if (!raw) return "Terrain inconnu";
  const k = raw.toLowerCase().replace(/_p$/, "");
  const parts = k.split("_");
  for (let n = parts.length; n > 0; n--) { const key = parts.slice(0, n).join("_"); if (MAPS[key]) return MAPS[key]; }
  return raw.replace(/_p$/i, "").replace(/_/g, " ");
}
const normId = (id) => (id || "").split("|").slice(0, 2).join("|");
const platformOf = (id) => ({ Epic: "Epic", Steam: "Steam", PS4: "PlayStation", PlayStation: "PlayStation", XboxOne: "Xbox", Xbox: "Xbox", Switch: "Switch" }[(id || "").split("|")[0]] || "");
const fmtDate = (t) => new Date(t * 1000).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
const fmtDateLong = (t) => new Date(t * 1000).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: new Date(t * 1000).getFullYear() !== new Date().getFullYear() ? "numeric" : undefined });
const fmtTime = (t) => new Date(t * 1000).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const mmrOf = (mu) => (mu ? Math.round(mu * 20 + 100) : null);
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const hue = (s) => { let h = 0; for (const c of s || "") h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const initials = (n) => (n || "?").replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
const avatar = (name, lg) => `<span class="avatar ${lg ? "lg" : ""}" style="background:linear-gradient(140deg,hsl(${hue(name)} 80% 72%),hsl(${(hue(name) + 50) % 360} 75% 58%))">${esc(initials(name))}</span>`;
const jl = (id) => (S.proMode ? "#/pro/j/" : "#/joueur/") + encodeURIComponent(id);
const plink = (id, name) => id ? `<a href="${jl(id)}">${esc(name)}</a>` : esc(name);

// Jauge de boost : arc de 270°, comme le compteur de boost du jeu
function gauge(r, size = "md", label = "Rating 3.0") {
  const dims = { xl: 210, md: 92, sm: 48 }[size];
  const sw = { xl: 14, md: 8, sm: 5 }[size];
  const rad = (dims - sw) / 2 - 2, c = dims / 2;
  const L = 2 * Math.PI * rad, arc = L * 0.75;
  const v = r == null ? 0 : Math.max(0, Math.min(1, (r - 0.4) / 1.4));
  const seg = arc / 30;
  const track = size === "sm" ? `stroke-dasharray="${arc} ${L}"` : `stroke-dasharray="${Array(30).fill(`${seg * 0.62} ${seg * 0.38}`).join(" ")} ${L}"`;
  const t = ratingTier(r);
  return `<span class="gauge g-${size}" style="width:${dims}px;height:${dims}px" title="${r == null ? "Pas encore de rating" : "Rating 3.0 : " + nf(r, 2) + " · " + t.label}">
    <svg width="${dims}" height="${dims}" viewBox="0 0 ${dims} ${dims}" aria-hidden="true">
      <circle cx="${c}" cy="${c}" r="${rad}" fill="none" stroke="rgba(255,255,255,.09)" stroke-width="${sw}" ${track} transform="rotate(135 ${c} ${c})"/>
      ${r == null ? "" : `<circle cx="${c}" cy="${c}" r="${rad}" fill="none" stroke="${t.color}" stroke-width="${sw}" stroke-linecap="${size === "sm" ? "round" : "butt"}" stroke-dasharray="${arc * v} ${L}" transform="rotate(135 ${c} ${c})" style="filter:drop-shadow(0 0 ${size === "xl" ? 12 : 4}px ${t.color}88)"/>`}
    </svg>
    <span class="val"><span class="num ${t.cls}">${r == null ? "—" : nf(r, 2)}</span>${size === "sm" ? "" : `<span class="lab">${esc(label)}</span>`}</span>
  </span>`;
}
const emblem = (tier) => `<span class="emblem" style="background:linear-gradient(160deg,${TIER_COLORS[tier] || "#6e73a6"},color-mix(in srgb, ${TIER_COLORS[tier] || "#6e73a6"} 55%, #0b0d26))">${tier >= 22 ? "SSL" : tier > 0 ? ["I", "II", "III"][(tier - 1) % 3] : "?"}</span>`;

// ---------------- État ----------------
const S = { state: null, raw: [], games: [], skills: [], myIds: new Set(), baselines: null, players: new Map(),
  af: { pl: "all", n: "50" }, gf: { pl: "all", res: "all" }, select: null, custom: null, proMode: false, pro: null, proGames: new Map(), proPlayers: new Map(), proSeries: new Map(), proBaselines: null };

function buildGame(rec, bl = S.baselines) {
  const h = rec.history || null, a = rec.analysis || null;
  const g = { guid: rec.guid, source: rec.source, time: rec.startTime || a?.meta?.startEpoch || 0, rec, h, a };
  g.playlist = h?.Playlist ?? a?.meta?.playlistId ?? null;
  g.map = mapName(h?.MapName || a?.meta?.map);
  g.score = h ? [h.Team0Score, h.Team1Score] : a?.meta?.score || [0, 0];
  g.overtime = h?.bOverTime || false;
  g.seconds = h ? (h.SecondsPlayed || 0) + (h.OvertimeSecondsPlayed || 0) : a?.meta?.seconds || 0;
  g.teamSize = Math.min(3, Math.max(1, a?.meta?.teamSize || Math.ceil((h?.Players?.length || 2) / 2)));
  g.winner = h ? (h.WinningTeam ?? (g.score[0] > g.score[1] ? 0 : 1)) : a?.meta?.winner;
  if (a && bl) for (const p of a.players) { const r = rate(p, a.meta, bl); p.r = r?.rating ?? null; p.subs = r?.subs ?? null; }
  // joueurs unifiés (analyse + historique serveur)
  g.people = [];
  const seen = new Set();
  for (const p of a?.players || []) {
    const id = normId(p.id);
    const hp = h?.Players?.find((x) => normId(x.PlayerID) === id || x.PlayerName === p.name);
    const pid = hp ? normId(hp.PlayerID) : id;
    g.people.push({ id: pid, name: p.name, team: p.team, a: p, h: hp });
    seen.add(pid);
  }
  for (const hp of h?.Players || []) {
    const id = normId(hp.PlayerID);
    if (seen.has(id)) continue;
    g.people.push({ id, name: hp.PlayerName, team: hp.LastTeam, a: null, h: hp });
  }
  for (const p of g.people) {
    p.me = S.myIds.has(p.id) || (p.a && S.myIds.has(normId(p.a.id)));
    const sk = p.h?.Skills;
    p.mmr = sk?.bValid && sk.Mu ? mmrOf(sk.Mu) : null;
    p.mmrDelta = sk?.bValid && sk.Mu && sk.PrevMu ? mmrOf(sk.Mu) - mmrOf(sk.PrevMu) : null;
    p.core = p.a?.core || (p.h ? { score: p.h.Score, goals: p.h.Goals, assists: p.h.Assists, saves: p.h.Saves, shots: p.h.Shots, demosInflicted: p.h.Demolishes } : {});
    p.r = p.a?.r ?? null;
  }
  g.mePerson = g.people.find((p) => p.me) || null;
  g.me = g.mePerson?.a || null;
  g.myTeam = g.mePerson ? g.mePerson.team : null;
  g.result = g.myTeam == null ? "D" : g.winner === g.myTeam ? "W" : "L";
  if (h?.bNoContest) g.result = "D";
  g.rating = g.me?.r ?? null;
  g.mmr = g.mePerson?.mmr ?? null; g.mmrDelta = g.mePerson?.mmrDelta ?? null;
  g.core = g.mePerson?.core || null;
  g.analyzed = !!a;
  return g;
}

function inferMe() {
  if (S.state.myIds?.length) { S.myIds = new Set(S.state.myIds.map(normId)); return; }
  const cnt = {};
  for (const r of S.raw) for (const p of r.analysis?.players || []) cnt[normId(p.id)] = (cnt[normId(p.id)] || 0) + 1;
  const best = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
  S.myIds = new Set(best ? [best[0]] : []);
}

function buildPlayers() {
  const m = new Map();
  for (const g of S.games) for (const p of g.people) {
    if (!p.id) continue;
    let e = m.get(p.id);
    if (!e) { e = { id: p.id, name: p.name, games: [], me: false }; m.set(p.id, e); }
    if (p.me) e.me = true;
    e.games.push({ g, p });
  }
  for (const e of m.values()) {
    e.name = e.games[0].p.name; // nom le plus récent
    e.with = e.games.filter(({ g, p }) => g.myTeam != null && p.team === g.myTeam && !p.me);
    e.against = e.games.filter(({ g, p }) => g.myTeam != null && p.team !== g.myTeam);
    const rs = e.games.map(({ p }) => p.r).filter((x) => x != null);
    e.rating = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null;
    e.platform = platformOf(e.id);
  }
  S.players = m;
}

async function loadAll() {
  const [st, raw, skills] = await Promise.all([api("/api/state"), api("/api/matches"), api("/api/skills")]);
  S.state = st; S.raw = raw; S.skills = skills || [];
  inferMe();
  S.baselines = computeBaselines(raw.map((r) => r.analysis).filter(Boolean));
  S.games = raw.map((r) => buildGame(r)).filter((g) => g.time > 0 || g.analyzed).sort((a, b) => b.time - a.time);
  buildPlayers();
  await loadPro();
  if (st.mobile && !document.body.classList.contains("mobile")) setupMobile();
  renderStatus();
}
const isMobile = () => !!S.state?.mobile;
function openUrl(url) {
  if (window.OvertimeAndroid) window.OvertimeAndroid.openUrl(url);
  else api("/api/open", { method: "POST", body: JSON.stringify({ url }) });
}
function setupMobile() {
  document.body.classList.add("mobile");
  $(".brand").setAttribute("href", "#/pro");
  const pro = $('#dock a[data-r="pro"]');
  pro.lastChild.textContent = "Matchs";
}

const myName = () => { for (const g of S.games) if (g.mePerson) return g.mePerson.name; return S.state?.auth?.displayName || "Mon profil"; };
const myId = () => { for (const p of S.players.values()) if (p.me) return p.id; return [...S.myIds][0] || ""; };

// ---------------- File d'analyse ----------------
const Q = { running: false, done: 0, total: 0, worker: null, count: 0 };
function getWorker() {
  if (!Q.worker || Q.count >= 12) { Q.worker?.terminate(); Q.worker = new Worker("worker.js", { type: "module" }); Q.count = 0; }
  return Q.worker;
}
function analyzeOne(guid, url) {
  return new Promise((resolve) => {
    const w = getWorker(); Q.count++;
    const t = setTimeout(() => { w.terminate(); Q.worker = null; resolve({ ok: false, error: "analyse trop longue" }); }, 120000);
    w.onmessage = (ev) => { clearTimeout(t); resolve(ev.data); };
    w.onerror = (e) => { clearTimeout(t); Q.worker = null; resolve({ ok: false, error: e.message || "erreur" }); };
    w.postMessage({ guid, url });
  });
}
async function pendingAll() {
  const [mine, pro] = await Promise.all([api("/api/pending").catch(() => []), api("/api/pro/pending").catch(() => [])]);
  return [...(mine || []).map((id) => ({ id, pro: false })), ...(pro || []).map((id) => ({ id, pro: true }))];
}
async function runQueue() {
  if (Q.running) return;
  Q.running = true;
  try {
    let pending = await pendingAll();
    Q.total = pending.length; Q.done = 0;
    let since = 0;
    while (pending.length) {
      for (const it of pending) {
        renderStatus();
        const id = encodeURIComponent(it.id);
        const r = await analyzeOne(it.id, it.pro ? `/api/pro/replay/${id}` : undefined);
        const base = it.pro ? `/api/pro/match/${id}` : `/api/matches/${id}`;
        try {
          if (r.ok) await api(`${base}/analysis`, { method: "POST", body: JSON.stringify(r.summary) });
          else await api(`${base}/analysis-error`, { method: "POST", body: JSON.stringify({ error: r.error }) });
        } catch (e) { console.warn(e); }
        Q.done++; since++;
        if (since >= 8) { since = 0; await refresh(); }
      }
      await refresh();
      pending = await pendingAll();
      Q.total += pending.length;
    }
  } finally { Q.running = false; Q.total = 0; Q.worker?.terminate(); Q.worker = null; renderStatus(); }
}

// ---------------- Barre du haut ----------------
function renderStatus() {
  const st = S.state; if (!st) return;
  const sy = st.sync;
  const cls = sy.running ? "run" : sy.lastError ? "err" : st.auth.loggedIn ? "ok" : "";
  const txt = sy.running ? "Synchro en cours" : sy.lastError ? "Synchro en échec" : st.auth.loggedIn ? (sy.gameRunning ? "Jeu ouvert, synchro à la fermeture" : sy.lastSync ? `Synchro à ${fmtTime(sy.lastSync)}` : "Connecté") : "Non connecté";
  let html = "";
  if (isMobile()) {
    if (Q.running && Q.total) html += `<span class="pill">Analyse <b>${Q.done}/${Q.total}</b></span>`;
    else if (S.pro?.running) html += `<span class="pill"><span class="dot run"></span>Synchro</span>`;
    html += `<button class="btn sm ghost" id="syncbtn" title="Mettre à jour les matchs" aria-label="Mettre à jour les matchs">${ICON.sync}</button>`;
    $("#status").innerHTML = html;
    $("#syncbtn").onclick = async () => { await api("/api/pro/sync", { method: "POST" }); toast("Mise à jour des matchs lancée"); };
    return;
  }
  if (Q.running && Q.total) html += `<span class="pill">Analyse <b>${Q.done}/${Q.total}</b><span class="progress"><i style="width:${(Q.done / Q.total) * 100}%"></i></span></span>`;
  html += `<a class="pill" href="#/reglages" title="${esc(sy.lastError || sy.lastResult || "")}"><span class="dot ${cls}"></span>${esc(txt)}</a>`;
  html += `<button class="btn sm ghost" id="syncbtn" title="Synchroniser maintenant" aria-label="Synchroniser maintenant">${ICON.sync}</button>`;
  $("#status").innerHTML = html;
  $("#syncbtn").onclick = async () => {
    if (st.sync.gameRunning && !(await modal("Rocket League est ouvert", "Se connecter maintenant aux serveurs du jeu peut te déconnecter de ta partie en cours.", "Synchroniser quand même"))) return;
    await api("/api/sync" + (st.sync.gameRunning ? "?force=1" : ""), { method: "POST" });
    toast("Synchro lancée"); setTimeout(refresh, 4000);
  };
}

function setupSearch() {
  const q = $("#q"), box = $("#qres");
  let sel = 0, items = [];
  const draw = () => {
    const s = q.value.trim().toLowerCase();
    if (!s) { box.classList.remove("on"); return; }
    items = [...S.players.values()].filter((p) => p.name.toLowerCase().includes(s)).sort((a, b) => b.games.length - a.games.length).slice(0, 8);
    box.innerHTML = items.length ? items.map((p, i) => `<a href="${jl(p.id)}" class="${i === sel ? "on" : ""}">${avatar(p.name)}<span class="grow"><b>${esc(p.name)}</b><br><span class="muted">${p.games.length} game(s) · ${esc(p.platform)}</span></span>${gauge(p.rating, "sm")}</a>`).join("") : `<div class="muted">Aucun joueur trouvé.</div>`;
    box.classList.add("on");
  };
  q.addEventListener("input", () => { sel = 0; draw(); });
  q.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { sel = Math.min(items.length - 1, sel + 1); draw(); e.preventDefault(); }
    if (e.key === "ArrowUp") { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); }
    if (e.key === "Enter" && items[sel]) { location.hash = "#/joueur/" + encodeURIComponent(items[sel].id); q.value = ""; draw(); q.blur(); }
    if (e.key === "Escape") { q.value = ""; draw(); q.blur(); }
  });
  q.addEventListener("blur", () => setTimeout(() => { box.classList.remove("on"); }, 180));
  box.addEventListener("click", () => { q.value = ""; box.classList.remove("on"); });
  document.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); q.focus(); } });
}

// ---------------- Router ----------------
let charts = [];
function clearCharts() { charts.forEach((c) => c.destroy()); charts = []; }
function route(soft) {
  const h = location.hash || "#/";
  const [, page = "", arg] = h.split("/");
  if (isMobile() && page !== "pro" && page !== "reglages") { location.replace("#/pro"); return; }
  const tab = { "": "home", game: "games", joueur: "joueurs" }[page] || page;
  $$("#dock a").forEach((a) => a.classList.toggle("on", a.dataset.r === tab));
  S.proMode = page === "pro";
  if (soft && (page === "reglages" || S.select || page === "game" || (page === "pro" && ["g", "s"].includes(arg)))) return;
  clearCharts();
  if (page === "pro") renderPro(h.split("/").slice(2).map(decodeURIComponent));
  else if (page === "games") renderGames();
  else if (page === "game") renderGame(decodeURIComponent(arg || ""));
  else if (page === "analyse") renderProfile(myId(), true);
  else if (page === "joueurs") renderPlayers();
  else if (page === "joueur") renderProfile(decodeURIComponent(arg || ""), false);
  else if (page === "reglages") renderSettings();
  else renderHome();
}
window.addEventListener("hashchange", () => { $$(".modal-bg").forEach((m) => m.remove()); if (!location.hash.startsWith("#/analyse")) S.custom = null; S.select = null; $(".actionbar")?.remove(); route(); window.scrollTo(0, 0); });
async function refresh() { try { await loadAll(); route(true); } catch (e) { console.warn(e); } }

function chartOpts(scales = {}, extra = {}) {
  const grid = { color: "rgba(195,205,255,.07)" }, ticks = { color: "#a3a8d8", font: { family: "Geist" } };
  return {
    responsive: true, maintainAspectRatio: false, animation: false,
    interaction: { intersect: false, mode: "index" },
    plugins: { legend: { display: false }, tooltip: { backgroundColor: "rgba(19,22,61,.96)", borderColor: "rgba(195,205,255,.24)", borderWidth: 1, padding: 10, titleFont: { family: "Geist" }, bodyFont: { family: "Geist" } }, ...(extra.plugins || {}) },
    scales: { x: { grid: { display: false }, ticks, border: { display: false }, ...(scales.x || {}) }, y: { grid, ticks, border: { display: false }, ...(scales.y || {}) }, ...(scales.extra || {}) },
    onClick: extra.onClick,
  };
}
function fillGrad(ctx, rgb) {
  const g = ctx.createLinearGradient(0, 0, 0, ctx.canvas.clientHeight || 240);
  g.addColorStop(0, `rgba(${rgb}, .32)`); g.addColorStop(1, `rgba(${rgb}, 0)`);
  return g;
}
const tierColor = (r) => ratingTier(r).color;

// ---------------- Accueil ----------------
function latestSkills() {
  const s = S.skills[S.skills.length - 1];
  if (!s) return [];
  try { return (typeof s.skills === "string" ? JSON.parse(s.skills) : s.skills).Skills || []; } catch { return []; }
}
function sessions(games) {
  const out = []; let cur = null;
  for (const g of games) { // du plus récent au plus ancien
    if (!cur || cur.start - (g.time + g.seconds) > 50 * 60) { cur = { games: [], start: g.time, end: g.time + g.seconds }; out.push(cur); }
    cur.games.push(g); cur.start = g.time;
  }
  for (const s of out) {
    s.w = s.games.filter((g) => g.result === "W").length; s.l = s.games.filter((g) => g.result === "L").length;
    s.mmr = s.games.reduce((a, g) => a + (g.mmrDelta || 0), 0);
    s.rating = avgOf(s.games, (g) => g.rating);
  }
  return out;
}
function avgOf(arr, f) { const v = arr.map(f).filter((x) => x != null && !Number.isNaN(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; }

function connectCard() {
  return `<div class="empty"><h3>Connecte ton compte Epic</h3><p>Overtime lit ton historique de matchs sur les serveurs de Rocket League et récupère les replays tout seul, sans que tu aies à les sauvegarder.</p><a class="btn hot" href="#/reglages">Se connecter</a></div>`;
}

function renderHome() {
  const gs = S.games, st = S.state;
  const ranks = latestSkills().filter((s) => RANKED.includes(s.Playlist) && (s.MatchesPlayed || s.Tier));
  const an = gs.filter((g) => g.rating != null);
  const last20 = an.slice(0, 20), prev20 = an.slice(20, 40);
  const avgR = avgOf(last20, (g) => g.rating), prevR = avgOf(prev20, (g) => g.rating);
  let html = `<section class="glass hero"><div>
      <div class="who">${st.auth.loggedIn ? `<span class="dot ok"></span>Compte Epic connecté` : `<span class="dot"></span>Hors ligne`}${myId() ? ` · ${esc(platformOf(myId()))}` : ""}</div>
      <h1>${esc(myName())}</h1>
      <div class="ranks">${ranks.map((r) => `<div class="rank">${emblem(r.Tier)}<div><div class="pl">${plName(r.Playlist)}</div><div class="tier">${tierName(r.Tier)}${r.Tier > 0 && r.Tier < 22 ? ` <span class="muted">${divName(r.Division)}</span>` : ""}</div><div class="mmr">${nf(r.MMR || mmrOf(r.Mu))} MMR${r.WinStreak > 1 ? ` · ${r.WinStreak} victoires d'affilée` : ""}</div></div></div>`).join("")}</div>
    </div>
    <div style="text-align:center">${gauge(avgR, "xl", "Rating 3.0 moyen")}<div class="muted" style="margin-top:6px">${last20.length ? `sur tes ${last20.length} dernières games` : "pas encore de game analysée"}${prevR != null && avgR != null ? ` · <span class="${avgR >= prevR ? "up" : "down"}">${avgR >= prevR ? "+" : ""}${nf(avgR - prevR, 2)}</span> vs les 20 d'avant` : ""}</div></div>
  </section>`;
  if (!gs.length) { html += `<div style="margin-top:22px">${st.auth.loggedIn ? `<div class="empty"><h3>Aucune game pour l'instant</h3><p>La synchro attend que Rocket League soit fermé. Tu peux aussi la lancer avec le bouton en haut à droite.</p></div>` : connectCard()}</div>`; view.innerHTML = html; return; }

  const s0 = sessions(gs)[0];
  const subAvg = Object.fromEntries(SUBS.map((s) => [s.k, avgOf(last20, (g) => g.me?.subs?.[s.k])]));
  html += `<div class="bento" style="margin-top:16px">
    <section class="glass c5"><div class="between"><h3>Dernière session</h3><span class="muted">${fmtDateLong(s0.start)} · ${fmtTime(s0.start)}–${fmtTime(s0.end)}</span></div>
      <div class="row" style="gap:26px;margin-top:6px"><div class="bigstat"><span class="up">${s0.w}</span><small> V&nbsp;&nbsp;</small><span class="down">${s0.l}</span><small> D</small></div>
      ${s0.mmr ? `<div class="bigstat ${s0.mmr > 0 ? "up" : "down"}">${s0.mmr > 0 ? "+" : ""}${s0.mmr}<small> MMR</small></div>` : ""}</div>
      <div class="kpis"><div><b>${s0.games.length}</b><span>games jouées</span></div><div><b class="${ratingTier(s0.rating).cls}">${r2(s0.rating)}</b><span>rating moyen</span></div><div><b>${nf(avgOf(s0.games, (g) => g.core?.goals), 1)}</b><span>buts par game</span></div></div>
    </section>
    <section class="glass c7"><div class="between"><h3>Forme</h3><span class="muted">tes 12 dernières games, la plus récente à droite</span></div>
      <div class="formstrip" style="margin-top:10px">${gs.slice(0, 12).reverse().map((g) => `<a href="#/game/${encodeURIComponent(g.guid)}" title="${fmtDate(g.time)} · ${plName(g.playlist)} · ${g.score.join("-")}">${gauge(g.rating, "sm")}<span class="res ${g.result}">${g.result === "W" ? "V" : g.result === "L" ? "D" : "–"}</span></a>`).join("")}</div>
    </section>
    <section class="glass c5"><h3>Ton Rating 3.0 décomposé</h3><p class="muted" style="margin:-6px 0 14px">1,00 = la moyenne des joueurs de tes lobbys, sur tes 20 dernières games. <a href="#/analyse" style="text-decoration:underline">Ce que veut dire chaque note</a></p>${subBars(subAvg)}</section>
    <section class="glass c7"><div class="between"><h3>Rating par game</h3><a class="muted" href="#/analyse">Voir l'analyse complète</a></div><div class="chartbox"><canvas id="cR"></canvas></div></section>
    <section class="glass c12"><div class="between"><h3>Évolution du MMR</h3><span class="faint">Les serveurs du jeu ne donnent le MMR que pour tes dernières games classées : la courbe s'allonge à chaque synchro.</span></div><div class="chartbox"><canvas id="cM"></canvas></div></section>
  </div>
  <div class="between"><h2>Dernières games</h2><a class="btn sm ghost" href="#/games">Toutes les games</a></div>
  <div class="games">${gs.slice(0, 6).map((g) => gameRow(g)).join("")}</div>`;
  view.innerHTML = html;
  bindRows();

  const rs = an.slice(0, 40).reverse();
  if (rs.length) {
    const ctx = $("#cR").getContext("2d");
    charts.push(new Chart(ctx, { type: "line", data: { labels: rs.map((g) => fmtDate(g.time)), datasets: [
      { data: rs.map((g) => g.rating), borderColor: "#ff9a1f", backgroundColor: fillGrad(ctx, "255,154,31"), fill: true, tension: .35, pointRadius: 3.5, pointBackgroundColor: rs.map((g) => tierColor(g.rating)), pointBorderWidth: 0, borderWidth: 2 },
      { data: rs.map(() => 1), borderColor: "rgba(238,240,255,.35)", borderDash: [4, 4], pointRadius: 0, borderWidth: 1 },
    ] }, options: chartOpts({ y: { suggestedMin: 0.4, suggestedMax: 1.6 } }, { onClick: (e, el) => { if (el[0]) location.hash = "#/game/" + encodeURIComponent(rs[el[0].index].guid); } }) }));
  } else $("#cR").parentElement.innerHTML = `<div class="empty">Les ratings arrivent dès que des replays sont analysés.</div>`;
  mmrChart($("#cM"), gs);
}

function subBars(subs) {
  return `<div class="subbars">${SUBS.map((s) => { const v = subs[s.k]; const w = v == null ? 0 : Math.max(0, Math.min(100, (v / 2) * 100)); const t = ratingTier(v); return `<div class="subbar" title="${esc(s.short)}"><span>${s.label}</span><span class="track"><i style="width:${w}%;background:${t.color}"></i></span><b class="${t.cls}">${r2(v)}</b></div>`; }).join("")}</div>`;
}

function mmrChart(cv, gs) {
  const byPl = {};
  const add = (pl, t, y) => { if (!RANKED.includes(pl) || !y) return; (byPl[pl] ||= []).push({ x: t * 1000, y }); };
  for (const g of gs) if (g.mmr) add(g.playlist, g.time + g.seconds, g.mmr);
  for (const snap of S.skills) { let sk = []; try { sk = (typeof snap.skills === "string" ? JSON.parse(snap.skills) : snap.skills).Skills || []; } catch {} for (const x of sk) add(x.Playlist, snap.time, Math.round(x.MMR || mmrOf(x.Mu))); }
  const colors = { 10: "#c9d0dc", 11: "#3a8dff", 13: "#ff8c2b", 27: "#2fe39b", 28: "#ffe24a", 29: "#b678ff", 30: "#6fd6e3" };
  const ds = Object.entries(byPl).map(([pl, pts]) => {
    pts.sort((a, b) => a.x - b.x);
    const clean = pts.filter((p, i) => i === 0 || p.x - pts[i - 1].x > 120000 || p.y !== pts[i - 1].y);
    return { label: plName(+pl), data: clean, borderColor: colors[pl], backgroundColor: colors[pl], tension: .25, pointRadius: 2.5, borderWidth: 2, stepped: false };
  }).filter((d) => d.data.length);
  if (!ds.length) { cv.parentElement.innerHTML = `<div class="empty">Le MMR apparaît pour les games classées synchronisées depuis ton compte.</div>`; return; }
  charts.push(new Chart(cv, { type: "line", data: { datasets: ds }, options: chartOpts({ x: { type: "linear", ticks: { color: "#a3a8d8", maxTicksLimit: 8, callback: (v) => new Date(v).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) } } }, { plugins: { legend: { display: true, labels: { color: "#eef0ff", boxWidth: 10, boxHeight: 10, usePointStyle: true } }, tooltip: { callbacks: { title: (it) => new Date(it[0].parsed.x).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) } } } }) }));
}

// ---------------- Games ----------------
function gameRow(g, selectable) {
  const c = g.core;
  const status = g.analyzed ? "" : g.rec.analysisError ? `<span class="tag" title="${esc(g.rec.analysisError)}">analyse impossible</span>` : g.rec.replayStatus === "downloaded" ? `<span class="tag">analyse en attente</span>` : `<span class="tag">sans replay</span>`;
  const picked = S.select?.has(g.guid);
  return `<div class="game ${g.result} ${picked ? "picked" : ""}" data-guid="${esc(g.guid)}" tabindex="0" role="link">
    ${gauge(g.rating, "sm")}
    <span class="when"><b>${fmtTime(g.time)}</b>${fmtDate(g.time)}</span>
    <span class="mode"><b>${plName(g.playlist)}</b><span>${esc(g.map)}${g.overtime ? " · prolongation" : ""}</span></span>
    <span class="score hide-s"><span class="t0">${g.score[0]}</span><i>–</i><span class="t1">${g.score[1]}</span></span>
    <span class="statline hide-s">${c ? `<span><b>${c.goals ?? 0}</b>buts</span><span><b>${c.assists ?? 0}</b>passes</span><span><b>${c.saves ?? 0}</b>arrêts</span><span><b>${c.shots ?? 0}</b>tirs</span>` : ""}${status}</span>
    <span class="mmrd ${g.mmrDelta > 0 ? "up" : g.mmrDelta < 0 ? "down" : ""}">${g.mmrDelta ? (g.mmrDelta > 0 ? "+" : "") + g.mmrDelta : ""}</span>
    ${selectable ? `<span class="sel">${ICON.check}</span>` : ICON.chev}
  </div>`;
}
function bindRows() {
  $$(".game[data-guid]").forEach((el) => {
    const go = () => {
      if (S.select) { const id = el.dataset.guid; S.select.has(id) ? S.select.delete(id) : S.select.add(id); el.classList.toggle("picked"); renderActionBar(); return; }
      location.hash = "#/game/" + encodeURIComponent(el.dataset.guid);
    };
    el.onclick = go;
    el.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } };
  });
}

function filteredGames() {
  const f = S.gf;
  let gs = S.games;
  if (f.pl !== "all") gs = gs.filter((g) => String(g.playlist) === f.pl);
  if (f.res !== "all") gs = gs.filter((g) => g.result === f.res);
  return gs;
}
function renderGames() {
  const f = S.gf;
  const pls = [...new Set(S.games.map((g) => g.playlist))].filter((x) => x != null);
  const gs = filteredGames();
  const sel = !!S.select;
  let html = `<div class="between"><div><h1>Games</h1><p class="lede" style="margin:8px 0 0">${S.games.length} game(s) enregistrée(s), regroupées par session de jeu.</p></div>
    <button class="btn ${sel ? "hot" : "ghost"}" id="selbtn">${ICON.select}${sel ? "Terminer la sélection" : "Sélectionner des games"}</button></div>
    <div class="toolbar"><div class="chips">${[["all", "Tous les modes"], ...pls.map((p) => [String(p), plName(p)])].map(([v, l]) => `<button class="chip ${f.pl === v ? "on" : ""}" data-pl="${v}">${l}</button>`).join("")}</div>
    <div class="chips" style="margin-left:auto">${[["all", "Tout"], ["W", "Victoires"], ["L", "Défaites"]].map(([v, l]) => `<button class="chip ${f.res === v ? "on" : ""}" data-res="${v}">${l}</button>`).join("")}</div></div>`;
  if (!gs.length) html += S.games.length ? `<div class="empty" style="margin-top:20px">Aucune game ne correspond à ces filtres.</div>` : connectCard();
  for (const s of sessions(gs)) {
    html += `<section class="session"><div class="session-head"><h3>${fmtDateLong(s.start)}</h3><span class="muted">${fmtTime(s.start)} – ${fmtTime(s.end)}</span>
      <span class="tagline"><span class="tag W">${s.w} V</span><span class="tag L">${s.l} D</span>${s.mmr ? `<span class="tag ${s.mmr > 0 ? "W" : "L"}">${s.mmr > 0 ? "+" : ""}${s.mmr} MMR</span>` : ""}${s.rating != null ? `<span class="tag">rating ${r2(s.rating)}</span>` : ""}</span>
      ${sel ? `<button class="btn sm ghost" data-selsess="${s.games.map((g) => esc(g.guid)).join(",")}">Sélectionner la session</button>` : `<button class="btn sm ghost" data-anasess="${s.games.map((g) => esc(g.guid)).join(",")}" data-label="Session du ${fmtDateLong(s.start)}">Analyser cette session</button>`}</div>
      <div class="games">${s.games.map((g) => gameRow(g, sel)).join("")}</div></section>`;
  }
  view.innerHTML = html;
  bindRows();
  $$("[data-pl]").forEach((b) => (b.onclick = () => { f.pl = b.dataset.pl; renderGames(); }));
  $$("[data-res]").forEach((b) => (b.onclick = () => { f.res = b.dataset.res; renderGames(); }));
  $$("[data-selsess]").forEach((b) => (b.onclick = () => { b.dataset.selsess.split(",").forEach((id) => S.select.add(id)); renderGames(); }));
  $$("[data-anasess]").forEach((b) => (b.onclick = () => { S.custom = { guids: new Set(b.dataset.anasess.split(",")), label: b.dataset.label }; location.hash = "#/analyse"; }));
  $("#selbtn").onclick = () => { S.select = S.select ? null : new Set(); renderGames(); };
  renderActionBar();
}
function renderActionBar() {
  $(".actionbar")?.remove();
  if (!S.select) return;
  const n = S.select.size;
  const bar = document.createElement("div");
  bar.className = "actionbar";
  bar.innerHTML = `<b>${n} sélectionnée(s)</b><button class="btn sm ghost" data-x="all">Tout sélectionner</button><button class="btn sm ghost" data-x="none">Aucune</button><button class="btn sm hot" data-x="ana" ${n ? "" : "disabled"}>Analyser ces games</button><button class="btn sm danger" data-x="del" ${n ? "" : "disabled"}>${ICON.trash}Supprimer</button>`;
  bar.onclick = async (e) => {
    const x = e.target.closest("[data-x]")?.dataset.x;
    if (x === "all") { filteredGames().forEach((g) => S.select.add(g.guid)); renderGames(); }
    if (x === "none") { S.select.clear(); renderGames(); }
    if (x === "ana" && n) { const label = await askText("Analyser ces games", "Donne un nom à cette sélection (par exemple : Tournoi du samedi).", `Sélection de ${n} games`); if (label == null) return; S.custom = { guids: new Set(S.select), label }; S.select = null; $(".actionbar")?.remove(); location.hash = "#/analyse"; }
    if (x === "del" && n) {
      if (!(await modal(`Supprimer ${n} game(s) ?`, "Les games et leurs replays seront effacés d'Overtime et ne seront pas réimportés. Cette action est définitive.", "Supprimer", true))) return;
      const r = await api("/api/matches/delete", { method: "POST", body: JSON.stringify({ guids: [...S.select] }) });
      S.select = null; toast(`${r.deleted} game(s) supprimée(s)`); await loadAll(); renderGames();
    }
  };
  document.body.append(bar);
}

// ---------------- Détail d'une game ----------------
let gameTab = "rating";
async function renderGame(guid) {
  view.innerHTML = `<p class="muted">Chargement…</p>`;
  let rec;
  try { rec = await api(`/api/matches/${encodeURIComponent(guid)}`); } catch (e) { view.innerHTML = `<div class="note err">${esc(e.message)}</div>`; return; }
  renderGameView(buildGame(rec), rec, {});
}
function renderGameView(g, rec, opts) {
  const tn = opts.teamNames || ["Équipe bleue", "Équipe orange"];
  const verdict = opts.teamNames ? `<span class="up">Victoire ${esc(tn[g.winner] || "")}</span>` : g.result === "W" ? `<span class="up">Victoire</span>` : g.result === "L" ? `<span class="down">Défaite</span>` : "Match";
  const best = Math.max(...g.people.map((p) => p.r ?? -9));
  const team = (t) => {
    const ps = g.people.filter((p) => p.team === t).sort((a, b) => (b.core.score || 0) - (a.core.score || 0));
    const xg = g.a?.teams?.[t]?.xg;
    return `<div class="side t${t}"><div class="team"><span>${esc(tn[t])}</span><span>${xg ? "xG " + nf(xg, 2) : ""}</span></div>
      ${ps.map((p) => `<a class="pcard ${p.me ? "me" : ""}" href="${jl(p.id)}">${gauge(p.r, "sm")}<span style="min-width:0"><div class="nm">${p.r != null && p.r === best ? "★ " : ""}${esc(p.name)}${p.me ? ` <span class="muted">· toi</span>` : ""}</div><div class="ln">${p.core.goals ?? 0} buts · ${p.core.assists ?? 0} passes · ${p.core.saves ?? 0} arrêts · ${p.core.score ?? "—"} pts</div></span><span class="mm">${p.mmr ? p.mmr + " MMR" : ""}${p.mmrDelta ? `<br><span class="${p.mmrDelta > 0 ? "up" : "down"}">${p.mmrDelta > 0 ? "+" : ""}${p.mmrDelta}</span>` : ""}</span></a>`).join("")}</div>`;
  };
  let html = `<a class="back" href="${opts.back?.href || "#/games"}">${ICON.back}${esc(opts.back?.label || "Games")}</a>
    <div class="matchup">${team(0)}<div class="center"><div class="big"><span class="a">${g.score[0]}</span><i>–</i><span class="b">${g.score[1]}</span></div><div class="verdict">${verdict}</div></div>${team(1)}</div>
    <div class="between"><div class="metaline">${opts.tag ? `<span class="pill">${esc(opts.tag)}</span>` : `<span class="pill">${plName(g.playlist)}</span>`}<span class="pill">${esc(g.map)}</span><span class="pill">${fmtDateLong(g.time)} à ${fmtTime(g.time)}</span><span class="pill">${mmss(g.seconds)}${g.overtime ? " · prolongation" : ""}</span>${g.mmrDelta != null ? `<span class="pill">MMR <b>${g.mmr}</b>&nbsp;<span class="${g.mmrDelta >= 0 ? "up" : "down"}">${g.mmrDelta >= 0 ? "+" : ""}${g.mmrDelta}</span></span>` : ""}</div>
    <div class="row" style="margin-top:16px"><button class="btn sm hot" id="shareG">${ICON.camera}Créer l'image pour X</button>${opts.pro ? "" : `<button class="btn sm danger" id="delg">${ICON.trash}Supprimer cette game</button>`}</div></div>`;
  if (!g.a) {
    html += `<div class="note" style="margin-top:22px">${opts.pro && rec.replayStatus === "failed" ? "Le replay n'a pas pu être téléchargé depuis Ballchasing : " + esc(rec.replayError || "") : rec.analysisError ? "L'analyse de ce replay a échoué : " + esc(rec.analysisError) : rec.replayStatus === "downloaded" ? "Le replay est en cours d'analyse : le Rating 3.0 et les stats avancées arrivent dans quelques secondes." : "Pas de replay disponible pour cette game : seules les stats du tableau des scores sont affichées."}</div>`;
    view.innerHTML = html; if (!opts.pro) bindDel(g); bindShare(g, opts); return;
  }
  const tabs = [["rating", "Rating 3.0"], ["boost", "Boost"], ["vitesse", "Vitesse"], ["position", "Placement"], ["duels", "Duels et ballon"], ["meca", "Mécaniques"], ["terrain", "Terrain"], ["chrono", "Chronologie"]];
  html += `<div class="seg" role="tablist">${tabs.map(([k, l]) => `<button role="tab" data-t="${k}" class="${gameTab === k ? "on" : ""}">${l}</button>`).join("")}</div><div id="tabc"></div>`;
  view.innerHTML = html;
  if (!opts.pro) bindDel(g);
  bindShare(g, opts);
  $$(".seg button").forEach((b) => (b.onclick = () => { gameTab = b.dataset.t; $$(".seg button").forEach((x) => x.classList.toggle("on", x === b)); renderTab(g); }));
  renderTab(g);
}
function bindShare(g, opts) {
  $("#shareG").onclick = async () => {
    const tag = opts.tag ? `${opts.tag} · ${fmtDateLong(g.time)}` : `${plName(g.playlist)} · ${fmtDateLong(g.time)}`;
    const cv = await gameImage(g, { tag, teamNames: opts.teamNames, note: opts.pro ? "Rating 3.0 Overtime (1,00 = un pro moyen) · Replays : Ballchasing" : "Rating 3.0 Overtime (1,00 = un joueur moyen de ces lobbys)" });
    const tn = opts.teamNames || ["bleus", "orange"];
    shareModal(cv, `${tn[0]}-${tn[1]}-${g.score[0]}-${g.score[1]}.png`.replace(/\s+/g, "_"));
  };
}
function bindDel(g) {
  $("#delg").onclick = async () => {
    if (!(await modal("Supprimer cette game ?", "La game et son replay seront effacés d'Overtime et ne seront pas réimportés.", "Supprimer", true))) return;
    await api(`/api/matches/${encodeURIComponent(g.guid)}`, { method: "DELETE" });
    toast("Game supprimée"); await loadAll(); location.hash = "#/games";
  };
}

// Tableau comparatif : rows = [label, getter, fmt, better('high'|'low'|null)]
function cmpTable(g, rows) {
  const ps = g.people.filter((p) => p.a).sort((x, y) => x.team - y.team || (y.core.score - x.core.score));
  let html = `<div class="glass flush tablewrap"><table class="t"><thead><tr><th></th>${ps.map((p) => `<th class="t${p.team} ${p.me ? "me" : ""}"><a href="${jl(p.id)}">${esc(p.name)}</a></th>`).join("")}</tr></thead><tbody>`;
  for (const r of rows) {
    if (typeof r === "string") { html += `<tr class="sec"><td colspan="${ps.length + 1}">${r}</td></tr>`; continue; }
    const [label, get, fmt, better] = r;
    const vals = ps.map((p) => { try { const v = get(p.a); return v == null || Number.isNaN(v) ? null : v; } catch { return null; } });
    const valid = vals.filter((v) => v != null);
    const best = better && valid.length > 1 && new Set(valid).size > 1 ? (better === "high" ? Math.max(...valid) : Math.min(...valid)) : null;
    html += `<tr><td>${label}</td>${vals.map((v, i) => `<td class="${ps[i].me ? "me" : ""} ${best != null && v === best ? "best" : ""}">${v == null ? "—" : fmt(v)}</td>`).join("")}</tr>`;
  }
  return html + `</tbody></table></div><p class="legend">Le point jaune marque la meilleure valeur du match sur chaque ligne.</p>`;
}
const N = (d = 0) => (v) => nf(v, d);

function renderTab(g) {
  clearCharts();
  const el = $("#tabc");
  const a = g.a;
  const team = g.teamSize > 1;
  switch (gameTab) {
    case "rating": {
      const rows = SUBS.map((s) => [`<span title="${esc(s.short)}">${s.label}</span>`, (p) => p.subs?.[s.k], (v) => `<span class="${ratingTier(v).cls}">${nf(v, 2)}</span>`, "high"]);
      let html = playerAnalysis(g);
      html += `<h2>Tableau du Rating 3.0</h2>` + cmpTable(g, [["<b>Rating 3.0</b>", (p) => p.r, (v) => `<span class="r3cell ${ratingTier(v).cls}">${nf(v, 2)}</span>`, "high"], "Sous-notes (1,00 = joueur moyen)", ...rows,
        "D'où viennent les notes", ["Temps de jeu", () => a.meta.liveSeconds, (v) => mmss(v), null], ["Phases de jeu où il a pesé", (p) => (p.r3?.rounds ? (p.r3.kast / p.r3.rounds) * 100 : null), pct, "high"], ["Effet sur la probabilité de victoire", (p) => (p.r3 ? p.r3.swing * 100 : null), (v) => (v > 0 ? "+" : "") + nf(v, 0) + " pts", "high"], ["Buts encaissés en dernier défenseur", (p) => p.r3?.deaths, N(1), "low"]]);
      const tp = a.teams; const pos = (tp[0].possessionSec || 0) + (tp[1].possessionSec || 0);
      if (pos) html += `<h2>Possession et pression</h2><div class="glass"><div class="muted" style="margin-bottom:8px">Possession du ballon</div>${splitBar(tp[0].possessionSec, tp[1].possessionSec)}<div class="muted" style="margin:16px 0 8px">Temps de pression dans la moitié adverse</div>${splitBar(tp[0].pressureSec, tp[1].pressureSec)}</div>`;
      html += ratingExplainer();
      el.innerHTML = html;
      bindPlayerAnalysis(g);
      break;
    }
    case "boost":
      el.innerHTML = cmpTable(g, [
        ["Boost ramassé par minute (BPM)", (p) => p.boost.bpm, N(0), "high"], ["Boost moyen", (p) => p.boost.avgAmount, N(0), "high"],
        ["Temps à 0 boost", (p) => p.boost.pctZero, pct, "low"], ["Temps à 100 boost", (p) => p.boost.pctFull, pct, null],
        ["Temps entre 0 et 25", (p) => p.boost.pct0_25, pct, "low"], ["Temps entre 75 et 100", (p) => p.boost.pct75_100, pct, null],
        "Ramassage", ["Gros pads", (p) => p.boost.bigPads, N(), null], ["Petits pads", (p) => p.boost.smallPads, N(), "high"],
        ["Boost volé dans le camp adverse", (p) => p.boost.stolen, N(0), "high"], ["Gros pads volés", (p) => p.boost.stolenBig, N(), "high"],
        ["Boost gaspillé (ramassé au-delà de 100)", (p) => p.boost.overfill, N(0), "low"],
        "Utilisation", ["Boost total ramassé", (p) => p.boost.collected, N(0), null], ["Boost utilisé", (p) => p.boost.used, N(0), null], ["Boost utilisé en supersonic", (p) => p.boost.usedSupersonic, N(0), "low"],
      ]) + `<h2>Réserve de boost pendant le match</h2><div class="glass"><p class="muted" style="margin-top:0">Clique sur un nom dans la légende pour afficher ou masquer un joueur.</p><div class="chartbox tall"><canvas id="cBoost"></canvas></div></div>`;
      boostChart(g);
      break;
    case "vitesse":
      el.innerHTML = cmpTable(g, [
        ["Vitesse moyenne", (p) => p.movement.avgSpeed, kmh, "high"], ["Distance parcourue", (p) => p.movement.distance / 100000, (v) => nf(v, 1) + " km", null],
        ["Temps en supersonic", (p) => p.movement.pctSupersonic, pct, "high"], ["Temps à vitesse boost", (p) => p.movement.pctBoostSpeed, pct, null], ["Temps à vitesse lente", (p) => p.movement.pctSlow, pct, "low"],
        "Hauteur", ["Au sol", (p) => p.movement.pctGround, pct, null], ["En l'air (bas)", (p) => p.movement.pctLowAir, pct, null], ["En l'air (haut)", (p) => p.movement.pctHighAir, pct, null],
        "Déplacements", ["Flips", (p) => p.movement.dodges, N(), null], ["Speed flips", (p) => p.movement.speedFlips, N(), null], ["Wavedashes", (p) => p.movement.wavedashes, N(), null], ["Half flips", (p) => p.movement.halfFlips, N(), null], ["Powerslides", (p) => p.movement.powerslides, N(), null],
      ]);
      break;
    case "position":
      el.innerHTML = cmpTable(g, [
        "Zones du terrain", ["Tiers défensif", (p) => p.positioning.pctDefThird, pct, null], ["Tiers central", (p) => p.positioning.pctNeuThird, pct, null], ["Tiers offensif", (p) => p.positioning.pctOffThird, pct, null], ["Moitié défensive", (p) => p.positioning.pctDefHalf, pct, null],
        "Par rapport au ballon", ["Derrière le ballon", (p) => p.positioning.pctBehindBall, pct, "high"], ["Au niveau du ballon", (p) => p.positioning.pctLevelBall, pct, null], ["Devant le ballon", (p) => p.positioning.pctAheadBall, pct, "low"],
        ["Distance moyenne au ballon", (p) => p.positioning.avgDistToBall / 100, (v) => nf(v, 1) + " m", null], ["Le plus proche du ballon (équipe)", (p) => p.positioning.pctClosestToBall, pct, null],
        ...(team ? ["Rotations", ["Dernier défenseur", (p) => p.positioning.pctMostBack, pct, null], ["Le plus avancé", (p) => p.positioning.pctMostForward, pct, null], ["Premier homme (au contact)", (p) => p.positioning.pctFirstMan, pct, null], ["Deuxième homme (soutien)", (p) => p.positioning.pctSecondMan, pct, null], ["Distance moyenne aux coéquipiers", (p) => p.positioning.avgDistToTeammates / 100, (v) => nf(v, 1) + " m", null]] : []),
        ["Défense en recul (shadow)", (p) => p.positioning.shadowDefenseSec, (v) => nf(v, 0) + " s", "high"],
      ]);
      break;
    case "duels":
      el.innerHTML = cmpTable(g, [
        "Contact avec le ballon", ["Touches", (p) => p.core.touches, N(), "high"], ["Temps de possession", (p) => p.control.possessionSec, (v) => nf(v, 0) + " s", "high"], ["Frappes appuyées", (p) => p.control.hardHits, N(), null], ["Touches aériennes", (p) => p.control.aerialTouches, N(), null], ["Touches au mur", (p) => p.control.wallTouches, N(), null], ["Dribbles au sol", (p) => p.control.carries, N(), null],
        "Duels", ["50/50 gagnés", (p) => p.control.fiftyWins, N(), "high"], ["50/50 perdus", (p) => p.control.fiftyLosses, N(), "low"], ["Devancé sur le ballon", (p) => p.control.beatenToBall, N(), "low"], ["Ballons ratés (whiffs)", (p) => p.control.whiffs, N(), "low"], ["Démolitions infligées", (p) => p.core.demosInflicted, N(), "high"], ["Démolitions subies", (p) => p.core.demosTaken, N(), "low"],
        "Jeu collectif", ["Passes réussies", (p) => p.control.passes, N(), "high"], ["Passes reçues", (p) => p.control.passesReceived, N(), null], ["Centres", (p) => p.control.centers, N(), null], ["Expected goals (xG)", (p) => (p.core.xg > 0 ? p.core.xg : null), N(2), "high"],
        "Engagements", ["Premier au ballon", (p) => p.control.kickoffFirstTouches, N(), null], ["Engagements gagnés", (p) => p.control.kickoffWins, N(), "high"],
      ]);
      break;
    case "meca":
      el.innerHTML = cmpTable(g, [["Aériens depuis le mur", (p) => p.mechanics.wallAerials, N(), "high"], ["Flicks", (p) => p.mechanics.flicks, N(), "high"], ["Tirs depuis le plafond", (p) => p.mechanics.ceilingShots, N(), "high"], ["Air dribbles", (p) => p.mechanics.airDribbles, N(), "high"], ["Flip resets", (p) => p.mechanics.flipResets, N(), "high"], ["Reprises de volée", (p) => p.mechanics.oneTimers, N(), "high"], ["Demi-volées", (p) => p.mechanics.halfVolleys, N(), "high"], ["Rebonds sur la vitre", (p) => p.mechanics.backboards, N(), null], ["Bumps", (p) => p.mechanics.bumps, N(), null]]);
      break;
    case "terrain": {
      const ps = g.people.filter((p) => p.a).sort((x, y) => x.team - y.team);
      el.innerHTML = `<p class="lede" style="margin-top:0">Où chaque joueur a passé son temps. Le terrain est orienté pour que le joueur attaque toujours vers le haut.</p>
        <div class="heats">${ps.map((p, i) => `<figure>${fieldHtml("hm" + i)}<figcaption><a href="${jl(p.id)}" style="color:${p.team ? "#ffae6b" : "#7db3ff"}">${esc(p.name)}</a>${p.me ? ` <span class="muted">· toi</span>` : ""}</figcaption></figure>`).join("")}</div>`;
      ps.forEach((p, i) => drawHeat($("#hm" + i), p.a.heatmap));
      break;
    }
    case "chrono": {
      const gl = [...(a.goals || [])].sort((x, y) => x.time - y.time);
      const bl = { counter_attack: "contre-attaque", sustained_pressure: "pression prolongée", kickoff: "sur engagement", other: "action placée" };
      const sc = [0, 0];
      const pid = (id) => g.people.find((p) => p.a && p.a.id === id)?.id;
      el.innerHTML = `<div class="goalfeed">${gl.length ? gl.map((x) => { sc[x.team]++; return `<div class="gf t${x.team}"><span class="t">${mmss(x.time)}</span><span><b>${plink(pid(x.scorer), x.scorerName)}</b>${x.assistName ? ` <span class="muted">sur une passe de ${plink(pid(x.assist), x.assistName)}</span>` : ""}<br><span class="muted">${bl[x.buildup] || x.buildup || ""}${x.airTime > 1.5 ? " · ballon aérien" : ""} · ${x.ballSpeedKmh} km/h</span></span><span class="sc"><span style="color:#7db3ff">${sc[0]}</span> – <span style="color:#ffae6b">${sc[1]}</span></span></div>`; }).join("") : `<div class="empty">Aucun but dans ce match.</div>`}</div>
        <p class="legend">Le temps affiché est le temps écoulé dans le replay, pas le chrono du match.</p>
        <h2>Réserve de boost</h2><div class="glass"><div class="chartbox tall"><canvas id="cBoost"></canvas></div></div>`;
      boostChart(g);
      break;
    }
  }
}

// ---- Analyse d'un joueur sur un match (switch entre joueurs) ----
let focusId = null;
function playerAnalysis(g) {
  const ps = g.people.filter((p) => p.a).sort((x, y) => x.team - y.team || (y.r ?? 0) - (x.r ?? 0));
  if (!ps.length) return "";
  if (!focusId || !ps.some((p) => p.id === focusId)) focusId = (g.mePerson?.a ? g.mePerson : [...ps].sort((x, y) => (y.r ?? 0) - (x.r ?? 0))[0]).id;
  return `<h2 style="margin-top:0">Analyse des joueurs</h2><div class="chips" id="pchips">${ps.map((p) => `<button class="chip ${p.id === focusId ? "on" : ""} team${p.team}" data-pid="${esc(p.id)}">${esc(p.name)}${p.me ? " · toi" : ""}</button>`).join("")}</div><div id="pfocus" style="margin-top:16px">${playerCard(g, ps.find((p) => p.id === focusId))}</div>`;
}
function bindPlayerAnalysis(g) {
  $$("#pchips [data-pid]").forEach((b) => (b.onclick = () => {
    focusId = b.dataset.pid;
    $$("#pchips .chip").forEach((x) => x.classList.toggle("on", x === b));
    $("#pfocus").innerHTML = playerCard(g, g.people.find((p) => p.id === focusId));
  }));
}
function playerCard(g, person) {
  const p = person.a, me = person.me;
  const others = g.a.players.filter((x) => x !== p);
  const cmp = Object.values(lobbyCompare([{ me: p, others }], g.teamSize > 1)).sort((a, b) => b.score - a.score);
  const goods = cmp.filter((r) => r.score > 0.6).slice(0, 3), bads = cmp.filter((r) => r.score < -0.6).slice(-3).reverse();
  const t = ratingTier(p.r);
  return `<div class="bento"><section class="glass c5"><div class="row" style="gap:20px">${gauge(p.r, "md")}<div style="min-width:0"><div class="muted">${esc(g.teamNames ? g.teamNames[person.team] : person.team ? "Équipe orange" : "Équipe bleue")}${me ? " · toi" : ""}</div><h3 style="margin:2px 0 0;font-size:20px"><a href="${jl(person.id)}">${esc(person.name)}</a></h3><div class="${t.cls}" style="font-weight:600">${t.label}</div></div></div>
      <p class="summary">${matchSummary(g, person)}</p>${subBars(p.subs || {})}</section>
    <section class="c7 stack"><div class="between"><h3 style="margin:0">Sur ce match</h3><span class="faint">comparé aux ${others.length} autres joueurs de la game</span></div>
      ${goods.map((r) => matchInsight(r, me, person.name)).join("")}${bads.map((r) => matchInsight(r, me, person.name)).join("")}${!goods.length && !bads.length ? `<div class="empty">Aucun écart marquant avec les autres joueurs sur ce match.</div>` : ""}</section></div>`;
}
function matchInsight(r, me, name) {
  const good = r.score > 0;
  const who = me ? "tu" : name;
  const verdict = good ? (me ? `Ici, tu fais mieux que les autres joueurs de la game.` : `Ici, ${esc(name)} fait mieux que les autres joueurs de la game.`) : (me ? `Ici, tu es en dessous des autres joueurs de la game.` : `Ici, ${esc(name)} est en dessous des autres joueurs de la game.`);
  const advice = me && !good ? ` <span class="muted">Pour la prochaine fois : ${r.m.bad.charAt(0).toLowerCase() + r.m.bad.slice(1)}</span>` : "";
  void who;
  return `<div class="ins ${good ? "good" : "bad"}"><div class="hd"><b>${r.m.label}</b><span class="vs"><strong>${r.m.fmt(r.my)}</strong> · autres ${r.m.fmt(r.lo)}</span></div><p>${verdict}${advice}</p></div>`;
}
const SUB_NAMES = { att: "l'attaque", thr: "la menace", sur: "la survie", kast: "la participation", big: "les actions décisives", sw: "le swing" };
function subContext(k, p, g) {
  const r = p.r3 || {}, c = p.core;
  switch (k) {
    case "att": return `${c.goals} but${c.goals > 1 ? "s" : ""} et ${c.assists} passe${c.assists > 1 ? "s" : ""} décisive${c.assists > 1 ? "s" : ""}`;
    case "thr": return `${c.shots} tir${c.shots > 1 ? "s" : ""}${c.xg > 0 ? ` pour ${nf(c.xg, 2)} xG` : ""}`;
    case "sur": return `${nf(r.deaths, 1)} but(s) encaissé(s) sous sa responsabilité`;
    case "kast": return `utile dans ${nf(r.rounds ? (r.kast / r.rounds) * 100 : 0)} % des phases de jeu`;
    case "big": return r.big > 0 ? `des actions dans les moments chauds` : `peu d'actions dans les moments chauds`;
    case "sw": return `${r.swing >= 0 ? "+" : ""}${nf((r.swing || 0) * 100)} points de probabilité de victoire`;
  }
  return "";
}
function matchSummary(g, person) {
  const p = person.a, me = person.me, n = esc(person.name);
  const won = g.winner === person.team;
  const sc = person.team === 0 ? g.score : [g.score[1], g.score[0]];
  const ranked = g.people.filter((x) => x.r != null).sort((a, b) => b.r - a.r);
  const pos = ranked.findIndex((x) => x === person) + 1;
  const posTxt = pos === 1 ? "la meilleure note du match" : pos === ranked.length ? "la note la plus basse du match" : `la ${pos}e note du match sur ${ranked.length}`;
  const t = ratingTier(p.r);
  const subs = Object.entries(p.subs || {}).sort((a, b) => b[1] - a[1]);
  const top = subs.filter(([, v]) => v >= 1.1).slice(0, 2);
  const low = subs.filter(([, v]) => v < 0.9).slice(-1);
  const c = p.core;
  const parts = [];
  if (g.teamNames) parts.push(`${esc(g.teamNames[person.team])} ${won ? "gagne" : "perd"} ${sc[0]}-${sc[1]} contre ${esc(g.teamNames[1 - person.team])} sur ${esc(g.map)}${g.overtime ? ", après prolongation" : ""}.`);
  else parts.push(`${won ? "Victoire" : "Défaite"} ${sc[0]}-${sc[1]} en ${plName(g.playlist)} sur ${esc(g.map)}${g.overtime ? ", après prolongation" : ""}.`);
  parts.push(`${me ? "Tu termines" : n + " termine"} avec un Rating 3.0 de <b class="${t.cls}">${nf(p.r, 2)}</b> (${t.label.toLowerCase()}), ${posTxt}, avec ${c.goals} but${c.goals > 1 ? "s" : ""}, ${c.assists} passe${c.assists > 1 ? "s" : ""} décisive${c.assists > 1 ? "s" : ""} et ${c.saves} arrêt${c.saves > 1 ? "s" : ""}.`);
  if (top.length) parts.push(`${me ? "Ton match repose" : "Son match repose"} surtout sur ${top.map(([k, v]) => `${SUB_NAMES[k]} (${nf(v, 2)} : ${subContext(k, p, g)})`).join(" et ")}.`);
  else parts.push(`Aucune facette ne ressort vraiment : un match ${p.r >= 1 ? "solide mais sans coup d'éclat" : "discret"}.`);
  if (low.length) { const [k, v] = low[0]; parts.push(`Le point faible ici, c'est ${SUB_NAMES[k]} (${nf(v, 2)} : ${subContext(k, p, g)}).`); }
  return parts.join(" ");
}

function ratingExplainer() {
  return `<h2>Comprendre le Rating 3.0</h2><div class="glass"><p class="muted" style="margin-top:0;max-width:80ch">Inspiré du Rating 3.0 de HLTV (Counter-Strike) et adapté à Rocket League. Six sous-notes comparent ton match à celui des joueurs de tes games au même format (1v1, 2v2 ou 3v3), ramené à 5 minutes de jeu. <b>1,00 = un joueur moyen.</b> La note finale en est la moyenne pondérée.</p>
    <div class="explain">${SUBS.map((s) => `<div><div class="between"><b>${s.label}</b><span class="faint">${Math.round(s.w * 100)} % · ≈ ${s.cs}</span></div><div class="ex-short">${s.short}</div><p>${s.long}</p></div>`).join("")}</div>
    <div class="scale">${[...SCALE].reverse().map((x, i, arr) => `<span style="--c:${x.color}"><i></i>${x.label}<small>${i === 0 ? "< 0,85" : i === arr.length - 1 ? "≥ 1,30" : `${nf(x.min, 2)}+`}</small></span>`).join("")}</div></div>`;
}

function splitBar(a, b) {
  const t = (a || 0) + (b || 0) || 1, pa = ((a || 0) / t) * 100;
  return `<div class="split"><div style="width:${pa}%;background:linear-gradient(90deg,#1f5fc4,#3a8dff)">${nf(pa)} %</div><div style="width:${100 - pa}%;background:linear-gradient(90deg,#ff8c2b,#ffae6b)">${nf(100 - pa)} %</div></div>`;
}

function boostChart(g) {
  const cv = $("#cBoost"); if (!cv) return;
  const pal = [["#3a8dff", "#8cc0ff", "#1f5fc4"], ["#ff8c2b", "#ffbf8a", "#c95f10"]];
  const c = [0, 0];
  const ds = g.people.filter((p) => p.a?.boostCurve?.length).map((p) => {
    const col = pal[p.team][c[p.team]++ % 3];
    return { label: p.name, data: p.a.boostCurve.map(([x, y]) => ({ x, y })), borderColor: col, backgroundColor: col, borderWidth: p.me ? 2.5 : 1.5, pointRadius: 0, tension: .25, hidden: !!g.me && !p.me };
  });
  charts.push(new Chart(cv, { type: "line", data: { datasets: ds }, options: chartOpts({ x: { type: "linear", ticks: { color: "#a3a8d8", callback: (v) => mmss(v) } }, y: { min: 0, max: 100 } }, { plugins: { legend: { display: true, labels: { color: "#eef0ff", boxWidth: 10, boxHeight: 10, usePointStyle: true } } } }) }));
}

function fieldHtml(id) {
  return `<div class="field"><canvas id="${id}" width="120" height="150"></canvas>
    <svg class="lines" viewBox="0 0 100 125" preserveAspectRatio="none" aria-hidden="true">
      <path d="M17 3 H83 L97 16 V109 L83 122 H17 L3 109 V16 Z" fill="none" stroke="rgba(238,240,255,.45)" stroke-width=".8"/>
      <line x1="3" y1="62.5" x2="97" y2="62.5" stroke="rgba(238,240,255,.3)" stroke-width=".6"/>
      <circle cx="50" cy="62.5" r="11" fill="none" stroke="rgba(238,240,255,.3)" stroke-width=".6"/>
      <rect x="38" y="0.5" width="24" height="3" rx="1" fill="#ff8c2b"/><rect x="38" y="121.5" width="24" height="3" rx="1" fill="#3a8dff"/>
    </svg></div>`;
}
function drawHeat(cv, data) {
  if (!cv || !data) return;
  const ctx = cv.getContext("2d");
  const cols = 12, rows = 16, w = cv.width / cols, h = cv.height / rows;
  ctx.fillStyle = "rgba(10,14,40,.85)"; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.globalCompositeOperation = "lighter";
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const v = (data[r * cols + c] || 0) / 100;
    if (v <= 0.08) continue;
    const x = (c + 0.5) * w, y = (r + 0.5) * h, rad = w * 1.6;
    const hueV = 210 - v * 200; // bleu froid -> jaune -> rouge
    const gr = ctx.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `hsla(${hueV}, 100%, ${50 + v * 10}%, ${Math.pow(v, 1.2) * 0.6})`);
    gr.addColorStop(1, `hsla(${hueV}, 100%, 55%, 0)`);
    ctx.fillStyle = gr; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  ctx.globalCompositeOperation = "source-over";
}

// ---------------- Conseils ----------------
const METRICS = [
  { k: "bpm", label: "Boost ramassé par minute", get: (p) => p.boost.bpm, fmt: N(0), better: "high", good: "Tu ramasses plus de boost que les joueurs de tes lobbys : tu as presque toujours de quoi jouer.", bad: "Tu ramasses moins de boost que les autres. Prends les petits pads sur ta trajectoire de rotation au lieu de faire des détours pour les gros." },
  { k: "zero", label: "Temps à 0 boost", get: (p) => p.boost.pctZero, fmt: pct, better: "low", good: "Tu es rarement à sec : tu gères bien ta réserve.", bad: "Tu passes trop de temps sans boost. Lâche le boost quand tu es déjà supersonic et récupère quelques petits pads avant de remonter sur le ballon." },
  { k: "stolen", label: "Boost volé à l'adversaire", get: (p) => p.boost.stolen, fmt: N(0), better: "high", good: "Tu affames l'adversaire en lui volant son boost.", bad: "Tu voles peu de boost. Après une attaque, repasse par un gros pad adverse : tu te recharges et tu prives l'adversaire." },
  { k: "overfill", label: "Boost gaspillé (au-delà de 100)", get: (p) => p.boost.overfill, fmt: N(0), better: "low", good: "Tu gaspilles peu de boost.", bad: "Tu prends souvent des gros pads alors que tu es déjà bien rempli. Laisse-les à tes coéquipiers." },
  { k: "speed", label: "Vitesse moyenne", get: (p) => p.movement.avgSpeed, fmt: kmh, better: "high", good: "Tu joues vite et tu arrives sur les ballons avant les autres.", bad: "Tu joues plus lentement que tes adversaires. Garde ton élan : enchaîne les flips et prends tes virages en courbe." },
  { k: "ss", label: "Temps en supersonic", get: (p) => p.movement.pctSupersonic, fmt: pct, better: "high", good: "Tu passes beaucoup de temps à pleine vitesse.", bad: "Tu es rarement supersonic. Une fois à pleine vitesse, maintiens-la avec des flips plutôt qu'en freinant." },
  { k: "slow", label: "Temps à vitesse lente", get: (p) => p.movement.pctSlow, fmt: pct, better: "low", good: "Tu restes rarement à l'arrêt.", bad: "Tu passes beaucoup de temps lent, souvent signe d'hésitation. Reste en mouvement, même en défense." },
  { k: "behind", label: "Temps derrière le ballon", get: (p) => p.positioning.pctBehindBall, fmt: pct, better: "high", good: "Tu restes du bon côté du ballon et tu es rarement pris à contre-pied.", bad: "Tu es souvent mal placé par rapport au ballon. Reviens toujours entre le ballon et ton but avant de remonter." },
  { k: "ahead", label: "Temps devant le ballon", get: (p) => p.positioning.pctAheadBall, fmt: pct, better: "low", good: "Tu te fais rarement dépasser par le jeu.", bad: "Tu t'engages trop et tu te fais contrer. Recule plus tôt quand ton coéquipier est déjà sur le ballon." },
  { k: "fifty", label: "50/50 gagnés", get: (p) => (p.control.fiftyTotal ? (p.control.fiftyWins / p.control.fiftyTotal) * 100 : null), fmt: pct, better: "high", good: "Tu gagnes la majorité de tes duels.", bad: "Tu perds trop de 50/50. Arrive avec du boost, flippe au dernier moment et vise le centre du ballon." },
  { k: "beaten", label: "Fois devancé sur le ballon", get: (p) => p.control.beatenToBall, fmt: N(1), better: "low", good: "Tu te fais rarement devancer.", bad: "Tu te fais souvent devancer. Anticipe le rebond et pars plus tôt, ou laisse le ballon si tu n'y arriveras pas en premier." },
  { k: "whiff", label: "Ballons ratés", get: (p) => p.control.whiffs, fmt: N(1), better: "low", good: "Tu rates peu de ballons.", bad: "Tu rates plus de ballons que les autres. Travaille les touches à pleine vitesse et les aériens courts en entraînement libre." },
  { k: "touches", label: "Touches de balle", get: (p) => p.core.touches, fmt: N(1), better: "high", good: "Tu es très impliqué dans le jeu.", bad: "Tu touches peu le ballon. Rends-toi disponible plus tôt pour tes coéquipiers." },
  { k: "possession", label: "Temps de possession", get: (p) => p.control.possessionSec, fmt: (v) => nf(v, 0) + " s", better: "high", good: "Tu gardes bien le ballon.", bad: "Tu gardes peu le ballon. Essaie les touches contrôlées au lieu de frapper à chaque contact." },
  { k: "passes", label: "Passes réussies", get: (p) => p.control.passes, fmt: N(1), better: "high", teamOnly: true, good: "Tu fais jouer tes coéquipiers.", bad: "Tu fais peu de passes. En attaque, pousse le ballon vers le centre pour ton coéquipier." },
  { k: "shots", label: "Tirs", get: (p) => p.core.shots, fmt: N(2), better: "high", good: "Tu tentes beaucoup ta chance.", bad: "Tu tires peu. Dans le tiers offensif, cadre plutôt que de chercher l'action parfaite." },
  { k: "finishing", label: "Buts marqués vs xG", get: (p) => (p.core.xg > 0 ? p.core.goals - p.core.xg : null), fmt: (v) => (v > 0 ? "+" : "") + nf(v, 2), better: "high", good: "Tu marques plus que tes occasions ne le laissent prévoir : bonne finition.", bad: "Tu marques moins que la qualité de tes occasions ne le laisse prévoir. Travaille la précision des tirs." },
  { k: "saves", label: "Arrêts", get: (p) => p.core.saves, fmt: N(2), better: "high", good: "Tu es solide dans ton but.", bad: "Tu fais moins d'arrêts que les autres. Recule plus tôt quand l'adversaire avance et reste face au jeu." },
  { k: "demos", label: "Démolitions infligées", get: (p) => p.core.demosInflicted, fmt: N(2), better: "high", good: "Tu mets la pression physique sur l'adversaire.", bad: "Tu démolis rarement. En deuxième homme à pleine vitesse, une démo sur le défenseur ouvre souvent le but." },
  { k: "demosTaken", label: "Démolitions subies", get: (p) => p.core.demosTaken, fmt: N(2), better: "low", good: "Tu te fais rarement démolir.", bad: "Tu te fais souvent démolir. Saute ou change de trajectoire quand un adversaire supersonic fonce sur toi." },
];
// samples : [{ me: joueurAnalysé, others: [joueursAnalysés] }]
function lobbyCompare(samples, teamMode) {
  const out = {};
  for (const m of METRICS) {
    if (m.teamOnly && !teamMode) continue;
    const mine = [], others = [];
    for (const s of samples) {
      const v = m.get(s.me); if (v != null && !Number.isNaN(v)) mine.push(v);
      for (const p of s.others) { const o = m.get(p); if (o != null && !Number.isNaN(o)) others.push(o); }
    }
    if (!mine.length || !others.length) continue;
    const avg = (x) => x.reduce((a, b) => a + b, 0) / x.length;
    const my = avg(mine), lo = avg(others);
    const sd = Math.sqrt(others.reduce((a, b) => a + (b - lo) ** 2, 0) / others.length) || 1;
    const z = (my - lo) / sd;
    out[m.k] = { m, my, lo, score: m.better === "low" ? -z : z, n: mine.length };
  }
  return out;
}
function insightCard(r, advice) {
  const good = r.score > 0;
  return `<div class="ins ${good ? "good" : "bad"}"><div class="hd"><b>${r.m.label}</b><span class="vs"><strong>${r.m.fmt(r.my)}</strong> · lobbys ${r.m.fmt(r.lo)}</span></div>${advice ? `<p>${good ? r.m.good : r.m.bad}</p>` : ""}</div>`;
}

// ---------------- Profil (toi ou un autre joueur) ----------------
function renderProfile(id, isMe) {
  const PRO = S.proMode && !isMe;
  const pl = (PRO ? S.proPlayers : S.players).get(id);
  if (!pl) { view.innerHTML = isMe ? `<h1>Analyse</h1><div style="margin-top:20px">${S.games.length ? `<div class="empty"><h3>Pas encore de game analysée</h3><p>Ton profil tactique apparaît dès qu'un replay est analysé.</p></div>` : connectCard()}</div>` : `<a class="back" href="#/joueurs">${ICON.back}Joueurs</a><div class="empty">Joueur introuvable.</div>`; return; }
  if (!isMe && !PRO && pl.me) { location.hash = "#/analyse"; return; }
  const f = S.af;
  const custom = isMe && S.custom ? S.custom : null;
  const allA = pl.games.filter(({ p }) => p.a);
  const pls = [...new Set(allA.map(({ g }) => g.playlist))].filter((x) => x != null);
  let sel;
  if (custom) sel = allA.filter(({ g }) => custom.guids.has(g.guid));
  else { sel = f.pl === "all" ? allA : allA.filter(({ g }) => String(g.playlist) === f.pl); if (f.n !== "all") sel = sel.slice(0, +f.n); }
  const avgR = avgOf(sel, ({ p }) => p.r);
  const wins = sel.filter(({ g, p }) => g.winner === p.team).length;
  const subAvg = Object.fromEntries(SUBS.map((s) => [s.k, avgOf(sel, ({ p }) => p.a.subs?.[s.k])]));
  const rec = (arr) => { const w = arr.filter(({ g }) => g.result === "W").length, l = arr.filter(({ g }) => g.result === "L").length; return `${w} V – ${l} D`; };
  const rec2 = (arr) => { const w = arr.filter(({ g, p }) => g.winner === p.team).length; return `${w} V – ${arr.length - w} D`; };
  const teamMode = sel.some(({ g }) => g.teamSize > 1);
  const samples = sel.map(({ g, p }) => ({ me: p.a, others: g.people.filter((x) => x.a && x !== p).map((x) => x.a) }));
  const arch = sel.length ? archetype(samples, teamMode) : null;

  let html = isMe ? "" : PRO ? `<a class="back" href="#/pro/t/${encodeURIComponent(pl.tour || "")}">${ICON.back}${esc(pl.tourName || "Compétition")}</a>` : `<a class="back" href="#/joueurs">${ICON.back}Joueurs</a>`;
  if (custom) html += `<div class="note sel-note between"><span>Analyse de ta sélection : <b>${esc(custom.label)}</b> (${sel.length} game${sel.length > 1 ? "s" : ""} analysée${sel.length > 1 ? "s" : ""})</span><button class="btn sm" id="clearCustom">Revenir à toutes mes games</button></div>`;
  html += `<section class="glass hero"><div><div class="row" style="gap:18px">${avatar(pl.name, true)}<div><div class="who">${isMe ? "Ton analyse tactique" : PRO ? `Joueur pro · ${esc(pl.teamName || "")}` : esc(pl.platform || "Joueur")}</div><h1>${esc(pl.name)}</h1></div></div>
    ${arch ? `<div class="arch"><span class="faint">Type de joueur</span><div class="arch-name">${arch.main.name}</div><p>${arch.main.desc}</p>${arch.second ? `<div class="muted">Avec un côté <b>${arch.second.name}</b>.</div>` : ""}<div class="chips" style="margin-top:10px">${arch.main.proof.map((x) => `<span class="tag">${x}</span>`).join("")}</div></div>` : ""}
    ${isMe ? "" : PRO ? `<div class="kpis" style="max-width:640px"><div><b>${pl.games.length}</b><span>games</span></div><div><b>${rec2(pl.games)}</b><span>bilan de son équipe</span></div><div><b>${esc(pl.teamName || "—")}</b><span>équipe</span></div></div>` : `<div class="kpis" style="max-width:640px"><div><b>${pl.games.length}</b><span>games ensemble</span></div><div><b>${rec(pl.with)}</b><span>${pl.with.length} avec toi</span></div><div><b>${rec(pl.against)}</b><span>${pl.against.length} contre toi (ton bilan)</span></div></div>
         <p class="faint" style="margin-top:14px">Basé uniquement sur les games que vous avez jouées ensemble.</p>`}</div>
    <div style="text-align:center">${gauge(avgR, "xl", "Rating 3.0 moyen")}<div class="muted" style="margin-top:6px">${sel.length} game(s) analysée(s) · ${sel.length ? nf((wins / sel.length) * 100) : "—"} % de victoires</div></div></section>`;
  if (allA.length > 0 && !custom && !PRO) html += `<div class="toolbar"><div class="chips">${[["all", "Tous les modes"], ...pls.map((p) => [String(p), plName(p)])].map(([v, l]) => `<button class="chip ${f.pl === v ? "on" : ""}" data-apl="${v}">${l}</button>`).join("")}</div>
    <div class="chips" style="margin-left:auto">${[["20", "20 games"], ["50", "50"], ["100", "100"], ["all", "Toutes"]].map(([v, l]) => `<button class="chip ${f.n === v ? "on" : ""}" data-an="${v}">${l}</button>`).join("")}</div></div>`;
  if (!sel.length) {
    html += `<div class="empty" style="margin-top:20px">${allA.length ? "Aucune game analysée pour ce filtre." : "Aucune game analysée avec ce joueur pour l'instant."}</div>`;
    if (!isMe) html += PRO ? proGamesList(pl) : togetherList(pl);
    view.innerHTML = html; bindProfileFilters(id, isMe); bindRows(); return;
  }
  const sorted = Object.values(lobbyCompare(samples, teamMode)).sort((a, b) => b.score - a.score);
  const strengths = sorted.filter((r) => r.score > 0.25).slice(0, 4), weak = sorted.filter((r) => r.score < -0.25).reverse().slice(0, 4);
  // mes moyennes (pour comparer un autre joueur à moi), sur le même mode
  let mine = null;
  if (!isMe) {
    const meP = [...S.players.values()].find((x) => x.me);
    if (meP) {
      let ms = meP.games.filter(({ p }) => p.a);
      if (PRO) ms = ms.filter(({ g }) => g.teamSize === 3);
      else if (f.pl !== "all") ms = ms.filter(({ g }) => String(g.playlist) === f.pl);
      if (ms.length) mine = Object.fromEntries(METRICS.map((m) => [m.k, avgOf(ms, ({ p }) => m.get(p.a))]));
    }
  }
  const ranked = [...sel].filter(({ p }) => p.r != null).sort((a, b) => b.p.r - a.p.r);
  const best = ranked[0], worst = ranked.length > 1 ? ranked[ranked.length - 1] : null;

  html += `${best ? `<div class="bento" style="margin-top:6px"><section class="c6">${classCard(best, true, isMe)}</section><section class="c6">${worst ? classCard(worst, false, isMe) : ""}</section></div>` : ""}
  <div class="bento" style="margin-top:16px">
    <section class="glass c6"><h3>Profil Rating 3.0</h3><p class="muted" style="margin:-6px 0 0">Les six sous-notes. Le contour pointillé = 1,00, le joueur moyen.</p><div class="chartbox tall"><canvas id="cRadar"></canvas></div></section>
    <section class="glass c6"><h3>${isMe ? "Où tu passes ton temps" : "Où il passe son temps"}</h3><div class="row" style="align-items:flex-start;gap:26px;margin-top:6px"><figure style="margin:0;width:180px">${fieldHtml("hmAll")}<figcaption class="faint" style="margin-top:8px">Attaque vers le haut.</figcaption></figure><div class="grow" style="min-width:220px">${zoneBars(sel.map(({ p }) => p.a), teamMode)}</div></div></section>
    <section class="c6"><h2 style="margin-top:20px">Points forts</h2><div class="stack">${strengths.length ? strengths.map((r) => insightCard(r, isMe)).join("") : `<div class="empty">Pas de point fort net pour l'instant.</div>`}</div></section>
    <section class="c6"><h2 style="margin-top:20px">${isMe ? "À travailler" : "Points faibles"}</h2><div class="stack">${weak.length ? weak.map((r) => insightCard(r, isMe)).join("") : `<div class="empty">Aucun point faible net par rapport aux lobbys.</div>`}</div></section>
  </div>
  <h2>${isMe ? "Comparé aux lobbys" : "Comparé aux lobbys et à toi"}</h2><div class="glass flush tablewrap"><table class="t"><thead><tr><th>Stat (moyenne par game)</th><th>${isMe ? "Toi" : esc(pl.name)}</th>${mine ? `<th>Toi</th>` : ""}<th>Lobbys</th><th style="text-align:center;width:28%">Écart avec les lobbys</th></tr></thead><tbody>
  ${sorted.map((r) => { const w = Math.min(50, Math.abs(r.score) * 25), pos = r.score >= 0; const mv = mine?.[r.m.k]; const heBetter = mv != null && (r.m.better === "high" ? r.my > mv : r.my < mv); return `<tr><td>${r.m.label}</td><td><b>${r.m.fmt(r.my)}</b></td>${mine ? `<td class="${mv == null ? "" : heBetter ? "down" : "up"}">${mv == null ? "—" : r.m.fmt(mv)}</td>` : ""}<td class="muted">${r.m.fmt(r.lo)}</td><td><div class="delta"><i style="${pos ? "left:50%" : `left:${50 - w}%`};width:${w}%;background:${pos ? "var(--up)" : "var(--down)"}"></i></div></td></tr>`; }).join("")}
  </tbody></table></div><p class="legend">${mine ? "Colonne Toi : en vert quand tu fais mieux que lui, en rouge quand il fait mieux que toi (tes moyennes sur toutes tes games du même mode). " : ""}Barre verte : mieux que la moyenne des joueurs croisés. Barre rouge : moins bien.</p>
  <h2>Tendances</h2><div class="bento"><section class="glass c6"><h3>Rating 3.0 par game</h3><div class="chartbox"><canvas id="tR"></canvas></div></section>
  <section class="glass c6"><h3>Boost : ramassé par minute et temps à 0</h3><div class="chartbox"><canvas id="tB"></canvas></div></section>
  <section class="glass c6"><h3>Vitesse moyenne</h3><div class="chartbox"><canvas id="tS"></canvas></div></section>
  <section class="glass c6"><h3>Placement par rapport au ballon</h3><div class="chartbox"><canvas id="tP"></canvas></div></section></div>
  <div class="bento" style="margin-top:16px"><section class="c6"><h2 style="margin-top:20px">Par terrain</h2>${groupTable(sel, ({ g }) => g.map, "Terrain")}</section>
  <section class="c6"><h2 style="margin-top:20px">Par voiture</h2>${groupTable(sel, ({ p }) => carName(p.a), "Voiture")}</section></div>
  <div class="bento" style="margin-top:16px">${isMe && teamMode ? `<section class="c6"><h2 style="margin-top:20px">Avec tes coéquipiers</h2>${mates(sel)}</section>` : ""}<section class="c6"><h2 style="margin-top:20px">Engagements</h2>${kickoffPanel(sel)}</section></div>
  ${isMe ? ratingExplainer() : ""}
  ${!isMe ? (PRO ? proGamesList(pl) : togetherList(pl)) : ""}`;
  view.innerHTML = html;
  bindProfileFilters(id, isMe);
  bindRows();
  $("#clearCustom") && ($("#clearCustom").onclick = () => { S.custom = null; clearCharts(); renderProfile(id, isMe); });

  charts.push(new Chart($("#cRadar"), {
    type: "radar",
    data: { labels: SUBS.map((s) => s.label), datasets: [
      { label: isMe ? "Toi" : pl.name, data: SUBS.map((s) => subAvg[s.k]), borderColor: "#ff9a1f", backgroundColor: "rgba(255,154,31,.22)", pointBackgroundColor: SUBS.map((s) => tierColor(subAvg[s.k])), pointRadius: 4, borderWidth: 2 },
      { label: "Joueur moyen", data: SUBS.map(() => 1), borderColor: "rgba(238,240,255,.5)", borderDash: [4, 4], backgroundColor: "transparent", pointRadius: 0, borderWidth: 1 },
    ] },
    options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { labels: { color: "#eef0ff", boxWidth: 10, usePointStyle: true } } },
      scales: { r: { min: 0, max: 2, ticks: { display: false, stepSize: 0.5 }, grid: { color: "rgba(195,205,255,.12)" }, angleLines: { color: "rgba(195,205,255,.12)" }, pointLabels: { color: "#eef0ff", font: { family: "Unbounded", size: 11, weight: "600" } } } } },
  }));
  const agg = new Array(192).fill(0);
  for (const { p } of sel) (p.a.heatmap || []).forEach((v, i) => (agg[i] += v));
  const mx = Math.max(...agg, 1);
  drawHeat($("#hmAll"), agg.map((v) => (v / mx) * 100));

  const ord = sel.slice().reverse();
  const labels = ord.map(({ g }) => fmtDate(g.time));
  const line = (cid, sets, y = {}, extra) => { charts.push(new Chart($(cid), { type: "line", data: { labels, datasets: sets.map((s) => ({ pointRadius: 2, tension: .3, borderWidth: 2, ...s })) }, options: chartOpts({ y, extra }, { plugins: { legend: { display: sets.length > 1, labels: { color: "#eef0ff", boxWidth: 10, usePointStyle: true } } } }) })); };
  line("#tR", [{ label: "Rating", data: ord.map(({ p }) => p.r), borderColor: "#a6e05a", pointBackgroundColor: ord.map(({ p }) => tierColor(p.r)), pointRadius: 3 }, { label: "Moyenne sur 5 games", data: rolling(ord.map(({ p }) => p.r), 5), borderColor: "#eef0ff", pointRadius: 0, borderDash: [4, 4] }], { suggestedMin: 0.4, suggestedMax: 1.6 });
  line("#tB", [{ label: "BPM", data: ord.map(({ p }) => p.a.boost.bpm), borderColor: "#3a8dff", yAxisID: "y" }, { label: "% du temps à 0", data: ord.map(({ p }) => p.a.boost.pctZero), borderColor: "#ff5577", yAxisID: "y1" }], {}, { y1: { position: "right", grid: { display: false }, ticks: { color: "#a3a8d8" }, border: { display: false } } });
  line("#tS", [{ label: "km/h", data: ord.map(({ p }) => p.a.movement.avgSpeed * 0.036), borderColor: "#ffe24a" }]);
  line("#tP", [{ label: "Derrière le ballon %", data: ord.map(({ p }) => p.a.positioning.pctBehindBall), borderColor: "#2fe39b" }, { label: "Devant le ballon %", data: ord.map(({ p }) => p.a.positioning.pctAheadBall), borderColor: "#ff5577" }]);
}

function classCard({ g, p }, isBest, isMe) {
  const c = p.core, won = g.winner === p.team;
  const sc = p.team === 0 ? g.score : [g.score[1], g.score[0]];
  return `<a class="glass classcard ${isBest ? "best" : "worst"}" href="#/game/${encodeURIComponent(g.guid)}">
    <div class="cc-label">${isBest ? (p.r >= 1.05 ? "La plus grosse masterclass" : "Le meilleur match") : (p.r < 0.95 ? "La plus grosse disaster class" : "Le match le plus discret")}</div>
    <div class="row" style="gap:18px;margin-top:10px">${gauge(p.r, "md")}<div><div class="cc-score"><span class="${won ? "up" : "down"}">${won ? "Victoire" : "Défaite"} ${sc[0]}-${sc[1]}</span></div><div class="muted">${g.teamNames ? esc(g.teamNames[p.team] + " – " + g.teamNames[1 - p.team]) : plName(g.playlist)} · ${esc(g.map)} · ${fmtDate(g.time)}</div>
    <div class="statline" style="margin-top:8px"><span><b>${c.goals}</b>buts</span><span><b>${c.assists}</b>passes</span><span><b>${c.saves}</b>arrêts</span><span><b>${c.shots}</b>tirs</span></div></div></div></a>`;
}

const CAR_NAMES = { 23: "Octane", 4284: "Fennec", 403: "Dominus", 22: "Breakout", 402: "Takumi", 30: "Merc", 803: "Batmobile" };
function carName(p) {
  if (p.carBodyId != null && CAR_NAMES[p.carBodyId]) return CAR_NAMES[p.carBodyId];
  if (p.carBodyId != null) return `${p.car || "Voiture"} (carrosserie n° ${p.carBodyId})`;
  return p.car ? `Hitbox ${p.car}` : "Inconnue";
}

// ---- Type de joueur (archétype) à partir des écarts avec les lobbys ----
const FEATS = {
  goals: (p) => p.core.goals, shots: (p) => p.core.shots, xg: (p) => (p.core.xg > 0 ? p.core.xg : null), saves: (p) => p.core.saves,
  assists: (p) => p.core.assists, passes: (p) => p.control.passes, centers: (p) => p.control.centers, poss: (p) => p.control.possessionSec,
  touches: (p) => p.core.touches, demos: (p) => p.core.demosInflicted, bumps: (p) => p.mechanics.bumps, fifty: (p) => (p.control.fiftyTotal ? p.control.fiftyWins / p.control.fiftyTotal : null),
  stolen: (p) => p.boost.stolen, bpm: (p) => p.boost.bpm, speed: (p) => p.movement.avgSpeed, ss: (p) => p.movement.pctSupersonic, slow: (p) => p.movement.pctSlow,
  behind: (p) => p.positioning.pctBehindBall, ahead: (p) => p.positioning.pctAheadBall, off3: (p) => p.positioning.pctOffThird, def3: (p) => p.positioning.pctDefThird,
  back: (p) => p.positioning.pctMostBack, close: (p) => p.positioning.pctClosestToBall, aerial: (p) => p.control.aerialTouches, high: (p) => p.movement.pctHighAir,
  mech: (p) => p.mechanics.flicks + p.mechanics.airDribbles + p.mechanics.flipResets + p.mechanics.ceilingShots + p.mechanics.wallAerials,
  carry: (p) => p.control.carrySec + p.mechanics.flicks * 2,
};
const ARCHES = [
  { name: "Finisseur", f: { goals: 1.2, shots: 1, xg: 0.8, off3: 0.6 }, desc: "Toujours là pour conclure : beaucoup de tirs, beaucoup de buts, et du temps passé près du but adverse.", proof: ["goals", "shots", "off3"] },
  { name: "Dernier rempart", f: { saves: 1.2, behind: 0.8, back: 0.8, def3: 0.6, ahead: -0.6 }, desc: "Le mur de l'équipe : souvent dernier défenseur, bien placé derrière le ballon, et beaucoup d'arrêts.", proof: ["saves", "behind", "def3"], team: false },
  { name: "Meneur de jeu", f: { assists: 1.1, passes: 1, centers: 0.8, poss: 0.6 }, desc: "Celui qui fait jouer les autres : passes, centres et possession. Il crée plus qu'il ne finit.", proof: ["assists", "passes", "poss"], teamOnly: true },
  { name: "Bulldozer", f: { demos: 1.3, bumps: 0.8, fifty: 0.7 }, desc: "Le jeu physique avant tout : démolitions, bumps et 50/50 gagnés. Les adversaires le sentent passer.", proof: ["demos", "fifty", "bumps"] },
  { name: "Voleur de boost", f: { stolen: 1.3, bpm: 0.9 }, desc: "Il affame l'adversaire : énormément de boost ramassé, et surtout dans le camp d'en face.", proof: ["stolen", "bpm"] },
  { name: "Fusée", f: { speed: 1.1, ss: 1, slow: -0.8 }, desc: "Toujours à pleine vitesse : supersonic une bonne partie du match, rarement à l'arrêt.", proof: ["speed", "ss"] },
  { name: "Artiste aérien", f: { aerial: 1.1, high: 0.9, mech: 1 }, desc: "Joue dans les airs : touches aériennes, aériens depuis le mur, flicks et autres mécaniques.", proof: ["aerial", "high", "mech"] },
  { name: "Dribbleur", f: { carry: 1.2, poss: 0.8, touches: 0.6 }, desc: "Garde le ballon au pied : dribbles, possession et contrôle plutôt que les frappes directes.", proof: ["carry", "poss", "touches"] },
  { name: "Chasseur de ballon", f: { close: 1.1, ahead: 0.7, touches: 0.6, behind: -0.6 }, desc: "Toujours sur le ballon, quitte à sortir des rotations : très présent, mais souvent devant le jeu.", proof: ["close", "touches", "ahead"] },
  { name: "Joueur de rotation", f: { behind: 1, ahead: -0.8, close: -0.4, slow: -0.4 }, desc: "Discipliné : respecte les rotations, reste du bon côté du ballon et ne surcharge pas l'action.", proof: ["behind", "ahead"], teamOnly: true },
];
const FEAT_LABELS = { goals: "buts", shots: "tirs", off3: "temps dans le tiers offensif", saves: "arrêts", behind: "temps derrière le ballon", def3: "temps dans le tiers défensif", assists: "passes décisives", passes: "passes", poss: "possession", demos: "démolitions", fifty: "50/50 gagnés", bumps: "bumps", stolen: "boost volé", bpm: "boost ramassé", speed: "vitesse", ss: "temps supersonic", aerial: "touches aériennes", high: "temps haut dans les airs", mech: "mécaniques", carry: "dribbles", touches: "touches", close: "temps au plus près du ballon", ahead: "temps devant le ballon" };
function archetype(samples, teamMode) {
  const z = {};
  for (const [k, get] of Object.entries(FEATS)) {
    const mine = [], oth = [];
    for (const s of samples) { const v = get(s.me); if (v != null && !Number.isNaN(v)) mine.push(v); for (const o of s.others) { const w = get(o); if (w != null && !Number.isNaN(w)) oth.push(w); } }
    if (!mine.length || oth.length < 2) continue;
    const mo = oth.reduce((a, b) => a + b, 0) / oth.length, sd = Math.sqrt(oth.reduce((a, b) => a + (b - mo) ** 2, 0) / oth.length) || 1;
    z[k] = (mine.reduce((a, b) => a + b, 0) / mine.length - mo) / sd;
  }
  const scored = ARCHES.filter((a) => !a.teamOnly || teamMode).map((a) => {
    let sc = 0, w = 0;
    for (const [k, wt] of Object.entries(a.f)) if (z[k] != null) { sc += z[k] * wt; w += Math.abs(wt); }
    return { ...a, score: w ? sc / w : -9 };
  }).sort((a, b) => b.score - a.score);
  const main = scored[0];
  if (!main || main.score < 0.15) return { main: { name: "Polyvalent", desc: "Aucune facette ne ressort nettement : un profil équilibré, proche de la moyenne de ses lobbys sur tous les plans.", proof: [] }, second: null };
  main.proof = main.proof.filter((k) => z[k] != null).map((k) => { const v = z[k], neg = main.f[k] < 0; const strong = Math.abs(v) >= 1.5; return `${FEAT_LABELS[k]} : ${v >= 0 ? (strong ? "très au-dessus" : "au-dessus") : (strong ? "très en dessous" : "en dessous")} des lobbys${neg ? "" : ""}`; });
  const second = scored[1] && scored[1].score > 0.35 ? scored[1] : null;
  return { main, second };
}
function bindProfileFilters(id, isMe) {
  const again = () => { clearCharts(); renderProfile(id, isMe); };
  $$("[data-apl]").forEach((b) => (b.onclick = () => { S.af.pl = b.dataset.apl; again(); }));
  $$("[data-an]").forEach((b) => (b.onclick = () => { S.af.n = b.dataset.an; again(); }));
}
function togetherList(pl) {
  return `<h2>Vos games ensemble</h2><div class="games">${pl.games.slice(0, 40).map(({ g }) => gameRow(g)).join("")}</div>`;
}
function rolling(arr, n) { return arr.map((_, i) => { const s = arr.slice(Math.max(0, i - n + 1), i + 1).filter((x) => x != null); return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null; }); }

function zoneBars(ps, team) {
  const avg = (f) => ps.reduce((a, p) => a + (f(p) || 0), 0) / ps.length;
  const bar = (title, parts) => `<div class="muted" style="margin:14px 0 7px">${title}</div><div class="split">${parts.map(([l, v, c]) => `<div style="width:${v}%;background:${c}" title="${l} ${nf(v)} %">${v > 16 ? `${l} ${nf(v)} %` : ""}</div>`).join("")}</div>`;
  let h = bar("Tiers du terrain", [["Déf.", avg((p) => p.positioning.pctDefThird), "#3a8dff"], ["Milieu", avg((p) => p.positioning.pctNeuThird), "#a3a8d8"], ["Off.", avg((p) => p.positioning.pctOffThird), "#ff8c2b"]]);
  h += bar("Par rapport au ballon", [["Derrière", avg((p) => p.positioning.pctBehindBall), "#2fe39b"], ["Niveau", avg((p) => p.positioning.pctLevelBall), "#a3a8d8"], ["Devant", avg((p) => p.positioning.pctAheadBall), "#ff5577"]]);
  h += bar("Hauteur", [["Sol", avg((p) => p.movement.pctGround), "#a3a8d8"], ["Air bas", avg((p) => p.movement.pctLowAir), "#8cc0ff"], ["Air haut", avg((p) => p.movement.pctHighAir), "#b678ff"]]);
  if (team) { const fm = avg((p) => p.positioning.pctFirstMan), sm = avg((p) => p.positioning.pctSecondMan); h += bar("Rôle dans la rotation", [["1er homme", fm, "#ff8c2b"], ["2e homme", sm, "#3a8dff"], ["Autre", Math.max(0, 100 - fm - sm), "#4a4f86"]]); }
  return h;
}
function groupTable(sel, key, label) {
  const m = {};
  for (const x of sel) (m[key(x)] ||= []).push(x);
  const rows = Object.entries(m).map(([k, arr]) => ({ k, arr, r: avgOf(arr, ({ p }) => p.r), w: arr.filter(({ g, p }) => g.winner === p.team).length / arr.length })).sort((a, b) => b.arr.length - a.arr.length).slice(0, 12);
  const elig = rows.filter((x) => x.arr.length >= 2 && x.r != null);
  const fav = elig.length >= 2 ? elig.reduce((a, b) => (b.r > a.r ? b : a)) : null, bad = elig.length >= 2 ? elig.reduce((a, b) => (b.r < a.r ? b : a)) : null;
  return `<div class="glass flush tablewrap"><table class="t"><thead><tr><th>${label}</th><th>Games</th><th>Victoires</th><th>Rating</th></tr></thead><tbody>${rows.map((x) => `<tr><td>${esc(x.k)}${x === fav ? ` <span class="tag W">là où tu brilles</span>` : x === bad ? ` <span class="tag L">bête noire</span>` : ""}</td><td>${x.arr.length}</td><td>${nf(x.w * 100)} %</td><td class="r3cell ${ratingTier(x.r).cls}">${r2(x.r)}</td></tr>`).join("")}</tbody></table></div>${elig.length < 2 ? `<p class="legend">Les étiquettes apparaissent quand au moins deux ${label === "Terrain" ? "terrains" : "voitures"} ont 2 games ou plus.</p>` : ""}`;
}
function mates(sel) {
  const m = {};
  for (const { g, p } of sel) for (const o of g.people) if (o !== p && o.team === p.team) (m[o.id] ||= { id: o.id, name: o.name, xs: [] }).xs.push({ g, p });
  const rows = Object.values(m).filter((x) => x.xs.length >= 2).sort((a, b) => b.xs.length - a.xs.length).slice(0, 10);
  if (!rows.length) return `<div class="empty">Pas encore plusieurs games avec le même coéquipier.</div>`;
  return `<div class="glass flush tablewrap"><table class="t"><thead><tr><th>Coéquipier</th><th>Games</th><th>Victoires</th><th>Ton rating</th></tr></thead><tbody>${rows.map((r) => { const rt = avgOf(r.xs, ({ p }) => p.r); return `<tr><td>${plink(r.id, r.name)}</td><td>${r.xs.length}</td><td>${nf((r.xs.filter(({ g, p }) => g.winner === p.team).length / r.xs.length) * 100)} %</td><td class="r3cell ${ratingTier(rt).cls}">${r2(rt)}</td></tr>`; }).join("")}</tbody></table></div>`;
}
function kickoffPanel(sel) {
  let first = 0, won = 0, total = 0;
  for (const { g, p } of sel) { total += (g.a.kickoffs || []).length; first += p.a.control.kickoffFirstTouches; won += p.a.control.kickoffWins; }
  return `<div class="glass"><div class="kpis" style="margin:0"><div><b>${total}</b><span>engagements joués</span></div><div><b>${first}</b><span>fois premier au ballon</span></div><div><b>${first ? nf((won / first) * 100) : "—"} %</b><span>gagnés en y allant</span></div></div></div>`;
}

// ---------------- Joueurs ----------------
let psort = "games", pq = "";
function renderPlayers() {
  const all = [...S.players.values()].filter((p) => !p.me);
  const list = all.filter((p) => !pq || p.name.toLowerCase().includes(pq.toLowerCase()));
  const sorters = { games: (a, b) => b.games.length - a.games.length, with: (a, b) => b.with.length - a.with.length, against: (a, b) => b.against.length - a.against.length, rating: (a, b) => (b.rating ?? -1) - (a.rating ?? -1) };
  list.sort(sorters[psort]);
  const rec = (arr) => { const w = arr.filter(({ g }) => g.result === "W").length, l = arr.filter(({ g }) => g.result === "L").length; return arr.length ? `<b>${w}</b> V – <b>${l}</b> D` : `<span class="faint">—</span>`; };
  const html = `<h1>Joueurs</h1><p class="lede" style="margin:8px 0 0">Les ${all.length} joueurs croisés dans tes games : potes, coéquipiers d'un soir et adversaires. Clique sur un joueur pour ouvrir son profil.</p>
    <div class="toolbar"><input type="text" id="pf" placeholder="Filtrer par nom" value="${esc(pq)}" style="min-width:240px" aria-label="Filtrer par nom"><div class="chips" style="margin-left:auto">${[["games", "Plus de games"], ["with", "Coéquipiers"], ["against", "Adversaires"], ["rating", "Meilleur rating"]].map(([v, l]) => `<button class="chip ${psort === v ? "on" : ""}" data-ps="${v}">${l}</button>`).join("")}</div></div>
    <div class="prow" style="background:none;border:0;padding-bottom:0" aria-hidden="true"><span></span><span class="faint">Joueur</span><span class="faint hide-s">Games</span><span class="faint hide-s">Avec toi</span><span class="faint hide-s">Contre toi (ton bilan)</span><span class="faint">Rating</span></div>
    <div class="plist">${list.slice(0, 200).map((p) => `<a class="prow" href="${jl(p.id)}">${avatar(p.name)}<span class="nm">${esc(p.name)}<span>${esc(p.platform)}${p.games[0] ? " · vu le " + fmtDate(p.games[0].g.time) : ""}</span></span><span class="hide-s rec"><b>${p.games.length}</b></span><span class="hide-s rec">${rec(p.with)}</span><span class="hide-s rec">${rec(p.against)}</span>${gauge(p.rating, "sm")}</a>`).join("") || `<div class="empty">Aucun joueur.</div>`}</div>`;
  view.innerHTML = html;
  const pf = $("#pf");
  pf.oninput = () => { pq = pf.value; const pos = pf.selectionStart; renderPlayers(); const n = $("#pf"); n.focus(); n.setSelectionRange(pos, pos); };
  $$("[data-ps]").forEach((b) => (b.onclick = () => { psort = b.dataset.ps; renderPlayers(); }));
}

// ---------------- Matchs pros (Ballchasing) ----------------
const TEAM_NAMES = { KC: "Karmine Corp", VIT: "Vitality", M8: "Gentle Mates", GK: "Geekay Esports", IKK: "Ikkaku", DUM: "Dumornay Goat", BDS: "Team BDS", G2: "G2 Esports", NRG: "NRG", FLCN: "Team Falcons", FAL: "Team Falcons", FUR: "FURIA", SSG: "Spacestation", GEN: "Gen.G", OXG: "Oxygen Esports", MOIST: "Moist Esports", TS: "The Ultimates", DIG: "Dignitas", LG: "Luminosity", COMP: "Complexity" };
const teamFull = (abbr) => TEAM_NAMES[(abbr || "").toUpperCase()] || abbr || "?";

async function loadPro() {
  let d;
  try { d = await api("/api/pro"); } catch { return; }
  S.pro = d;
  S.proSig = d.matches.length + ":" + d.tournaments.map((t) => t.lastSync).join(",") + ":" + d.running;
  S.proBaselines = computeBaselines(d.matches.map((m) => m.analysis).filter(Boolean));
  const games = new Map();
  for (const m of d.matches) {
    let info = m.info; if (typeof info === "string") try { info = JSON.parse(info); } catch { info = {}; }
    const rec = { guid: m.id, source: "pro", startTime: m.date, analysis: m.analysis, history: null, replayStatus: m.replayStatus, replayError: m.replayError, analysisError: m.analysisError };
    const g = buildGame(rec, S.proBaselines);
    g.pm = m; g.info = info || {};
    if (!g.analyzed) { // score et joueurs depuis la liste Ballchasing
      const bg = g.info.blue?.goals, og = g.info.orange?.goals;
      if (bg != null && og != null) { g.score = [bg, og]; g.winner = bg > og ? 0 : 1; }
      g.map = mapName(g.info.map_code || g.info.map_name);
      g.seconds = g.info.duration || 0;
    }
    g.rosters = [0, 1].map((t) => {
      if (g.a) return g.a.players.filter((p) => p.team === t).map((p) => p.name);
      return ((t ? g.info.orange : g.info.blue)?.players || []).map((p) => p.name);
    });
    games.set(m.id, g);
  }
  S.proGames = games;
  // séries = groupes qui contiennent des replays ; on reconnaît les équipes grâce aux noms "KC vs GK"
  const series = new Map();
  const walk = (node, tour, parents) => {
    if (node.replays?.length) {
      const m = /^(.+?)\s+(?:vs\.?|v|-)\s+(.+)$/i.exec(node.name.trim());
      series.set(node.id, { id: node.id, name: node.name, tour: tour.id, tourName: tour.name, parent: parents[parents.length - 2] || tour.name, abbrs: m ? [m[1].trim(), m[2].trim()] : null, games: node.replays.map((id) => games.get(id)).filter(Boolean) });
    }
    for (const c of node.children || []) walk(c, tour, [...parents, c.name]);
  };
  for (const t of d.tournaments) if (t.tree) walk(t.tree, t, []);
  // équipe de chaque joueur = l'abréviation commune à toutes les séries qu'il joue
  const pSets = new Map();
  for (const se of series.values()) if (se.abbrs) for (const g of se.games) for (const r of g.rosters) for (const n of r) {
    const set = new Set(se.abbrs.map((x) => x.toUpperCase()));
    pSets.set(n, pSets.has(n) ? new Set([...pSets.get(n)].filter((x) => set.has(x))) : set);
  }
  const teamOf = (n) => { const st = pSets.get(n); return st && st.size === 1 ? [...st][0] : null; };
  for (const se of series.values()) {
    se.wins = {};
    for (const g of se.games) {
      let keys = null;
      const named = [g.info.blue?.name, g.info.orange?.name];
      if (se.abbrs) {
        const ab = se.abbrs.map((x) => x.toUpperCase());
        const vote = (r) => { const c = {}; for (const n of r) { const k = teamOf(n); if (k && ab.includes(k)) c[k] = (c[k] || 0) + 1; } return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0]; };
        let b = vote(g.rosters[0]), o = vote(g.rosters[1]);
        if (b && !o) o = ab.find((x) => x !== b); else if (o && !b) b = ab.find((x) => x !== o);
        keys = b && o && b !== o ? [b, o] : ab;
      }
      g.teamKeys = keys || [named[0] || "Bleus", named[1] || "Orange"];
      g.teamNames = named[0] && named[1] && !se.abbrs ? named : g.teamKeys.map(teamFull);
      g.series = se;
      if (g.winner === 0 || g.winner === 1) se.wins[g.teamKeys[g.winner]] = (se.wins[g.teamKeys[g.winner]] || 0) + 1;
    }
    se.teams = se.abbrs ? se.abbrs.map((x) => x.toUpperCase()) : se.games[0]?.teamKeys || ["?", "?"];
    se.score = se.teams.map((k) => se.wins[k] || 0);
    se.date = Math.min(...se.games.map((g) => g.time || Infinity));
    se.done = se.games.length > 0;
  }
  S.proSeries = series;
  // joueurs pros
  const players = new Map();
  for (const g of games.values()) for (const p of g.people) {
    if (!p.id) continue;
    let e = players.get(p.id);
    if (!e) { e = { id: p.id, name: p.name, games: [], teams: {} }; players.set(p.id, e); }
    e.games.push({ g, p });
    const k = g.teamKeys?.[p.team]; if (k) e.teams[k] = (e.teams[k] || 0) + 1;
  }
  for (const e of players.values()) {
    e.games.sort((a, b) => b.g.time - a.g.time);
    e.name = e.games[0].p.name;
    const tk = Object.entries(e.teams).sort((a, b) => b[1] - a[1])[0]?.[0];
    e.teamKey = tk; e.teamName = tk ? teamFull(tk) : "";
    e.tour = e.games[0].g.pm.tournament; e.tourName = e.games[0].g.series?.tourName || "";
    e.with = []; e.against = [];
    e.rating = avgOf(e.games, ({ p }) => p.r);
    e.platform = platformOf(e.id);
  }
  S.proPlayers = players;
}

function renderPro(args) {
  const [kind, id] = args;
  if (kind === "t") return renderProTournament(id);
  if (kind === "s") return renderProSeries(id);
  if (kind === "g") return renderProGame(id);
  if (kind === "j") return renderProfile(id, false);
  return renderProHome();
}

function proSetupCard(d) {
  return `<section class="glass c6"><h3>Clé API Ballchasing</h3>
    <p class="muted" style="margin-top:-4px">Overtime récupère les replays des matchs pros sur Ballchasing. Connecte-toi sur ballchasing.com, va sur la page <b>Upload</b> : ta clé API y est affichée. Copie-la ici.</p>
    <div class="row"><input type="text" id="bckey" class="grow" placeholder="${d.hasKey ? "Clé enregistrée (colle une nouvelle clé pour la remplacer)" : "Colle ta clé API ici"}" aria-label="Clé API Ballchasing"><button class="btn hot" id="bcsave">Enregistrer</button></div>
    <p class="faint" style="margin-bottom:0">${d.hasKey ? "Une clé est enregistrée." : "Aucune clé pour l'instant."} <a href="#" id="bcopen" style="text-decoration:underline">Ouvrir ballchasing.com</a></p></section>`;
}
function bindProSetup() {
  $("#bcsave") && ($("#bcsave").onclick = async () => {
    const key = $("#bckey").value.trim(); if (!key) return toast("Colle d'abord ta clé");
    try { const r = await api("/api/pro/key", { method: "POST", body: JSON.stringify({ key }) }); toast(`Clé validée (compte ${r.account})`); await loadPro(); route(); }
    catch (e) { toast("Clé refusée : " + e.message, 7000); }
  });
  $("#bcopen") && ($("#bcopen").onclick = (e) => { e.preventDefault(); openUrl("https://ballchasing.com/upload"); });
  $("#addt") && ($("#addt").onclick = async () => {
    const url = $("#turl").value.trim(); if (!url) return;
    try { const t = await api("/api/pro/tournaments", { method: "POST", body: JSON.stringify({ url }) }); toast("Compétition ajoutée, récupération des matchs…"); await loadPro(); location.hash = "#/pro/t/" + encodeURIComponent(t.id); }
    catch (e) { toast(e.message, 7000); }
  });
}

function renderProHome() {
  const d = S.pro || { tournaments: [], matches: [], hasKey: false };
  if (d.hasKey && d.tournaments.length === 1 && !S.proHomeSeen) { S.proHomeSeen = true; location.replace("#/pro/t/" + encodeURIComponent(d.tournaments[0].id)); return; }
  let html = `<h1>Matchs pros</h1><p class="lede" style="margin:8px 0 0">Résultats, stats et Rating 3.0 des matchs pros, à partir des replays publiés sur Ballchasing.</p>
  <div class="bento" style="margin-top:24px">
    <section class="glass c6"><h3>Ajouter une compétition</h3><p class="muted" style="margin-top:-4px">Colle le lien d'un groupe Ballchasing (une compétition entière, un jour ou une série).</p>
      <div class="row"><input type="text" id="turl" class="grow" placeholder="https://ballchasing.com/group/…" aria-label="Lien du groupe"><button class="btn hot" id="addt" ${d.hasKey ? "" : "disabled"}>Ajouter</button></div>
      ${d.hasKey ? "" : `<p class="faint">Enregistre d'abord ta clé API Ballchasing.</p>`}</section>
    ${proSetupCard(d)}
  </div>`;
  if (d.tournaments.length) {
    html += `<h2>Compétitions suivies</h2><div class="games">${d.tournaments.map((t) => { const n = d.matches.filter((m) => m.tournament === t.id).length; return `<a class="glass tourn" href="#/pro/t/${encodeURIComponent(t.id)}"><span class="tourn-ico">${ICON.trophy}</span><span class="grow"><b>${esc(t.name)}</b><br><span class="muted">${n} game(s)${t.lastSync ? ` · mis à jour à ${fmtTime(t.lastSync)}` : " · récupération en cours"}</span>${t.error ? `<br><span class="down">${esc(t.error)}</span>` : ""}</span>${ICON.chev}</a>`; }).join("")}</div>`;
  }
  view.innerHTML = html;
  bindProSetup();
}

let proTab = "results";
let proDay = { tour: null, day: "all", cumul: false };
function renderProTournament(id) {
  const d = S.pro; const t = d?.tournaments.find((x) => x.id === id);
  if (!t) { view.innerHTML = `<a class="back" href="#/pro">${ICON.back}Matchs pros</a><div class="empty">Compétition introuvable.</div>`; return; }
  const series = [...S.proSeries.values()].filter((s) => s.tour === id);
  const games = [...S.proGames.values()].filter((g) => g.pm.tournament === id);
  const analyzed = games.filter((g) => g.analyzed).length;
  let html = `<a class="back" href="#/pro">${ICON.back}Matchs pros</a>
  <section class="glass hero"><div><div class="who">${ICON.trophy}&nbsp;Compétition suivie sur Ballchasing</div><h1>${esc(t.name)}</h1>
    <p class="lede" style="margin-top:14px">${series.length} série(s) · ${games.length} game(s)${games.length ? ` · ${analyzed} analysée(s)` : ""}</p>
    <div class="row" style="margin-top:6px"><button class="btn sm ghost" id="psync">${ICON.sync}Mettre à jour</button><span class="muted" id="prostatus">${esc(d.status || (t.lastSync ? `Mis à jour à ${fmtTime(t.lastSync)}` : "Récupération en cours…"))}</span></div>
    ${t.error ? `<div class="note err" style="margin-top:12px">${esc(t.error)}</div>` : ""}</div></section>
  <div class="seg" role="tablist">${[["results", "Résultats"], ["players", "Classement des joueurs"], ["teams", "Équipes"]].map(([k, l]) => `<button data-pt="${k}" class="${proTab === k ? "on" : ""}">${l}</button>`).join("")}</div><div id="ptc"></div>`;
  view.innerHTML = html;
  $("#psync").onclick = async () => { await api("/api/pro/sync", { method: "POST" }); toast("Mise à jour lancée"); };
  $$("[data-pt]").forEach((b) => (b.onclick = () => { proTab = b.dataset.pt; $$("[data-pt]").forEach((x) => x.classList.toggle("on", x === b)); renderProTab(id, series, games); }));
  renderProTab(id, series, games);
}
function renderProTab(id, series, games) {
  const el = $("#ptc");
  if (!series.length && !games.length) { el.innerHTML = `<div class="empty">${S.pro.running ? "Récupération des matchs en cours…" : "Aucun match pour l'instant."}</div>`; return; }
  if (proTab === "results") {
    const byDay = {};
    for (const s of series) (byDay[s.parent || "Matchs"] ||= []).push(s);
    const days = Object.entries(byDay).sort((a, b) => Math.min(...b[1].map((x) => x.date)) - Math.min(...a[1].map((x) => x.date)));
    el.innerHTML = days.map(([day, ss]) => `<section class="session"><div class="session-head"><h3>${esc(day)}</h3><span class="muted">${ss[0].date !== Infinity ? fmtDateLong(Math.min(...ss.map((x) => x.date))) : ""}</span></div>
      <div class="series-grid">${ss.sort((a, b) => a.date - b.date).map(seriesCard).join("")}</div></section>`).join("");
  } else {
    // ----- filtre par jour (commun joueurs / équipes) -----
    if (proDay.tour !== id) proDay = { tour: id, day: "all", cumul: false };
    const dayFirst = {};
    for (const s of series) { const k = s.parent || "Matchs"; dayFirst[k] = Math.min(dayFirst[k] ?? Infinity, s.date); }
    const dayList = Object.keys(dayFirst).sort((a, b) => dayFirst[a] - dayFirst[b]);
    if (proDay.day !== "all" && !dayList.includes(proDay.day)) proDay.day = "all";
    const inDayKey = (k) => proDay.day === "all" || (proDay.cumul ? (dayFirst[k] ?? Infinity) <= dayFirst[proDay.day] : k === proDay.day);
    const inDay = (g) => inDayKey(g.series?.parent || "Matchs");
    const isTeams = proTab === "teams";
    const views = isTeams ? [["bilan", "Bilan"], ...PRO_STATS.filter((x) => x.team !== false).map((x) => [x.k, x.label])] : [["general", "Général"], ...PRO_STATS.map((x) => [x.k, x.label])];
    const vkey = isTeams ? "teamView" : "playerView";
    if (!views.some(([k]) => k === proDay[vkey])) proDay[vkey] = views[0][0];
    const stat = PRO_STATS.find((x) => x.k === proDay[vkey]);
    const mode = stat?.kind === "avg" ? "avg" : proDay.mode || "total";
    const chipRow = (items, attr, cur) => `<div class="chips">${items.map(([v, l, dis]) => `<button class="chip ${cur === v ? "on" : ""}" data-${attr}="${esc(String(v))}" ${dis ? "disabled" : ""}>${esc(l)}</button>`).join("")}</div>`;
    let filt = `<div class="toolbar">${chipRow([["all", "Tout le tournoi"], ...dayList.map((d) => [d, d])], "day", proDay.day)}
      ${dayList.length > 1 ? `<div style="margin-left:auto">${chipRow([[false, "Ce jour seul", proDay.day === "all"], [true, "Cumulé jusqu'à ce jour", proDay.day === "all"]], "cumul", proDay.cumul)}</div>` : ""}</div>
      <div class="toolbar statbar">${chipRow(views, "view", proDay[vkey])}
      ${stat ? `<div style="margin-left:auto">${chipRow([["total", "Total", stat.kind === "avg"], ["pg", "Par game", stat.kind === "avg"]], "mode", stat.kind === "avg" ? "" : mode)}</div>` : ""}</div>`;
    const period = proDay.day === "all" ? "Tout le tournoi" : proDay.cumul ? `Cumulé jusqu'à ${esc(proDay.day)} inclus` : esc(proDay.day);
    let body = "";
    // lignes de stats (joueurs ou équipes)
    const accumulate = (entries) => entries.map((e) => {
      const o = { ...e, n: e.gs.length, r: avgOf(e.gs, (x) => x.r) };
      for (const st of PRO_STATS) {
        if (st.k === "r") continue;
        if (st.kind === "avg") o[st.k] = avgOf(e.gs.filter((x) => x.a), (x) => st.get(x.a));
        else { const tot = e.gs.reduce((t, x) => t + (x.a ? st.get(x.a) || 0 : 0), 0); o[st.k] = tot; o[st.k + "_pg"] = e.gsA ? tot / e.gsA : null; }
      }
      return o;
    });
    if (!isTeams) {
      const ps = accumulate([...S.proPlayers.values()].map((p) => {
        const gs = p.games.filter(({ g, p: x }) => g.pm.tournament === id && x.a && inDay(g)).map(({ p: x }) => x);
        return { p, gs, gsA: gs.length };
      }).filter((x) => x.gs.length));
      const pname = (x) => `<a href="#/pro/j/${encodeURIComponent(x.p.id)}"><b>${esc(x.p.name)}</b></a> <span class="muted">${esc(x.p.teamKey || "")}</span>`;
      if (!stat) {
        ps.sort((a, b) => (b.r ?? -1) - (a.r ?? -1));
        body = ps.length ? `<div class="glass flush tablewrap"><table class="t"><thead><tr><th>#</th><th style="text-align:left">Joueur</th><th>Games</th><th>Rating 3.0</th><th class="hm">Buts</th><th class="hm">Passes</th><th class="hm">Arrêts</th><th class="hm">Tirs</th><th class="hm">Démos</th><th class="hm">BPM</th><th class="hm">Vitesse</th></tr></thead><tbody>
          ${ps.map((x, i) => `<tr><td>${i + 1}</td><td style="text-align:left">${pname(x)}</td><td>${x.n}</td><td class="r3cell ${ratingTier(x.r).cls}">${r2(x.r)}</td><td class="hm">${nf(x.goals_pg, 2)}</td><td class="hm">${nf(x.assists_pg, 2)}</td><td class="hm">${nf(x.saves_pg, 2)}</td><td class="hm">${nf(x.shots_pg, 2)}</td><td class="hm">${nf(x.demos_pg, 2)}</td><td class="hm">${nf(x.bpm, 0)}</td><td class="hm">${kmh(x.speed)}</td></tr>`).join("")}</tbody></table></div>
          <p class="legend">${period} · moyennes par game. Le Rating 3.0 des pros est calculé par rapport aux autres joueurs pros suivis dans Overtime (1,00 = un pro moyen).</p>` : "";
      } else body = statTable(ps, stat, mode, pname, "Joueur", period);
    } else {
      // équipes : bilan des séries + stats cumulées de leurs joueurs
      const teams = {};
      const T = (k) => (teams[k] ||= { k, sw: 0, sl: 0, gw: 0, gl: 0, players: new Set(), gs: [], games: new Set() });
      for (const s of series) {
        if (!inDayKey(s.parent || "Matchs")) continue;
        for (let i = 0; i < 2; i++) {
          const t = T(s.teams[i]);
          t.gw += s.score[i]; t.gl += s.score[1 - i];
          if (s.score[i] !== s.score[1 - i]) s.score[i] > s.score[1 - i] ? t.sw++ : t.sl++;
        }
      }
      for (const p of S.proPlayers.values()) for (const { g, p: x } of p.games) {
        if (g.pm.tournament !== id || !inDay(g)) continue;
        const k = g.teamKeys?.[x.team]; if (!k) continue;
        const t = T(k); t.players.add(p);
        if (x.a) { t.gs.push(x); t.games.add(g.guid); }
      }
      const rowsT = accumulate(Object.values(teams).map((t) => ({ ...t, gsA: t.games.size })));
      for (const t of rowsT) { t.n = t.games.size; t.r = avgOf(t.gs, (x) => x.r); }
      const tname = (t) => `<b>${esc(teamFull(t.k))}</b> <span class="muted">${esc(t.k)}</span>`;
      if (!stat) {
        const rows = rowsT.filter((t) => t.sw + t.sl + t.gw + t.gl > 0).sort((a, b) => b.sw - a.sw || (b.gw - b.gl) - (a.gw - a.gl));
        body = rows.length ? `<div class="glass flush tablewrap"><table class="t"><thead><tr><th style="text-align:left">Équipe</th><th>Séries</th><th>Games</th><th>Diff.</th><th class="hm">Rating moyen</th><th class="hm" style="text-align:left">Joueurs</th></tr></thead><tbody>
          ${rows.map((t) => `<tr><td style="text-align:left">${tname(t)}</td><td>${t.sw} V – ${t.sl} D</td><td>${t.gw} – ${t.gl}</td><td class="${t.gw - t.gl >= 0 ? "up" : "down"}">${t.gw - t.gl >= 0 ? "+" : ""}${t.gw - t.gl}</td><td class="hm r3cell ${ratingTier(t.r).cls}">${r2(t.r)}</td><td class="hm" style="text-align:left">${[...t.players].map((p) => `<a href="#/pro/j/${encodeURIComponent(p.id)}">${esc(p.name)}</a>`).join(", ")}</td></tr>`).join("")}</tbody></table></div>
          <p class="legend">${period} · bilan calculé à partir des séries publiées sur Ballchasing.</p>` : "";
      } else body = statTable(rowsT.filter((t) => t.n), stat, mode, tname, "Équipe", period, true);
    }
    el.innerHTML = filt + (body || `<div class="empty">${proDay.day === "all" ? "Le classement apparaît dès que les replays sont analysés." : "Aucune game analysée pour cette sélection."}</div>`);
    const rer = () => renderProTab(id, series, games);
    $$("[data-day]", el).forEach((b) => (b.onclick = () => { proDay.day = b.dataset.day; rer(); }));
    $$("[data-cumul]", el).forEach((b) => (b.onclick = () => { proDay.cumul = b.dataset.cumul === "true"; rer(); }));
    $$("[data-view]", el).forEach((b) => (b.onclick = () => { proDay[vkey] = b.dataset.view; rer(); }));
    $$("[data-mode]", el).forEach((b) => (b.onclick = () => { proDay.mode = b.dataset.mode; rer(); }));
  }
}

// Stats disponibles dans les classements pros. kind "sum" : total + par game ; "avg" : moyenne par game.
const PRO_STATS = [
  { k: "r", label: "Rating 3.0", kind: "avg", fmt: (v) => r2(v), rating: true },
  { k: "goals", label: "Buts", kind: "sum", get: (a) => a.core.goals },
  { k: "assists", label: "Passes déc.", kind: "sum", get: (a) => a.core.assists },
  { k: "saves", label: "Arrêts", kind: "sum", get: (a) => a.core.saves },
  { k: "shots", label: "Tirs", kind: "sum", get: (a) => a.core.shots },
  { k: "points", label: "Buts + passes", kind: "sum", get: (a) => (a.core.goals || 0) + (a.core.assists || 0) },
  { k: "xg", label: "xG", kind: "sum", get: (a) => a.core.xg, d: 2 },
  { k: "score", label: "Score", kind: "sum", get: (a) => a.core.score, d: 0 },
  { k: "demos", label: "Démos", kind: "sum", get: (a) => a.core.demosInflicted },
  { k: "demosTaken", label: "Démos subies", kind: "sum", get: (a) => a.core.demosTaken, low: true },
  { k: "touches", label: "Touches", kind: "sum", get: (a) => a.core.touches, d: 0 },
  { k: "fifty", label: "Duels gagnés", kind: "sum", get: (a) => a.control?.fiftyWins },
  { k: "poss", label: "Possession", kind: "sum", get: (a) => a.control?.possessionSec, fmt: (v) => mmss(v), team: true },
  { k: "bpm", label: "Boost / min", kind: "avg", get: (a) => a.boost.bpm, d: 0 },
  { k: "speed", label: "Vitesse", kind: "avg", get: (a) => a.movement.avgSpeed, fmt: (v) => kmh(v) },
  { k: "sonic", label: "% supersonique", kind: "avg", get: (a) => a.movement.pctSupersonic, fmt: (v) => nf(v, 1) + " %" },
];
function statTable(rows, st, mode, nameCell, who, period, team = false) {
  if (!rows.length) return "";
  const val = (x) => (st.kind === "avg" ? x[st.k] : mode === "pg" ? x[st.k + "_pg"] : x[st.k]);
  const fmt = (v, pg) => (v == null ? "–" : st.fmt ? st.fmt(v) : nf(v, pg ? 2 : st.d ?? 0));
  // en "par game", on écarte les joueurs avec trop peu de games pour éviter les classements trompeurs
  const maxN = Math.max(...rows.map((x) => x.n));
  const minN = mode === "pg" || st.kind === "avg" ? Math.max(1, Math.ceil(maxN * 0.3)) : 1;
  const list = rows.filter((x) => x.n >= minN && val(x) != null).sort((a, b) => (st.low ? val(a) - val(b) : val(b) - val(a)));
  const hidden = rows.length - list.length;
  const cols = st.kind === "avg"
    ? `<th class="on">${esc(st.label)}${st.rating ? "" : " (moy.)"}</th>`
    : `<th class="${mode === "total" ? "on" : ""}">Total</th><th class="${mode === "pg" ? "on" : ""}">Par game</th>`;
  const cells = (x) => st.kind === "avg"
    ? `<td class="${st.rating ? "r3cell " + ratingTier(x.r).cls : "on"}">${fmt(x[st.k])}</td>`
    : `<td class="${mode === "total" ? "on" : ""}">${fmt(x[st.k], false)}</td><td class="${mode === "pg" ? "on" : ""}">${fmt(x[st.k + "_pg"], true)}</td>`;
  return `<div class="glass flush tablewrap"><table class="t stat-t"><thead><tr><th>#</th><th style="text-align:left">${who}</th><th>Games</th>${cols}</tr></thead><tbody>
    ${list.map((x, i) => `<tr class="${i < 3 ? "top" + (i + 1) : ""}"><td>${i + 1}</td><td style="text-align:left">${nameCell(x)}</td><td>${x.n}</td>${cells(x)}</tr>`).join("")}</tbody></table></div>
    <p class="legend">${period} · ${esc(st.label)}${st.kind === "avg" ? " : moyenne par game" : mode === "pg" ? " par game" : " au total"}${team && st.kind === "sum" ? " (somme des 3 joueurs de l'équipe)" : ""}${st.low ? " · moins c'est mieux" : ""}.${hidden && minN > 1 ? ` Classement limité aux ${team ? "équipes" : "joueurs"} avec au moins ${minN} games.` : ""}</p>`;
}
function seriesCard(s) {
  const w = s.score[0] === s.score[1] ? -1 : s.score[0] > s.score[1] ? 0 : 1;
  const best = s.games.flatMap((g) => g.people.filter((p) => p.r != null).map((p) => ({ p, g }))).reduce((a, b) => (!a || b.p.r > a.p.r ? b : a), null);
  return `<a class="glass series" href="#/pro/s/${encodeURIComponent(s.id)}">
    <div class="srow ${w === 0 ? "win" : w === 1 ? "lose" : ""}"><span class="tbadge" style="--h:${hue(s.teams[0])}">${esc(s.teams[0])}</span><span class="tname">${esc(teamFull(s.teams[0]))}</span><span class="sscore">${s.score[0]}</span></div>
    <div class="srow ${w === 1 ? "win" : w === 0 ? "lose" : ""}"><span class="tbadge" style="--h:${hue(s.teams[1])}">${esc(s.teams[1])}</span><span class="tname">${esc(teamFull(s.teams[1]))}</span><span class="sscore">${s.score[1]}</span></div>
    <div class="smeta muted">${s.games.length} game${s.games.length > 1 ? "s" : ""}${s.date !== Infinity ? ` · ${fmtTime(s.date)}` : ""}${best ? ` · ★ ${esc(best.p.name)} ${nf(best.p.r, 2)}` : ""}</div></a>`;
}

function renderProSeries(id) {
  const s = S.proSeries.get(id);
  if (!s) { view.innerHTML = `<a class="back" href="#/pro">${ICON.back}Matchs pros</a><div class="empty">Série introuvable.</div>`; return; }
  const w = s.score[0] === s.score[1] ? -1 : s.score[0] > s.score[1] ? 0 : 1;
  const gs = [...s.games].sort((a, b) => a.time - b.time);
  let html = `<a class="back" href="#/pro/t/${encodeURIComponent(s.tour)}">${ICON.back}${esc(s.tourName)}</a>
    <div class="matchup"><div class="side t0"><div class="team"><span>${esc(s.parent)}</span></div><div class="steam">${esc(teamFull(s.teams[0]))}</div></div>
    <div class="center"><div class="big"><span class="a">${s.score[0]}</span><i>–</i><span class="b">${s.score[1]}</span></div><div class="verdict">${w >= 0 ? `<span class="up">Victoire ${esc(teamFull(s.teams[w]))}</span>` : "Série en cours"}</div></div>
    <div class="side t1"><div class="team"><span>${fmtDateLong(s.date)}</span></div><div class="steam" style="text-align:right">${esc(teamFull(s.teams[1]))}</div></div></div>
    <div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn hot" id="shareS">${ICON.camera}Créer l'image pour X</button></div>
    <h2>Les games</h2><div class="games">${gs.map((g, i) => {
      const k = g.teamKeys || s.teams; const sc0 = k[0] === s.teams[0] ? g.score[0] : g.score[1], sc1 = k[0] === s.teams[0] ? g.score[1] : g.score[0];
      const best = g.people.filter((p) => p.r != null).sort((a, b) => b.r - a.r)[0];
      return `<a class="game pg" href="#/pro/g/${encodeURIComponent(g.guid)}"><span class="gnum">G${i + 1}</span><span class="mode"><b>${esc(g.map)}</b><span>${mmss(g.seconds)}${g.overtime ? " · prolongation" : ""}</span></span><span class="score"><span class="t0">${sc0}</span><i>–</i><span class="t1">${sc1}</span></span><span class="statline">${best ? `<span>★ <b>${esc(best.name)}</b> ${nf(best.r, 2)}</span>` : g.pm.replayStatus === "failed" ? `<span class="tag">replay indisponible</span>` : `<span class="tag">analyse en attente</span>`}</span>${ICON.chev}</a>`;
    }).join("")}</div>`;
  // stats des joueurs sur la série
  const agg = {};
  for (const g of gs) for (const p of g.people) {
    if (!p.a) continue;
    const e = (agg[p.id] ||= { id: p.id, name: p.name, team: g.teamKeys?.[p.team], rs: [], g: 0, as: 0, sv: 0, sh: 0, dm: 0 });
    e.rs.push(p.r); e.g += p.core.goals; e.as += p.core.assists; e.sv += p.core.saves; e.sh += p.core.shots; e.dm += p.core.demosInflicted || 0;
  }
  const rows = Object.values(agg).map((e) => ({ ...e, r: avgOf(e.rs, (x) => x) })).sort((a, b) => (a.team === s.teams[0] ? 0 : 1) - (b.team === s.teams[0] ? 0 : 1) || (b.r ?? 0) - (a.r ?? 0));
  if (rows.length) html += `<h2>Stats de la série</h2><div class="glass flush tablewrap"><table class="t"><thead><tr><th style="text-align:left">Joueur</th><th>Rating 3.0</th><th>Buts</th><th>Passes</th><th>Arrêts</th><th>Tirs</th><th>Démos</th></tr></thead><tbody>${rows.map((e) => `<tr><td style="text-align:left"><a href="#/pro/j/${encodeURIComponent(e.id)}"><b>${esc(e.name)}</b></a> <span class="muted">${esc(e.team || "")}</span></td><td class="r3cell ${ratingTier(e.r).cls}">${r2(e.r)}</td><td>${e.g}</td><td>${e.as}</td><td>${e.sv}</td><td>${e.sh}</td><td>${e.dm}</td></tr>`).join("")}</tbody></table></div><p class="legend">Totaux sur la série, Rating 3.0 moyen.</p>`;
  view.innerHTML = html;
  $("#shareS").onclick = async () => {
    const gd = gs.map((g) => { const k = g.teamKeys || s.teams; const flip = k[0] !== s.teams[0]; const tm = g.a?.teams; const or = (a, b) => (flip ? [b, a] : [a, b]); return { map: g.map, sc: or(g.score[0], g.score[1]), ot: g.overtime, poss: tm ? or(tm[0].possessionSec, tm[1].possessionSec) : null, press: tm ? or(tm[0].pressureSec, tm[1].pressureSec) : null }; });
    const rd = rows.map((e) => ({ name: e.name, team: e.team, teamLabel: e.team, r: e.r, g: e.g, a: e.as, s: e.sv, sh: e.sh }));
    const cv = await seriesImage(s, gd, rd, teamFull);
    shareModal(cv, `${s.teams[0]}-${s.teams[1]}-${s.score[0]}-${s.score[1]}.png`);
  };
}

async function renderProGame(id) {
  let rec;
  try { rec = await api(`/api/pro/match/${encodeURIComponent(id)}`); } catch (e) { view.innerHTML = `<div class="note err">${esc(e.message)}</div>`; return; }
  const pg = S.proGames.get(id);
  const g = buildGame({ guid: rec.id, source: "pro", startTime: rec.date, analysis: rec.analysis, history: null }, S.proBaselines);
  if (pg) { g.teamNames = pg.teamNames; g.teamKeys = pg.teamKeys; if (!g.analyzed) { g.score = pg.score; g.winner = pg.winner; g.map = pg.map; g.seconds = pg.seconds; } }
  const s = pg?.series;
  const idx = s ? [...s.games].sort((a, b) => a.time - b.time).findIndex((x) => x.guid === id) + 1 : 0;
  renderGameView(g, rec, { pro: true, teamNames: g.teamNames, back: s ? { href: "#/pro/s/" + encodeURIComponent(s.id), label: s.name } : { href: "#/pro", label: "Matchs pros" }, tag: s ? `${s.tourName} · ${s.parent} · Game ${idx}` : "Match pro" });
}

function proGamesList(pl) {
  return `<h2>Ses games</h2><div class="games">${pl.games.slice(0, 60).map(({ g, p }) => {
    const won = g.winner === p.team; const sc = p.team === 0 ? g.score : [g.score[1], g.score[0]];
    return `<a class="game pg ${won ? "W" : "L"}" href="#/pro/g/${encodeURIComponent(g.guid)}">${gauge(p.r, "sm")}<span class="mode"><b>${esc(g.teamNames?.[p.team] || "")} – ${esc(g.teamNames?.[1 - p.team] || "")}</b><span>${esc(g.series?.parent || "")} · ${esc(g.map)}</span></span><span class="score"><span class="t0">${sc[0]}</span><i>–</i><span class="t1">${sc[1]}</span></span><span class="statline"><span><b>${p.core.goals ?? 0}</b>buts</span><span><b>${p.core.assists ?? 0}</b>passes</span><span><b>${p.core.saves ?? 0}</b>arrêts</span></span>${ICON.chev}</a>`;
  }).join("")}</div>`;
}

// ---------------- Réglages ----------------
async function renderSettings() {
  if (isMobile()) return renderMobileSettings();
  const { settings: s, autostart } = await api("/api/settings");
  const st = S.state, a = st.auth;
  const oldest = S.games.length ? S.games[S.games.length - 1].time : null;
  const local = S.games.filter((g) => g.source === "local").length;
  let html = `<h1>Réglages</h1><div class="bento" style="margin-top:24px">
  <section class="glass c6"><h3>Compte Epic</h3>`;
  html += a.loggedIn
    ? `<div class="row"><span class="dot ok"></span><div class="grow"><b>${a.displayName ? esc(a.displayName) : "Connecté"}</b><div class="faint">Identifiant Epic ${esc(a.accountId || "")}</div></div><button class="btn sm danger" id="logout">Se déconnecter</button></div>`
    : `<p class="muted" style="margin-top:0">Connecte le compte Epic lié à ton Rocket League. Si tu joues sur Steam, ton compte Steam doit être lié à Epic.</p><div class="row"><button class="btn hot" id="dev">Se connecter avec un code</button><button class="btn ghost" id="codeflow">Autre méthode</button></div><div id="authstep" style="margin-top:16px"></div>`;
  html += `<div class="note" style="margin-top:18px">La synchro se connecte aux serveurs du jeu avec ton compte. Si Rocket League est ouvert, ça peut te déconnecter de ta partie : Overtime attend donc que tu fermes le jeu.</div></section>
  <section class="glass c6 setgrid"><h3 style="margin:0">Synchronisation</h3>
    <label class="chk"><input type="checkbox" id="s_import" ${s.importDemosFolder ? "checked" : ""}><span>Importer les replays que je sauvegarde dans le jeu<br><span class="faint">${esc(st.sync.demosFolder || "Dossier Demos de Rocket League")}</span></span></label>
    <div class="row" style="padding-left:28px"><span class="muted">Seulement ceux des</span><input type="number" id="s_age" min="0" max="3650" value="${s.importMaxAgeDays ?? 30}" style="width:80px" aria-label="Nombre de jours"><span class="muted">derniers jours (0 = tous)</span></div>
    <label class="chk"><input type="checkbox" id="s_while" ${s.syncWhileGameRunning ? "checked" : ""}><span>Synchroniser même quand Rocket League est ouvert<br><span class="faint">Déconseillé : risque de déconnexion en pleine partie.</span></span></label>
    <label class="chk"><input type="checkbox" id="s_remote" ${s.useRemoteVersion ? "checked" : ""}><span>Après une mise à jour du jeu, récupérer la nouvelle version sur le serveur communautaire Rocky</span></label>
    <div class="row"><span class="muted">Vérifier toutes les</span><input type="number" id="s_int" min="1" max="60" value="${s.syncIntervalMinutes}" style="width:70px" aria-label="Minutes"><span class="muted">minutes</span></div>
    <label class="chk"><input type="checkbox" id="s_auto" ${autostart ? "checked" : ""}><span>Lancer Overtime en arrière-plan au démarrage de Windows</span></label>
    ${st.sync.lastError ? `<div class="note err">${esc(st.sync.lastError)}</div>` : ""}
    <details><summary>Réglages avancés : version du jeu (dernière utilisée : ${esc(st.sync.versionUsed || "—")})</summary><div class="kv" style="margin-top:12px">
      <span class="muted">Game version</span><input type="text" id="s_gv" value="${esc(s.gameVersion || "")}" placeholder="auto (Launch.log)">
      <span class="muted">Feature set</span><input type="text" id="s_fs" value="${esc(s.featureSet || "")}" placeholder="auto">
      <span class="muted">Build secret</span><input type="text" id="s_bs" value="${esc(s.buildSecret || "")}" placeholder="auto"></div></details>
    <div><button class="btn hot" id="save">Enregistrer</button></div></section>
  <section class="glass c12"><h3>Gérer les games</h3><p class="muted" style="margin-top:-4px">${S.games.length} game(s) enregistrée(s)${oldest ? `, la plus ancienne du ${fmtDateLong(oldest)}` : ""}. Une game supprimée n'est jamais réimportée. Tu peux aussi supprimer des games une par une ou par sélection depuis la page Games.</p>
    <div class="setgrid" style="margin-top:12px">
      <div class="row"><span>Supprimer toutes les games jouées avant le</span><input type="date" id="d_before" aria-label="Date limite"><button class="btn sm danger" id="delBefore">${ICON.trash}Supprimer</button></div>
      <div class="row"><span>Supprimer les ${local} game(s) importée(s) depuis des fichiers replay (garde celles synchronisées depuis ton compte)</span><button class="btn sm danger" id="delLocal" ${local ? "" : "disabled"}>${ICON.trash}Supprimer</button></div>
      <div class="row"><span>Tout effacer et repartir de zéro</span><button class="btn sm danger" id="delAll">${ICON.trash}Tout supprimer</button><span class="grow"></span><button class="btn sm ghost" id="clearDel">Autoriser à nouveau l'import des games supprimées</button></div>
    </div></section>
  <section class="glass c6"><h3>Qui es-tu dans les games ?</h3><p class="muted" style="margin-top:-4px">Overtime te reconnaît automatiquement : c'est le joueur présent dans toutes tes games.</p><div class="row"><select id="meSel" class="grow" aria-label="Ton joueur">${meOptions()}</select><button class="btn" id="meSave">Utiliser</button></div></section>
  <section class="glass c6"><h3>Importer des replays</h3><p class="muted" style="margin-top:-4px">Ajoute des fichiers .replay (anciens matchs, replays récupérés sur ballchasing…).</p><input type="file" id="files" accept=".replay" multiple></section>
  <section class="glass c12 between"><div class="muted">Overtime ${esc(st.version)} · données dans ${esc(st.dataDir)}<br><span class="faint">Analyse des replays par subtr-actor (MIT), connexion via rlapi (MIT). Projet non officiel, non affilié à Psyonix ni à Epic Games.</span></div><div class="row"><button class="btn ghost" id="mkshort">Créer le raccourci sur le bureau</button><button class="btn ghost" id="opendata">Ouvrir le dossier</button><button class="btn danger" id="quit">Quitter Overtime</button></div></section>
  </div>`;
  view.innerHTML = html;

  if (a.loggedIn) $("#logout").onclick = async () => { if (await modal("Se déconnecter ?", "Overtime ne pourra plus récupérer tes nouvelles games jusqu'à ta prochaine connexion.", "Se déconnecter", true)) { await api("/api/auth/logout", { method: "POST" }); await refresh(); renderSettings(); } };
  else { $("#dev").onclick = startDevice; $("#codeflow").onclick = startCodeFlow; }
  $("#save").onclick = async () => {
    const ns = { ...s, importDemosFolder: $("#s_import").checked, importMaxAgeDays: Math.max(0, +$("#s_age").value || 0), syncWhileGameRunning: $("#s_while").checked, useRemoteVersion: $("#s_remote").checked, syncIntervalMinutes: +$("#s_int").value || 3, gameVersion: $("#s_gv").value.trim(), featureSet: $("#s_fs").value.trim(), buildSecret: $("#s_bs").value.trim() };
    try { await api("/api/settings", { method: "POST", body: JSON.stringify({ settings: ns, autostart: $("#s_auto").checked }) }); toast("Réglages enregistrés"); } catch (e) { toast("Erreur : " + e.message); }
  };
  const del = async (body, title, text) => {
    if (!(await modal(title, text, "Supprimer", true))) return;
    const r = await api("/api/matches/delete", { method: "POST", body: JSON.stringify(body) });
    toast(`${r.deleted} game(s) supprimée(s)`); await refresh(); renderSettings();
  };
  $("#delBefore").onclick = () => { const v = $("#d_before").value; if (!v) return toast("Choisis d'abord une date"); const t = Math.floor(new Date(v + "T00:00:00").getTime() / 1000); const n = S.games.filter((g) => g.time && g.time < t).length; del({ before: t }, `Supprimer ${n} game(s) ?`, `Toutes les games jouées avant le ${new Date(t * 1000).toLocaleDateString("fr-FR")} seront effacées, avec leurs replays.`); };
  $("#delLocal").onclick = () => del({ source: "local" }, `Supprimer ${local} game(s) importée(s) ?`, "Les games importées depuis des fichiers replay seront effacées. Celles synchronisées depuis ton compte sont conservées.");
  $("#delAll").onclick = () => del({ source: "all" }, "Tout supprimer ?", `Les ${S.games.length} games et leurs replays seront effacés. Ta connexion et tes réglages sont conservés.`);
  $("#clearDel").onclick = async () => { await api("/api/deleted/clear", { method: "POST" }); toast("Les games supprimées pourront être réimportées"); };
  $("#meSave").onclick = async () => { await api("/api/settings", { method: "POST", body: JSON.stringify({ settings: { ...s, myIds: [$("#meSel").value], myIdsManual: true } }) }); toast("Joueur mis à jour"); await refresh(); };
  $("#files").onchange = async (e) => {
    const fd = new FormData(); for (const f of e.target.files) fd.append("files", f);
    const r = await fetch("/api/import", { method: "POST", body: fd }).then((x) => x.json());
    toast(`${r.guids?.length || 0} replay(s) importé(s), analyse en cours`); await refresh(); runQueue();
  };
  $("#mkshort").onclick = async () => { try { await api("/api/shortcut", { method: "POST" }); toast("Raccourci Overtime créé sur le bureau"); } catch (e) { toast("Échec : " + e.message, 6000); } };
  $("#opendata").onclick = () => api("/api/open", { method: "POST", body: JSON.stringify({ url: "data" }) });
  $("#quit").onclick = async () => { if (await modal("Quitter Overtime ?", "La synchro automatique s'arrête jusqu'au prochain lancement de l'app.", "Quitter")) { await api("/api/quit", { method: "POST" }); document.body.innerHTML = `<div class="empty" style="margin:60px auto;max-width:520px"><h3>Overtime est fermé</h3><p>Tu peux fermer cette fenêtre.</p></div>`; } };
}
function meOptions() {
  const arr = [...S.players.values()].sort((a, b) => b.games.length - a.games.length).slice(0, 15);
  return arr.map((p) => `<option value="${esc(p.id)}" ${p.me ? "selected" : ""}>${esc(p.name)} · ${p.games.length} games · ${esc(p.platform)}</option>`).join("") || `<option value="">Aucune game</option>`;
}
async function startDevice() {
  const box = $("#authstep");
  box.innerHTML = `<p class="muted">Demande d'un code…</p>`;
  try {
    const d = await api("/api/auth/device", { method: "POST" });
    const url = d.verificationUri.includes("?") ? d.verificationUri : `${d.verificationUri}?userCode=${d.userCode}`;
    box.innerHTML = `<p class="muted">La page Epic s'est ouverte. Connecte-toi et valide ce code :</p><div class="code">${esc(d.userCode)}</div><p class="row" style="margin-top:14px"><button class="btn ghost sm" id="openEpic">Rouvrir la page Epic</button><span class="muted" id="devst">En attente de ta validation…</span></p>`;
    $("#openEpic").onclick = () => api("/api/open", { method: "POST", body: JSON.stringify({ url }) });
    api("/api/open", { method: "POST", body: JSON.stringify({ url }) });
    const poll = async () => {
      const s = await api("/api/auth/device");
      if (s.ok) { toast("Compte connecté, récupération de tes games…"); await refresh(); renderSettings(); setTimeout(refresh, 6000); return; }
      if (s.error) { $("#devst").textContent = "Échec : " + s.error; return; }
      if (location.hash === "#/reglages") setTimeout(poll, 2500);
    };
    setTimeout(poll, 2500);
  } catch (e) { box.innerHTML = `<div class="note err">${esc(e.message)}</div>`; }
}
async function startCodeFlow() {
  const box = $("#authstep");
  const { url } = await api("/api/auth/url");
  box.innerHTML = `<p class="muted">Ouvre la page Epic (connecte-toi si besoin). Elle affiche un texte avec <b>authorizationCode</b> : copie-le en entier et colle-le ici.</p><p><button class="btn ghost sm" id="openCode">Ouvrir la page Epic</button></p><div class="row"><input type="text" id="codein" class="grow" placeholder="Colle le code ici" aria-label="Code d'autorisation"><button class="btn hot" id="codego">Valider</button></div>`;
  $("#openCode").onclick = () => api("/api/open", { method: "POST", body: JSON.stringify({ url }) });
  $("#codego").onclick = async () => {
    try { await api("/api/auth/code", { method: "POST", body: JSON.stringify({ code: $("#codein").value }) }); toast("Compte connecté, récupération de tes games…"); await refresh(); renderSettings(); setTimeout(refresh, 6000); }
    catch (e) { toast("Échec : " + e.message, 7000); }
  };
}

function renderMobileSettings() {
  const d = S.pro || { tournaments: [], matches: [], hasKey: false };
  view.innerHTML = `<h1>Réglages</h1><div class="bento" style="margin-top:22px">${proSetupCard(d)}
    <section class="glass c6"><h3>Compétitions suivies</h3>${d.tournaments.length ? `<div class="games">${d.tournaments.map((t) => `<div class="row" style="justify-content:space-between"><a href="#/pro/t/${encodeURIComponent(t.id)}"><b>${esc(t.name)}</b></a><button class="btn sm ghost" data-del="${esc(t.id)}">Retirer</button></div>`).join("")}</div>` : `<p class="muted">Aucune pour l'instant.</p>`}
      <div class="row" style="margin-top:14px"><input type="text" id="turl" class="grow" placeholder="Lien d'un groupe Ballchasing" aria-label="Lien du groupe"><button class="btn hot" id="addt" ${d.hasKey ? "" : "disabled"}>Ajouter</button></div></section>
    <section class="glass c6"><h3>À propos</h3><p class="muted" style="margin:0">Overtime ${esc(S.state.version)} · version téléphone (matchs pros). Les replays sont analysés sur ton téléphone : garde l'app ouverte pendant l'analyse.</p></section></div>`;
  bindProSetup();
  $$("[data-del]").forEach((b) => (b.onclick = async () => {
    if (!(await modal("Retirer la compétition ?", "Ses matchs et leurs stats seront supprimés du téléphone.", "Retirer"))) return;
    await api("/api/pro/tournaments/" + encodeURIComponent(b.dataset.del), { method: "DELETE" }); await loadPro(); renderMobileSettings();
  }));
}

// ---------------- Démarrage ----------------
async function boot() {
  setupSearch();
  try { await loadAll(); } catch (e) { view.innerHTML = `<div class="note err">Impossible de joindre le moteur d'Overtime : ${esc(e.message)}</div>`; return; }
  route();
  runQueue();
  setInterval(async () => {
    try {
      const st = await api("/api/state");
      const pro = await api("/api/pro").catch(() => null);
      const proSig = pro ? pro.matches.length + ":" + pro.tournaments.map((t) => t.lastSync).join(",") + ":" + pro.running : "";
      const changed = st.counts.matches !== S.state.counts.matches || st.sync.lastSync !== S.state.sync.lastSync || proSig !== S.proSig;
      if (pro && (pro.running !== S.pro?.running || pro.status !== S.pro?.status)) { S.pro.running = pro.running; S.pro.status = pro.status; if (S.proMode && $("#prostatus")) $("#prostatus").textContent = pro.status || (pro.running ? "Synchronisation…" : ""); }
      S.state = st; renderStatus();
      if (pro && pro.matches.some((m) => m.replayStatus === "downloaded" && !m.analysis && !m.analysisError) && !Q.running) runQueue();
      if (changed && !Q.running) { await refresh(); runQueue(); }
      else if (st.counts.pending && !Q.running) runQueue();
    } catch {}
  }, 5000);
}
boot();
