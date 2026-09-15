import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CircleDollarSign, Clock3, Goal, ReceiptText } from "lucide-react";
import { Link } from "react-router-dom";
import type { DashboardUseCases } from "../../application/use-cases/dashboard/dashboardUseCases.ts";
import type {
  AggregatePaceStatus,
  DashboardAttentionCategory,
  DashboardOverview,
} from "../../application/use-cases/dashboard/types.ts";
import { cents } from "../../domain/money/money.ts";
import type { BudgetPeriod } from "../../domain/shared/types.ts";
import { dollars } from "../format.ts";

interface DashboardPageProps {
  dashboardUseCases: DashboardUseCases;
}

function percent(value: number | undefined): string {
  if (value === undefined) {
    return "";
  }

  return `${Math.round(value * 1000) / 10}%`;
}

function basisPointPercent(value: number): string {
  return `${Math.round(value / 10) / 10}%`;
}

function paceText(status: AggregatePaceStatus): string {
  if (status === "NO_BUDGET_CONFIGURED") return "No budget configured";
  if (status === "OVER_BUDGET") return "Over budget";
  if (status === "AHEAD_OF_PACE") return "Spending is ahead of pace";
  return "On track";
}

function attentionText(category: DashboardAttentionCategory): string {
  if (category.paceStatus === "OVER_BUDGET") return "Over budget";
  if (category.paceStatus === "AHEAD_OF_PACE") return "Ahead of pace";
  if (category.paceStatus === "UNBUDGETED") return "Unbudgeted spending";
  return "Near limit";
}

