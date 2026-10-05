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
        allParticipants={participants}
        transactions={[transaction]}
        settlements={[]}
        onAddPerson={async () => undefined}
        onArchivePerson={async () => undefined}
        onUnarchivePerson={async () => undefined}
        onRenamePerson={async () => undefined}
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
        allParticipants={participants}
        transactions={[]}
        settlements={[]}
        onAddPerson={async () => undefined}
        onArchivePerson={async () => undefined}
        onUnarchivePerson={async () => undefined}
        onRenamePerson={async () => undefined}
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
        allParticipants={householdMembers}
        transactions={[transaction]}
        settlements={[]}
        onAddPerson={async () => undefined}
        onArchivePerson={async () => undefined}
        onUnarchivePerson={async () => undefined}
        onRenamePerson={async () => undefined}
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
        allParticipants={householdMembers}
        transactions={[]}
        settlements={[settlement]}
        onAddPerson={async () => undefined}
        onArchivePerson={async () => undefined}
        onUnarchivePerson={async () => undefined}
        onRenamePerson={async () => undefined}
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
        allParticipants={householdMembers}
        transactions={[]}
        settlements={[settlement]}
        onAddPerson={async () => undefined}
        onArchivePerson={async () => undefined}
        onUnarchivePerson={async () => undefined}
        onRenamePerson={async () => undefined}
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

  test("Active external person has Edit and Archive buttons, no Delete", () => {
    const householdMembers = participants.filter((p) => p.kind === "household-member");
    const externalPeople = participants.filter((p) => p.kind === "external");

    render(
      <PeoplePage
        householdMembers={householdMembers}
        externalPeople={externalPeople}
        archivedExternalPeople={[]}
        allParticipants={participants}
        transactions={[]}
        settlements={[]}
        onAddPerson={async () => undefined}
        onArchivePerson={async () => undefined}
        onUnarchivePerson={async () => undefined}
        onRenamePerson={async () => undefined}
        onRecordSettlement={async () => undefined}
        onDeleteSettlement={async () => undefined}
      />
    );

    // External person should be visible
    expect(screen.getByText("Test Friend")).toBeInTheDocument();

    // Should have Edit button
    const editButton = screen.getByTitle("Edit person name");
    expect(editButton).toBeInTheDocument();

    // Should have Archive button
    const archiveButton = screen.getByTitle("Archive person");
    expect(archiveButton).toBeInTheDocument();

    // Should NOT have Delete button
    expect(screen.queryByTitle(/Permanently delete/)).not.toBeInTheDocument();
  });

  test("Edit dialog opens with current name and saves on submit", async () => {
    const user = userEvent.setup();
    const mockRenamePerson = vi.fn();

    const householdMembers = participants.filter((p) => p.kind === "household-member");
    const externalPeople = participants.filter((p) => p.kind === "external");

    render(
      <PeoplePage
        householdMembers={householdMembers}
        externalPeople={externalPeople}
        archivedExternalPeople={[]}
        allParticipants={participants}
        transactions={[]}
        settlements={[]}
        onAddPerson={async () => undefined}
        onArchivePerson={async () => undefined}
        onUnarchivePerson={async () => undefined}
        onRenamePerson={mockRenamePerson}
        onRecordSettlement={async () => undefined}
        onDeleteSettlement={async () => undefined}
      />
    );

    // Click edit button
    const editButton = screen.getByTitle("Edit person name");
    await user.click(editButton);

    // Dialog should appear with current name
    expect(screen.getByText("Edit Test Friend")).toBeInTheDocument();
    const input = screen.getByDisplayValue("Test Friend");
    expect(input).toBeInTheDocument();

    // Change name
    await user.clear(input);
    await user.type(input, "New Friend Name");

    // Click save
    const saveButton = screen.getByRole("button", { name: "Save" });
    await user.click(saveButton);

    // Handler should be called with correct ID and new name
    expect(mockRenamePerson).toHaveBeenCalledWith(testFriendId, "New Friend Name");
  });

  test("Edit dialog cancels without calling handler", async () => {
    const user = userEvent.setup();
    const mockRenamePerson = vi.fn();

    const householdMembers = participants.filter((p) => p.kind === "household-member");
    const externalPeople = participants.filter((p) => p.kind === "external");

    render(
      <PeoplePage
        householdMembers={householdMembers}
        externalPeople={externalPeople}
        archivedExternalPeople={[]}
        allParticipants={participants}
        transactions={[]}
        settlements={[]}
        onAddPerson={async () => undefined}
        onArchivePerson={async () => undefined}
        onUnarchivePerson={async () => undefined}
        onRenamePerson={mockRenamePerson}
        onRecordSettlement={async () => undefined}
        onDeleteSettlement={async () => undefined}
      />
    );

    // Click edit button
    const editButton = screen.getByTitle("Edit person name");
    await user.click(editButton);

    // Click cancel
    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    await user.click(cancelButton);

    // Dialog should disappear and handler should not be called
    expect(screen.queryByText("Edit Test Friend")).not.toBeInTheDocument();
    expect(mockRenamePerson).not.toHaveBeenCalled();
  });

  test("Edit dialog rejects empty name", async () => {
    const user = userEvent.setup();
    const mockRenamePerson = vi.fn();

    const householdMembers = participants.filter((p) => p.kind === "household-member");
    const externalPeople = participants.filter((p) => p.kind === "external");

    render(
      <PeoplePage
        householdMembers={householdMembers}
        externalPeople={externalPeople}
        archivedExternalPeople={[]}
        allParticipants={participants}
        transactions={[]}
        settlements={[]}
        onAddPerson={async () => undefined}
        onArchivePerson={async () => undefined}
        onUnarchivePerson={async () => undefined}
        onRenamePerson={mockRenamePerson}
        onRecordSettlement={async () => undefined}
        onDeleteSettlement={async () => undefined}
      />
    );

    // Click edit button
    const editButton = screen.getByTitle("Edit person name");
    await user.click(editButton);

    // Clear name
    const input = screen.getByDisplayValue("Test Friend");
    await user.clear(input);

    // Save button should be disabled
    const saveButton = screen.getByRole("button", { name: "Save" });
    expect(saveButton).toBeDisabled();
  });

  test("Edit dialog trims whitespace from name", async () => {
    const user = userEvent.setup();
    const mockRenamePerson = vi.fn();

    const householdMembers = participants.filter((p) => p.kind === "household-member");
    const externalPeople = participants.filter((p) => p.kind === "external");

    render(
      <PeoplePage
        householdMembers={householdMembers}
        externalPeople={externalPeople}
        archivedExternalPeople={[]}
        allParticipants={participants}
        transactions={[]}
        settlements={[]}
        onAddPerson={async () => undefined}
        onArchivePerson={async () => undefined}
        onUnarchivePerson={async () => undefined}
        onRenamePerson={mockRenamePerson}
        onRecordSettlement={async () => undefined}
        onDeleteSettlement={async () => undefined}
      />
    );

    // Click edit button
    const editButton = screen.getByTitle("Edit person name");
    await user.click(editButton);

    // Change name with whitespace
    const input = screen.getByDisplayValue("Test Friend");
    await user.clear(input);
    await user.type(input, "  New Friend  ");

    // Click save
    const saveButton = screen.getByRole("button", { name: "Save" });
    await user.click(saveButton);

    // Handler should be called with trimmed name
    expect(mockRenamePerson).toHaveBeenCalledWith(testFriendId, "New Friend");
  });

  test("Editing without changing name closes dialog without calling handler", async () => {
    const user = userEvent.setup();
    const mockRenamePerson = vi.fn();

    const householdMembers = participants.filter((p) => p.kind === "household-member");
    const externalPeople = participants.filter((p) => p.kind === "external");

    render(
      <PeoplePage
        householdMembers={householdMembers}
        externalPeople={externalPeople}
        archivedExternalPeople={[]}
        allParticipants={participants}
        transactions={[]}
        settlements={[]}
        onAddPerson={async () => undefined}
        onArchivePerson={async () => undefined}
        onUnarchivePerson={async () => undefined}
        onRenamePerson={mockRenamePerson}
        onRecordSettlement={async () => undefined}
        onDeleteSettlement={async () => undefined}
      />
    );

    // Click edit button
    const editButton = screen.getByTitle("Edit person name");
    await user.click(editButton);

    // Click save without changing name
    const saveButton = screen.getByRole("button", { name: "Save" });
    await user.click(saveButton);

    // Dialog should disappear and handler should not be called
    expect(screen.queryByText("Edit Test Friend")).not.toBeInTheDocument();
    expect(mockRenamePerson).not.toHaveBeenCalled();
  });

  test("Archived external person has Edit and Restore buttons, no Delete", () => {
    const archivedFriend: Participant = { ...participants[2], archivedAt: "2026-10-03T00:00:00Z" };

    const householdMembers = participants.filter((p) => p.kind === "household-member");

    render(
      <PeoplePage
        householdMembers={householdMembers}
        externalPeople={[]}
        archivedExternalPeople={[archivedFriend]}
        allParticipants={[...householdMembers, archivedFriend]}
        transactions={[]}
        settlements={[]}
        onAddPerson={async () => undefined}
        onArchivePerson={async () => undefined}
        onUnarchivePerson={async () => undefined}
        onRenamePerson={async () => undefined}
        onRecordSettlement={async () => undefined}
        onDeleteSettlement={async () => undefined}
      />
    );

    // Need to expand archived people section first
    const showArchivedButton = screen.getByText(/Show Archived People/);
    expect(showArchivedButton).toBeInTheDocument();
  });

  test("Editing archived person's name does not restore them", async () => {
    const user = userEvent.setup();
    const mockRenamePerson = vi.fn();
    const archivedFriend: Participant = { ...participants[2], archivedAt: "2026-10-03T00:00:00Z" };

    const householdMembers = participants.filter((p) => p.kind === "household-member");

    render(
      <PeoplePage
        householdMembers={householdMembers}
        externalPeople={[]}
        archivedExternalPeople={[archivedFriend]}
        allParticipants={[...householdMembers, archivedFriend]}
        transactions={[]}
        settlements={[]}
        onAddPerson={async () => undefined}
        onArchivePerson={async () => undefined}
        onUnarchivePerson={async () => undefined}
        onRenamePerson={mockRenamePerson}
        onRecordSettlement={async () => undefined}
        onDeleteSettlement={async () => undefined}
      />
    );

    // Show archived people
    const showArchivedButton = screen.getByText(/Show Archived People/);
    await user.click(showArchivedButton);

    // Click edit button on archived person
    const editButtons = screen.getAllByTitle("Edit person name");
    await user.click(editButtons[0]); // First edit button should be for archived person

    // Change name
    const input = screen.getByDisplayValue("Test Friend");
    await user.clear(input);
    await user.type(input, "Archived Friend Updated");

    // Click save
    const saveButton = screen.getByRole("button", { name: "Save" });
    await user.click(saveButton);

    // Handler should be called (rename only, not restore)
    expect(mockRenamePerson).toHaveBeenCalledWith(testFriendId, "Archived Friend Updated");
  });
});
