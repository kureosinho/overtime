// Analyse d'un replay Rocket League -> résumé de stats par joueur.
// S'appuie sur subtr-actor (WASM) : get_stats_timeline() renvoie des flux d'événements
// (mouvement, boost, positionnement, touches, mécaniques...) que l'on agrège ici.

const SUPERSONIC = 2200;

export function pidKey(pid) {
  if (!pid) return "";
  if (typeof pid === "string") return pid;
  const k = Object.keys(pid)[0];
  const v = pid[k];
  if (typeof v === "object" && v !== null) {
    // ex: {PlayStation: {name, online_id}} ou {Xbox: id}
    const inner = v.online_id ?? v.id ?? v.name ?? JSON.stringify(v);
    return `${k}|${inner}`;
  }
  return `${k}|${v}`;
}

const toPlain = (v) => {
  if (v instanceof Map) {
    const o = {};
    for (const [k, val] of v) o[k] = toPlain(val);
    return o;
  }
  if (Array.isArray(v)) return v.map(toPlain);
  if (v && typeof v === "object") {
    const o = {};
    for (const k of Object.keys(v)) o[k] = toPlain(v[k]);
    return o;
  }
  return v;
};

function header(meta, name) {
  for (const h of meta.all_headers || []) if (h[0] === name) return h[1];
  return undefined;
}

const HM_COLS = 12, HM_ROWS = 16;

function newPlayer(p, team) {
  return {
    id: pidKey(p.remote_id),
    name: p.name,
    team,
    car: p.car_hitbox_family || "",
    carBodyId: p.car_body_id ?? null,
    core: { score: 0, goals: 0, assists: 0, saves: 0, shots: 0, demosInflicted: 0, demosTaken: 0, touches: 0, xg: 0 },
    boost: { bpm: 0, avgAmount: 0, pctZero: 0, pctFull: 0, pct0_25: 0, pct25_50: 0, pct50_75: 0, pct75_100: 0,
      bigPads: 0, smallPads: 0, stolen: 0, stolenBig: 0, overfill: 0, collected: 0, used: 0, usedSupersonic: 0, bigPadsOwnHalf: 0 },
    movement: { avgSpeed: 0, distance: 0, pctSupersonic: 0, pctBoostSpeed: 0, pctSlow: 0, pctGround: 0, pctLowAir: 0, pctHighAir: 0,
      powerslides: 0, dodges: 0, wavedashes: 0, halfFlips: 0, speedFlips: 0 },
    positioning: { pctDefThird: 0, pctNeuThird: 0, pctOffThird: 0, pctDefHalf: 0, pctOffHalf: 0, pctBehindBall: 0, pctLevelBall: 0,
      pctAheadBall: 0, pctMostBack: 0, pctMostForward: 0, pctFirstMan: 0, pctSecondMan: 0, pctClosestToBall: 0, pctFarthestFromBall: 0,
      avgDistToBall: 0, avgDistToTeammates: 0, shadowDefenseSec: 0 },
    control: { possessionSec: 0, passes: 0, passesReceived: 0, centers: 0, fiftyWins: 0, fiftyLosses: 0, fiftyTotal: 0,
      beatenToBall: 0, whiffs: 0, kickoffFirstTouches: 0, kickoffWins: 0, aerialTouches: 0, wallTouches: 0, hardHits: 0,
      carries: 0, carrySec: 0 },
    mechanics: { wallAerials: 0, flicks: 0, ceilingShots: 0, airDribbles: 0, flipResets: 0, oneTimers: 0, halfVolleys: 0,
      backboards: 0, bumps: 0, dodgeResets: 0 },
    heatmap: new Array(HM_COLS * HM_ROWS).fill(0),
    _t: {}, // accumulateurs temporaires
  };
}

function addT(p, key, v) { p._t[key] = (p._t[key] || 0) + v; }

