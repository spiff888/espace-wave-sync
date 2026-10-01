import { describe, expect, it } from "vitest";
import type { CampusConfig } from "../src/config.js";
import type { KioskEvent } from "../src/kiosk.js";
import { isLive, selectCameras } from "../src/select.js";

// All fixtures are invented. Never paste real device ids or room names here.
const campus: CampusConfig = {
  name: "Test Campus",
  layoutName: "Daily View - Test",
  boardWebPageId: "board",
  maxCameraTiles: 3,
  gridColumns: 2,
  defaultCameras: ["lobby"],
  rooms: {
    Auditorium: ["aud-1", "aud-2"],
    Chapel: ["chapel-1"],
    Gym: ["gym-1", "lobby"],
  },
};

const ev = (id: string, room: string, start: string, end: string): KioskEvent => ({
  id,
  title: `Event ${id}`,
  room,
  start: `2026-10-04T${start}:00-07:00`,
  end: `2026-10-04T${end}:00-07:00`,
});

const at = (hhmm: string) => ({ now: new Date(`2026-10-04T${hhmm}:00-07:00`), lookaheadMinutes: 15, graceMinutes: 5 });

describe("isLive", () => {
  const e = ev("1", "Auditorium", "10:00", "11:00");
  it("starts 15 minutes early", () => {
    expect(isLive(e, at("09:44"))).toBe(false);
    expect(isLive(e, at("09:45"))).toBe(true);
  });
  it("stays 5 minutes after the end", () => {
    expect(isLive(e, at("11:04"))).toBe(true);
    expect(isLive(e, at("11:05"))).toBe(false);
  });
});

describe("selectCameras", () => {
  it("shows only defaults when nothing is live", () => {
    const s = selectCameras(campus, [ev("1", "Auditorium", "13:00", "14:00")], at("10:00"));
    expect(s.cameras).toEqual(["lobby"]);
    expect(s.liveEvents).toHaveLength(0);
  });

  it("puts live-event cameras ahead of defaults, earliest event first", () => {
    const s = selectCameras(
      campus,
      [ev("2", "Chapel", "10:10", "11:00"), ev("1", "Auditorium", "09:30", "11:00")],
      at("10:00"),
    );
    expect(s.cameras).toEqual(["aud-1", "aud-2", "chapel-1"]);
    expect(s.dropped).toEqual(["lobby"]);
  });

  it("dedupes a camera shared by a room and the defaults", () => {
    const s = selectCameras(campus, [ev("1", "Gym", "10:00", "11:00")], at("10:00"));
    expect(s.cameras).toEqual(["gym-1", "lobby"]);
  });

  it("ignores rooms that belong to other campuses", () => {
    const s = selectCameras(campus, [ev("1", "Somewhere Else", "10:00", "11:00")], at("10:00"));
    expect(s.cameras).toEqual(["lobby"]);
  });
});