export function DashboardPage({ dashboardUseCases }: DashboardPageProps) {
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (periodId?: string) => {
      setError(null);
      try {
        const next = await dashboardUseCases.getDashboardOverview(periodId as BudgetPeriod["id"] | undefined);
        setOverview(next);
        setSelectedPeriodId(next.selectedBudgetPeriodId);
      } catch (caught) {
        console.error("Failed to load dashboard", caught);
        setError("Dashboard information could not be loaded.");
      }
    },
    [dashboardUseCases],
  );

  useEffect(() => {
    void load(selectedPeriodId || undefined);
  }, [load, selectedPeriodId]);

  const periodLabel = useMemo(() => {
    if (!overview) return "";
    return `${overview.period.startDate} - ${overview.period.endDate}`;
  }, [overview]);

  if (!overview) {
    return <section className="rounded-md border border-stone-200 bg-white p-5">Loading dashboard...</section>;
  }

  const budgetProgressPercent = overview.budgetSummary.usagePercent;
  const budgetProgressWidth = `${Math.min((budgetProgressPercent ?? 0) * 100, 100)}%`;
  const externalReceivableTotal = cents(
    overview.externalReceivables.reduce((sum, receivable) => sum + receivable.amountCents, 0),
  );

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-2xl font-semibold">Dashboard</h3>
          <p className="text-sm text-stone-600">{periodLabel}</p>
        </div>
        <label className="block min-w-64 text-sm font-medium text-stone-700">
          Budget period
          <select
            className="focus-ring mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2"
            value={selectedPeriodId}
            onChange={(event) => setSelectedPeriodId(event.target.value)}
          >
            {overview.periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.name} ({period.startDate} - {period.endDate})
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}

      <div className="grid gap-3 md:grid-cols-4">
        <SummaryCard label="Spent" value={dollars(overview.householdSummary.totalSpentCents)} />
        <SummaryCard label="Budgeted" value={dollars(overview.householdSummary.totalBudgetedCents)} />
        <SummaryCard label="Remaining" value={dollars(overview.householdSummary.remainingBudgetCents)} />
        <SummaryCard label="Period pace" value={paceText(overview.budgetSummary.aggregatePaceStatus)} subdued />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-md border border-stone-200 bg-white p-5">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h4 className="font-semibold">Budget Progress</h4>
              <p className="text-sm text-stone-600">
                {overview.budgetSummary.totalBudgetedCents === 0
                  ? "No budget limits configured"
                  : `${dollars(overview.budgetSummary.budgetedCategorySpentCents)} spent of ${dollars(
                      overview.budgetSummary.totalBudgetedCents,
                    )} budgeted`}
              </p>
            </div>
            <div className="text-right text-sm">
              <p className="font-medium">{percent(budgetProgressPercent) || "No budget configured"}</p>
              <p className="text-stone-500">{dollars(overview.budgetSummary.remainingBudgetCents)} remaining</p>
            </div>
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-stone-100">
            <div className="h-full rounded-full bg-emerald-800" style={{ width: budgetProgressWidth }} />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <MetricRow label="Budget used" value={percent(budgetProgressPercent) || "-"} />
            <MetricRow label="Period elapsed" value={percent(overview.budgetSummary.periodElapsedPercent)} />
            <MetricRow label="Unbudgeted spending" value={dollars(overview.householdSummary.unbudgetedSpentCents)} />
          </div>
        </section>

        <section className="rounded-md border border-stone-200 bg-white p-5">
          <h4 className="font-semibold">Spending Split</h4>
          <div className="mt-4 space-y-3">
            <MetricRow label="Shared" value={dollars(overview.householdSummary.sharedSpendingCents)} />
            <MetricRow label="Personal" value={dollars(overview.householdSummary.personalSpendingCents)} />
            {overview.memberSummaries.map((member) => (
              <MetricRow
                key={member.participantId}
                label={member.name}
                value={dollars(member.totalEconomicShareCents)}
                detail={`${dollars(member.sharedSpendingCents)} shared + ${dollars(member.personalSpendingCents)} personal`}
              />
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <section className="rounded-md border border-stone-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-700" />
            <h4 className="font-semibold">Needs Attention</h4>
          </div>
          <div className="mt-4 space-y-3">
            {overview.attentionCategories.length === 0 ? (
              <p className="text-sm text-stone-600">No categories need attention.</p>
            ) : (
              overview.attentionCategories.map((category) => (
                <div key={`${category.sectionLabel}:${category.categoryId}`} className="border-b border-stone-100 pb-3 last:border-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{category.categoryName}</p>
                      <p className="text-sm text-stone-500">{category.sectionLabel}</p>
                    </div>
                    <p className="text-sm font-medium text-stone-700">{attentionText(category)}</p>
                  </div>
                  <p className="mt-1 text-sm text-stone-600">
                    {dollars(category.spentCents)} spent
                    {category.budgetedCents !== undefined ? ` of ${dollars(category.budgetedCents)}` : ""}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-md border border-stone-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <CircleDollarSign size={18} className="text-emerald-800" />
            <h4 className="font-semibold">Balances</h4>
          </div>
          <div className="mt-4 space-y-4">
            <div>
              <p className="text-sm font-medium text-stone-500">Who owes whom</p>
              {overview.internalBalance.amountCents === 0 ? (
                <p className="mt-1 font-medium">You are settled up</p>
              ) : (
                <p className="mt-1 font-medium">
                  {overview.internalBalance.fromName} owes {overview.internalBalance.toName}{" "}
                  {dollars(overview.internalBalance.amountCents)}
                </p>
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-stone-500">Friends owe us</p>
              <p className="mt-1 font-medium">Total friends owe us: {dollars(externalReceivableTotal)}</p>
              <div className="mt-2 space-y-1">
                {overview.externalReceivables.slice(0, 4).map((receivable) => (
                  <p key={`${receivable.fromParticipantId}:${receivable.toParticipantId}`} className="text-sm text-stone-600">
                    {receivable.fromName} owes {receivable.toName} {dollars(receivable.amountCents)}
                  </p>
                ))}
                {overview.externalReceivables.length === 0 ? (
                  <p className="text-sm text-stone-600">No outstanding friend balances.</p>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-md border border-stone-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <Goal size={18} className="text-emerald-800" />
          <h4 className="font-semibold">Tuition Goals</h4>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {overview.goalsSummary.map((goal) => (
            <div key={goal.goal.id} className="rounded-md border border-stone-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{goal.goal.name}</p>
                  <p className="text-sm text-stone-500">{goal.ownerName}</p>
                </div>
                <p className="text-sm font-semibold">{basisPointPercent(goal.percentCompleteBasisPoints)}</p>
              </div>
              <p className="mt-3 text-sm text-stone-600">
                {dollars(goal.currentSavedCents)} / {dollars(goal.targetCents)}
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-100">
                <div
                  className="h-full rounded-full bg-emerald-800"
                  style={{ width: `${Math.min(goal.percentCompleteBasisPoints / 100, 100)}%` }}
                />
              </div>
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <MetricRow label="Remaining" value={dollars(goal.remainingCents)} />
                <MetricRow label="Suggested monthly" value={dollars(goal.suggestedMonthlyContributionCents)} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <section className="rounded-md border border-stone-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <Clock3 size={18} className="text-stone-700" />
            <h4 className="font-semibold">Upcoming Committed Expenses</h4>
          </div>
          <div className="mt-4 space-y-3">
            {overview.obligationsSummary.length === 0 ? (
              <p className="text-sm text-stone-600">No upcoming obligations entered yet.</p>
            ) : (
              overview.obligationsSummary.map(({ obligation, ownerName }) => (
                <MetricRow
                  key={obligation.id}
                  label={obligation.description}
                  value={dollars(obligation.amountCents)}
                  detail={`${ownerName} due ${obligation.dueDate}`}
                />
              ))
            )}
          </div>
        </section>

        <section className="rounded-md border border-stone-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ReceiptText size={18} className="text-stone-700" />
              <h4 className="font-semibold">Recent Transactions</h4>
            </div>
            <Link className="focus-ring inline-flex items-center gap-1 rounded-md border border-stone-300 px-3 py-2 text-sm" to="/transactions">
              View all <ArrowRight size={15} />
            </Link>
          </div>
          <div className="mt-4">
            <div className="space-y-3 sm:hidden">
              {overview.recentTransactions.map(({ transaction, categoryName }) => (
                <article key={transaction.id} className="rounded-md border border-stone-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{transaction.description}</p>
                      <p className="mt-1 text-sm text-stone-600">
                        {transaction.date} · {categoryName} · {transaction.scope}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold">{dollars(transaction.totalCents)}</p>
                  </div>
                </article>
              ))}
            </div>
            <table className="hidden min-w-full text-left text-sm sm:table">
              <thead className="text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="py-2 pr-4 font-medium">Date</th>
                  <th className="py-2 pr-4 font-medium">Description</th>
                  <th className="py-2 pr-4 font-medium">Category</th>
                  <th className="py-2 pr-4 font-medium">Amount</th>
                  <th className="py-2 pr-4 font-medium">Scope</th>
                </tr>
              </thead>
              <tbody>
                {overview.recentTransactions.map(({ transaction, categoryName }) => (
                  <tr key={transaction.id} className="border-t border-stone-100">
                    <td className="py-2 pr-4">{transaction.date}</td>
                    <td className="py-2 pr-4 font-medium">{transaction.description}</td>
                    <td className="py-2 pr-4">{categoryName}</td>
                    <td className="py-2 pr-4">{dollars(transaction.totalCents)}</td>
                    <td className="py-2 pr-4">{transaction.scope}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {overview.recentTransactions.length === 0 ? (
              <p className="py-6 text-sm text-stone-600">No transactions in this period yet.</p>
            ) : null}
          </div>
        </section>
      </div>
    </section>
  );
}

function SummaryCard({ label, value, subdued = false }: { label: string; value: string; subdued?: boolean }) {
  return (
    <section className="rounded-md border border-stone-200 bg-white p-4">
      <p className="text-sm font-medium text-stone-500">{label}</p>
      <p className={`mt-2 text-xl font-semibold ${subdued ? "text-emerald-900" : "text-stone-950"}`}>{value}</p>
    </section>
  );
}

function MetricRow({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-stone-600">{label}</p>
        {detail ? <p className="text-xs text-stone-500">{detail}</p> : null}
      </div>
      <p className="shrink-0 text-sm font-semibold">{value}</p>
    </div>
  );
}
