import "@testing-library/jest-dom/vitest";
import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { parseMoney } from "../../src/domain/money/money.ts";
import { categoryId, participantId, transactionId } from "../../src/domain/shared/ids.ts";
import type { Participant } from "../../src/domain/shared/types.ts";
import type { Transaction } from "../../src/domain/ledger/transaction.ts";
import { PeoplePage } from "../../src/ui/pages/PeoplePage.tsx";

const gowriId = participantId("people_gowri");
const nathanielId = participantId("people_nathaniel");
const testFriendId = participantId("people_test_friend");
const groceriesId = categoryId("people_groceries");

const participants: Participant[] = [
  { id: gowriId, name: "Gowri", kind: "household-member", memberKey: "gowri" },
  { id: nathanielId, name: "Nathaniel", kind: "household-member", memberKey: "nathaniel" },
  { id: testFriendId, name: "Test Friend", kind: "external" },
];

describe("PeoplePage", () => {
  test("External payer: Shows all external receivables, not just internal", () => {
    // Create transaction: Test Friend pays $3.00
    // Allocations: Gowri $1, Nathaniel $1, Test Friend $1
    const transaction: Transaction = {
      id: transactionId("people_external_payer_test"),
      kind: "expense",
      date: "2026-10-03",
      description: "Test transaction",
      totalCents: parseMoney("3.00"),
      categoryId: groceriesId,
      payerParticipantId: testFriendId,
      scope: "shared",
      allocations: [
        { participantId: gowriId, amountCents: parseMoney("1.00") },
        { participantId: nathanielId, amountCents: parseMoney("1.00") },
        { participantId: testFriendId, amountCents: parseMoney("1.00") },
      ],
    };

    const householdMembers = participants.filter((p) => p.kind === "household-member");
    const externalPeople = participants.filter((p) => p.kind === "external");

    render(
      <PeoplePage
        householdMembers={householdMembers}
        externalPeople={externalPeople}
        transactions={[transaction]}
        settlements={[]}
        onAddPerson={async () => undefined}
        onArchivePerson={async () => undefined}
        onRecordSettlement={async () => undefined}
      />
    );

    // Verify external payer balances are displayed
    expect(screen.getByText(/Gowri owes Test Friend/)).toBeInTheDocument();
    expect(screen.getByText(/Nathaniel owes Test Friend/)).toBeInTheDocument();

    // "Settled up" must NOT appear when external balances exist
    expect(screen.queryByText("Settled up")).not.toBeInTheDocument();
  });

  test("Settled up only appears when all balances (internal + external) are zero", () => {
    const householdMembers = participants.filter((p) => p.kind === "household-member");
    const externalPeople = participants.filter((p) => p.kind === "external");

    render(
      <PeoplePage
        householdMembers={householdMembers}
        externalPeople={externalPeople}
        transactions={[]}
        settlements={[]}
        onAddPerson={async () => undefined}
        onArchivePerson={async () => undefined}
        onRecordSettlement={async () => undefined}
      />
    );

    // With no transactions, should show "Settled up"
    expect(screen.getByText("Settled up")).toBeInTheDocument();
    expect(screen.getByText("Household members have no outstanding balances.")).toBeInTheDocument();
  });

  test("Internal balance shows correctly when no external people", () => {
    // Gowri pays Nathaniel, then they settle it
    const transaction: Transaction = {
      id: transactionId("people_internal_test"),
      kind: "expense",
      date: "2026-10-03",
      description: "Internal transaction",
      totalCents: parseMoney("2.00"),
      categoryId: groceriesId,
      payerParticipantId: gowriId,
      scope: "shared",
      allocations: [
        { participantId: gowriId, amountCents: parseMoney("1.00") },
        { participantId: nathanielId, amountCents: parseMoney("1.00") },
      ],
    };

    const householdMembers = participants.filter((p) => p.kind === "household-member");

    render(
      <PeoplePage
        householdMembers={householdMembers}
        externalPeople={[]}
        transactions={[transaction]}
        settlements={[]}
        onAddPerson={async () => undefined}
        onArchivePerson={async () => undefined}
        onRecordSettlement={async () => undefined}
      />
    );

    // Internal balance should show
    expect(screen.getByText(/Nathaniel owes Gowri/)).toBeInTheDocument();
    expect(screen.queryByText("Settled up")).not.toBeInTheDocument();
  });
});
