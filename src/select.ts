import type { CampusConfig } from "./config.js";
import type { KioskEvent } from "./kiosk.js";

export interface SelectionOptions {
  now: Date;
  lookaheadMinutes: number;
  graceMinutes: number;
  /** Include all-day bookings (after timed events). Default true. */
  includeAllDay?: boolean;
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

/** Whether an event takes part at all, given the all-day setting. */
export function counts(event: KioskEvent, includeAllDay = true): boolean {
  return includeAllDay || event.allDay !== true;
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
  /** Live events at this campus that have at least one mapped camera, for logging. */
  liveEvents: KioskEvent[];
  /** Cameras that wanted a tile but didn't fit under the cap. */
  dropped: string[];
}

const byStart = (a: KioskEvent, b: KioskEvent) => Date.parse(a.start) - Date.parse(b.start) || a.title.localeCompare(b.title);

/** Every event's 1st camera, then every event's 2nd, and so on. */
function takeTurns(campus: CampusConfig, events: KioskEvent[], add: (id: string) => void): void {
  const perEvent = events.map((e) => camerasFor(campus, e));
  const rounds = Math.max(0, ...perEvent.map((cams) => cams.length));
  for (let i = 0; i < rounds; i++) for (const cams of perEvent) if (i < cams.length) add(cams[i]!);
}

/**
 * Picks the cameras a campus layout should show right now, in priority order:
 *   1. timed live events, taking turns (events by start time, cameras in config.json order)
 *   2. all-day events, taking turns (if included)
 *   3. default cameras
 * then capped at maxCameraTiles.
 */
export function selectCameras(campus: CampusConfig, events: KioskEvent[], opts: SelectionOptions): Selection {
  const includeAllDay = opts.includeAllDay ?? true;
  const live = events
    .filter((e) => counts(e, includeAllDay) && camerasFor(campus, e).length > 0 && isLive(e, opts))
    .sort(byStart);
  const timed = live.filter((e) => e.allDay !== true);
  const allDay = live.filter((e) => e.allDay === true);

  const wanted: string[] = [];
  const add = (id: string) => {
    if (!wanted.includes(id)) wanted.push(id);
  };
  takeTurns(campus, timed, add);
  takeTurns(campus, allDay, add);
  for (const cam of campus.defaultCameras) add(cam);

  return {
    cameras: wanted.slice(0, campus.maxCameraTiles),
    dropped: wanted.slice(campus.maxCameraTiles),
    liveEvents: [...timed, ...allDay],
  };
}

/** Rooms with events today that aren't in config.json, sorted. Your to-do list for mapping. */
export function unmappedRooms(campus: CampusConfig, events: KioskEvent[], includeAllDay = true): string[] {
  const rooms = new Set<string>();
  for (const e of events) if (counts(e, includeAllDay)) for (const r of e.rooms) if (!(r in campus.rooms)) rooms.add(r);
  return [...rooms].sort((a, b) => a.localeCompare(b));
}