function heatIndex(pos, team) {
  if (!pos) return -1;
  let x = pos[0], y = pos[1];
  if (team === 1) { x = -x; y = -y; } // toujours attaquer vers le haut
  const cx = Math.floor(((x + 4096) / 8192) * HM_COLS);
  const cy = Math.floor(((5120 - y) / 10240) * HM_ROWS); // ligne 0 = but adverse (haut)
  if (cx < 0 || cx >= HM_COLS || cy < 0 || cy >= HM_ROWS) return -1;
  return cy * HM_COLS + cx;
}

export function analyzeTimeline(rawTimeline) {
  const st = toPlain(rawTimeline);
  const meta = st.replay_meta;
  const frames = st.frames;
  const events = st.events?.events || [];

  const players = [];
  const byId = new Map();
  for (const p of meta.team_zero || []) { const o = newPlayer(p, 0); players.push(o); byId.set(o.id, o); }
  for (const p of meta.team_one || []) { const o = newPlayer(p, 1); players.push(o); byId.set(o.id, o); }
  const get = (pid) => byId.get(pidKey(pid));

  // Stats du tableau des scores (header)
  for (const ps of header(meta, "PlayerStats") || []) {
    const epic = ps.PlayerID?.fields?.EpicAccountId;
    let pl = players.find((p) => p.name === ps.Name && p.team === ps.Team);
    if (!pl && epic) pl = byId.get(`Epic|${epic}`);
    if (!pl) continue;
    pl.core.score = ps.Score || 0; pl.core.goals = ps.Goals || 0; pl.core.assists = ps.Assists || 0;
    pl.core.saves = ps.Saves || 0; pl.core.shots = ps.Shots || 0;
  }

  const live = st.activity_summary?.live_play_seconds || 0;
  const liveMin = Math.max(live / 60, 0.01);

  // Temps par frame (pour pondérer les pistes de boost)
  const frameTime = new Float64Array(frames.length);
  const frameLiveDt = new Float64Array(frames.length);
  for (let i = 0; i < frames.length; i++) {
    frameTime[i] = frames[i].time;
    frameLiveDt[i] = frames[i].is_live_play ? (frames[i].dt || 0) : 0;
  }

  // Pistes cumulées (boost)
  for (const tr of st.accumulation_tracks || []) {
    const p = get(tr.player_id); if (!p) continue;
    const pts = tr.points || [];
    const last = pts.length ? pts[pts.length - 1].value : 0;
    switch (tr.quantity) {
      case "boost_collected": p.boost.collected = last / 2.55; break;
      case "boost_used": p.boost.used = last / 2.55; break;
      case "boost_stolen": p.boost.stolen = last / 2.55; break;
      case "boost_overfill": p.boost.overfill = last / 2.55; break;
      case "boost_used_supersonic": p.boost.usedSupersonic = last / 2.55; break;
      case "boost_amount": {
        let j = 0, cur = pts.length ? pts[0].value : 0, tot = 0, sum = 0;
        const bins = [0, 0, 0, 0]; let zero = 0, full = 0;
        for (let f = 0; f < frames.length; f++) {
          while (j < pts.length && pts[j].frame <= f) { cur = pts[j].value; j++; }
          const dt = frameLiveDt[f]; if (!dt) continue;
          const pct = Math.max(0, Math.min(100, cur / 2.55));
          tot += dt; sum += pct * dt;
          if (pct < 1) zero += dt;
          if (pct >= 99) full += dt;
          bins[Math.min(3, Math.floor(pct / 25))] += dt;
        }
        if (tot > 0) {
          p.boost.avgAmount = sum / tot;
          p.boost.pctZero = (zero / tot) * 100; p.boost.pctFull = (full / tot) * 100;
          p.boost.pct0_25 = (bins[0] / tot) * 100; p.boost.pct25_50 = (bins[1] / tot) * 100;
          p.boost.pct50_75 = (bins[2] / tot) * 100; p.boost.pct75_100 = (bins[3] / tot) * 100;
        }
        // courbe échantillonnée toutes les ~5 s pour le graphique du match
        const samples = []; let k = 0, c2 = pts.length ? pts[0].value : 0;
        let nextT = frameTime[0] || 0;
        for (let f = 0; f < frames.length; f++) {
          while (k < pts.length && pts[k].frame <= f) { c2 = pts[k].value; k++; }
          if (frameTime[f] >= nextT) { samples.push([Math.round(frameTime[f]), Math.round(c2 / 2.55)]); nextT += 5; }
        }
        p.boostCurve = samples;
        break;
      }
    }
  }

  // xG
  const xg = st.expected_goals_tracks;
  const teamXg = [0, 0];
  for (const t of xg?.teams || []) {
    const last = t.points?.[t.points.length - 1];
    teamXg[t.is_team_0 ? 0 : 1] = last?.stats?.xg || 0;
  }
  for (const tp of xg?.players || []) {
    const p = get(tp.player_id); if (!p) continue;
    const pts = Array.isArray(tp.points) ? tp.points[tp.points.length - 1] : tp.points;
    p.core.xg = pts?.stats?.xg || 0;
  }

  // Distances (positioning_summary)
  for (const ps of st.positioning_summary || []) {
    const p = get(ps.player_id); if (!p) continue;
    const d = ps.distance || {};
    const t = (d.time_has_possession || 0) + (d.time_no_possession || 0);
    if (live > 0) {
      p.positioning.avgDistToBall = (d.sum_distance_to_ball || 0) / live;
      p.positioning.avgDistToTeammates = (d.sum_distance_to_teammates || 0) / live;
    }
    p.control.possessionSec = d.time_has_possession || 0;
    void t;
  }

  const goals = [];
  const kickoffs = [];
  const possession = { team0: 0, team1: 0, neutral: 0 };
  const pressure = [0, 0];

  for (const e of events) {
    const stream = e.meta?.stream;
    const pl = e.payload?.payload;
    if (!pl) continue;
    const p = get(pl.player ?? pl.player_id);
    switch (stream) {
      case "movement":
        if (!p) break;
        addT(p, "mv", pl.dt); addT(p, "dist", pl.distance);
        addT(p, "sp_" + pl.speed_band, pl.dt); addT(p, "h_" + pl.height_band, pl.dt);
        { const i = heatIndex(pl.player_position, p.team); if (i >= 0) p.heatmap[i] += pl.dt; }
        break;
      case "field_third": if (p) addT(p, "ft_" + pl.state, pl.duration); break;
      case "field_half": if (p) addT(p, "fh_" + pl.state, pl.duration); break;
      case "ball_depth": if (p) addT(p, "bd_" + pl.state, pl.duration); break;
      case "depth_role": if (p) addT(p, "dr_" + pl.state, pl.duration); break;
      case "rotation_role": if (p) addT(p, "rr_" + pl.state, pl.duration); break;
      case "ball_proximity":
        if (!p) break;
        addT(p, "bp", pl.duration);
        if (pl.state?.closest_to_ball_team) addT(p, "bp_close", pl.duration);
        if (pl.state?.farthest_from_ball) addT(p, "bp_far", pl.duration);
        break;
      case "shadow_defense": if (p && pl.state === "shadowing") p.positioning.shadowDefenseSec += pl.duration || 0; break;
      case "powerslide": if (p && pl.active) p.movement.powerslides++; break;
      case "dodge": if (p) p.movement.dodges++; break;
      case "wavedash": if (p) p.movement.wavedashes++; break;
      case "half_flip": if (p) p.movement.halfFlips++; break;
      case "speed_flip": if (p) p.movement.speedFlips++; break;
      case "boost_pickups":
        if (!p) break;
        if (pl.pad_type === "big") { p.boost.bigPads++; if (pl.is_steal) p.boost.stolenBig++; if (pl.field_half === "own") p.boost.bigPadsOwnHalf++; }
        else p.boost.smallPads++;
        break;
      case "touch": {
        if (!p) break;
        p.core.touches++;
        const tags = Object.fromEntries((pl.tags || []).map((t) => [t.group, t.value]));
        if (tags.height_band && tags.height_band !== "ground") p.control.aerialTouches++;
        if (tags.surface === "wall") p.control.wallTouches++;
        if (tags.kind === "hard_hit") p.control.hardHits++;
        break;
      }
      case "pass": {
        const a = get(pl.passer), b = get(pl.receiver);
        if (a) a.control.passes++; if (b) b.control.passesReceived++;
        break;
      }
      case "center": if (p) p.control.centers++; break;
      case "fifty_fifty": {
        const a = get(pl.team_zero_player), b = get(pl.team_one_player);
        const w0 = pl.possession_team_is_team_0;
        if (a) { a.control.fiftyTotal++; if (w0 === true) a.control.fiftyWins++; else if (w0 === false) a.control.fiftyLosses++; }
        if (b) { b.control.fiftyTotal++; if (w0 === false) b.control.fiftyWins++; else if (w0 === true) b.control.fiftyLosses++; }
        break;
      }
      case "beaten_to_ball": if (p) p.control.beatenToBall++; break;
      case "whiff": if (p) p.control.whiffs++; break;
      case "ball_carry": {
        const q = get(pl.player_id);
        if (!q) break;
        if (pl.kind === "air_dribble") q.mechanics.airDribbles++;
        else { q.control.carries++; q.control.carrySec += pl.duration || 0; }
        break;
      }
      case "kickoff": {
        const ft = get(pl.first_touch_player);
        kickoffs.push({ time: pl.start_time, type: pl.kickoff_type, outcome: pl.outcome, firstTouch: ft?.id || null });
        if (ft) {
          ft.control.kickoffFirstTouches++;
          const win = pl.winning_team_is_team_0;
          if ((win === true && ft.team === 0) || (win === false && ft.team === 1)) ft.control.kickoffWins++;
        }
        break;
      }
      case "wall_aerial": if (p) p.mechanics.wallAerials++; break;
      case "flick": if (p) p.mechanics.flicks++; break;
      case "ceiling_shot": if (p) p.mechanics.ceilingShots++; break;
      case "flip_reset": if (p) p.mechanics.flipResets++; break;
      case "one_timer": if (p) p.mechanics.oneTimers++; break;
      case "half_volley": if (p) p.mechanics.halfVolleys++; break;
      case "backboard": if (p) p.mechanics.backboards++; break;
      case "dodge_reset": if (p && pl.on_ball) p.mechanics.dodgeResets++; break;
      case "bump": { const a = get(pl.initiator); if (a && !pl.is_team_bump) a.mechanics.bumps++; break; }
      case "demolition": {
        const a = get(pl.attacker), v = get(pl.victim);
        if (a) a.core.demosInflicted++; if (v) v.core.demosTaken++;
        break;
      }
      case "possession":
        if (pl.possession_state === "team_zero") possession.team0 += pl.duration || 0;
        else if (pl.possession_state === "team_one") possession.team1 += pl.duration || 0;
        else possession.neutral += pl.duration || 0;
        break;
      case "territorial_pressure": pressure[pl.team_is_team_0 ? 0 : 1] += pl.offensive_half_time || 0; break;
      case "goal_context": {
        const sc = get(pl.scorer);
        goals.push({
          time: pl.time, team: pl.scoring_team_is_team_0 ? 0 : 1, scorer: sc?.id || null, scorerName: sc?.name || "?",
          ballSpeedKmh: Math.round((pl.ball_speed_at_goal || 0) * 0.036), buildup: pl.goal_buildup || "",
          airTime: pl.ball_air_time_before_goal || 0,
        });
        break;
      }
    }
  }

  // Assists : rattachés aux buts via la timeline
  const assists = events.filter((e) => e.meta?.stream === "timeline" && e.payload?.payload?.kind === "Assist")
    .map((e) => ({ time: e.payload.payload.time, id: pidKey(e.payload.payload.player_id) }));
  for (const g of goals) {
    const a = assists.find((x) => Math.abs(x.time - g.time) < 1.5);
    if (a) { g.assist = a.id; g.assistName = byId.get(a.id)?.name; }
  }

  // Finalisation des pourcentages
  for (const p of players) {
    const t = p._t;
    const mv = t.mv || 0;
    if (mv > 0) {
      p.movement.distance = t.dist || 0;
      p.movement.avgSpeed = (t.dist || 0) / mv;
      p.movement.pctSupersonic = ((t.sp_supersonic || 0) / mv) * 100;
      p.movement.pctBoostSpeed = ((t.sp_boost || 0) / mv) * 100;
      p.movement.pctSlow = ((t.sp_slow || 0) / mv) * 100;
      p.movement.pctGround = ((t.h_ground || 0) / mv) * 100;
      p.movement.pctLowAir = ((t.h_low_air || 0) / mv) * 100;
      p.movement.pctHighAir = ((t.h_high_air || 0) / mv) * 100;
    }
    const ft = (t.ft_defensive || 0) + (t.ft_neutral || 0) + (t.ft_offensive || 0);
    if (ft > 0) {
      p.positioning.pctDefThird = (t.ft_defensive / ft) * 100 || 0;
      p.positioning.pctNeuThird = (t.ft_neutral / ft) * 100 || 0;
      p.positioning.pctOffThird = (t.ft_offensive / ft) * 100 || 0;
    }
    const fh = (t.fh_defensive || 0) + (t.fh_offensive || 0);
    if (fh > 0) { p.positioning.pctDefHalf = ((t.fh_defensive || 0) / fh) * 100; p.positioning.pctOffHalf = ((t.fh_offensive || 0) / fh) * 100; }
    const bd = (t.bd_behind_ball || 0) + (t.bd_level_with_ball || 0) + (t.bd_ahead_of_ball || 0);
    if (bd > 0) {
      p.positioning.pctBehindBall = ((t.bd_behind_ball || 0) / bd) * 100;
      p.positioning.pctLevelBall = ((t.bd_level_with_ball || 0) / bd) * 100;
      p.positioning.pctAheadBall = ((t.bd_ahead_of_ball || 0) / bd) * 100;
    }
    const dr = (t.dr_most_back || 0) + (t.dr_most_forward || 0) + (t.dr_other || 0);
    if (dr > 0) { p.positioning.pctMostBack = ((t.dr_most_back || 0) / dr) * 100; p.positioning.pctMostForward = ((t.dr_most_forward || 0) / dr) * 100; }
    const rr = (t.rr_first_man || 0) + (t.rr_second_man || 0) + (t.rr_third_man || 0) + (t.rr_ambiguous || 0);
    if (rr > 0) { p.positioning.pctFirstMan = ((t.rr_first_man || 0) / rr) * 100; p.positioning.pctSecondMan = ((t.rr_second_man || 0) / rr) * 100; }
    if (t.bp) { p.positioning.pctClosestToBall = ((t.bp_close || 0) / t.bp) * 100; p.positioning.pctFarthestFromBall = ((t.bp_far || 0) / t.bp) * 100; }
    p.boost.bpm = p.boost.collected / liveMin;
    // heatmap -> entiers 0..100
    const mx = Math.max(...p.heatmap, 1e-9);
    p.heatmap = p.heatmap.map((v) => Math.round((v / mx) * 100));
    delete p._t;
  }

  const t0 = header(meta, "Team0Score") || 0, t1 = header(meta, "Team1Score") || 0;
  const epoch = Number(header(meta, "MatchStartEpoch") || 0);
  const summary = {
    version: 2,
    meta: {
      matchGuid: header(meta, "MatchGUID") || "",
      replayId: header(meta, "Id") || "",
      replayName: header(meta, "ReplayName") || "",
      map: header(meta, "MapName") || "",
      date: header(meta, "Date") || "",
      startEpoch: epoch,
      playlistId: meta.game_type?.playlist_id ?? null,
      gameType: meta.game_type?.game_type || "",
      matchType: header(meta, "MatchType") || "",
      teamSize: header(meta, "TeamSize") || Math.max(meta.team_zero?.length || 0, meta.team_one?.length || 0),
      score: [t0, t1],
      winner: t0 === t1 ? -1 : t0 > t1 ? 0 : 1,
      seconds: header(meta, "TotalSecondsPlayed") || 0,
      liveSeconds: live,
      season: meta.season?.number ?? null,
    },
    teams: [
      { xg: teamXg[0], possessionSec: possession.team0, pressureSec: pressure[0] },
      { xg: teamXg[1], possessionSec: possession.team1, pressureSec: pressure[1] },
    ],
    goals, kickoffs, players,
  };
  computeR3Raw(summary, st, frames, events, get, header(meta, "Date"));
  return summary;
}


