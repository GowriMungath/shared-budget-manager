import { useCallback, useEffect, useState } from "react";
import type { PeopleUseCases } from "../../application/use-cases/people/peopleUseCases.ts";
import type { ParticipantId, Cents } from "../../domain/shared/types.ts";
import type { Participant } from "../../domain/shared/types.ts";
import type { Settlement } from "../../domain/settlement/settlement.ts";
import type { Transaction } from "../../domain/ledger/transaction.ts";
import { PeoplePage } from "./PeoplePage.tsx";

interface PeoplePageContainerProps {
  peopleUseCases: PeopleUseCases;
}

export function PeoplePageContainer({ peopleUseCases }: PeoplePageContainerProps) {
  const [householdMembers, setHouseholdMembers] = useState<Participant[]>([]);
  const [externalPeople, setExternalPeople] = useState<Participant[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const [members, external, settlements_] = await Promise.all([
        peopleUseCases.listHouseholdMembers(),
        peopleUseCases.listActiveExternalPeople(),
        peopleUseCases.listSettlements(),
      ]);
      setHouseholdMembers(members);
      setExternalPeople(external);
      setTransactions([]); // TODO: Load actual transactions from use-case
      setSettlements(settlements_);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [peopleUseCases]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleAddPerson = useCallback(
    async (name: string, note?: string) => {
      await peopleUseCases.createExternalPerson({ name, note });
      await loadData();
    },
    [peopleUseCases, loadData]
  );

  const handleArchivePerson = useCallback(
    async (participantId: string) => {
      await peopleUseCases.archiveParticipant(participantId as ParticipantId);
      await loadData();
    },
    [peopleUseCases, loadData]
  );

  const handleRecordSettlement = useCallback(
    async (from: string, to: string, amountCents: number, date: string, note?: string) => {
      await peopleUseCases.createSettlement({
        fromParticipantId: from as ParticipantId,
        toParticipantId: to as ParticipantId,
        amountCents: amountCents as Cents,
        date,
        notes: note,
      });
      await loadData();
    },
    [peopleUseCases, loadData]
  );

  if (loading) {
    return (
      <div className="rounded-md border border-stone-200 bg-white p-5">
        <p className="text-sm text-stone-600">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-900">{error}</p>
      </div>
    );
  }

  return (
    <PeoplePage
      householdMembers={householdMembers}
      externalPeople={externalPeople}
      transactions={transactions}
      settlements={settlements}
      onAddPerson={handleAddPerson}
      onArchivePerson={handleArchivePerson}
      onRecordSettlement={handleRecordSettlement}
    />
  );
}
