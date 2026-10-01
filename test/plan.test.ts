import { describe, expect, it } from "vitest";
import { planLayout, slotRect, type LayoutItem } from "../src/plan.js";

const COLS = 3;
const item = (id: string, resourceId: string, slot: number): LayoutItem => ({ id, resourceId, ...slotRect(slot, COLS) });

const base = { boardResourceId: "board", columns: COLS, maxCameraTiles: 8 };

describe("planLayout", () => {
  it("builds an empty layout: board at slot 0, cameras after", () => {
    const ops = planLayout({ ...base, current: [], cameras: ["a", "b"] });
    expect(ops.map((o) => [o.kind, o.resourceId, o.kind === "add" ? o.slot : null])).toEqual([
      ["add", "board", 0],
      ["add", "a", 1],
      ["add", "b", 2],
    ]);
  });

  it("is a no-op when the layout already matches", () => {
    const current = [item("i0", "board", 0), item("i1", "a", 1), item("i2", "b", 2)];
    expect(planLayout({ ...base, current, cameras: ["a", "b"] })).toEqual([]);
  });

  it("keeps cameras in place and fills the gap left by a removed one", () => {
    const current = [item("i0", "board", 0), item("i1", "a", 1), item("i2", "b", 2), item("i3", "c", 3)];
    const ops = planLayout({ ...base, current, cameras: ["a", "c", "d"] });
    expect(ops).toEqual([
      { kind: "remove", itemId: "i2", resourceId: "b" },
      { kind: "add", resourceId: "d", slot: 2, ...slotRect(2, COLS) },
    ]);
  });

  it("removes duplicates and tiles that aren't on the grid", () => {
    const current = [
      item("i0", "board", 0),
      item("i1", "a", 1),
      item("dup", "a", 2),
      { id: "big", resourceId: "b", left: 0, top: 1, right: 2, bottom: 3 },
    ];
    const ops = planLayout({ ...base, current, cameras: ["a", "b"] });
    expect(ops.filter((o) => o.kind === "remove").map((o) => (o.kind === "remove" ? o.itemId : ""))).toEqual([
      "dup",
      "big",
    ]);
    expect(ops.filter((o) => o.kind === "add").map((o) => o.resourceId)).toEqual(["b"]);
  });

  it("moves a camera off the board's slot", () => {
    const current = [item("i0", "a", 0)];
    const ops = planLayout({ ...base, current, cameras: ["a"] });
    expect(ops.map((o) => `${o.kind}:${o.resourceId}`)).toEqual(["remove:a", "add:board", "add:a"]);
  });

  it("works without a board tile", () => {
    const ops = planLayout({ ...base, boardResourceId: undefined, current: [], cameras: ["a"] });
    expect(ops).toEqual([{ kind: "add", resourceId: "a", slot: 0, ...slotRect(0, COLS) }]);
  });

  it("never exceeds the camera cap", () => {
    const cams = Array.from({ length: 12 }, (_, i) => `c${i}`);
    const adds = planLayout({ ...base, current: [], cameras: cams }).filter((o) => o.kind === "add");
    expect(adds).toHaveLength(9); // board + 8
  });
});
