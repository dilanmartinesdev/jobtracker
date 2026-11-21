import { describe, expect, it } from "vitest";

import { makeApplication } from "../test/fixtures";
import { daysSince, formatAge, formatPercent, parseDay, toDayString } from "./format";
import { groupByStatus, matchesQuery } from "./stages";

describe("dates", () => {
  it("parses a calendar day as local time, not UTC", () => {
    const parsed = parseDay("2026-11-18");
    expect([parsed.getFullYear(), parsed.getMonth(), parsed.getDate()]).toEqual([2026, 10, 18]);
    expect(parsed.getHours()).toBe(0);
  });

  it("round-trips through toDayString", () => {
    expect(toDayString(parseDay("2026-01-05"))).toBe("2026-01-05");
  });

  it("describes age in plain words", () => {
    const now = new Date(2026, 10, 18, 15, 30);
    expect(formatAge("2026-11-18", now)).toBe("Today");
    expect(formatAge("2026-11-17", now)).toBe("Yesterday");
    expect(formatAge("2026-11-10", now)).toBe("8 days ago");
    expect(formatAge("2026-10-14", now)).toBe("5 weeks ago");
    expect(formatAge("2026-05-01", now)).toMatch(/2026/);
  });

  it("counts whole days regardless of the time of day", () => {
    expect(daysSince("2026-11-17", new Date(2026, 10, 18, 0, 5))).toBe(1);
    expect(daysSince("2026-11-17", new Date(2026, 10, 18, 23, 55))).toBe(1);
  });

  it("formats rates as whole percentages", () => {
    expect(formatPercent(0.4444)).toBe("44%");
    expect(formatPercent(0)).toBe("0%");
  });
});

describe("stages", () => {
  const items = [
    makeApplication({ id: 1, status: "applied" }),
    makeApplication({ id: 2, status: "interview", company: "Cemex", position: "Data Analyst" }),
    makeApplication({ id: 3, status: "applied", company: "FEMSA" }),
  ];

  it("groups applications by status and keeps empty stages", () => {
    const groups = groupByStatus(items);
    expect(groups.applied.map((item) => item.id)).toEqual([1, 3]);
    expect(groups.interview.map((item) => item.id)).toEqual([2]);
    expect(groups.offer).toEqual([]);
    expect(groups.rejected).toEqual([]);
  });

  it("matches company or role, ignoring case and surrounding spaces", () => {
    const cemex = items[1]!;
    expect(matchesQuery(cemex, "  CEM ")).toBe(true);
    expect(matchesQuery(cemex, "analyst")).toBe(true);
    expect(matchesQuery(cemex, "backend")).toBe(false);
    expect(matchesQuery(cemex, "   ")).toBe(true);
  });
});
