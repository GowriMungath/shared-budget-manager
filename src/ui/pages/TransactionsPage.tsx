import { useCallback, useEffect, useMemo, useState } from "react";
import { Edit3, Plus, Trash2 } from "lucide-react";
import type { Transaction } from "../../domain/ledger/transaction.ts";
import type { ParticipantId } from "../../domain/shared/types.ts";
import type { TransactionUseCases } from "../../application/use-cases/transactions/transactionUseCases.ts";
import type {
  TransactionListItem,
  TransactionReferenceData,
} from "../../application/use-cases/transactions/types.ts";
import { dollars } from "../format.ts";
import { TransactionForm } from "../components/TransactionForm.tsx";

interface TransactionsPageProps {
  transactionUseCases: TransactionUseCases;
}

function participantName(referenceData: TransactionReferenceData | null, participantId: ParticipantId): string {
  return referenceData?.participants.find((participant) => participant.id === participantId)?.name ?? "Unknown";
}

function allocationSummary(item: TransactionListItem, referenceData: TransactionReferenceData | null): string {
  return item.transaction.allocations
    .map((allocation) => `${participantName(referenceData, allocation.participantId)} ${dollars(allocation.amountCents)}`)
    .join(", ");
}

export function TransactionsPage({ transactionUseCases }: TransactionsPageProps) {
  const [referenceData, setReferenceData] = useState<TransactionReferenceData | null>(null);
  const [transactions, setTransactions] = useState<TransactionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<TransactionListItem | null>(null);
  const [filters, setFilters] = useState({
    startDate: "",
    endDate: "",
    categoryId: "",
    payerParticipantId: "",
    scope: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [nextReferenceData, nextTransactions] = await Promise.all([
        transactionUseCases.getReferenceData(),
        transactionUseCases.listTransactions(),
      ]);
      setReferenceData(nextReferenceData);
      setTransactions(nextTransactions);
    } catch (caught) {
      console.error("Failed to load transactions", caught);
      setError("Transactions could not be loaded. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [transactionUseCases]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredTransactions = useMemo(
    () =>
      transactions.filter((item) => {
        if (filters.startDate && item.transaction.date < filters.startDate) {
          return false;
        }
        if (filters.endDate && item.transaction.date > filters.endDate) {
          return false;
        }
        if (filters.categoryId && item.transaction.categoryId !== filters.categoryId) {
          return false;
        }
        if (filters.payerParticipantId && item.transaction.payerParticipantId !== filters.payerParticipantId) {
          return false;
        }
        if (filters.scope && item.transaction.scope !== filters.scope) {
          return false;
        }

        return true;
      }),
    [filters, transactions],
  );

  async function confirmDelete() {
    if (!deleteTarget) {
      return;
    }

    try {
      await transactionUseCases.deleteTransaction(deleteTarget.transaction.id);
      setDeleteTarget(null);
      await load();
    } catch (caught) {
      console.error("Failed to delete transaction", caught);
      setError("Transaction could not be deleted. Please try again.");
    }
  }

  if (loading) {
    return <section className="rounded-md border border-stone-200 bg-white p-5">Loading transactions...</section>;
  }

  if (!referenceData) {
    return <section className="rounded-md border border-stone-200 bg-white p-5">Reference data is unavailable.</section>;
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold">Transactions</h3>
          <p className="text-sm text-stone-600">Record one payment once, then split the economics correctly.</p>
        </div>
        <button
          type="button"
          className="focus-ring inline-flex items-center justify-center gap-2 rounded-md bg-emerald-900 px-4 py-2 text-white"
          onClick={() => {
            setEditing(undefined);
            setFormOpen(true);
          }}
        >
          <Plus size={18} />
          Add Transaction
        </button>
      </div>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}
      <div className="grid gap-3 rounded-md border border-stone-200 bg-white p-4 md:grid-cols-5">
        <label className="text-sm">
          From
          <input
            type="date"
            className="focus-ring mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
            value={filters.startDate}
            onChange={(event) => setFilters((current) => ({ ...current, startDate: event.target.value }))}
          />
        </label>
        <label className="text-sm">
          To
          <input
            type="date"
            className="focus-ring mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
            value={filters.endDate}
            onChange={(event) => setFilters((current) => ({ ...current, endDate: event.target.value }))}
          />
        </label>
        <label className="text-sm">
          Category
          <select
            className="focus-ring mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
            value={filters.categoryId}
            onChange={(event) => setFilters((current) => ({ ...current, categoryId: event.target.value }))}
          >
            <option value="">All</option>
            {referenceData.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Payer
          <select
            className="focus-ring mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
            value={filters.payerParticipantId}
            onChange={(event) => setFilters((current) => ({ ...current, payerParticipantId: event.target.value }))}
          >
            <option value="">All</option>
            {referenceData.householdMembers.map((participant) => (
              <option key={participant.id} value={participant.id}>
                {participant.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Scope
          <select
            className="focus-ring mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
            value={filters.scope}
            onChange={(event) => setFilters((current) => ({ ...current, scope: event.target.value }))}
          >
            <option value="">All</option>
            <option value="shared">Shared</option>
            <option value="personal">Personal</option>
          </select>
        </label>
      </div>
      <div className="overflow-hidden rounded-md border border-stone-200 bg-white">
        {filteredTransactions.length === 0 ? (
          <div className="p-8 text-center text-stone-600">No transactions yet.</div>
        ) : (
          <>
          <div className="divide-y divide-stone-100 md:hidden">
            {filteredTransactions.map((item) => (
              <article key={item.transaction.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{item.transaction.description}</p>
                    <p className="mt-1 text-sm text-stone-600">
                      {item.transaction.date} · {item.category?.name ?? "Unknown"} · {item.transaction.scope}
                    </p>
                    <p className="mt-1 text-sm text-stone-600">Paid by {item.payer?.name ?? "Unknown"}</p>
                  </div>
                  <p className="shrink-0 font-semibold">{dollars(item.transaction.totalCents)}</p>
                </div>
                <p className="mt-3 text-sm text-stone-700">{allocationSummary(item, referenceData)}</p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    aria-label={`Edit ${item.transaction.description}`}
                    className="focus-ring inline-flex min-h-10 items-center justify-center rounded-md border border-stone-300 px-3 text-sm"
                    onClick={() => {
                      setEditing(item.transaction);
                      setFormOpen(true);
                    }}
                  >
                    <Edit3 size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${item.transaction.description}`}
                    className="focus-ring inline-flex min-h-10 items-center justify-center rounded-md border border-stone-300 px-3 text-sm text-red-700"
                    onClick={() => setDeleteTarget(item)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <thead className="bg-stone-50 text-left text-stone-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Payer</th>
                  <th className="px-4 py-3 font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Scope</th>
                  <th className="px-4 py-3 font-medium">Allocation</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((item) => (
                  <tr key={item.transaction.id} className="border-t border-stone-100">
                    <td className="px-4 py-3">{item.transaction.date}</td>
                    <td className="px-4 py-3 font-medium">{item.transaction.description}</td>
                    <td className="px-4 py-3">{item.category?.name ?? "Unknown"}</td>
                    <td className="px-4 py-3">{item.payer?.name ?? "Unknown"}</td>
                    <td className="px-4 py-3 font-semibold">{dollars(item.transaction.totalCents)}</td>
                    <td className="px-4 py-3 capitalize">{item.transaction.scope}</td>
                    <td className="max-w-72 truncate px-4 py-3" title={allocationSummary(item, referenceData)}>
                      {allocationSummary(item, referenceData)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          aria-label={`Edit ${item.transaction.description}`}
                          className="focus-ring rounded-md border border-stone-300 p-2"
                          onClick={() => {
                            setEditing(item.transaction);
                            setFormOpen(true);
                          }}
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${item.transaction.description}`}
                          className="focus-ring rounded-md border border-stone-300 p-2 text-red-700"
                          onClick={() => setDeleteTarget(item)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>
      {formOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={editing ? "Edit transaction" : "Add transaction"}
          className="fixed inset-0 z-30 overflow-y-auto bg-stone-950/35 p-3 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-6"
        >
          <div className="mx-auto w-full max-w-5xl rounded-md bg-white p-4 shadow-xl sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">{editing ? "Edit Transaction" : "Add Transaction"}</h3>
            </div>
            <TransactionForm
              referenceData={referenceData}
              initialTransaction={editing}
              preview={(draft, existingId) => transactionUseCases.preview(draft, existingId)}
              onCreateExternalParticipant={async (name) => {
                const participant = await transactionUseCases.createExternalParticipant(name);
                setReferenceData((current) =>
                  current
                    ? {
                        ...current,
                        participants: [...current.participants, participant],
                        externalParticipants: [...current.externalParticipants, participant],
                      }
                    : current,
                );
                return participant;
              }}
              onSubmit={async (draft, existingId) => {
                if (existingId) {
                  await transactionUseCases.updateTransaction(existingId, draft);
                } else {
                  await transactionUseCases.createTransaction(draft);
                }
                setFormOpen(false);
                setEditing(undefined);
                await load();
              }}
              onCancel={() => {
                setFormOpen(false);
                setEditing(undefined);
              }}
            />
          </div>
        </div>
      ) : null}
      {deleteTarget ? (
        <div role="dialog" aria-modal="true" aria-label="Delete transaction" className="fixed inset-0 z-40 grid place-items-center bg-stone-950/35 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="w-full max-w-md rounded-md bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold">Delete "{dollars(deleteTarget.transaction.totalCents)} {deleteTarget.transaction.description}"?</h3>
            <p className="mt-2 text-sm text-stone-600">This will remove the transaction and update all derived balances.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="focus-ring rounded-md border border-stone-300 px-4 py-2" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button type="button" className="focus-ring rounded-md bg-red-700 px-4 py-2 text-white" onClick={confirmDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
