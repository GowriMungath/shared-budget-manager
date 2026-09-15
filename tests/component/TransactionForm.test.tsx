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
    save: async (participant) => {
      referenceData = {
        ...referenceData,
        participants: [...referenceData.participants, participant],
        externalParticipants: [...referenceData.externalParticipants, participant],
      };
    },
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
      onCreateExternalParticipant={(name) => useCases.createExternalParticipant(name)}
    />,
  );
}

beforeEach(() => {
  referenceData = {
    participants,
    householdMembers: participants,
    externalParticipants: [],
    categories: [
      { id: shoppingCategoryId, name: "Shopping", groupName: "Personal", scope: "personal", archived: false },
      { id: fuelCategoryId, name: "Fuel", groupName: "Shared", scope: "shared", archived: false },
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
    const amountInputs = screen.getAllByLabelText("Allocation amount");
    await user.clear(amountInputs[0]);
    await user.type(amountInputs[0], "50");
    await user.clear(amountInputs[1]);
    await user.type(amountInputs[1], "20");

    expect(await screen.findByText(/Allocations must equal/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add Transaction/i })).toBeDisabled();
  });

  test("external participant can be added inline", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: /Custom Amount/i }));
    await user.type(screen.getByLabelText(/New friend name/i), "Rohit");
    await user.click(screen.getByRole("button", { name: /^Add friend$/i }));

    await waitFor(() => expect(referenceData.externalParticipants[0]?.name).toBe("Rohit"));
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
    const percentInputs = screen.getAllByLabelText("Allocation percent");
    await user.clear(percentInputs[0]);
    await user.type(percentInputs[0], "50");
    await user.clear(percentInputs[1]);
    await user.type(percentInputs[1], "50");

    const preview = await screen.findByText("Preview");
    const previewPanel = preview.closest("aside");
    expect(previewPanel).not.toBeNull();
    expect(within(previewPanel!).getAllByText("$0.01").length).toBeGreaterThan(0);
    expect(within(previewPanel!).getAllByText("$0.00").length).toBeGreaterThan(0);
  });
});
