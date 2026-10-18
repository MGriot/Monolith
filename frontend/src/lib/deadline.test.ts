import { describe, expect, it } from "vitest";
import { deadlineState } from "./deadline";

const now = new Date("2026-10-18T12:00:00Z");

describe("deadlineState", () => {
  it("is none without a deadline", () => {
    expect(deadlineState(null, "2026-11-01", false, now)).toBe("none");
  });
  it("is overdue once the deadline has passed", () => {
    expect(deadlineState("2026-10-01", null, false, now)).toBe("overdue");
  });
  it("is ok when done, even past the deadline", () => {
    expect(deadlineState("2026-10-01", null, true, now)).toBe("ok");
  });
  it("is at risk when the plan finishes after the deadline", () => {
    expect(deadlineState("2026-12-01", "2026-12-15", false, now)).toBe("at-risk");
  });
  it("is ok when the plan fits", () => {
    expect(deadlineState("2026-12-15", "2026-12-01", false, now)).toBe("ok");
  });
});
