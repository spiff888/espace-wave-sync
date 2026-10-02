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

/**
 * All-day bookings usually mean "room held for the day", not "people are in it now",
 * so they don't pull up cameras or create bookmarks.
 */
export function counts(event: KioskEvent): boolean {
  return event.allDay !== true;
}

/** Cameras mapped to any of an event's rooms, in room order, deduped. */
export function camerasFor(campus: CampusConfig, event: KioskEvent): string[] {
  const out: string[] = [];
  for (const room of event.rooms) for (const cam of campus.rooms[room] ?? []) if (!out.includes(cam)) out.push(cam);
  return out;
}

export interface Selection {
  /** Camera ids in priority order, already capped. */
  cameras: string[];
  /** Live events at this campus that have at least one mapped room, for logging. */
  liveEvents: KioskEvent[];
  /** Cameras that wanted a tile but didn't fit under the cap. */
  dropped: string[];
}

/**
 * Picks the cameras a campus layout should show right now.
 *
 * Live events take turns: every event's 1st camera, then every event's 2nd, and so on
 * (events ordered by start time, cameras in config.json order). So when several events
 * overlap, each gets a fair share of the tiles instead of the earliest one taking them all.
 * Default cameras fill whatever is left.
 */
export function selectCameras(campus: CampusConfig, events: KioskEvent[], opts: SelectionOptions): Selection {
  const liveEvents = events
    .filter((e) => counts(e) && camerasFor(campus, e).length > 0 && isLive(e, opts))
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.title.localeCompare(b.title));

  const wanted: string[] = [];
  const add = (id: string) => {
    if (!wanted.includes(id)) wanted.push(id);
  };
  const perEvent = liveEvents.map((e) => camerasFor(campus, e));
  const rounds = Math.max(0, ...perEvent.map((cams) => cams.length));
  for (let i = 0; i < rounds; i++) for (const cams of perEvent) if (i < cams.length) add(cams[i]!);
  for (const cam of campus.defaultCameras) add(cam);

  return {
    cameras: wanted.slice(0, campus.maxCameraTiles),
    dropped: wanted.slice(campus.maxCameraTiles),
    liveEvents,
  };
}

/** Rooms with events today that aren't in config.json, sorted. Your to-do list for mapping. */
export function unmappedRooms(campus: CampusConfig, events: KioskEvent[]): string[] {
  const rooms = new Set<string>();
  for (const e of events) if (counts(e)) for (const r of e.rooms) if (!(r in campus.rooms)) rooms.add(r);
  return [...rooms].sort((a, b) => a.localeCompare(b));
}