// ---------- Rating 3.0 (adapté de HLTV à Rocket League) ----------
// Les "rounds" d'un match RL = les séquences entre deux engagements (un but termine un round).
// Pour chaque joueur on calcule les stats brutes ; la normalisation (1.00 = joueur moyen) se fait dans l'interface.

const GOAL_RATE = { 1: 0.55, 2: 0.62, 3: 0.68 }; // buts par équipe et par minute (approx. ranked)

function poisson(l, k) { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p; }
// Probabilité de victoire avec un écart d (pour nous) et s secondes restantes
export function winProb(d, s, teamSize = 2) {
  if (s <= 0) return d > 0 ? 1 : d < 0 ? 0 : 0.5;
  const l = (GOAL_RATE[teamSize] || 0.62) * (s / 60);
  const pa = [], pb = [];
  for (let k = 0; k <= 14; k++) { pa.push(poisson(l, k)); pb.push(poisson(l, k)); }
  let win = 0, tie = 0;
  for (let a = 0; a <= 14; a++) for (let b = 0; b <= 14; b++) {
    const diff = d + a - b, p = pa[a] * pb[b];
    if (diff > 0) win += p; else if (diff === 0) tie += p;
  }
  return win + tie * 0.5;
}

function parseHeaderDate(str) {
  // "2021-05-04 18-07-32"
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2})-(\d{2})-(\d{2})/.exec(str || "");
  if (!m) return 0;
  return Math.floor(new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() / 1000);
}

