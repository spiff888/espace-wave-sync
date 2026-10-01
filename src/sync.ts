import type { CampusConfig, SyncConfig } from "./config.js";
import type { KioskEvent } from "./kiosk.js";
import { planLayout, type Op } from "./plan.js";
import { isInProgress, selectCameras } from "./select.js";
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

export async function syncCampus(ctx: CycleContext, campus: CampusConfig): Promise<void> {
  const { wave, config, events, now, dryRun, log } = ctx;
  const tag = `[${campus.name}]`;

  const selection = selectCameras(campus, events, {
    now,
    lookaheadMinutes: config.lookaheadMinutes,
    graceMinutes: config.graceMinutes,
  });
  log(
    `${tag} live events: ${selection.liveEvents.map((e) => `${e.room} "${e.title}"`).join(", ") || "none"}; ` +
      `cameras: ${selection.cameras.length}` +
      (selection.dropped.length ? ` (${selection.dropped.length} over the ${campus.maxCameraTiles}-tile cap)` : ""),
  );

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
    cameras: selection.cameras,
    boardResourceId: campus.boardWebPageId,
    columns: campus.gridColumns,
    maxCameraTiles: campus.maxCameraTiles,
  });
  await applyOps(ctx, campus, layout.id, ops);

  if (config.bookmarks.enabled) await createBookmarks(ctx, campus);
}

async function applyOps(ctx: CycleContext, campus: CampusConfig, layoutId: string, ops: Op[]): Promise<void> {
  const tag = `[${campus.name}]`;
  if (ops.length === 0) return;
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
 * Bookmarks each in-progress event on its room's cameras, once.
 * Created when the event starts (not ahead of time) because it's unconfirmed
 * whether WAVE accepts bookmarks with a future startTimeMs.
 */
async function createBookmarks(ctx: CycleContext, campus: CampusConfig): Promise<void> {
  const tag = `[${campus.name}]`;
  for (const event of ctx.events) {
    const cams = campus.rooms[event.room];
    if (!cams || !isInProgress(event, ctx.now)) continue;
    for (const deviceId of cams) {
      const key = bookmarkKey(event.id, deviceId);
      if (ctx.state.bookmarks[key]) continue;
      const startTimeMs = Date.parse(event.start);
      const durationMs = Date.parse(event.end) - startTimeMs;
      if (ctx.dryRun) {
        ctx.log(`${tag} DRY RUN: would bookmark "${event.title}" on ${deviceId}`);
        continue;
      }
      await ctx.wave.createBookmark(deviceId, {
        name: event.title,
        description: `eSPACE: ${event.room}`,
        startTimeMs,
        durationMs,
        tags: ctx.config.bookmarks.tags,
      });
      ctx.state.bookmarks[key] = event.end;
      ctx.log(`${tag} bookmarked "${event.title}" on ${deviceId}`);
    }
  }
}
