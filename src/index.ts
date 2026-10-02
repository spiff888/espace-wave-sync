import { loadConfig, loadDotEnv, loadEnv } from "./config.js";
import { fetchTodaysEvents } from "./kiosk.js";
import { loadState, pruneState, saveState } from "./state.js";
import { syncCampus } from "./sync.js";
import { waveClientFromEnv } from "./wave/client.js";

const log = (msg: string) => console.log(`${new Date().toISOString()} ${msg}`);

async function main(): Promise<void> {
  const once = process.argv.includes("--once");
  loadDotEnv();
  const env = loadEnv();
  const config = loadConfig(env.CONFIG_PATH);
  const wave = waveClientFromEnv(env);

  log(`espace-wave-sync starting: ${config.campuses.length} campus(es), every ${env.SYNC_INTERVAL_SECONDS}s` +
    (env.DRY_RUN ? ", DRY RUN (no changes will be made)" : ""));

  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  while (!stopping) {
    await cycle();
    if (once) break;
    await sleep(env.SYNC_INTERVAL_SECONDS * 1000, () => stopping);
  }
  await wave.logout();
  log("stopped");

  async function cycle(): Promise<void> {
    const now = new Date();
    const state = pruneState(loadState(env.STATE_PATH), now);
    for (const campus of config.campuses) {
      let feed;
      try {
        feed = await fetchTodaysEvents(env.KIOSK_URL, campus.kioskCampus);
      } catch (err) {
        // Kiosk down: leave this campus's layout exactly as it is rather than clearing it.
        log(`[${campus.name}] kiosk unreachable, leaving layout unchanged: ${(err as Error).message}`);
        continue;
      }
      if (feed.stale) log(`[${campus.name}] note: kiosk reports its eSPACE data is stale; using what it has`);
      try {
        await syncCampus({ wave, config, events: feed.events, state, now, dryRun: env.DRY_RUN, log }, campus);
      } catch (err) {
        log(`[${campus.name}] sync failed: ${(err as Error).message}`);
      }
    }
    if (!env.DRY_RUN) saveState(env.STATE_PATH, state);
  }
}

function sleep(ms: number, cancelled: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = setInterval(() => {
      if (cancelled() || Date.now() - started >= ms) {
        clearInterval(tick);
        resolve();
      }
    }, 500);
  });
}

main().catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});
