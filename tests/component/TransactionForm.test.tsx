import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { TransactionUseCases } from "../../src/application/use-cases/transactions/transactionUseCases.ts";
import type { TransactionReferenceData } from "../../src/application/use-cases/transactions/types.ts";
import type { IdService } from "../../src/application/services/idService.ts";
import type {
  CategoryRepository,
  ParticipantRepository,
  PaymentMethodRepository,
  TransactionRepository,
} from "../../src/application/ports/repositories.ts";
import { TransactionForm } from "../../src/ui/components/TransactionForm.tsx";
import { categoryId, participantId } from "../../src/domain/shared/ids.ts";
import type { Participant } from "../../src/domain/shared/types.ts";

const gowriId = participantId("component_gowri");
const nathanielId = participantId("component_nathaniel");
const shoppingCategoryId = categoryId("component_shopping");
const fuelCategoryId = categoryId("component_fuel");

const participants: Participant[] = [
  { id: gowriId, name: "Gowri", kind: "household-member", memberKey: "gowri" },
  { id: nathanielId, name: "Nathaniel", kind: "household-member", memberKey: "nathaniel" },
];

let referenceData: TransactionReferenceData;
let useCases: TransactionUseCases;

const ids: IdService = { createId: () => "component_transaction" };

function makeUseCases() {
  const participantRepository: ParticipantRepository = {
    listAll: async () => referenceData.participants,
    listActive: async () => referenceData.participants.filter((p) => !p.archivedAt),
    getById: async () => undefined,
    save: async (participant) => {
      referenceData = {
        ...referenceData,
        participants: [...referenceData.participants, participant],
        externalParticipants: [...referenceData.externalParticipants, participant],
      };
    },
    delete: async () => undefined,
  };
  const categoryRepository: CategoryRepository = {
    listAll: async () => referenceData.categories,
    save: async () => undefined,
  };
  const paymentMethodRepository: PaymentMethodRepository = {
    listAll: async () => referenceData.paymentMethods,
    save: async () => undefined,
  };
  const transactionRepository: TransactionRepository = {
    create: async () => undefined,
    update: async () => undefined,
    delete: async () => undefined,
    getById: async () => undefined,
    listByPeriod: async () => [],
    listAll: async () => [],
    hasParticipantReference: async () => false,
  };

  return new TransactionUseCases({
    transactions: transactionRepository,
    participants: participantRepository,
    categories: categoryRepository,
    paymentMethods: paymentMethodRepository,
    ids,
  });
}

function renderForm(onSubmit = vi.fn()) {
  return render(
    <TransactionForm
      referenceData={referenceData}
      preview={(draft, existingId) => useCases.preview(draft, existingId)}
      onSubmit={onSubmit}
      onCancel={vi.fn()}
    />,
  );
}

beforeEach(() => {
  referenceData = {
    participants: [...participants],  // Create a new array so mutations in tests don't affect others
    householdMembers: [...participants],
    externalParticipants: [],
    categories: [
      { id: shoppingCategoryId, name: "Shopping", groupName: "Personal", archived: false },
      { id: fuelCategoryId, name: "Fuel", groupName: "Shared", archived: false },
    ],
    paymentMethods: [],
  };
  useCases = makeUseCases();
});

