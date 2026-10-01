import type { CampusConfig } from "./config.js";
import type { KioskEvent } from "./kiosk.js";

export interface SelectionOptions {
  now: Date;
  lookaheadMinutes: number;
  graceMinutes: number;
}

/** An event is "live" from (start - lookahead) until (end + grace). */
export function isLive(event: KioskEvent, opts: SelectionOptions): boolean {
  const now = opts.now.getTime();
  const from = Date.parse(event.start) - opts.lookaheadMinutes * 60_000;
  const until = Date.parse(event.end) + opts.graceMinutes * 60_000;
  return now >= from && now < until;
}

/** Events that started and haven't ended (no lookahead/grace). Used for bookmarks. */
export function isInProgress(event: KioskEvent, now: Date): boolean {
  const t = now.getTime();
  return t >= Date.parse(event.start) && t < Date.parse(event.end);
}

export interface Selection {
  /** Camera ids in priority order, already capped. */
  cameras: string[];
  /** Live events at this campus, for logging. */
  liveEvents: KioskEvent[];
  /** Cameras that wanted a tile but didn't fit under the cap. */
  dropped: string[];
}

/**
 * Picks the cameras a campus layout should show right now.
 * Priority: cameras for live events (earliest start first), then default cameras.
 * Events in rooms not mapped to this campus are ignored.
 */
export function selectCameras(campus: CampusConfig, events: KioskEvent[], opts: SelectionOptions): Selection {
  const liveEvents = events
    .filter((e) => campus.rooms[e.room] !== undefined && isLive(e, opts))
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.room.localeCompare(b.room));

  const wanted: string[] = [];
  const add = (id: string) => {
    if (!wanted.includes(id)) wanted.push(id);
  };
  for (const e of liveEvents) for (const cam of campus.rooms[e.room] ?? []) add(cam);
  for (const cam of campus.defaultCameras) add(cam);

  return {
    cameras: wanted.slice(0, campus.maxCameraTiles),
    dropped: wanted.slice(campus.maxCameraTiles),
    liveEvents,
  };
}
