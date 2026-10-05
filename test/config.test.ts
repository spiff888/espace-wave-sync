import { describe, expect, it } from "vitest";
import { loadEnv, parseConfig } from "../src/config.js";

describe("loadEnv", () => {
  const good = {
    WAVE_URL: "https://wave.example.local:7001",
    WAVE_USERNAME: "board",
    WAVE_PASSWORD: "fake-password-value",
    KIOSK_URL: "http://localhost:3000",
  };

  it("defaults to dry run", () => {
    expect(loadEnv(good).DRY_RUN).toBe(true);
    expect(loadEnv({ ...good, DRY_RUN: "false" }).DRY_RUN).toBe(false);
  });

  it("names missing variables without echoing secret values", () => {
    const { WAVE_URL: _omit, ...missing } = good;
    expect(() => loadEnv(missing)).toThrow(/WAVE_URL/);
    try {
      loadEnv({ ...missing, WAVE_PASSWORD: "fake-password-value" });
    } catch (err) {
      expect((err as Error).message).not.toContain("fake-password-value");
    }
  });
});

describe("parseConfig", () => {
  it("accepts the example config shape", () => {
    const c = parseConfig({ campuses: [{ name: "X", kioskCampus: "x", layoutName: "L", rooms: { A: ["cam"] } }] });
    expect(c.lookaheadMinutes).toBe(15);
    expect(c.campuses[0]?.maxCameraTiles).toBe(8);
  });

  it("enables bookmarks by default when the section is omitted", () => {
    const c = parseConfig({ campuses: [{ name: "X", kioskCampus: "x", layoutName: "L", rooms: {} }] });
    expect(c.bookmarks).toEqual({ enabled: true, tags: ["espace"] });
  });
});

describe("kioskCampus", () => {
  it("is required and must look like a kiosk campus key", () => {
    expect(() => parseConfig({ campuses: [{ name: "X", layoutName: "L", rooms: {} }] })).toThrow(/kioskCampus/);
    expect(() => parseConfig({ campuses: [{ name: "X", kioskCampus: "/board/main", layoutName: "L", rooms: {} }] })).toThrow();
  });
});

describe("maxCameraTiles", () => {
  it("allows a full 4x4 grid without a board tile", () => {
    const c = parseConfig({ campuses: [{ name: "X", kioskCampus: "x", layoutName: "L", maxCameraTiles: 16, gridColumns: 4, rooms: {} }] });
    expect(c.campuses[0]?.maxCameraTiles).toBe(16);
  });
});

describe("allDayEvents", () => {
  it("defaults to shown but not bookmarked", () => {
    const c = parseConfig({ campuses: [{ name: "X", kioskCampus: "x", layoutName: "L", rooms: {} }] });
    expect(c.allDayEvents).toEqual({ show: true, bookmark: false });
  });
});
