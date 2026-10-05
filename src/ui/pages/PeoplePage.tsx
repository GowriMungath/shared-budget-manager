import { useMemo, useState } from "react";
import { Plus, Archive, Edit2, Trash2 } from "lucide-react";
import type { Participant } from "../../domain/shared/types.ts";
import type { Settlement } from "../../domain/settlement/settlement.ts";
import type { Transaction } from "../../domain/ledger/transaction.ts";
import type { ParticipantId } from "../../domain/shared/types.ts";
import { dollars } from "../format.ts";
import { calculateHouseholdBalance } from "../../application/use-cases/balances/balanceUseCases.ts";

interface PeoplePageProps {
  householdMembers: Participant[];
  externalPeople: Participant[];
  archivedExternalPeople: Participant[];
  allParticipants: Participant[]; // All participants including archived (for historical lookups)
  transactions: Transaction[];
  settlements: Settlement[];
  onAddPerson: (name: string, note?: string) => Promise<void>;
  onArchivePerson: (participantId: string) => Promise<void>;
  onUnarchivePerson: (participantId: string) => Promise<void>;
  onRenamePerson: (participantId: ParticipantId, newName: string) => Promise<void>;
  onRecordSettlement: (from: string, to: string, amountCents: number, date: string, note?: string) => Promise<void>;
  onDeleteSettlement: (settlementId: string) => Promise<void>;
}