describe("TransactionForm", () => {
  test("personal transaction form submits personal owner allocation", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderForm(onSubmit);

    await user.type(screen.getByLabelText(/Amount/i), "45");
    await user.type(screen.getByLabelText(/Description/i), "Shopping");
    await user.selectOptions(screen.getByLabelText(/Scope/i), "personal");
    await user.click(screen.getByLabelText("Gowri"));
    await user.click(screen.getByRole("button", { name: /Add Transaction/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      splitMode: "PERSONAL",
      personalOwnerParticipantId: gowriId,
    });
  });

  test("equal shared split previews both household members", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/Amount/i), "40");
    await user.type(screen.getByLabelText(/Description/i), "Fuel");

    await waitFor(() => expect(screen.getAllByText("Gowri").length).toBeGreaterThan(1));
    expect(screen.getAllByText("Nathaniel").length).toBeGreaterThan(1);
    expect(screen.getAllByText("$20.00")).toHaveLength(2);
  });

  test("custom split validation blocks mismatched allocations", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/Amount/i), "75");
    await user.type(screen.getByLabelText(/Description/i), "Fuel");
    await user.click(screen.getByRole("button", { name: /Custom Amount/i }));
    
    // Household members are now fixed label rows with aria-labels like "Gowri amount", "Nathaniel amount"
    const gowriAmountInput = screen.getByLabelText("Gowri amount");
    const nathanielAmountInput = screen.getByLabelText("Nathaniel amount");
    
    await user.clear(gowriAmountInput);
    await user.type(gowriAmountInput, "50");
    await user.clear(nathanielAmountInput);
    await user.type(nathanielAmountInput, "20");

    expect(await screen.findByText(/Allocations must equal/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add Transaction/i })).toBeDisabled();
  });

  test("external participant removed - no inline creation", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: /Custom Amount/i }));
    
    // The "New friend name" input and "Add friend" button should NOT exist
    expect(screen.queryByLabelText(/New friend name/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Add friend$/i })).not.toBeInTheDocument();
    
    // Instead, there should be a "No external people available" message
    expect(screen.getByText(/No external people available/i)).toBeInTheDocument();
  });

  test("invalid amount shows validation and blocks submit", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/Amount/i), "12.345");
    await user.type(screen.getByLabelText(/Description/i), "Fuel");

    expect(await screen.findByText(/Amount must be a valid dollar amount/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add Transaction/i })).toBeDisabled();
  });

  test("custom percentage shows calculated dollar preview", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/Amount/i), "0.01");
    await user.type(screen.getByLabelText(/Description/i), "Tiny split");
    await user.click(screen.getByRole("button", { name: /Custom %/i }));
    
    // Household members now have aria-labels like "Gowri percentage", "Nathaniel percentage"
    const gowriPercentInput = screen.getByLabelText("Gowri percentage");
    const nathanielPercentInput = screen.getByLabelText("Nathaniel percentage");
    
    await user.clear(gowriPercentInput);
    await user.type(gowriPercentInput, "50");
    await user.clear(nathanielPercentInput);
    await user.type(nathanielPercentInput, "50");

    const preview = await screen.findByText("Preview");
    const previewPanel = preview.closest("aside");
    expect(previewPanel).not.toBeNull();
    expect(within(previewPanel!).getAllByText("$0.01").length).toBeGreaterThan(0);
    expect(within(previewPanel!).getAllByText("$0.00").length).toBeGreaterThan(0);
  });

  test("external participant can be selected as payer", async () => {
    const user = userEvent.setup();
    const externalPihu = { id: participantId("test_pihu"), name: "Pihu", kind: "external" as const };
    referenceData.participants.push(externalPihu);
    referenceData.externalParticipants.push(externalPihu);

    renderForm();

    const payerSelect = screen.getByLabelText(/Payer/i);
    await user.selectOptions(payerSelect, externalPihu.id);

    expect(payerSelect).toHaveValue(externalPihu.id);
  });

  test("external payer transaction creates correct allocations", async () => {
    const user = userEvent.setup();
    // Set up an active external participant (Pihu) for testing external payer
    const externalPihu = { id: participantId("component_pihu"), name: "Pihu", kind: "external" as const };
    
    // Use direct mutation like the "can be selected as payer" test, since it's before render
    referenceData.participants.push(externalPihu);
    referenceData.externalParticipants.push(externalPihu);
    
    const onSubmit = vi.fn();
    renderForm(onSubmit);

    // Select Pihu as payer
    await user.selectOptions(screen.getByLabelText(/Payer/i), externalPihu.id);
    await user.type(screen.getByLabelText(/Amount/i), "30");
    await user.type(screen.getByLabelText(/Description/i), "Pihu pays");
    
    // Switch to custom amount split
    await user.click(screen.getByRole("button", { name: /Custom Amount/i }));

    // Wait for custom split to render
    await waitFor(() => expect(screen.getByLabelText("Gowri amount")).toBeInTheDocument());
    
    // Get household member inputs (fixed rows that cannot be removed)
    const gowriInput = screen.getByLabelText("Gowri amount");
    const nathanielInput = screen.getByLabelText("Nathaniel amount");
    
    // Set household member amounts
    await user.clear(gowriInput);
    await user.type(gowriInput, "10");
    await user.clear(nathanielInput);
    await user.type(nathanielInput, "10");
    
    // Add Pihu to the custom split using the + Add person dropdown
    // Wait for the select to appear
    await waitFor(() => screen.getByLabelText("Add external person"));
    const addPersonSelect = screen.getByLabelText("Add external person");
    await user.selectOptions(addPersonSelect, externalPihu.id);
    
    // Wait for Pihu's allocation row to appear
    await waitFor(() => expect(screen.getByLabelText("Pihu amount")).toBeInTheDocument());
    
    // Set Pihu's amount
    const pihuInput = screen.getByLabelText("Pihu amount");
    await user.clear(pihuInput);
    await user.type(pihuInput, "10");

    // Submit the form
    await user.click(screen.getByRole("button", { name: /Add Transaction/i }));

    // Verify submission
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const draft = onSubmit.mock.calls[0][0];
    expect(draft.payerParticipantId).toBe(externalPihu.id);
    expect(draft.totalAmountInput).toBe("30");
    expect(draft.allocations).toHaveLength(3);
    expect(draft.allocations.map((a) => a.participantId).sort()).toEqual(
      [gowriId, nathanielId, externalPihu.id].sort()
    );
  });
});
