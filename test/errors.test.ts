import { describe, expect, it } from "vitest";
import { clearError, reportError } from "../src/sync.js";

describe("reportError / clearError", () => {
  it("logs a repeating error once, again when it changes, and once when it clears", () => {
    const lines: string[] = [];
    const log = (m: string) => lines.push(m);
    reportError(log, "k", "boom");
    reportError(log, "k", "boom");
    reportError(log, "k", "boom");
    reportError(log, "k", "different boom");
    clearError(log, "k", "fixed");
    clearError(log, "k", "fixed");
    expect(lines).toEqual([
      "boom (repeats are not logged until this changes)",
      "different boom (repeats are not logged until this changes)",
      "fixed",
    ]);
  });

  it("keeps keys independent", () => {
    const lines: string[] = [];
    const log = (m: string) => lines.push(m);
    reportError(log, "cam-1", "no access");
    reportError(log, "cam-2", "no access");
    expect(lines).toHaveLength(2);
  });
});
