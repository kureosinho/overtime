// Rating 3.0 — adaptation à Rocket League du Rating 3.0 de HLTV (CS2).
// HLTV combine six sous-notes normalisées (1,00 = joueur moyen) : Kills, Damage, Survival, KAST, Multi-kills, Round Swing.
// Rocket League n'a pas de rounds : tout est ramené à 5 minutes de jeu (la durée d'un match),
// sauf la Participation qui regarde chaque phase de jeu (d'un engagement au but suivant).

export const SUBS = [
  { k: "att", label: "Attaque", w: 0.24, cs: "Kills",
    short: "Buts et passes décisives",
    long: "Ce que tu marques et fais marquer : buts, plus la moitié de tes passes décisives, ramenés à 5 minutes de jeu. C'est l'équivalent des kills sur CS." },
  { k: "thr", label: "Menace", w: 0.16, cs: "Damage",
    short: "Le danger que tu crées",
    long: "La qualité et le volume de tes occasions : tes expected goals (xG, la probabilité que chaque tir finisse au fond) et tes tirs. Un joueur peut beaucoup menacer sans marquer, comme un joueur CS qui fait des dégâts sans finir ses kills." },
  { k: "sur", label: "Survie", w: 0.16, cs: "Survival",
    short: "Ne pas laisser passer",
    long: "Les buts encaissés quand tu étais le dernier défenseur (tu en portes la plus grosse part), une petite part des autres buts encaissés par ton équipe, et les démolitions subies. Moins tu en prends, plus la note monte." },
  { k: "kast", label: "Participation", w: 0.16, cs: "KAST",
    short: "Être utile à chaque action",
    long: "Le pourcentage de phases de jeu (d'un engagement au but suivant) où tu as fait quelque chose d'utile : un but, une passe décisive, un arrêt, un tir, une passe, un 50/50 gagné, ou du jeu dans une phase que ton équipe gagne. C'est l'équivalent du KAST sur CS." },
  { k: "big", label: "Décisif", w: 0.10, cs: "Multi-kills",
    short: "Les actions qui comptent double",
    long: "Les buts qui égalisent ou donnent l'avantage, le but en prolongation, les buts et les arrêts dans la dernière minute d'un match serré. Un but à 5-0 compte peu, celui du 2-2 à 30 secondes de la fin compte beaucoup." },
  { k: "sw", label: "Swing", w: 0.18, cs: "Round Swing",
    short: "Ton impact sur la victoire",
    long: "De combien tes actions ont fait monter (ou baisser) la probabilité de victoire de ton équipe. Chaque but change cette probabilité selon le score et le temps restant : le buteur et le passeur en récupèrent le gain, les défenseurs en prennent la perte. Les arrêts rapportent aussi un peu." },
];

// Moyennes de départ par format (pour 5 minutes de jeu), mélangées aux games que tu as stockées
const PRIORS = {
  1: { att: 2.6, thr: 2.0, d: 2.6, kast: 0.78, big: 1.4, sw: 0, swsd: 0.6 },
  2: { att: 2.0, thr: 2.0, d: 1.7, kast: 0.89, big: 1.2, sw: 0, swsd: 0.27 },
  3: { att: 1.27, thr: 1.0, d: 1.1, kast: 0.8, big: 0.86, sw: 0, swsd: 0.2 },
};
const PRIOR_WEIGHT = 30;

function per5(r, liveSec) {
  const M = Math.max(60, liveSec || 300) / 300;
  return {
    att: (r.goals + 0.5 * r.assists) / M,
    thr: ((r.xg > 0 ? r.xg : r.shots * 0.3) + 0.1 * r.shots) / M,
    d: r.deaths / M,
    kast: r.rounds ? r.kast / r.rounds : 0,
    big: r.big / M,
    sw: r.swing / M,
  };
}
const tsOf = (meta) => Math.min(3, Math.max(1, meta?.teamSize || 2));

export function computeBaselines(analyses) {
  const acc = {};
  for (const a of analyses) {
    const ts = tsOf(a.meta);
    for (const p of a.players || []) if (p.r3?.rounds) (acc[ts] ||= []).push(per5(p.r3, a.meta?.liveSeconds));
  }
  const out = {};
  for (const ts of [1, 2, 3]) {
    const arr = acc[ts] || [], pr = PRIORS[ts], n = arr.length, W = PRIOR_WEIGHT;
    const mean = (k) => (arr.reduce((s, x) => s + x[k], 0) + pr[k] * W) / (n + W);
    const b = { n, att: mean("att"), thr: mean("thr"), d: mean("d"), kast: mean("kast"), big: mean("big"), sw: mean("sw") };
    b.swsd = Math.sqrt((arr.reduce((s, x) => s + (x.sw - b.sw) ** 2, 0) + pr.swsd ** 2 * W) / (n + W)) || pr.swsd;
    out[ts] = b;
  }
  return out;
}

const clip = (v) => Math.max(0.2, Math.min(2.5, v));

export function rate(p, meta, baselines) {
  if (!p?.r3 || !p.r3.rounds) return null;
  const b = baselines[tsOf(meta)];
  const x = per5(p.r3, meta?.liveSeconds);
  const subs = {
    att: clip((x.att + 0.2) / (b.att + 0.2)),
    thr: clip((x.thr + 0.2) / (b.thr + 0.2)),
    sur: clip((b.d + 0.6) / (x.d + 0.6)),
    kast: clip(x.kast / Math.max(0.3, b.kast)),
    big: clip((x.big + 0.3) / (b.big + 0.3)),
    sw: clip(1 + ((x.sw - b.sw) / b.swsd) * 0.25),
  };
  let rating = 0;
  for (const s of SUBS) rating += subs[s.k] * s.w;
  // match très court (forfait…) : on resserre vers 1,00
  const min = (meta?.liveSeconds || 300) / 60;
  rating = 1 + (rating - 1) * Math.min(1, (min + 2) / 7);
  return { rating: Math.round(rating * 100) / 100, subs };
}

// Échelle de couleur : rouge (mauvais) -> orange -> jaune (moyen) -> vert clair -> vert (excellent)
export const SCALE = [
  { min: 1.3, label: "Exceptionnel", cls: "r-elite", color: "#12d98a" },
  { min: 1.15, label: "Excellent", cls: "r-great", color: "#4ee07a" },
  { min: 1.05, label: "Bon", cls: "r-good", color: "#a6e05a" },
  { min: 0.95, label: "Dans la moyenne", cls: "r-avg", color: "#f2d24b" },
  { min: 0.85, label: "En dessous", cls: "r-low", color: "#ff9a3d" },
  { min: -Infinity, label: "Difficile", cls: "r-bad", color: "#ff4d6a" },
];
export function ratingTier(r) {
  if (r == null || Number.isNaN(r)) return { label: "—", cls: "r-none", color: "#6e73a6" };
  return SCALE.find((s) => r >= s.min);
}
