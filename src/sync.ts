import type { CampusConfig, SyncConfig } from "./config.js";
import type { KioskEvent } from "./kiosk.js";
import { planLayout, type Op } from "./plan.js";
import { camerasFor, counts, isInProgress, selectCameras, unmappedRooms } from "./select.js";
import { bookmarkKey, type State } from "./state.js";
import type { WaveClient } from "./wave/client.js";

export interface CycleContext {
  wave: WaveClient;
  config: SyncConfig;
  events: KioskEvent[];
  state: State;
  now: Date;
  dryRun: boolean;
  log: (msg: string) => void;
}

/** Last unmapped-room list logged per campus, so the warning only prints when it changes. */
const lastUnmapped = new Map<string, string>();
/** Bookmarks already reported in dry run, so each is logged once rather than every cycle. */
const dryRunBookmarks = new Set<string>();

export async function syncCampus(ctx: CycleContext, campus: CampusConfig): Promise<void> {
  const { wave, config, events, now, dryRun, log } = ctx;
  const tag = `[${campus.name}]`;

  const unmapped = unmappedRooms(campus, events);
  const unmappedKey = unmapped.join("\n");
  if (unmappedKey !== lastUnmapped.get(campus.name)) {
    lastUnmapped.set(campus.name, unmappedKey);
    if (unmapped.length) {
      log(`${tag} ${unmapped.length} room(s) with events today aren't in config.json (no cameras will show for them):`);
      for (const r of unmapped) log(`${tag}   - ${r}`);
    }
  }

  const selection = selectCameras(campus, events, {
    now,
    lookaheadMinutes: config.lookaheadMinutes,
    graceMinutes: config.graceMinutes,
  });
  log(
    `${tag} live events: ${selection.liveEvents.map((e) => `"${e.title}" (${e.rooms.join(", ")})`).join("; ") || "none"}; ` +
      `cameras: ${selection.cameras.length}` +
      (selection.dropped.length ? ` (${selection.dropped.length} over the ${campus.maxCameraTiles}-tile cap)` : ""),
  );

  // Layout and bookmarks are independent: a failure in one shouldn't skip the other.
  try {
    await syncLayout(ctx, campus, selection.cameras);
  } catch (err) {
    log(`${tag} layout update failed: ${(err as Error).message}`);
  }
  if (config.bookmarks.enabled) {
    try {
      await createBookmarks(ctx, campus);
    } catch (err) {
      log(`${tag} bookmarks failed: ${(err as Error).message}`);
    }
  }
}

async function syncLayout(ctx: CycleContext, campus: CampusConfig, cameras: string[]): Promise<void> {
  const { wave, dryRun, log } = ctx;
  const tag = `[${campus.name}]`;
  let layout = await wave.findLayoutByName(campus.layoutName);
  if (!layout) {
    const rows = Math.ceil((campus.maxCameraTiles + (campus.boardWebPageId ? 1 : 0)) / campus.gridColumns);
    if (dryRun) {
      log(`${tag} DRY RUN: would create shared layout "${campus.layoutName}" (${campus.gridColumns}x${rows})`);
      layout = { id: "(new)", name: campus.layoutName, items: [] };
    } else {
      layout = await wave.createSharedLayout(campus.layoutName, campus.gridColumns, rows);
      log(`${tag} created shared layout "${campus.layoutName}"`);
    }
  }

  const current = layout.id === "(new)" ? [] : await wave.getLayoutItems(layout.id);
  const ops = planLayout({
    current,
    cameras,
    boardResourceId: campus.boardWebPageId,
    columns: campus.gridColumns,
    maxCameraTiles: campus.maxCameraTiles,
  });
  await applyOps(ctx, campus, layout.id, ops);
}

async function applyOps(ctx: CycleContext, campus: CampusConfig, layoutId: string, ops: Op[]): Promise<void> {
  const tag = `[${campus.name}]`;
  for (const op of ops) {
    const desc = op.kind === "add" ? `add ${op.resourceId} at slot ${op.slot}` : `remove ${op.resourceId}`;
    if (ctx.dryRun) {
      ctx.log(`${tag} DRY RUN: would ${desc}`);
      continue;
    }
    if (op.kind === "add") await ctx.wave.addLayoutItem(layoutId, op.resourceId, op);
    else await ctx.wave.removeLayoutItem(layoutId, op.itemId);
    ctx.log(`${tag} ${desc}`);
  }
}

/**
 * Bookmarks each in-progress event on its rooms' cameras, once.
 * Created when the event starts (not ahead of time) because it's unconfirmed
 * whether WAVE accepts bookmarks with a future startTimeMs.
 */
async function createBookmarks(ctx: CycleContext, campus: CampusConfig): Promise<void> {
  const tag = `[${campus.name}]`;
  for (const event of ctx.events) {
    if (!counts(event) || !isInProgress(event, ctx.now)) continue;
    for (const deviceId of camerasFor(campus, event)) {
      const key = bookmarkKey(event.id, deviceId);
      if (ctx.state.bookmarks[key]) continue;
      const startTimeMs = Date.parse(event.start);
      const durationMs = Date.parse(event.end) - startTimeMs;
      if (ctx.dryRun) {
        if (!dryRunBookmarks.has(key)) ctx.log(`${tag} DRY RUN: would bookmark "${event.title}" on ${deviceId}`);
        dryRunBookmarks.add(key);
        continue;
      }
      await ctx.wave.createBookmark(deviceId, {
        name: event.title,
        description: `eSPACE: ${event.rooms.join(", ")}`,
        startTimeMs,
        durationMs,
        tags: ctx.config.bookmarks.tags,
      });
      ctx.state.bookmarks[key] = event.end;
      ctx.log(`${tag} bookmarked "${event.title}" on ${deviceId}`);
    }
  }
}
