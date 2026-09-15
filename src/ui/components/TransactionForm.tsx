import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Transaction } from "../../domain/ledger/transaction.ts";
import type { CategoryId, Participant, ParticipantId } from "../../domain/shared/types.ts";
import { parseMoney, sumCents } from "../../domain/money/money.ts";
import type {
  DraftAllocationInput,
  SplitMode,
  TransactionDraft,
  TransactionPreview,
  TransactionReferenceData,
} from "../../application/use-cases/transactions/types.ts";
import { dollars } from "../format.ts";

interface TransactionFormProps {
  referenceData: TransactionReferenceData;
  initialTransaction?: Transaction;
  preview: (draft: TransactionDraft, existingId?: Transaction["id"]) => Promise<TransactionPreview>;
  onSubmit: (draft: TransactionDraft, existingId?: Transaction["id"]) => Promise<void>;
  onCancel: () => void;
  onCreateExternalParticipant: (name: string) => Promise<Participant>;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyDraft(referenceData: TransactionReferenceData): TransactionDraft {
  const firstHouseholdMember = referenceData.householdMembers[0];
  const firstSharedCategory =
    referenceData.categories.find((category) => category.scope === "shared") ?? referenceData.categories[0];

  return {
    date: today(),
    description: "",
    categoryId: firstSharedCategory?.id as CategoryId,
    payerParticipantId: firstHouseholdMember?.id,
    scope: "shared",
    totalAmountInput: "",
    splitMode: "EQUAL_HOUSEHOLD",
    allocations: [],
  };
}

function draftFromTransaction(transaction: Transaction): TransactionDraft {
  return {
    date: transaction.date,
    description: transaction.description,
    categoryId: transaction.categoryId,
    payerParticipantId: transaction.payerParticipantId,
    paymentMethodId: transaction.paymentMethodId,
    notes: transaction.notes,
    scope: transaction.scope,
    personalOwnerParticipantId:
      transaction.scope === "personal" ? transaction.allocations[0]?.participantId : undefined,
    totalAmountInput: (transaction.totalCents / 100).toFixed(2),
    splitMode: transaction.scope === "personal" ? "PERSONAL" : "CUSTOM_AMOUNT",
    allocations: transaction.allocations.map((allocation) => ({
      participantId: allocation.participantId,
      amountInput: (allocation.amountCents / 100).toFixed(2),
    })),
  };
}

function labelForParticipant(participants: readonly Participant[], participantId: ParticipantId): string {
  return participants.find((participant) => participant.id === participantId)?.name ?? "Unknown";
}

export function TransactionForm({
  referenceData,
  initialTransaction,
  preview,
  onSubmit,
  onCancel,
  onCreateExternalParticipant,
}: TransactionFormProps) {
  const [draft, setDraft] = useState<TransactionDraft>(() =>
    initialTransaction ? draftFromTransaction(initialTransaction) : emptyDraft(referenceData),
  );
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [transactionPreview, setTransactionPreview] = useState<TransactionPreview | null>(null);
  const [newFriendName, setNewFriendName] = useState("");
  const [inlineParticipants, setInlineParticipants] = useState<Participant[]>([]);
  const participants = useMemo(
    () => [
      ...referenceData.participants,
      ...inlineParticipants.filter(
        (inlineParticipant) =>
          !referenceData.participants.some((participant) => participant.id === inlineParticipant.id),
      ),
    ],
    [inlineParticipants, referenceData.participants],
  );

  const categoriesForScope = useMemo(
    () => referenceData.categories.filter((category) => category.scope === draft.scope && !category.archived),
    [draft.scope, referenceData.categories],
  );
  const paymentMethods = useMemo(
    () =>
      referenceData.paymentMethods.slice().sort((left, right) => {
        const leftBelongs = left.ownerParticipantId === draft.payerParticipantId ? 0 : 1;
        const rightBelongs = right.ownerParticipantId === draft.payerParticipantId ? 0 : 1;
        return leftBelongs - rightBelongs || left.name.localeCompare(right.name);
      }),
    [draft.payerParticipantId, referenceData.paymentMethods],
  );

  useEffect(() => {
    if (!categoriesForScope.some((category) => category.id === draft.categoryId) && categoriesForScope[0]) {
      setDraft((current) => ({ ...current, categoryId: categoriesForScope[0].id }));
    }
  }, [categoriesForScope, draft.categoryId]);

  useEffect(() => {
    let cancelled = false;

    preview(draft, initialTransaction?.id)
      .then((result) => {
        if (!cancelled) {
          setTransactionPreview(result);
          setFieldError(null);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setTransactionPreview(null);
          setFieldError(caught instanceof Error ? caught.message : "Check the transaction details");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [draft, initialTransaction?.id, preview]);

  const allocatedAmount = useMemo(() => {
    if (draft.splitMode !== "CUSTOM_AMOUNT") {
      return null;
    }

    try {
      return sumCents(draft.allocations.map((allocation) => parseMoney(allocation.amountInput ?? "0")));
    } catch {
      return null;
    }
  }, [draft.allocations, draft.splitMode]);

  const remainingAmount = useMemo(() => {
    if (allocatedAmount === null) {
      return null;
    }

    try {
      return parseMoney(draft.totalAmountInput) - allocatedAmount;
    } catch {
      return null;
    }
  }, [allocatedAmount, draft.totalAmountInput]);

  function update(partial: Partial<TransactionDraft>) {
    setError(null);
    setDraft((current) => ({ ...current, ...partial }));
  }

  function setScope(scope: "shared" | "personal") {
    const firstMember = referenceData.householdMembers[0];
    update({
      scope,
      splitMode: scope === "personal" ? "PERSONAL" : "EQUAL_HOUSEHOLD",
      personalOwnerParticipantId: scope === "personal" ? firstMember?.id : undefined,
      allocations: [],
    });
  }

  function addAllocation(participantId: ParticipantId) {
    setDraft((current) => ({
      ...current,
      allocations: [
        ...current.allocations,
        current.splitMode === "CUSTOM_PERCENTAGE"
          ? { participantId, percentageInput: "0" }
          : { participantId, amountInput: "0" },
      ],
    }));
  }

  async function addFriend() {
    const friend = await onCreateExternalParticipant(newFriendName);
    setInlineParticipants((current) => [...current, friend]);
    setNewFriendName("");
    addAllocation(friend.id);
  }

  function updateAllocation(index: number, partial: Partial<DraftAllocationInput>) {
    setDraft((current) => ({
      ...current,
      allocations: current.allocations.map((allocation, allocationIndex) =>
        allocationIndex === index ? { ...allocation, ...partial } : allocation,
      ),
    }));
  }

  function removeAllocation(index: number) {
    setDraft((current) => ({
      ...current,
      allocations: current.allocations.filter((_, allocationIndex) => allocationIndex !== index),
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await onSubmit(draft, initialTransaction?.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Transaction could not be saved");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Date
            <input
              className="focus-ring mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2"
              type="date"
              value={draft.date}
              onChange={(event) => update({ date: event.target.value })}
              required
            />
          </label>
          <label className="block text-sm font-medium">
            Amount
            <input
              className="focus-ring mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2"
              inputMode="decimal"
              value={draft.totalAmountInput}
              onChange={(event) => update({ totalAmountInput: event.target.value })}
              placeholder="40.00"
              aria-describedby="amount-error"
              required
            />
          </label>
        </div>
        <label className="block text-sm font-medium">
          Description
          <input
            className="focus-ring mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2"
            value={draft.description}
            onChange={(event) => update({ description: event.target.value })}
            placeholder="Fuel, groceries, dinner..."
            required
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Scope
            <select
              className="focus-ring mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2"
              value={draft.scope}
              onChange={(event) => setScope(event.target.value as "shared" | "personal")}
            >
              <option value="shared">Shared</option>
              <option value="personal">Personal</option>
            </select>
          </label>
          <label className="block text-sm font-medium">
            Category
            <select
              className="focus-ring mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2"
              value={draft.categoryId}
              onChange={(event) => update({ categoryId: event.target.value as CategoryId })}
            >
              {categoriesForScope.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Payer
            <select
              className="focus-ring mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2"
              value={draft.payerParticipantId}
              onChange={(event) => update({ payerParticipantId: event.target.value as ParticipantId })}
            >
              {referenceData.householdMembers.map((participant) => (
                <option key={participant.id} value={participant.id}>
                  {participant.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Payment method
            <select
              className="focus-ring mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2"
              value={draft.paymentMethodId ?? ""}
              onChange={(event) =>
                update({ paymentMethodId: event.target.value ? (event.target.value as TransactionDraft["paymentMethodId"]) : undefined })
              }
            >
              <option value="">None</option>
              {paymentMethods.map((method) => (
                <option key={method.id} value={method.id}>
                  {method.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {draft.scope === "personal" ? (
          <fieldset className="rounded-md border border-stone-200 p-4">
            <legend className="px-1 text-sm font-semibold">Whose expense?</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {referenceData.householdMembers.map((participant) => (
                <label key={participant.id} className="flex items-center gap-2 rounded-md border border-stone-200 p-3">
                  <input
                    type="radio"
                    name="personal-owner"
                    checked={draft.personalOwnerParticipantId === participant.id}
                    onChange={() => update({ personalOwnerParticipantId: participant.id })}
                  />
                  {participant.name}
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          <fieldset className="rounded-md border border-stone-200 p-4">
            <legend className="px-1 text-sm font-semibold">Split</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["EQUAL_HOUSEHOLD", "CUSTOM_AMOUNT", "CUSTOM_PERCENTAGE"] as SplitMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`focus-ring rounded-md border px-3 py-2 text-sm ${
                    draft.splitMode === mode ? "border-emerald-900 bg-emerald-900 text-white" : "border-stone-300"
                  }`}
                  onClick={() =>
                    update({
                      splitMode: mode,
                      allocations:
                        mode === "EQUAL_HOUSEHOLD"
                          ? []
                          : referenceData.householdMembers.map((member) => ({
                              participantId: member.id,
                              ...(mode === "CUSTOM_AMOUNT" ? { amountInput: "0" } : { percentageInput: "0" }),
                            })),
                    })
                  }
                >
                  {mode === "EQUAL_HOUSEHOLD" ? "Equal Split" : mode === "CUSTOM_AMOUNT" ? "Custom Amount" : "Custom %"}
                </button>
              ))}
            </div>
            {draft.splitMode !== "EQUAL_HOUSEHOLD" ? (
              <div className="mt-4 space-y-2">
                {draft.allocations.map((allocation, index) => (
                  <div key={`${allocation.participantId}-${index}`} className="grid grid-cols-[minmax(0,1fr)_104px_42px] gap-2 sm:grid-cols-[minmax(0,1fr)_120px_44px]">
                    <select
                      aria-label={`Participant ${index + 1}`}
                      className="focus-ring rounded-md border border-stone-300 bg-white px-3 py-2"
                      value={allocation.participantId}
                      onChange={(event) => updateAllocation(index, { participantId: event.target.value as ParticipantId })}
                    >
                      {participants.map((participant) => (
                        <option key={participant.id} value={participant.id}>
                          {participant.name}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label={draft.splitMode === "CUSTOM_AMOUNT" ? "Allocation amount" : "Allocation percent"}
                      className="focus-ring rounded-md border border-stone-300 px-3 py-2"
                      inputMode="decimal"
                      value={draft.splitMode === "CUSTOM_AMOUNT" ? allocation.amountInput ?? "" : allocation.percentageInput ?? ""}
                      onChange={(event) =>
                        updateAllocation(
                          index,
                          draft.splitMode === "CUSTOM_AMOUNT"
                            ? { amountInput: event.target.value }
                            : { percentageInput: event.target.value },
                        )
                      }
                    />
                    <button
                      type="button"
                      aria-label="Remove allocation"
                      className="focus-ring rounded-md border border-stone-300 p-2"
                      onClick={() => removeAllocation(index)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                <div className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
                  <button
                    type="button"
                    className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-stone-300 px-3 py-2 text-sm"
                    onClick={() => addAllocation(referenceData.householdMembers[0].id)}
                  >
                    <Plus size={16} /> Add allocation
                  </button>
                  <input
                    aria-label="New friend name"
                    className="focus-ring min-h-10 rounded-md border border-stone-300 px-3 py-2 text-sm"
                    placeholder="Friend name"
                    value={newFriendName}
                    onChange={(event) => setNewFriendName(event.target.value)}
                  />
                  <button
                    type="button"
                    className="focus-ring min-h-10 rounded-md bg-stone-900 px-3 py-2 text-sm text-white disabled:opacity-50"
                    onClick={addFriend}
                    disabled={!newFriendName.trim()}
                  >
                    Add friend
                  </button>
                </div>
                {remainingAmount !== null ? (
                  <p className="text-sm text-stone-700">
                    Allocated: {allocatedAmount !== null ? dollars(allocatedAmount) : "--"} | Remaining to allocate:{" "}
                    {dollars(remainingAmount as ReturnType<typeof parseMoney>)}
                  </p>
                ) : null}
              </div>
            ) : null}
          </fieldset>
        )}
        <label className="block text-sm font-medium">
          Notes
          <textarea
            className="focus-ring mt-1 min-h-20 w-full rounded-md border border-stone-300 bg-white px-3 py-2"
            value={draft.notes ?? ""}
            onChange={(event) => update({ notes: event.target.value })}
          />
        </label>
        <div id="amount-error" aria-live="polite" className="min-h-5 text-sm text-red-700">
          {error ?? fieldError}
        </div>
        <div className="grid gap-2 sm:flex sm:flex-wrap sm:justify-end">
          <button type="button" className="focus-ring min-h-11 rounded-md border border-stone-300 px-4 py-2" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || Boolean(fieldError)}
            className="focus-ring min-h-11 rounded-md bg-emerald-900 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving..." : initialTransaction ? "Save Changes" : "Add Transaction"}
          </button>
        </div>
      </div>
      <aside className="rounded-md border border-stone-200 bg-stone-50 p-4">
        <h3 className="font-semibold">Preview</h3>
        {transactionPreview ? (
          <div className="mt-3 space-y-3 text-sm">
            <p className="text-lg font-semibold">{dollars(transactionPreview.transaction.totalCents)}</p>
            <div>
              <p className="font-medium">Paid by</p>
              <p>{labelForParticipant(participants, transactionPreview.transaction.payerParticipantId)}</p>
            </div>
            <div>
              <p className="font-medium">Split</p>
              <ul className="mt-1 space-y-1">
                {transactionPreview.transaction.allocations.map((allocation) => (
                  <li key={allocation.participantId} className="flex justify-between gap-3">
                    <span>{labelForParticipant(participants, allocation.participantId)}</span>
                    <span>{dollars(allocation.amountCents)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <p>Household spending: {dollars(transactionPreview.householdSpendingCents)}</p>
            <p>Friends owe back: {dollars(transactionPreview.externalReceivableCents)}</p>
            {transactionPreview.internalBalance.amountCents > 0 ? (
              <p>
                Internal effect:{" "}
                {labelForParticipant(participants, transactionPreview.internalBalance.fromParticipantId!)} owes{" "}
                {labelForParticipant(participants, transactionPreview.internalBalance.toParticipantId!)}{" "}
                {dollars(transactionPreview.internalBalance.amountCents)}
              </p>
            ) : null}
            {transactionPreview.externalReceivables.length > 0 ? (
              <ul className="space-y-1">
                {transactionPreview.externalReceivables.map((receivable) => (
                  <li key={`${receivable.fromParticipantId}-${receivable.toParticipantId}`}>
                    {labelForParticipant(participants, receivable.fromParticipantId)} -&gt;{" "}
                    {labelForParticipant(participants, receivable.toParticipantId)}{" "}
                    {dollars(receivable.amountCents)}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-sm text-stone-600">Enter transaction details to preview the split.</p>
        )}
      </aside>
    </form>
  );
}
