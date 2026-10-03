import "@testing-library/jest-dom/vitest";
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { parseMoney } from "../../src/domain/money/money.ts";
import { categoryId, participantId, transactionId, settlementId } from "../../src/domain/shared/ids.ts";
import type { Participant } from "../../src/domain/shared/types.ts";
import type { Transaction } from "../../src/domain/ledger/transaction.ts";
import type { Settlement } from "../../src/domain/settlement/settlement.ts";
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
        archivedExternalPeople={[]}
        transactions={[transaction]}
        settlements={[]}
        onAddPerson={async () => undefined}
        onArchivePerson={async () => undefined}
        onUnarchivePerson={async () => undefined}
        onRecordSettlement={async () => undefined}
        onDeleteSettlement={async () => undefined}
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
        archivedExternalPeople={[]}
        transactions={[]}
        settlements={[]}
        onAddPerson={async () => undefined}
        onArchivePerson={async () => undefined}
        onUnarchivePerson={async () => undefined}
        onRecordSettlement={async () => undefined}
        onDeleteSettlement={async () => undefined}
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
        archivedExternalPeople={[]}
        transactions={[transaction]}
        settlements={[]}
        onAddPerson={async () => undefined}
        onArchivePerson={async () => undefined}
        onUnarchivePerson={async () => undefined}
        onRecordSettlement={async () => undefined}
        onDeleteSettlement={async () => undefined}
      />
    );

    // Internal balance should show
    expect(screen.getByText(/Nathaniel owes Gowri/)).toBeInTheDocument();
    expect(screen.queryByText("Settled up")).not.toBeInTheDocument();
  });

  test("Delete settlement shows confirmation dialog and calls handler", async () => {
    const user = userEvent.setup();
    const mockDeleteSettlement = vi.fn();

    const settlement: Settlement = {
      id: settlementId("settlement_test_delete"),
      fromParticipantId: gowriId,
      toParticipantId: nathanielId,
      amountCents: parseMoney("50.00"),
      date: "2026-10-03",
      type: "internal",
      notes: "Test settlement",
    };

    const householdMembers = participants.filter((p) => p.kind === "household-member");

    render(
      <PeoplePage
        householdMembers={householdMembers}
        externalPeople={[]}
        archivedExternalPeople={[]}
        transactions={[]}
        settlements={[settlement]}
        onAddPerson={async () => undefined}
        onArchivePerson={async () => undefined}
        onUnarchivePerson={async () => undefined}
        onRecordSettlement={async () => undefined}
        onDeleteSettlement={mockDeleteSettlement}
      />
    );

    // Settlement should be visible
    expect(screen.getByText("Gowri paid Nathaniel $50.00")).toBeInTheDocument();

    // Click delete button
    const deleteButton = screen.getByTitle("Delete settlement");
    await user.click(deleteButton);

    // Confirmation dialog should appear
    expect(screen.getByText("Delete Settlement?")).toBeInTheDocument();
    expect(screen.getByText("This action cannot be undone. The settlement will be permanently deleted.")).toBeInTheDocument();

    // Click confirm delete
    const confirmButton = screen.getByRole("button", { name: "Delete" });
    await user.click(confirmButton);

    // Handler should be called with correct settlement ID
    expect(mockDeleteSettlement).toHaveBeenCalledWith(settlement.id);
  });

  test("Delete settlement cancels on cancel button", async () => {
    const user = userEvent.setup();
    const mockDeleteSettlement = vi.fn();

    const settlement: Settlement = {
      id: settlementId("settlement_test_cancel"),
      fromParticipantId: gowriId,
      toParticipantId: nathanielId,
      amountCents: parseMoney("30.00"),
      date: "2026-10-03",
      type: "internal",
    };

    const householdMembers = participants.filter((p) => p.kind === "household-member");

    render(
      <PeoplePage
        householdMembers={householdMembers}
        externalPeople={[]}
        archivedExternalPeople={[]}
        transactions={[]}
        settlements={[settlement]}
        onAddPerson={async () => undefined}
        onArchivePerson={async () => undefined}
        onUnarchivePerson={async () => undefined}
        onRecordSettlement={async () => undefined}
        onDeleteSettlement={mockDeleteSettlement}
      />
    );

    // Click delete button
    const deleteButton = screen.getByTitle("Delete settlement");
    await user.click(deleteButton);

    // Click cancel
    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    await user.click(cancelButton);

    // Dialog should disappear and handler should not be called
    expect(screen.queryByText("Delete Settlement?")).not.toBeInTheDocument();
    expect(mockDeleteSettlement).not.toHaveBeenCalled();
  });
});