export function PeoplePage({
  householdMembers,
  externalPeople,
  archivedExternalPeople,
  allParticipants,
  transactions,
  settlements,
  onAddPerson,
  onArchivePerson,
  onUnarchivePerson,
  onRenamePerson,
  onRecordSettlement,
  onDeleteSettlement,
}: PeoplePageProps) {
  const [showAddPersonForm, setShowAddPersonForm] = useState(false);
  const [showSettlementForm, setShowSettlementForm] = useState(false);
  const [showArchivedPeople, setShowArchivedPeople] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingSettlementId, setDeletingSettlementId] = useState<string | null>(null);
  const [editingPersonId, setEditingPersonId] = useState<ParticipantId | null>(null);

  // Use allParticipants (including archived) for balance calculations
  // This ensures archived participants are resolvable for historical transactions

  const householdBalance = useMemo(() => {
    const memberIds = householdMembers.map((m) => m.id);
    return calculateHouseholdBalance(memberIds, transactions, settlements, allParticipants);
  }, [householdMembers, transactions, settlements, allParticipants]);

  const renderHouseholdBalance = () => {
    const { internal, external } = householdBalance;

    // Show "Settled up" only if BOTH internal and external balances are zero
    if (internal.amountCents === 0 && external.length === 0) {
      return (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-900">Settled up</p>
          <p className="mt-1 text-sm text-emerald-700">Household members have no outstanding balances.</p>
        </div>
      );
    }

    // Show internal balance if present
    const balanceElements = [];

    if (internal.amountCents !== 0 && internal.fromParticipantId && internal.toParticipantId) {
      const fromName = allParticipants.find((p) => p.id === internal.fromParticipantId)?.name || "Unknown";
      const toName = allParticipants.find((p) => p.id === internal.toParticipantId)?.name || "Unknown";

      balanceElements.push(
        <div key="internal-balance" className="rounded-md border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm font-semibold text-blue-900">
            {fromName} owes {toName} {dollars(internal.amountCents)}
          </p>
        </div>
      );
    }

    // Show external receivables
    if (external.length > 0) {
      external.forEach((receivable) => {
        const fromName = allParticipants.find((p) => p.id === receivable.fromParticipantId)?.name || "Unknown";
        const toName = allParticipants.find((p) => p.id === receivable.toParticipantId)?.name || "Unknown";

        balanceElements.push(
          <div key={`${receivable.fromParticipantId}-${receivable.toParticipantId}`} className="rounded-md border border-blue-200 bg-blue-50 p-4">
            <p className="text-sm font-semibold text-blue-900">
              {fromName} owes {toName} {dollars(receivable.amountCents)}
            </p>
          </div>
        );
      });
    }

    return <div className="space-y-2">{balanceElements}</div>;
  };

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">People & Settlements</h1>
          <p className="mt-1 text-sm text-stone-600">Track what everyone owes and record repayments.</p>
        </div>
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      {/* Household Balance */}
      <div>{renderHouseholdBalance()}</div>

      {/* People Section */}
      <div className="rounded-md border border-stone-200 bg-white p-5">
        <h2 className="font-semibold">People</h2>

        {/* Household Members */}
        <div className="mt-4 space-y-3">
          <div>
            <h3 className="text-sm font-medium text-stone-600">Household Members</h3>
            <div className="mt-2 space-y-2">
              {householdMembers.map((member) => (
                <div key={member.id} className="flex items-center justify-between rounded-md border border-stone-100 p-3">
                  <div>
                    <p className="font-medium">{member.name}</p>
                    <p className="text-xs text-stone-500">Household</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* External People */}
          <div className="mt-4">
            <h3 className="text-sm font-medium text-stone-600">External People</h3>
            {externalPeople.length === 0 ? (
              <p className="mt-2 text-sm text-stone-500">No external people yet.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {externalPeople.map((person) => (
                  <div key={person.id} className="flex items-center justify-between rounded-md border border-stone-100 p-3">
                    <div>
                      <p className="font-medium">{person.name}</p>
                      <p className="text-xs text-stone-500">External</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingPersonId(person.id)}
                        className="focus-ring rounded-md p-1 hover:bg-stone-100"
                        title="Edit person name"
                      >
                        <Edit2 size={16} className="text-stone-500" />
                      </button>
                      <button
                        onClick={() => onArchivePerson(person.id)}
                        className="focus-ring rounded-md p-1 hover:bg-stone-100"
                        title="Archive person"
                      >
                        <Archive size={16} className="text-stone-500" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <button
          onClick={() => setShowAddPersonForm(true)}
          className="focus-ring mt-4 inline-flex items-center gap-2 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-medium hover:bg-stone-50"
        >
          <Plus size={16} />
          Add Person
        </button>

        {/* Archived People Toggle */}
        {archivedExternalPeople.length > 0 && (
          <div className="mt-6 border-t border-stone-200 pt-4">
            <button
              onClick={() => setShowArchivedPeople(!showArchivedPeople)}
              className="text-sm font-medium text-stone-700 hover:text-stone-900"
            >
              {showArchivedPeople ? "Hide" : "Show"} Archived People ({archivedExternalPeople.length})
            </button>

            {showArchivedPeople && (
              <div className="mt-3 space-y-2">
                {archivedExternalPeople.map((person) => (
                  <div key={person.id} className="flex items-center justify-between rounded-md border border-stone-100 bg-stone-50 p-3">
                    <div>
                      <p className="font-medium text-stone-600">{person.name}</p>
                      <p className="text-xs text-stone-500">Archived external</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingPersonId(person.id)}
                        className="focus-ring rounded-md p-1 hover:bg-stone-100"
                        title="Edit person name"
                      >
                        <Edit2 size={16} className="text-stone-500" />
                      </button>
                      <button
                        onClick={() => onUnarchivePerson(person.id)}
                        className="focus-ring rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                      >
                        Restore
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Person Form */}
      {showAddPersonForm && (
        <AddPersonForm
          onSubmit={async (name, note) => {
            try {
              await onAddPerson(name, note);
              setShowAddPersonForm(false);
              setError(null);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Failed to add person");
            }
          }}
          onCancel={() => setShowAddPersonForm(false)}
        />
      )}

      {/* Record Settlement */}
      <div className="rounded-md border border-stone-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Record Settlement</h2>
            <p className="mt-1 text-sm text-stone-600">Record a payment between people.</p>
          </div>
          <button
            onClick={() => setShowSettlementForm(true)}
            className="focus-ring rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-medium hover:bg-stone-50"
          >
            New Settlement
          </button>
        </div>
      </div>

      {/* Settlement Form */}
      {showSettlementForm && (
        <SettlementForm
          people={allParticipants}
          onSubmit={async (from, to, amountCents, date, note) => {
            try {
              await onRecordSettlement(from, to, amountCents, date, note);
              setShowSettlementForm(false);
              setError(null);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Failed to record settlement");
            }
          }}
          onCancel={() => setShowSettlementForm(false)}
        />
      )}

      {/* Settlement History */}
      <div className="rounded-md border border-stone-200 bg-white p-5">
        <h2 className="font-semibold">Settlement History</h2>
        {settlements.length === 0 ? (
          <p className="mt-3 text-sm text-stone-600">No settlements recorded yet.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {settlements.map((settlement) => {
              const fromName = allParticipants.find((p) => p.id === settlement.fromParticipantId)?.name || "Unknown";
              const toName = allParticipants.find((p) => p.id === settlement.toParticipantId)?.name || "Unknown";

              return (
                <div key={settlement.id} className="flex items-start justify-between border-b border-stone-100 py-2 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {fromName} paid {toName} {dollars(settlement.amountCents)}
                    </p>
                    <p className="text-xs text-stone-500">{settlement.date}</p>
                    {settlement.notes && <p className="mt-1 text-xs text-stone-600">{settlement.notes}</p>}
                  </div>
                  <button
                    onClick={() => setDeletingSettlementId(settlement.id)}
                    className="focus-ring ml-3 rounded-md p-1 hover:bg-red-50"
                    title="Delete settlement"
                  >
                    <Trash2 size={16} className="text-stone-500 hover:text-red-600" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog for Settlement */}
      {deletingSettlementId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="rounded-lg border border-stone-200 bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold">Delete Settlement?</h3>
            <p className="mt-2 text-sm text-stone-600">This action cannot be undone. The settlement will be permanently deleted.</p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={async () => {
                  try {
                    await onDeleteSettlement(deletingSettlementId);
                    setDeletingSettlementId(null);
                    setError(null);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Failed to delete settlement");
                    setDeletingSettlementId(null);
                  }
                }}
                className="focus-ring rounded-md border border-red-600 bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Delete
              </button>
              <button
                onClick={() => setDeletingSettlementId(null)}
                className="focus-ring rounded-md border border-stone-300 px-3 py-2 text-sm font-medium hover:bg-stone-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Person Dialog */}
      {editingPersonId && (
        <EditPersonDialog
          person={externalPeople.find((p) => p.id === editingPersonId) || archivedExternalPeople.find((p) => p.id === editingPersonId)!}
          onSubmit={async (newName) => {
            try {
              await onRenamePerson(editingPersonId, newName);
              setEditingPersonId(null);
              setError(null);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Failed to rename person");
            }
          }}
          onCancel={() => {
            setEditingPersonId(null);
            setError(null);
          }}
        />
      )}
    </section>
  );
}

function AddPersonForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (name: string, note?: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    try {
      await onSubmit(name.trim(), note.trim() || undefined);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-md border border-stone-200 bg-white p-5">
      <h3 className="font-semibold">Add External Person</h3>
      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <div>
          <label className="block text-sm font-medium text-stone-700">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Person's name"
            className="focus-ring mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
            disabled={loading}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700">Note (optional)</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g., office friend, roommate"
            className="focus-ring mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
            disabled={loading}
          />
        </div>
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={!name.trim() || loading}
            className="focus-ring rounded-md border border-emerald-600 bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {loading ? "Adding..." : "Add Person"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="focus-ring rounded-md border border-stone-300 px-3 py-2 text-sm font-medium hover:bg-stone-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function SettlementForm({
  people,
  onSubmit,
  onCancel,
}: {
  people: Participant[];
  onSubmit: (from: string, to: string, amountCents: number, date: string, note?: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  // Filter out archived people from settlement form
  const activeParticipants = people.filter(p => !p.archivedAt);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromId || !toId || fromId === toId || !amountInput.trim()) return;

    const amount = parseInt(amountInput.replace(/[^\d]/g, ""), 10);
    if (amount <= 0) return;

    setLoading(true);
    try {
      await onSubmit(fromId, toId, amount, date, note.trim() || undefined);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-md border border-stone-200 bg-white p-5">
      <h3 className="font-semibold">Record Settlement</h3>
      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-stone-700">From</label>
            <select
              value={fromId}
              onChange={(e) => setFromId(e.target.value)}
              className="focus-ring mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
              disabled={loading}
            >
              <option value="">Select person</option>
              {activeParticipants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700">To</label>
            <select
              value={toId}
              onChange={(e) => setToId(e.target.value)}
              className="focus-ring mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
              disabled={loading}
            >
              <option value="">Select person</option>
              {activeParticipants.map((p) => (
                <option key={p.id} value={p.id} disabled={p.id === fromId}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-700">Amount</label>
          <input
            type="text"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            placeholder="$0.00"
            className="focus-ring mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
            disabled={loading}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-700">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="focus-ring mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
            disabled={loading}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-700">Note (optional)</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g., September payment"
            className="focus-ring mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
            disabled={loading}
          />
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={!fromId || !toId || fromId === toId || !amountInput.trim() || loading}
            className="focus-ring rounded-md border border-emerald-600 bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {loading ? "Recording..." : "Record Settlement"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="focus-ring rounded-md border border-stone-300 px-3 py-2 text-sm font-medium hover:bg-stone-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function EditPersonDialog({
  person,
  onSubmit,
  onCancel,
}: {
  person: Participant;
  onSubmit: (newName: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(person.name);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    
    if (!trimmedName) {
      return;
    }

    // If name hasn't changed, treat as no-op
    if (trimmedName === person.name) {
      onCancel();
      return;
    }

    setLoading(true);
    try {
      await onSubmit(trimmedName);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="rounded-lg border border-stone-200 bg-white p-6 shadow-lg max-w-sm">
        <h3 className="text-lg font-semibold">Edit {person.name}</h3>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-stone-700">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="focus-ring mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
              disabled={loading}
              autoFocus
            />
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={!name.trim() || loading}
              className="focus-ring rounded-md border border-emerald-600 bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {loading ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="focus-ring rounded-md border border-stone-300 px-3 py-2 text-sm font-medium hover:bg-stone-50"
              disabled={loading}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
