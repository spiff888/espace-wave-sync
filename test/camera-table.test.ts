import { describe, expect, it } from "vitest";
import { normalizeId, renderCameraTable } from "../src/camera-table.js";
import { parseConfig } from "../src/config.js";

// Invented data only.
const campus = parseConfig({
  campuses: [
    {
      name: "Example Campus",
      kioskCampus: "main",
      layoutName: "Daily View - Example",
      defaultCameras: ["cam-lobby"],
      rooms: {
        "Main Auditorium": ["{cam-aud-1}", "cam-aud-2"],
        "Storage | Back": [],
        "Youth Room": ["cam-gone"],
      },
    },
  ],
}).campuses[0]!;

const devices = [
  { id: "{CAM-AUD-1}", name: "Auditorium Stage" },
  { id: "{cam-aud-2}", name: "Auditorium Rear" },
  { id: "{cam-lobby}", name: "Lobby" },
];

describe("renderCameraTable", () => {
  const out = renderCameraTable(campus, devices, { unmappedRooms: ["Kitchen"] });

  it("lists camera names in config order, matching ids with or without braces", () => {
    expect(out).toContain("| Main Auditorium | 1. Auditorium Stage<br>2. Auditorium Rear |");
  });

  it("marks rooms with no cameras and escapes pipes", () => {
    expect(out).toContain("| Storage \\| Back | _no cameras_ |");
  });

  it("flags ids that WAVE doesn't know", () => {
    expect(out).toContain("| Youth Room | 1. ⚠ not in WAVE |");
    expect(out).toMatch(/1 camera id\(s\) in config.json weren't found/);
  });

  it("includes default cameras and unmapped rooms", () => {
    expect(out).toContain("1. Lobby");
    expect(out).toContain("- Kitchen");
  });

  it("never prints raw ids", () => {
    expect(out).not.toMatch(/cam-aud|cam-lobby|cam-gone/i);
  });
});

describe("normalizeId", () => {
  it("strips braces and case", () => {
    expect(normalizeId("{ABC-1}")).toBe("abc-1");
  });
});
