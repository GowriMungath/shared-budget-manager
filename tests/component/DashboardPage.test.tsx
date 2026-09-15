import "@testing-library/jest-dom/vitest";
import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DashboardPage } from "../../src/ui/pages/DashboardPage.tsx";
import type { DashboardUseCases } from "../../src/application/use-cases/dashboard/dashboardUseCases.ts";
import type { DashboardOverview } from "../../src/application/use-cases/dashboard/types.ts";
import { parseMoney } from "../../src/domain/money/money.ts";
import { budgetPeriodId, categoryId, goalId, participantId, transactionId } from "../../src/domain/shared/ids.ts";

const gowriId = participantId("dashboard_component_gowri");
const nathanielId = participantId("dashboard_component_nathaniel");
const friendId = participantId("dashboard_component_friend");
const periodId = budgetPeriodId("dashboard_component_period");
const groceriesId = categoryId("dashboard_component_groceries");

const overview: DashboardOverview = {
  period: { id: periodId, name: "Trial", startDate: "2026-09-15", endDate: "2026-09-30" },
  periods: [{ id: periodId, name: "Trial", startDate: "2026-09-15", endDate: "2026-09-30" }],
  selectedBudgetPeriodId: periodId,
  householdSummary: {
    totalSpentCents: parseMoney("80.00"),
    totalBudgetedCents: parseMoney("200.00"),
    budgetedCategorySpentCents: parseMoney("50.00"),
    remainingBudgetCents: parseMoney("150.00"),
    unbudgetedSpentCents: parseMoney("30.00"),
    sharedSpendingCents: parseMoney("50.00"),
    personalSpendingCents: parseMoney("30.00"),
  },
  memberSummaries: [
    {
      participantId: gowriId,
      name: "Gowri",
      personalSpendingCents: parseMoney("30.00"),
      sharedSpendingCents: parseMoney("25.00"),
      totalEconomicShareCents: parseMoney("55.00"),
    },
    {
      participantId: nathanielId,
      name: "Nathaniel",
      personalSpendingCents: parseMoney("0.00"),
      sharedSpendingCents: parseMoney("25.00"),
      totalEconomicShareCents: parseMoney("25.00"),
    },
  ],
  budgetSummary: {
    totalBudgetedCents: parseMoney("200.00"),
    budgetedCategorySpentCents: parseMoney("50.00"),
    remainingBudgetCents: parseMoney("150.00"),
    usagePercent: 0.25,
    periodElapsedPercent: 0.375,
    aggregatePaceStatus: "ON_TRACK",
    overview: {
      period: { id: periodId, name: "Trial", startDate: "2026-09-15", endDate: "2026-09-30" },
      periods: [{ id: periodId, name: "Trial", startDate: "2026-09-15", endDate: "2026-09-30" }],
      householdMembers: [],
      sections: [],
    },
  },
  attentionCategories: [
    {
      categoryId: groceriesId,
      categoryName: "Groceries",
      sectionLabel: "Shared",
      scope: "shared",
      budgetedCents: parseMoney("200.00"),
      spentCents: parseMoney("50.00"),
      remainingCents: parseMoney("150.00"),
      percentUsed: 0.25,
      paceStatus: "ON_TRACK",
    },
  ],
  internalBalance: {
    fromParticipantId: gowriId,
    fromName: "Gowri",
    toParticipantId: nathanielId,
    toName: "Nathaniel",
    amountCents: parseMoney("20.00"),
  },
  externalReceivables: [
    {
      fromParticipantId: friendId,
      fromName: "Rohit",
      toParticipantId: nathanielId,
      toName: "Nathaniel",
      amountCents: parseMoney("30.00"),
    },
  ],
  recentTransactions: [
    {
      transaction: {
        id: transactionId("dashboard_component_transaction"),
        kind: "expense",
        date: "2026-09-16",
        description: "Groceries",
        totalCents: parseMoney("50.00"),
        categoryId: groceriesId,
        payerParticipantId: gowriId,
        scope: "shared",
        allocations: [{ participantId: gowriId, amountCents: parseMoney("50.00") }],
      },
      categoryName: "Groceries",
      payerName: "Gowri",
    },
  ],
  goalsSummary: [
    {
      goal: {
        id: goalId("dashboard_component_goal"),
        name: "Gowri Tuition",
        ownerParticipantId: gowriId,
        targetCents: parseMoney("6500.00"),
        currentSavedCents: parseMoney("0.00"),
        deadlineMonth: "2027-02",
      },
      ownerName: "Gowri",
      currentSavedCents: parseMoney("0.00"),
      targetCents: parseMoney("6500.00"),
      remainingCents: parseMoney("6500.00"),
      percentCompleteBasisPoints: 0,
      suggestedMonthlyContributionCents: parseMoney("1300.00"),
    },
  ],
  obligationsSummary: [],
};

const dashboardUseCases = {
  getDashboardOverview: async () => overview,
} as unknown as DashboardUseCases;

describe("DashboardPage", () => {
  test("renders overview sections from dashboard DTO", async () => {
    render(
      <MemoryRouter>
        <DashboardPage dashboardUseCases={dashboardUseCases} />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByText("$80.00")).toBeInTheDocument();
    expect(screen.getByText("$200.00")).toBeInTheDocument();
    expect(screen.getAllByText("$150.00").length).toBeGreaterThan(0);
    expect(screen.getByText(/Gowri owes Nathaniel \$20.00/)).toBeInTheDocument();
    expect(screen.getByText(/Rohit owes Nathaniel \$30.00/)).toBeInTheDocument();
    expect(screen.getByText("Gowri Tuition")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View all/i })).toHaveAttribute("href", "/transactions");
  });
});
