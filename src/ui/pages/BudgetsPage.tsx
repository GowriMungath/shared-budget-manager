import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, Edit3, Plus, Save, X } from "lucide-react";
import type { BudgetUseCases } from "../../application/use-cases/budgets/budgetUseCases.ts";
import type { BudgetCategorySummary, BudgetOverview, BudgetSectionSummary } from "../../application/use-cases/budgets/types.ts";
import type { BudgetPeriod, BudgetScope, CategoryId } from "../../domain/shared/types.ts";
import { dollars } from "../format.ts";

interface BudgetsPageProps {
  budgetUseCases: BudgetUseCases;
}

function percent(value: number | undefined): string {
  if (value === undefined) {
    return "";
  }
  return `${Math.round(value * 1000) / 10}%`;
}

function statusText(category: BudgetCategorySummary): string {
  if (category.paceStatus === "UNBUDGETED") return "Unbudgeted";
  if (category.paceStatus === "OVER_BUDGET") return `Over budget by ${dollars((Math.abs(category.remainingCents ?? 0)) as never)}`;
  if (category.paceStatus === "AHEAD_OF_PACE") return "Ahead of pace";
  return "On track";
}

export function BudgetsPage({ budgetUseCases }: BudgetsPageProps) {
  const [overview, setOverview] = useState<BudgetOverview | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("");
  const [editingLimit, setEditingLimit] = useState<string | null>(null);
  const [limitInput, setLimitInput] = useState("");
  const [periodFormOpen, setPeriodFormOpen] = useState(false);
  const [categoryFormOpen, setCategoryFormOpen] = useState(false);
  const [newPeriod, setNewPeriod] = useState({ name: "", startDate: "", endDate: "" });
  const [categoryDraft, setCategoryDraft] = useState<{ name: string; scope: BudgetScope; groupName: string }>({
    name: "",
    scope: "shared",
    groupName: "",
  });
  const [renamingCategoryId, setRenamingCategoryId] = useState<CategoryId | null>(null);
  const [renameInput, setRenameInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (periodId?: string) => {
      setError(null);
      try {
        const next = await budgetUseCases.getBudgetOverview(periodId as BudgetPeriod["id"] | undefined);
        setOverview(next);
        setSelectedPeriodId(next.period.id);
      } catch (caught) {
        console.error("Failed to load budget overview", caught);
        setError("Budget information could not be loaded.");
      }
    },
    [budgetUseCases],
  );

  useEffect(() => {
    void load(selectedPeriodId || undefined);
  }, [load, selectedPeriodId]);

  const periodOptions = overview?.periods ?? [];

  async function saveLimit(category: BudgetCategorySummary) {
    if (!overview) return;
    try {
      await budgetUseCases.setBudgetLimit({
        budgetPeriodId: overview.period.id,
        categoryId: category.categoryId,
        scope: category.scope,
        ownerParticipantId: category.ownerParticipantId,
        amountInput: limitInput,
      });
      setEditingLimit(null);
      setLimitInput("");
      await load(overview.period.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Budget limit could not be saved.");
    }
  }

  async function removeLimit(category: BudgetCategorySummary) {
    if (!category.budgetLimitId || !overview) return;
    await budgetUseCases.removeBudgetLimit(category.budgetLimitId);
    await load(overview.period.id);
  }

  async function createPeriod() {
    try {
      const created = await budgetUseCases.createBudgetPeriod(newPeriod);
      setPeriodFormOpen(false);
      setNewPeriod({ name: "", startDate: "", endDate: "" });
      await load(created.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Budget period could not be created.");
    }
  }

  async function createCategory() {
    if (!overview) return;
    try {
      await budgetUseCases.createCategory(categoryDraft);
      setCategoryFormOpen(false);
      setCategoryDraft({ name: "", scope: "shared", groupName: "" });
      await load(overview.period.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Category could not be created.");
    }
  }

  async function renameCategory(category: BudgetCategorySummary) {
    if (!overview) return;
    try {
      await budgetUseCases.renameCategory(category.categoryId, renameInput);
      setRenamingCategoryId(null);
      setRenameInput("");
      await load(overview.period.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Category could not be renamed.");
    }
  }

  async function archiveCategory(category: BudgetCategorySummary) {
    if (!overview) return;
    await budgetUseCases.archiveCategory(category.categoryId);
    await load(overview.period.id);
  }

  const currentPeriodLabel = useMemo(() => {
    if (!overview) return "";
    return `${overview.period.name}: ${overview.period.startDate} through ${overview.period.endDate}`;
  }, [overview]);

  if (!overview) {
    return <section className="rounded-md border border-stone-200 bg-white p-5">Loading budgets...</section>;
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold">Budgets</h3>
          <p className="text-sm text-stone-600">{currentPeriodLabel}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="focus-ring inline-flex items-center gap-2 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm" type="button" onClick={() => setCategoryFormOpen(true)}>
            <Plus size={16} /> Add Category
          </button>
          <button className="focus-ring inline-flex items-center gap-2 rounded-md bg-emerald-900 px-3 py-2 text-sm text-white" type="button" onClick={() => setPeriodFormOpen(true)}>
            <Plus size={16} /> New Period
          </button>
        </div>
      </div>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}
      <div className="rounded-md border border-stone-200 bg-white p-4">
        <label className="block max-w-md text-sm font-medium">
          Budget period
          <select
            className="focus-ring mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
            value={selectedPeriodId}
            onChange={(event) => setSelectedPeriodId(event.target.value)}
          >
            {periodOptions.map((period) => (
              <option key={period.id} value={period.id}>
                {period.name} ({period.startDate} - {period.endDate})
              </option>
            ))}
          </select>
        </label>
      </div>
      {overview.sections.map((section) => (
        <BudgetSection
          key={section.key}
          section={section}
          editingLimit={editingLimit}
          limitInput={limitInput}
          renamingCategoryId={renamingCategoryId}
          renameInput={renameInput}
          onEditLimit={(category) => {
            setEditingLimit(`${section.key}:${category.categoryId}`);
            setLimitInput(category.budgetedCents !== undefined ? (category.budgetedCents / 100).toFixed(2) : "");
          }}
          onLimitInput={setLimitInput}
          onSaveLimit={saveLimit}
          onCancelLimit={() => setEditingLimit(null)}
          onRemoveLimit={removeLimit}
          onBeginRename={(category) => {
            setRenamingCategoryId(category.categoryId);
            setRenameInput(category.categoryName);
          }}
          onRenameInput={setRenameInput}
          onRename={renameCategory}
          onCancelRename={() => setRenamingCategoryId(null)}
          onArchive={archiveCategory}
        />
      ))}
      {periodFormOpen ? (
        <div role="dialog" aria-modal="true" aria-label="New budget period" className="fixed inset-0 z-30 grid place-items-center bg-stone-950/35 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="w-full max-w-md rounded-md bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold">New Budget Period</h3>
            <div className="mt-4 space-y-3">
              <label className="block text-sm">Label<input className="focus-ring mt-1 w-full rounded-md border border-stone-300 px-3 py-2" value={newPeriod.name} onChange={(event) => setNewPeriod((current) => ({ ...current, name: event.target.value }))} /></label>
              <label className="block text-sm">Start date<input type="date" className="focus-ring mt-1 w-full rounded-md border border-stone-300 px-3 py-2" value={newPeriod.startDate} onChange={(event) => setNewPeriod((current) => ({ ...current, startDate: event.target.value }))} /></label>
              <label className="block text-sm">End date<input type="date" className="focus-ring mt-1 w-full rounded-md border border-stone-300 px-3 py-2" value={newPeriod.endDate} onChange={(event) => setNewPeriod((current) => ({ ...current, endDate: event.target.value }))} /></label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="focus-ring rounded-md border border-stone-300 px-4 py-2" onClick={() => setPeriodFormOpen(false)}>Cancel</button>
              <button type="button" className="focus-ring rounded-md bg-emerald-900 px-4 py-2 text-white" onClick={createPeriod}>Create</button>
            </div>
          </div>
        </div>
      ) : null}
      {categoryFormOpen ? (
        <div role="dialog" aria-modal="true" aria-label="Add category" className="fixed inset-0 z-30 grid place-items-center bg-stone-950/35 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="w-full max-w-md rounded-md bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold">Add Category</h3>
            <div className="mt-4 space-y-3">
              <label className="block text-sm">Name<input className="focus-ring mt-1 w-full rounded-md border border-stone-300 px-3 py-2" value={categoryDraft.name} onChange={(event) => setCategoryDraft((current) => ({ ...current, name: event.target.value }))} /></label>
              <label className="block text-sm">Scope<select className="focus-ring mt-1 w-full rounded-md border border-stone-300 px-3 py-2" value={categoryDraft.scope} onChange={(event) => setCategoryDraft((current) => ({ ...current, scope: event.target.value as BudgetScope }))}><option value="shared">Shared</option><option value="personal">Personal</option></select></label>
              <label className="block text-sm">Group<input className="focus-ring mt-1 w-full rounded-md border border-stone-300 px-3 py-2" value={categoryDraft.groupName} onChange={(event) => setCategoryDraft((current) => ({ ...current, groupName: event.target.value }))} /></label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="focus-ring rounded-md border border-stone-300 px-4 py-2" onClick={() => setCategoryFormOpen(false)}>Cancel</button>
              <button type="button" className="focus-ring rounded-md bg-emerald-900 px-4 py-2 text-white" onClick={createCategory}>Create</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

interface SectionProps {
  section: BudgetSectionSummary;
  editingLimit: string | null;
  limitInput: string;
  renamingCategoryId: CategoryId | null;
  renameInput: string;
  onEditLimit: (category: BudgetCategorySummary) => void;
  onLimitInput: (value: string) => void;
  onSaveLimit: (category: BudgetCategorySummary) => void;
  onCancelLimit: () => void;
  onRemoveLimit: (category: BudgetCategorySummary) => void;
  onBeginRename: (category: BudgetCategorySummary) => void;
  onRenameInput: (value: string) => void;
  onRename: (category: BudgetCategorySummary) => void;
  onCancelRename: () => void;
  onArchive: (category: BudgetCategorySummary) => void;
}

function BudgetSection(props: SectionProps) {
  const { section } = props;
  return (
    <section className="overflow-hidden rounded-md border border-stone-200 bg-white">
      <div className="border-b border-stone-200 bg-stone-50 px-4 py-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <h4 className="font-semibold">{section.label}</h4>
          <p className="text-sm text-stone-600">
            Budgeted: {dollars(section.totalBudgetedCents)} | Spent: {dollars(section.totalSpentCents)} | Remaining: {dollars(section.totalRemainingCents)}
            {section.unbudgetedSpentCents > 0 ? ` | Unbudgeted spending: ${dollars(section.unbudgetedSpentCents)}` : ""}
          </p>
        </div>
      </div>
      <div className="divide-y divide-stone-100 md:hidden">
        {section.categories.map((category) => {
          const editingKey = `${section.key}:${category.categoryId}`;
          const isEditing = props.editingLimit === editingKey;
          const isRenaming = props.renamingCategoryId === category.categoryId;
          return (
            <article key={`${section.key}-${category.categoryId}`} className="p-4">
              <div className="flex items-start justify-between gap-3">
                {isRenaming ? (
                  <div className="grid flex-1 gap-2">
                    <input aria-label="Category name" className="focus-ring min-h-10 rounded-md border border-stone-300 px-3 py-2" value={props.renameInput} onChange={(event) => props.onRenameInput(event.target.value)} />
                    <div className="flex gap-2">
                      <button aria-label="Save category name" type="button" className="focus-ring rounded-md border border-stone-300 p-2" onClick={() => props.onRename(category)}><Save size={15} /></button>
                      <button aria-label="Cancel rename" type="button" className="focus-ring rounded-md border border-stone-300 p-2" onClick={props.onCancelRename}><X size={15} /></button>
                    </div>
                  </div>
                ) : (
                  <div className="min-w-0">
                    <p className="break-words font-medium">{category.categoryName}{category.archived ? " (archived)" : ""}</p>
                    <p className="text-xs text-stone-500">{category.groupName}</p>
                  </div>
                )}
                <p className="shrink-0 text-sm font-medium text-stone-700">{statusText(category)}</p>
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-stone-500">Budgeted</dt>
                  <dd className="mt-1 font-semibold">
                    {isEditing ? (
                      <input aria-label={`Budget amount for ${category.categoryName}`} className="focus-ring w-full rounded-md border border-stone-300 px-2 py-1" inputMode="decimal" value={props.limitInput} onChange={(event) => props.onLimitInput(event.target.value)} />
                    ) : category.budgetedCents === undefined ? (
                      "Not set"
                    ) : (
                      dollars(category.budgetedCents)
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-stone-500">Spent</dt>
                  <dd className="mt-1 font-semibold">{dollars(category.spentCents)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-stone-500">Remaining</dt>
                  <dd className="mt-1 font-semibold">{category.remainingCents === undefined ? "—" : dollars(category.remainingCents)}</dd>
                </div>
              </dl>
              <div className="mt-4">
                <div className="h-2 overflow-hidden rounded-full bg-stone-200">
                  <div className="h-full bg-emerald-800" style={{ width: `${Math.min((category.percentUsed ?? 0) * 100, 130)}%` }} />
                </div>
                <p className="mt-1 text-xs text-stone-700">{category.percentUsed === undefined ? "" : `${percent(category.percentUsed)} used — `}{statusText(category)}</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {isEditing ? (
                  <>
                    <button type="button" className="focus-ring rounded-md border border-stone-300 p-2" aria-label="Save budget limit" onClick={() => props.onSaveLimit(category)}><Save size={15} /></button>
                    <button type="button" className="focus-ring rounded-md border border-stone-300 p-2" aria-label="Cancel budget edit" onClick={props.onCancelLimit}><X size={15} /></button>
                  </>
                ) : (
                  <button type="button" className="focus-ring min-h-10 rounded-md border border-stone-300 px-3 py-2 text-sm" onClick={() => props.onEditLimit(category)}>Set/Edit</button>
                )}
                {category.budgetLimitId ? <button type="button" className="focus-ring min-h-10 rounded-md border border-stone-300 px-3 py-2 text-sm" onClick={() => props.onRemoveLimit(category)}>Unset</button> : null}
                <button type="button" aria-label={`Rename ${category.categoryName}`} className="focus-ring rounded-md border border-stone-300 p-2" onClick={() => props.onBeginRename(category)}><Edit3 size={15} /></button>
                {!category.archived ? <button type="button" aria-label={`Archive ${category.categoryName}`} className="focus-ring rounded-md border border-stone-300 p-2" onClick={() => props.onArchive(category)}><Archive size={15} /></button> : null}
              </div>
            </article>
          );
        })}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[840px] text-sm">
          <thead className="text-left text-stone-600">
            <tr>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Budgeted</th>
              <th className="px-4 py-3 font-medium">Spent</th>
              <th className="px-4 py-3 font-medium">Remaining</th>
              <th className="px-4 py-3 font-medium">Progress</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {section.categories.map((category) => {
              const editingKey = `${section.key}:${category.categoryId}`;
              const isEditing = props.editingLimit === editingKey;
              const isRenaming = props.renamingCategoryId === category.categoryId;
              return (
                <tr key={`${section.key}-${category.categoryId}`} className="border-t border-stone-100">
                  <td className="px-4 py-3">
                    {isRenaming ? (
                      <div className="flex gap-2">
                        <input aria-label="Category name" className="focus-ring rounded-md border border-stone-300 px-2 py-1" value={props.renameInput} onChange={(event) => props.onRenameInput(event.target.value)} />
                        <button aria-label="Save category name" type="button" className="focus-ring rounded-md border border-stone-300 p-2" onClick={() => props.onRename(category)}><Save size={15} /></button>
                        <button aria-label="Cancel rename" type="button" className="focus-ring rounded-md border border-stone-300 p-2" onClick={props.onCancelRename}><X size={15} /></button>
                      </div>
                    ) : (
                      <div>
                        <p className="font-medium">{category.categoryName}{category.archived ? " (archived)" : ""}</p>
                        <p className="text-xs text-stone-500">{category.groupName}</p>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <input aria-label={`Budget amount for ${category.categoryName}`} className="focus-ring w-28 rounded-md border border-stone-300 px-2 py-1" value={props.limitInput} onChange={(event) => props.onLimitInput(event.target.value)} />
                    ) : category.budgetedCents === undefined ? (
                      "Not set"
                    ) : (
                      dollars(category.budgetedCents)
                    )}
                  </td>
                  <td className="px-4 py-3">{dollars(category.spentCents)}</td>
                  <td className="px-4 py-3">{category.remainingCents === undefined ? "—" : dollars(category.remainingCents)}</td>
                  <td className="px-4 py-3">
                    <div className="max-w-56">
                      <div className="h-2 overflow-hidden rounded-full bg-stone-200">
                        <div className="h-full bg-emerald-800" style={{ width: `${Math.min((category.percentUsed ?? 0) * 100, 130)}%` }} />
                      </div>
                      <p className="mt-1 text-xs text-stone-700">{category.percentUsed === undefined ? "" : `${percent(category.percentUsed)} used — `}{statusText(category)}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {isEditing ? (
                        <>
                          <button type="button" className="focus-ring rounded-md border border-stone-300 p-2" aria-label="Save budget limit" onClick={() => props.onSaveLimit(category)}><Save size={15} /></button>
                          <button type="button" className="focus-ring rounded-md border border-stone-300 p-2" aria-label="Cancel budget edit" onClick={props.onCancelLimit}><X size={15} /></button>
                        </>
                      ) : (
                        <button type="button" className="focus-ring rounded-md border border-stone-300 px-2 py-1" onClick={() => props.onEditLimit(category)}>Set/Edit</button>
                      )}
                      {category.budgetLimitId ? <button type="button" className="focus-ring rounded-md border border-stone-300 px-2 py-1" onClick={() => props.onRemoveLimit(category)}>Unset</button> : null}
                      <button type="button" aria-label={`Rename ${category.categoryName}`} className="focus-ring rounded-md border border-stone-300 p-2" onClick={() => props.onBeginRename(category)}><Edit3 size={15} /></button>
                      {!category.archived ? <button type="button" aria-label={`Archive ${category.categoryName}`} className="focus-ring rounded-md border border-stone-300 p-2" onClick={() => props.onArchive(category)}><Archive size={15} /></button> : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
