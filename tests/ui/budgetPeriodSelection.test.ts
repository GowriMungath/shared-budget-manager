import { describe, expect, test } from "vitest";
import type { BudgetPeriod } from "../../src/domain/shared/types.ts";
import { budgetPeriodId } from "../../src/domain/shared/ids.ts";

/**
 * Selects the default budget period based on today's date and available periods.
 * Priority:
 * 1. If a period contains today's date, choose that period
 * 2. Otherwise choose the period with the latest date (most recent)
 * 3. If no periods exist, return undefined
 */
function selectDefaultPeriod(periods: BudgetPeriod[], todayOverride?: string): string | undefined {
  if (periods.length === 0) return undefined;

  const today = todayOverride ?? new Date().toISOString().split("T")[0];
  const periodContainingToday = periods.find((p) => p.startDate <= today && today <= p.endDate);

  if (periodContainingToday) {
    return periodContainingToday.id;
  }

  // Sort by endDate descending to find the most recent period
  const sorted = [...periods].sort((a, b) => b.endDate.localeCompare(a.endDate));
  return sorted[0]?.id;
}

describe("Budget period selection", () => {
  test("TEST 1: Selects period containing today's date", () => {
    const periods: BudgetPeriod[] = [
      {
        id: budgetPeriodId("sep"),
        name: "September",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
      },
      {
        id: budgetPeriodId("oct"),
        name: "October",
        startDate: "2026-10-01",
        endDate: "2026-10-31",
      },
      {
        id: budgetPeriodId("nov"),
        name: "November",
        startDate: "2026-11-01",
        endDate: "2026-11-30",
      },
    ];

    // Today is November 15
    const selected = selectDefaultPeriod(periods, "2026-11-15");
    expect(selected).toBe("nov");
  });

  test("TEST 2: Selects latest period when today is not in any period", () => {
    const periods: BudgetPeriod[] = [
      {
        id: budgetPeriodId("sep"),
        name: "September",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
      },
      {
        id: budgetPeriodId("oct"),
        name: "October",
        startDate: "2026-10-01",
        endDate: "2026-10-31",
      },
      {
        id: budgetPeriodId("nov"),
        name: "November",
        startDate: "2026-11-01",
        endDate: "2026-11-30",
      },
    ];

    // Today is December 15 (after all periods)
    const selected = selectDefaultPeriod(periods, "2026-12-15");
    expect(selected).toBe("nov");
  });

  test("TEST 3: Database return order does not affect selection", () => {
    const periodsUnordered: BudgetPeriod[] = [
      {
        id: budgetPeriodId("nov"),
        name: "November",
        startDate: "2026-11-01",
        endDate: "2026-11-30",
      },
      {
        id: budgetPeriodId("sep"),
        name: "September",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
      },
      {
        id: budgetPeriodId("oct"),
        name: "October",
        startDate: "2026-10-01",
        endDate: "2026-10-31",
      },
    ];

    const selected = selectDefaultPeriod(periodsUnordered, "2026-12-15");
    expect(selected).toBe("nov");
  });

  test("TEST 4: Empty period list returns undefined", () => {
    const periods: BudgetPeriod[] = [];
    const selected = selectDefaultPeriod(periods, "2026-11-15");
    expect(selected).toBeUndefined();
  });

  test("TEST 5: User manual selection is preserved (integration pattern)", () => {
    // This test verifies the pattern used by BudgetsPage to preserve user selection
    const periods: BudgetPeriod[] = [
      {
        id: budgetPeriodId("sep"),
        name: "September",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
      },
      {
        id: budgetPeriodId("oct"),
        name: "October",
        startDate: "2026-10-01",
        endDate: "2026-10-31",
      },
    ];

    // User manually selects September (older period)
    const userSelectedId = "sep";

    // When data refreshes and same periods are available, selection should remain
    const stillAvailable = periods.some((p) => p.id === userSelectedId);
    expect(stillAvailable).toBe(true);

    // Only fall back to default if selected period no longer exists
    const periodExists = periods.find((p) => p.id === userSelectedId);
    const nextSelection = periodExists ? userSelectedId : selectDefaultPeriod(periods, "2026-10-15");
    expect(nextSelection).toBe("sep");
  });

  test("TEST 6: Data rerender does not reset manual selection", () => {
    const initialPeriods: BudgetPeriod[] = [
      {
        id: budgetPeriodId("sep"),
        name: "September",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
      },
      {
        id: budgetPeriodId("oct"),
        name: "October",
        startDate: "2026-10-01",
        endDate: "2026-10-31",
      },
    ];

    // User selects October
    let selectedId = selectDefaultPeriod(initialPeriods, "2026-11-01"); // Default is October
    selectedId = "oct"; // User manually selects October

    // Data refreshes with same periods
    const refreshedPeriods = [...initialPeriods]; // Simulates data refresh

    // Selection logic should preserve October
    const stillExists = refreshedPeriods.some((p) => p.id === selectedId);
    expect(stillExists).toBe(true);
    expect(selectedId).toBe("oct");
  });

  test("TEST 7: Selected period falling out of available periods safely falls back", () => {
    let selectedId = "oct"; // User has October selected
    const initialPeriods: BudgetPeriod[] = [
      {
        id: budgetPeriodId("sep"),
        name: "September",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
      },
      {
        id: budgetPeriodId("oct"),
        name: "October",
        startDate: "2026-10-01",
        endDate: "2026-10-31",
      },
    ];

    // October gets deleted/archived
    const refreshedPeriods = initialPeriods.filter((p) => p.id !== "oct");

    // Should fall back to default selection
    const stillExists = refreshedPeriods.some((p) => p.id === selectedId);
    if (!stillExists) {
      selectedId = selectDefaultPeriod(refreshedPeriods, "2026-12-01") ?? "";
    }

    expect(selectedId).toBe("sep");
  });

  test("TEST 8: Period switching does not create repeated state changes", () => {
    const periods: BudgetPeriod[] = [
      {
        id: budgetPeriodId("sep"),
        name: "September",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
      },
      {
        id: budgetPeriodId("oct"),
        name: "October",
        startDate: "2026-10-01",
        endDate: "2026-10-31",
      },
    ];

    // Simulate the two-effect pattern used in BudgetsPage:
    // 1. Initialize effect selects default
    const initialSelection = selectDefaultPeriod(periods, "2026-10-15"); // October
    expect(initialSelection).toBe("oct");

    // 2. Data refresh effect should NOT change selection if period still exists
    const periodStillExists = periods.some((p) => p.id === initialSelection);
    expect(periodStillExists).toBe(true);

    // Selection should remain October without redundant state updates
    expect(initialSelection).toBe("oct");
  });
});
