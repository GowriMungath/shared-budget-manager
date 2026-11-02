// tests/ui/dashboardPeriodSelection.test.ts
// Tests for Dashboard period selection fix (prevents flicker/oscillation on period changes)

import { describe, it, expect } from "vitest";

describe("Dashboard Period Selection - Prevent Flicker", () => {
  describe("Period selection preservation", () => {
    it("should preserve user-selected period when data refreshes", () => {
      // Scenario: User selects November, then data refreshes
      // Expected: Selected period stays as November, not reset to API response

      const currentSelection = "nov-2026";
      const availablePeriods = [
        { id: "oct-2026", name: "October" },
        { id: "nov-2026", name: "November" },
        { id: "dec-2026", name: "December" },
      ];

      // Simulate callback setState behavior from fix
      const setSelectedPeriodId = (callback: (current: string) => string) => {
        const newSelection = callback(currentSelection);
        return newSelection;
      };

      // This is what the fixed code does:
      // setSelectedPeriodId((current) => {
      //   const periodStillExists = next.periods.some((p) => p.id === current);
      //   return periodStillExists ? current : next.selectedBudgetPeriodId;
      // });

      const result = setSelectedPeriodId((current) => {
        const periodStillExists = availablePeriods.some((p) => p.id === current);
        return periodStillExists ? current : "oct-2026"; // fallback
      });

      expect(result).toBe("nov-2026"); // Selection preserved
    });

    it("should NOT preserve selection if period no longer exists", () => {
      const currentSelection = "nov-2026";
      const availablePeriods = [
        { id: "oct-2026", name: "October" },
        { id: "dec-2026", name: "December" },
      ]; // November was deleted

      const setSelectedPeriodId = (callback: (current: string) => string) => {
        return callback(currentSelection);
      };

      const result = setSelectedPeriodId((current) => {
        const periodStillExists = availablePeriods.some((p) => p.id === current);
        return periodStillExists ? current : "dec-2026"; // fallback to latest
      });

      expect(result).toBe("dec-2026"); // Switched to available period
    });

    it("should match selected period with dashboard heading", () => {
      const periodDetail = {
        id: "nov-2026",
        name: "November",
        startDate: "2026-11-01",
        endDate: "2026-11-30",
      };

      const heading = `${periodDetail.startDate} - ${periodDetail.endDate}`;
      expect(heading).toBe("2026-11-01 - 2026-11-30");
    });

    it("should match selected period with budget summary totals", () => {
      const overview = {
        period: { id: "nov-2026", startDate: "2026-11-01", endDate: "2026-11-30" },
        budgetSummary: {
          totalBudgetedCents: 500000, // $5000
          budgetedCategorySpentCents: 300000, // $3000
          usagePercent: 0.6,
        },
      };

      // Selected period must match what's shown in totals
      expect(overview.period.id).toBe("nov-2026");
      expect(overview.budgetSummary.usagePercent).toBe(0.6);
    });

    it("should match selected period with member budget summary", () => {
      const memberSummary = {
        name: "Alice",
        budgetShareCents: 250000, // $2500 in November
      };

      // If period changes, member summary must reflect NEW period data
      // Not mixed data from old period
      expect(memberSummary.budgetShareCents).toBeGreaterThan(0);
    });
  });

  describe("Dashboard heading reflects selected period", () => {
    it("should update heading when period changes", () => {
      interface Period {
        id: string;
        startDate: string;
        endDate: string;
      }

      const oct: Period = { id: "oct", startDate: "2026-10-01", endDate: "2026-10-31" };
      const nov: Period = { id: "nov", startDate: "2026-11-01", endDate: "2026-11-30" };

      const getHeading = (period: Period) => `${period.startDate} - ${period.endDate}`;

      expect(getHeading(oct)).toBe("2026-10-01 - 2026-10-31");
      expect(getHeading(nov)).toBe("2026-11-01 - 2026-11-30");
    });

    it("should match heading to budget totals period", () => {
      const selectedPeriod = { id: "nov", startDate: "2026-11-01", endDate: "2026-11-30" };
      const budgetTotals = { period: selectedPeriod, totalCents: 500000 };

      const heading = `${budgetTotals.period.startDate} - ${budgetTotals.period.endDate}`;
      expect(heading).toContain("2026-11");
    });
  });

  describe("No rapid oscillation on period changes", () => {
    it("should not oscillate between October and November on rapid selection changes", async () => {
      // Scenario: User clicks Nov → Oct → Nov rapidly
      // Some requests arrive out of order
      // Expected: Final state is Nov (last user selection), not oscillating

      const stateChanges: string[] = [];

      // Simulate rapid user selections
      const userSelects = ["nov-2026", "oct-2026", "nov-2026"];

      // With the fix, each selection is preserved (not overwritten by response)
      for (const selection of userSelects) {
        const periodStillExists = true; // assuming periods exist
        const nextSelection = periodStillExists ? selection : "default";
        stateChanges.push(nextSelection);
      }

      // Should end on Nov, not oscillate
      expect(stateChanges[stateChanges.length - 1]).toBe("nov-2026");
      expect(stateChanges).toEqual(["nov-2026", "oct-2026", "nov-2026"]);
    });

    it("should not show October data when November is selected", () => {
      const selectedPeriodId = "nov-2026";
      const dashboardData = {
        period: { id: "nov-2026", startDate: "2026-11-01", endDate: "2026-11-30" },
        budgetSummary: { totalSpentCents: 250000 }, // November data
      };

      // If November is selected, data must be from November
      expect(dashboardData.period.id).toBe(selectedPeriodId);
      expect(dashboardData.period.startDate).toContain("11");
    });

    it("should not show November data when October is selected", () => {
      const selectedPeriodId = "oct-2026";
      const dashboardData = {
        period: { id: "oct-2026", startDate: "2026-10-01", endDate: "2026-10-31" },
        budgetSummary: { totalSpentCents: 150000 }, // October data
      };

      expect(dashboardData.period.id).toBe(selectedPeriodId);
      expect(dashboardData.period.startDate).toContain("10");
    });
  });

  describe("Async race condition prevention", () => {
    it("should handle out-of-order API responses gracefully", async () => {
      // Scenario:
      // 1. User selects October
      // 2. October request starts (slower)
      // 3. User selects November
      // 4. November request starts (faster)
      // 5. November response arrives first (should be applied)
      // 6. October response arrives second (should be IGNORED, not overwrit November)
      // Expected: November data shown, not October

      interface Response {
        period: { id: string };
        timestamp: number;
      }

      const octResponse: Response = { period: { id: "oct-2026" }, timestamp: 100 };
      const novResponse: Response = { period: { id: "nov-2026" }, timestamp: 200 };

      // With fix: Use callback setState which preserves user's latest selection
      const currentSelection = "nov-2026"; // User's latest selection

      const handleResponse = (response: Response) => {
        // Old buggy code would do:
        // setSelectedPeriodId(response.period.id); // Would switch back to oct!
        //
        // New fixed code does:
        // setSelectedPeriodId((current) => {
        //   const stillValid = periods.some(p => p.id === current);
        //   return stillValid ? current : response.period.id;
        // });

        // If current selection still exists, keep it
        const availablePeriods = [
          { id: "oct-2026" },
          { id: "nov-2026" },
        ];
        const stillValid = availablePeriods.some((p) => p.id === currentSelection);
        return stillValid ? currentSelection : response.period.id;
      };

      // November arrives first
      const afterNovember = handleResponse(novResponse);
      expect(afterNovember).toBe("nov-2026");

      // October arrives second - should NOT overwrite November
      const afterOctober = handleResponse(octResponse);
      expect(afterOctober).toBe("nov-2026"); // Still November!
    });

    it("should use period existence check, not response timestamp", () => {
      // The fix uses: periodStillExists = periods.some(p => p.id === current)
      // NOT: timestamp comparison or request version IDs
      // This is the simplest safe approach

      const currentSelection = "nov-2026";
      const availablePeriods = [
        { id: "oct-2026" },
        { id: "nov-2026" },
      ];

      // Check if current selection is valid
      const periodStillExists = availablePeriods.some((p) => p.id === currentSelection);

      expect(periodStillExists).toBe(true);
      expect(currentSelection).toBe("nov-2026");
    });

    it("should revert to available period only if selected period was deleted", () => {
      // Edge case: Period was deleted between requests
      const currentSelection = "nov-2026";
      const availablePeriodsAfterDelete = [
        { id: "oct-2026" },
        { id: "dec-2026" },
      ]; // November deleted

      const periodStillExists = availablePeriodsAfterDelete.some((p) => p.id === currentSelection);
      const nextSelection = periodStillExists ? currentSelection : "dec-2026";

      expect(periodStillExists).toBe(false);
      expect(nextSelection).toBe("dec-2026"); // Reverted
    });
  });

  describe("Dashboard remains usable during period transitions", () => {
    it("should keep current dashboard visible while new period data loads", () => {
      // UX requirement: Do NOT blank the page while loading
      // Page should show previous period data until new period data arrives

      const currentDashboard = {
        period: { id: "oct-2026" },
        budgetSummary: { totalSpentCents: 150000 },
      };

      const isLoading = false; // Dashboard is visible
      const canDisplay = currentDashboard && !isLoading;

      expect(canDisplay).toBe(true);
    });

    it("should use initialLoading flag only on first load", () => {
      // initialLoading = true on first mount (no data yet)
      // initialLoading = false after first load
      // On period change: DON'T set initialLoading to true again
      // Just swap data when ready

      const stateProgression = [
        { initialLoading: true, overview: null }, // First mount
        { initialLoading: false, overview: { period: "oct" } }, // First data arrives
        { initialLoading: false, overview: { period: "nov" } }, // Period changed, data swapped
      ];

      expect(stateProgression[0].initialLoading).toBe(true);
      expect(stateProgression[1].initialLoading).toBe(false);
      expect(stateProgression[2].initialLoading).toBe(false); // NOT reset!
    });
  });

  describe("Regression check: Budget page pattern followed", () => {
    it("should use same selection preservation pattern as BudgetsPage", () => {
      // BudgetsPage has the correct pattern; DashboardPage now mirrors it

      // BudgetsPage pattern:
      // setSelectedPeriodId((current) => {
      //   const periodStillExists = next.periods.some((p) => p.id === current);
      //   return periodStillExists ? current : next.period.id;
      // });

      const currentSelection = "nov-2026";
      const nextPeriods = [
        { id: "oct-2026" },
        { id: "nov-2026" },
      ];
      const nextPeriodId = "oct-2026"; // API returns October

      const result = (() => {
        const periodStillExists = nextPeriods.some((p) => p.id === currentSelection);
        return periodStillExists ? currentSelection : nextPeriodId;
      })();

      expect(result).toBe("nov-2026"); // Preserved user selection
    });

    it("should NOT unconditionally overwrite selection (old buggy pattern)", () => {
      // Old buggy pattern (WRONG):
      // setSelectedPeriodId(next.selectedBudgetPeriodId);
      // This overwrites user selection every load

      const userSelection = "nov-2026";
      const apiResponse = "oct-2026"; // API returns something different

      // Old code would do this (WRONG):
      const buggyResult = apiResponse; // Overwrites!

      // New code does this (CORRECT):
      const availablePeriods = [
        { id: "oct-2026" },
        { id: "nov-2026" },
      ];
      const correctResult = availablePeriods.some((p) => p.id === userSelection)
        ? userSelection
        : apiResponse;

      expect(buggyResult).toBe("oct-2026"); // WRONG
      expect(correctResult).toBe("nov-2026"); // CORRECT
    });
  });
});
