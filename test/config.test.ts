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
    const c = parseConfig({ campuses: [{ name: "X", layoutName: "L", rooms: { A: ["cam"] } }] });
    expect(c.lookaheadMinutes).toBe(15);
    expect(c.campuses[0]?.maxCameraTiles).toBe(8);
  });
});
