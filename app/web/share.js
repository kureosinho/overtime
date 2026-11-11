// Cartes à partager (images 1600×900 pour X), dessinées en Canvas
import { ratingTier } from "./rating.js";

const W = 1600, H = 900, SC = 2;
const C = { night: "#0b0d26", ink: "#eef0ff", haze: "#a3a8d8", haze2: "#6e73a6", blue: "#7db3ff", orange: "#ffae6b", up: "#2fe39b", line: "rgba(195,205,255,.14)" };
const pl = (n, w) => `${n} ${w}${n > 1 ? "s" : ""}`;
const fmt2 = (v) => (v == null ? "—" : Number(v).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

async function fonts() {
  await Promise.all(["800 40px Unbounded", "600 20px Unbounded", "400 20px Geist", "500 20px Geist", "600 20px Geist", "700 20px Geist"].map((f) => document.fonts.load(f)));
}
function canvas() {
  const cv = document.createElement("canvas");
  cv.width = W * SC; cv.height = H * SC;
  const ctx = cv.getContext("2d");
  ctx.scale(SC, SC);
  return [cv, ctx];
}
function background(ctx) {
  ctx.fillStyle = C.night; ctx.fillRect(0, 0, W, H);
  const glow = (x, y, r, rgb, a) => { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(0.35, `rgba(${rgb},${a * 0.4})`); g.addColorStop(0.65, `rgba(${rgb},${a * 0.1})`); g.addColorStop(1, `rgba(${rgb},0)`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); };
  glow(0, 0, 900, "58,141,255", 0.5);
  glow(W, H, 950, "255,140,43", 0.38);
  glow(W * 0.55, H * 0.45, 600, "120,80,255", 0.1);
  // terrain en filigrane
  ctx.strokeStyle = "rgba(238,240,255,.06)"; ctx.lineWidth = 2;
  const x0 = -60, y0 = 40, fw = W + 120, fh = H - 80, c = 110;
  ctx.beginPath(); ctx.moveTo(x0 + c, y0); ctx.lineTo(x0 + fw - c, y0); ctx.lineTo(x0 + fw, y0 + c); ctx.lineTo(x0 + fw, y0 + fh - c); ctx.lineTo(x0 + fw - c, y0 + fh); ctx.lineTo(x0 + c, y0 + fh); ctx.lineTo(x0, y0 + fh - c); ctx.lineTo(x0, y0 + c); ctx.closePath(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W / 2, y0); ctx.lineTo(W / 2, y0 + fh); ctx.stroke();
  ctx.beginPath(); ctx.arc(W / 2, H / 2, 150, 0, Math.PI * 2); ctx.stroke();
}
function boostGrad(ctx, x0, y0, x1, y1) { const g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, "#ffe24a"); g.addColorStop(0.55, "#ff9a1f"); g.addColorStop(1, "#ff4f6d"); return g; }
function logo(ctx, x, y) {
  const r = 15;
  ctx.lineWidth = 5; ctx.lineCap = "round";
  ctx.strokeStyle = boostGrad(ctx, x - r, y + r, x + r, y - r);
  ctx.beginPath(); ctx.arc(x, y, r, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 1.5 * 0.75); ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,.15)"; ctx.beginPath(); ctx.arc(x, y, r, Math.PI * 0.75 + Math.PI * 1.5 * 0.75, Math.PI * 2.25); ctx.stroke();
  ctx.strokeStyle = C.ink; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 8, y - 8); ctx.stroke();
  ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.font = "800 24px Unbounded"; ctx.textBaseline = "middle"; ctx.textAlign = "left"; ctx.fillText("Overtime", x + 28, y + 1);
}
function text(ctx, s, x, y, font, color, align = "left", maxW) {
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "alphabetic";
  let t = String(s ?? "");
  if (maxW) while (t.length > 1 && ctx.measureText(t).width > maxW) t = t.slice(0, -2) + "…";
  ctx.fillText(t, x, y);
  return ctx.measureText(t).width;
}
function panel(ctx, x, y, w, h, r = 22) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = "rgba(160,170,255,.07)"; ctx.fill();
  ctx.strokeStyle = "rgba(195,205,255,.16)"; ctx.lineWidth = 1.5; ctx.stroke();
}
function ratingPill(ctx, r, x, y, w = 74, h = 34) {
  const t = ratingTier(r);
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 10);
  ctx.fillStyle = r == null ? "rgba(255,255,255,.06)" : t.color + "26"; ctx.fill();
  ctx.strokeStyle = r == null ? "rgba(255,255,255,.1)" : t.color + "88"; ctx.lineWidth = 1.5; ctx.stroke();
  text(ctx, fmt2(r), x + w / 2, y + h / 2 + 7, "800 18px Unbounded", r == null ? C.haze2 : t.color, "center");
}
function header(ctx, tag) {
  logo(ctx, 70, 62);
  text(ctx, tag, W - 64, 70, "500 20px Geist", C.haze, "right", 900);
}
function footer(ctx, note) {
  text(ctx, note, 64, H - 34, "400 15px Geist", C.haze2, "left", W - 128);
}
function scoreline(ctx, a, b, sa, sb, y, sub) {
  const winA = sa > sb, winB = sb > sa;
  text(ctx, a, W / 2 - 150, y, "800 46px Unbounded", winA ? C.ink : C.haze, "right", 560);
  text(ctx, b, W / 2 + 150, y, "800 46px Unbounded", winB ? C.ink : C.haze, "left", 560);
  ctx.font = "800 84px Unbounded";
  const fill = (win) => (win ? boostGrad(ctx, W / 2 - 120, y, W / 2 + 120, y - 80) : C.haze);
  text(ctx, String(sa), W / 2 - 46, y + 12, "800 84px Unbounded", fill(winA), "right");
  text(ctx, "–", W / 2, y + 2, "400 48px Unbounded", C.haze2, "center");
  text(ctx, String(sb), W / 2 + 46, y + 12, "800 84px Unbounded", fill(winB), "left");
  if (sub) text(ctx, sub, W / 2, y + 56, "500 19px Geist", C.haze, "center", 900);
}
function playersTable(ctx, x, y, w, rows, title) {
  // rows: [{name, team, r, g, a, s, sh, best}] groupés par équipe
  const cols = [["Rating", 92], ["Buts", 64], ["Passes", 72], ["Arrêts", 72], ["Tirs", 56]];
  const colW = cols.reduce((a, c) => a + c[1], 0);
  const rowH = 46;
  const h = 70 + rows.length * rowH + (new Set(rows.map((r) => r.team)).size - 1) * 14 + 16;
  panel(ctx, x, y, w, h);
  text(ctx, title, x + 26, y + 42, "600 20px Unbounded", C.ink);
  let cx = x + w - 26 - colW;
  for (const [l, cw] of cols) { text(ctx, l, cx + cw / 2, y + 42, "500 15px Geist", C.haze, "center"); cx += cw; }
  let yy = y + 70, prevTeam = rows[0]?.team;
  for (const r of rows) {
    if (r.team !== prevTeam) { yy += 14; prevTeam = r.team; }
    ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 22, yy); ctx.lineTo(x + w - 22, yy); ctx.stroke();
    const nameMax = w - 52 - colW - 70;
    if (r.empty) { yy += rowH; continue; }
    const nw = text(ctx, (r.best ? "★ " : "") + r.name, x + 26, yy + 30, "600 20px Geist", r.best ? "#ffe24a" : C.ink, "left", nameMax);
    if (r.teamLabel) text(ctx, r.teamLabel, x + 34 + nw, yy + 30, "500 15px Geist", C.haze2, "left", 80);
    let c2 = x + w - 26 - colW;
    ratingPill(ctx, r.r, c2 + (cols[0][1] - 78) / 2, yy + 7, 78, 32); c2 += cols[0][1];
    for (const [v, i] of [[r.g, 1], [r.a, 2], [r.s, 3], [r.sh, 4]]) { text(ctx, String(v ?? 0), c2 + cols[i][1] / 2, yy + 30, "600 20px Geist", C.ink, "center"); c2 += cols[i][1]; }
    yy += rowH;
  }
  return h;
}

