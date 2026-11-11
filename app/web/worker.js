// Analyse des replays en arrière-plan (WebAssembly subtr-actor)
import init, { get_stats_timeline } from "./vendor/rl_replay_subtr_actor.js";
import { analyzeTimeline } from "./analyzer.js";

const ready = init({ module_or_path: new URL("./vendor/rl_replay_subtr_actor_bg.wasm", import.meta.url) });

self.onmessage = async (ev) => {
  const { guid, url } = ev.data;
  try {
    await ready;
    const res = await fetch(url || `/api/replay/${encodeURIComponent(guid)}`);
    if (!res.ok) throw new Error(`replay indisponible (${res.status})`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const timeline = get_stats_timeline(bytes, true);
    const summary = analyzeTimeline(timeline);
    self.postMessage({ guid, ok: true, summary });
  } catch (e) {
    self.postMessage({ guid, ok: false, error: String(e?.message || e) });
  }
};