function computeR3Raw(summary, st, frames, events, get, dateStr) {
  const ps = summary.players;
  const ts = summary.meta.teamSize || 1;
  if (!summary.meta.startEpoch) summary.meta.startEpoch = parseHeaderDate(dateStr);

  // secondes restantes au temps t
  const times = frames.map((f) => f.time);
  const secAt = (t) => {
    let lo = 0, hi = times.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (times[mid] < t) lo = mid + 1; else hi = mid; }
    return frames[lo]?.seconds_remaining ?? 0;
  };

  const goals = [...summary.goals].sort((a, b) => a.time - b.time);
  const tl = events.filter((e) => e.meta?.stream === "timeline").map((e) => e.payload.payload);
  const tlOf = (kind) => tl.filter((x) => x.kind === kind).map((x) => ({ time: x.time, id: pidKey(x.player_id) }));
  const shots = tlOf("Shot"), saves = tlOf("Save"), assistsTl = tlOf("Assist"), goalsTl = tlOf("Goal");
  const gctx = events.filter((e) => e.meta?.stream === "goal_context").map((e) => e.payload.payload);

  // Score avant chaque but et attribution
  const score = [0, 0];
  const goalInfo = goals.map((g) => {
    const before = [...score];
    score[g.team]++;
    const s = secAt(g.time);
    const ctx = gctx.find((c) => Math.abs(c.time - g.time) < 0.5);
    return { ...g, before, s, ot: s <= 0, lastDef: ctx ? pidKey(ctx.defending_team_most_back_player) : null };
  });
  const scoreAt = (t) => { const sc = [0, 0]; for (const g of goals) if (g.time < t) sc[g.team]++; return sc; };

  const r = {};
  for (const p of ps) r[p.id] = { rounds: 0, kast: 0, goals: p.core.goals, assists: p.core.assists, shots: p.core.shots, saves: p.core.saves, xg: p.core.xg || 0, deaths: 0, swing: 0, big: 0 };

  // --- Swing (variation de la probabilité de victoire) ---
  for (const g of goalInfo) {
    const d = g.before[g.team] - g.before[1 - g.team];
    const pBefore = g.ot ? 0.5 : winProb(d, g.s, ts);
    const pAfter = g.ot ? 1 : winProb(d + 1, g.s, ts);
    const delta = pAfter - pBefore;
    const scorer = g.scorer, assist = g.assist;
    if (r[scorer]) r[scorer].swing += delta * (assist ? 0.65 : 1);
    if (assist && r[assist]) r[assist].swing += delta * 0.35;
    const defenders = ps.filter((p) => p.team !== g.team);
    for (const p of defenders) {
      const share = defenders.length === 1 ? 1 : p.id === g.lastDef ? 0.5 : 0.5 / (defenders.length - 1);
      r[p.id].swing -= delta * share;
      r[p.id].deaths += defenders.length === 1 ? 1 : p.id === g.lastDef ? 0.6 : 0.4 / (defenders.length - 1);
    }
    // Actions décisives
    const tie = d === 0, equal = d === -1;
    let val = g.ot ? 1.5 : tie || equal ? 1 : 0;
    if (!g.ot && g.s <= 60 && Math.abs(d) <= 1) val += 0.5;
    if (val && r[scorer]) r[scorer].big += val;
    if (val && assist && r[assist]) r[assist].big += val * 0.5;
  }
  for (const sv of saves) {
    const p = ps.find((x) => x.id === sv.id); if (!p) continue;
    const sc = scoreAt(sv.time), d = sc[p.team] - sc[1 - p.team], s = secAt(sv.time);
    const value = 0.3 * (winProb(d, s, ts) - winProb(d - 1, s, ts));
    r[p.id].swing += value;
    if ((s <= 60 || s <= 0) && (d === 0 || d === 1)) r[p.id].big += 0.75;
    else if (d === 0 || d === 1) r[p.id].big += 0.15;
  }
  for (const p of ps) r[p.id].deaths += (p.core.demosTaken || 0) * 0.15;

  // --- Rounds et participation (équivalent KAST) ---
  const kicks = (summary.kickoffs || []).map((k) => k.time).sort((a, b) => a - b);
  const bounds = kicks.length ? kicks : [0, ...goals.map((g) => g.time + 0.1)];
  const endT = frames.length ? frames[frames.length - 1].time : 0;
  const passes = events.filter((e) => e.meta?.stream === "pass").map((e) => ({ time: e.payload.payload.time, id: pidKey(e.payload.payload.passer) }));
  const touches = events.filter((e) => e.meta?.stream === "touch").map((e) => ({ time: e.payload.payload.time, id: pidKey(e.payload.payload.player) }));
  const fifties = events.filter((e) => e.meta?.stream === "fifty_fifty").map((e) => {
    const f = e.payload.payload;
    const w = f.possession_team_is_team_0 === true ? f.team_zero_player : f.possession_team_is_team_0 === false ? f.team_one_player : null;
    return { time: f.resolve_time, id: w ? pidKey(w) : null };
  });
  const contrib = [...shots, ...saves, ...assistsTl, ...goalsTl, ...passes, ...fifties.filter((f) => f.id)];
  let nRounds = 0;
  for (let i = 0; i < bounds.length; i++) {
    const a = bounds[i], b = i + 1 < bounds.length ? bounds[i + 1] : endT;
    if (b - a < 3) continue;
    nRounds++;
    const goal = goals.find((g) => g.time >= a && g.time < b);
    for (const p of ps) {
      r[p.id].rounds++;
      const pos = contrib.some((c) => c.id === p.id && c.time >= a && c.time < b)
        || (goal && goal.team === p.team && touches.some((c) => c.id === p.id && c.time >= a && c.time < b))
        || (!goal && touches.filter((c) => c.id === p.id && c.time >= a && c.time < b).length >= 3);
      if (pos) r[p.id].kast++;
    }
  }
  summary.meta.rounds = nRounds;
  for (const p of ps) p.r3 = r[p.id];
}