export async function seriesCard(s, games, rows, teamFull) {
  await fonts();
  const [cv, ctx] = canvas();
  background(ctx);
  header(ctx, `${s.tourName} · ${s.parent}`);
  scoreline(ctx, teamFull(s.teams[0]), teamFull(s.teams[1]), s.score[0], s.score[1], 200);
  // un tableau par équipe (stats cumulées sur la série)
  const best = rows.reduce((a, b) => (b.r != null && (a == null || b.r > a.r) ? b : a), null);
  rows.forEach((r) => (r.best = r === best));
  const colW = (W - 64 * 2 - 30) / 2;
  const per = [0, 1].map((t) => rows.filter((r) => r.team === s.teams[t]).slice(0, 4));
  const nRows = Math.max(3, ...per.map((x) => x.length));
  let tableH = 0;
  [0, 1].forEach((t) => {
    const x = 64 + t * (colW + 30);
    const rs = per[t].map((r) => ({ ...r, teamLabel: "" }));
    while (rs.length < nRows) rs.push({ name: "", team: s.teams[t], r: undefined, empty: true });
    tableH = playersTable(ctx, x, 300, colW, rs, teamFull(s.teams[t]));
    ctx.fillStyle = t ? "#ff8c2b" : "#3a8dff"; ctx.beginPath(); ctx.roundRect(x + 26, 300, 60, 4, 2); ctx.fill();
  });
  // résultats des games
  const gy = 300 + tableH + 30, gh = 130;
  panel(ctx, 64, gy, W - 128, gh, 20);
  text(ctx, "Les games", 92, gy + 40, "600 20px Unbounded", C.ink);
  const n = Math.max(1, games.length), x0 = 92, avail = W - 128 - 56, cw = Math.min(260, avail / n);
  games.forEach((g, i) => {
    const x = x0 + i * cw, y = gy + 62;
    const w0 = g.sc[0] > g.sc[1];
    text(ctx, `G${i + 1}`, x, y + 32, "800 16px Unbounded", C.haze2, "left");
    const sx = x + 46;
    let wA = text(ctx, String(g.sc[0]), sx, y + 34, "800 28px Unbounded", w0 ? "#3a8dff" : C.haze2, "left");
    text(ctx, "–", sx + wA + 12, y + 30, "400 20px Unbounded", C.haze2, "center");
    text(ctx, String(g.sc[1]), sx + wA + 24, y + 34, "800 28px Unbounded", !w0 ? "#ff8c2b" : C.haze2, "left");
    text(ctx, g.map + (g.ot ? " · OT" : ""), x, y + 58, "500 14px Geist", C.haze, "left", cw - 20);
    if (i < games.length - 1) { ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(x + cw - 14, y + 4); ctx.lineTo(x + cw - 14, y + 52); ctx.stroke(); }
  });
  // possession et pression cumulées
  const tot = (k, t) => games.reduce((a, g) => a + (g[k]?.[t] || 0), 0);
  let y = gy + gh + 36;
  for (const [label, k] of [["Possession du ballon", "poss"], ["Pression dans la moitié adverse", "press"]]) {
    const a = tot(k, 0), b = tot(k, 1), t = a + b; if (!t || y > H - 60) continue;
    const pa = a / t, bw = W - 128;
    text(ctx, label, W / 2, y + 2, "500 16px Geist", C.haze, "center");
    ctx.beginPath(); ctx.roundRect(64, y + 14, bw * pa - 2, 30, [10, 0, 0, 10]); ctx.fillStyle = "#3a8dff"; ctx.fill();
    ctx.beginPath(); ctx.roundRect(64 + bw * pa + 2, y + 14, bw * (1 - pa) - 2, 30, [0, 10, 10, 0]); ctx.fillStyle = "#ff8c2b"; ctx.fill();
    text(ctx, `${Math.round(pa * 100)} %`, 84, y + 35, "700 16px Geist", "#0b0d26", "left");
    text(ctx, `${Math.round((1 - pa) * 100)} %`, W - 84, y + 35, "700 16px Geist", "#0b0d26", "right");
    y += 72;
  }
  return cv;
}

