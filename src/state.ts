import { readFileSync, writeFileSync, renameSync } from "node:fs";

/**
 * Remembers which (event, camera) bookmarks were already created so restarts
 * don't duplicate them. Entries expire 2 days after the event ends.
 */
export interface State {
  bookmarks: Record<string, string>; // key -> event end (ISO)
}

const KEEP_MS = 2 * 24 * 60 * 60_000;

export function bookmarkKey(eventId: string, deviceId: string): string {
  return `${eventId}:${deviceId}`;
}

export function loadState(path: string): State {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<State>;
    return { bookmarks: parsed.bookmarks ?? {} };
  } catch {
    return { bookmarks: {} };
  }
}

export function pruneState(state: State, now: Date): State {
  const cutoff = now.getTime() - KEEP_MS;
  const bookmarks = Object.fromEntries(Object.entries(state.bookmarks).filter(([, end]) => Date.parse(end) >= cutoff));
  return { bookmarks };
}

export function saveState(path: string, state: State): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, path); // atomic on the same filesystem
}