export async function gameCard(g, opts) {
  await fonts();
  const [cv, ctx] = canvas();
  background(ctx);
  header(ctx, opts.tag || "");
  const tn = opts.teamNames || ["Équipe bleue", "Équipe orange"];
  const xg = g.a?.teams?.map((t) => t.xg);
  scoreline(ctx, tn[0], tn[1], g.score[0], g.score[1], 200, null && `${g.map} · ${Math.floor(g.seconds / 60)}:${String(Math.floor(g.seconds % 60)).padStart(2, "0")}${g.overtime ? " · prolongation" : ""}${xg && xg[0] ? ` · xG ${fmt2(xg[0])} – ${fmt2(xg[1])}` : ""}`);
  const best = g.people.reduce((a, b) => (b.r != null && (!a || b.r > a.r) ? b : a), null);
  const colW = (W - 64 * 2 - 30) / 2;
  [0, 1].forEach((t) => {
    const ps = g.people.filter((p) => p.team === t).sort((a, b) => (b.r ?? 0) - (a.r ?? 0));
    const rows = ps.map((p) => ({ name: p.name, team: t, r: p.r, g: p.core.goals, a: p.core.assists, s: p.core.saves, sh: p.core.shots, best: p === best }));
    const x = 64 + t * (colW + 30);
    ctx.save();
    playersTable(ctx, x, 300, colW, rows, tn[t]);
    ctx.fillStyle = t ? "#ff8c2b" : "#3a8dff"; ctx.beginPath(); ctx.roundRect(x + 26, 300, 60, 4, 2); ctx.fill();
    ctx.restore();
  });
  if (best) {
    const y = 300 + 70 + 3 * 46 + 16 + 34;
    panel(ctx, 64, y, W - 128, 92, 20);
    text(ctx, "Meilleur joueur du match", 92, y + 38, "500 16px Geist", C.haze);
    text(ctx, best.name, 92, y + 70, "800 26px Unbounded", "#ffe24a", "left", 600);
    const sub = best.a?.subs ? Object.entries(best.a.subs).sort((a, b) => b[1] - a[1]).slice(0, 2) : [];
    const names = { att: "Attaque", thr: "Menace", sur: "Survie", kast: "Participation", big: "Décisif", sw: "Swing" };
    text(ctx, `${pl(best.core.goals, "but")} · ${pl(best.core.assists, "passe")} · ${pl(best.core.saves, "arrêt")}${sub.length ? ` · points forts : ${sub.map(([k, v]) => `${names[k]} ${fmt2(v)}`).join(", ")}` : ""}`, 700, y + 58, "500 18px Geist", C.ink, "left", W - 128 - 700 - 150);
    ratingPill(ctx, best.r, W - 64 - 28 - 96, y + 28, 96, 38);
  }
  // possession et pression
  const tm = g.a?.teams;
  if (tm) {
    const bars = [["Possession du ballon", tm[0].possessionSec, tm[1].possessionSec], ["Pression dans la moitié adverse", tm[0].pressureSec, tm[1].pressureSec]];
    let y = 300 + 70 + 3 * 46 + 16 + 34 + 92 + 36;
    for (const [label, a, b] of bars) {
      const t = (a || 0) + (b || 0); if (!t) continue;
      const pa = (a || 0) / t, bw = W - 128;
      text(ctx, label, W / 2, y + 2, "500 16px Geist", C.haze, "center");
      ctx.beginPath(); ctx.roundRect(64, y + 14, bw * pa - 2, 30, [10, 0, 0, 10]); ctx.fillStyle = "#3a8dff"; ctx.fill();
      ctx.beginPath(); ctx.roundRect(64 + bw * pa + 2, y + 14, bw * (1 - pa) - 2, 30, [0, 10, 10, 0]); ctx.fillStyle = "#ff8c2b"; ctx.fill();
      text(ctx, `${Math.round(pa * 100)} %`, 84, y + 35, "700 16px Geist", "#0b0d26", "left");
      text(ctx, `${Math.round((1 - pa) * 100)} %`, W - 84, y + 35, "700 16px Geist", "#0b0d26", "right");
      y += 72;
    }
  }
  return cv;
}

// Fenêtre d'aperçu : copier dans le presse-papiers ou enregistrer
export function shareModal(cv, filename) {
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  const url = cv.toDataURL("image/png");
  const AND = window.OvertimeAndroid;
  const btns = AND
    ? `<button class="btn ghost" data-a="close">Fermer</button><button class="btn" data-a="asave">Enregistrer</button><button class="btn hot" data-a="ashare">Partager</button>`
    : `<button class="btn ghost" data-a="close">Fermer</button><button class="btn" data-a="save">Enregistrer</button><button class="btn hot" data-a="copy">Copier l'image</button>`;
  bg.innerHTML = `<div class="modal share"><h3>Image prête à partager</h3><img src="${url}" alt="Aperçu de l'image"><div class="row share-actions" style="justify-content:flex-end;margin-top:18px"><span class="muted grow" id="shmsg"></span>${btns}</div></div>`;
  const msg = (t) => (bg.querySelector("#shmsg").textContent = t);
  bg.addEventListener("click", async (e) => {
    if (e.target === bg) return bg.remove();
    const a = e.target.closest("[data-a]")?.dataset.a;
    if (a === "close") bg.remove();
    if (a === "ashare") AND.shareImage(url, filename);
    if (a === "asave") { const ok = AND.saveImage(url, filename); msg(ok ? "Image enregistrée dans ta galerie (dossier Overtime)." : "L'enregistrement a échoué."); }
    if (a === "save") { const l = document.createElement("a"); l.href = url; l.download = filename; l.click(); msg("Image enregistrée dans tes Téléchargements."); }
    if (a === "copy") {
      try { const blob = await new Promise((r) => cv.toBlob(r, "image/png")); await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]); msg("Copiée ! Colle-la directement dans ton post X (Ctrl+V)."); }
      catch { msg("La copie n'a pas marché ici : utilise « Enregistrer »."); }
    }
  });
  document.body.append(bg);
}
