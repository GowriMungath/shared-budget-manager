import { cents } from "../../../domain/money/money.ts";
import {
  budgetPeriodId,
  categoryId,
  goalId,
  householdId,
  participantId,
  paymentMethodId,
} from "../../../domain/shared/ids.ts";
import type { SharedBudgetManagerDatabase } from "./database.ts";

function uuid(): string {
  return crypto.randomUUID();
}

export async function initializeDatabase(db: SharedBudgetManagerDatabase): Promise<void> {
  await db.transaction(
    "rw",
    [db.households, db.participants, db.categories, db.budgetPeriods, db.paymentMethods, db.goals],
    async () => {
      let gowri = await db.participants.where("memberKey").equals("gowri").first();
      let nathaniel = await db.participants.where("memberKey").equals("nathaniel").first();

      if (!gowri) {
        gowri = { id: uuid(), name: "Gowri", kind: "household-member", memberKey: "gowri" };
        await db.participants.add(gowri);
      }

      if (!nathaniel) {
        nathaniel = { id: uuid(), name: "Nathaniel", kind: "household-member", memberKey: "nathaniel" };
        await db.participants.add(nathaniel);
      }

      const existingHousehold = await db.households.toCollection().first();

      if (!existingHousehold) {
        await db.households.add({
          id: uuid(),
          name: "Gowri & Nathaniel",
          memberIds: [gowri.id, nathaniel.id],
        });
      }

      const paymentMethods = [
        { name: "Gowri BofA", ownerParticipantId: gowri.id },
        { name: "Gowri Discover", ownerParticipantId: gowri.id },
        { name: "Nathaniel BofA", ownerParticipantId: nathaniel.id },
        { name: "Nathaniel Discover", ownerParticipantId: nathaniel.id },
      ];

      for (const paymentMethod of paymentMethods) {
        const exists = await db.paymentMethods
          .where("ownerParticipantId")
          .equals(paymentMethod.ownerParticipantId)
          .and((record) => record.name === paymentMethod.name)
          .first();

        if (!exists) {
          await db.paymentMethods.add({ id: uuid(), ...paymentMethod });
        }
      }

      const periodExists = await db.budgetPeriods
        .where("startDate")
        .equals("2026-09-15")
        .and((period) => period.endDate === "2026-09-30")
        .first();

      if (!periodExists) {
        await db.budgetPeriods.add({
          id: uuid(),
          name: "Trial MVP",
          startDate: "2026-09-15",
          endDate: "2026-09-30",
        });
      }

      const sharedCategories = [
        "Groceries",
        "Fuel",
        "Eating Out",
        "Rent",
        "Utilities",
        "Car Insurance",
        "Car Maintenance",
        "Entertainment",
        "Travel",
        "Miscellaneous",
      ];
      const personalCategories = ["Shopping", "Personal Food", "Hair / Beauty", "Personal Miscellaneous"];

      for (const name of sharedCategories) {
        const exists = await db.categories
          .where("scope")
          .equals("shared")
          .and((category) => category.name === name)
          .first();

        if (!exists) {
          await db.categories.add({
            id: uuid(),
            name,
            groupName: "Shared",
            scope: "shared",
            archived: false,
          });
        }
      }

      for (const name of personalCategories) {
        const exists = await db.categories
          .where("scope")
          .equals("personal")
          .and((category) => category.name === name)
          .first();

        if (!exists) {
          await db.categories.add({
            id: uuid(),
            name,
            groupName: "Personal",
            scope: "personal",
            archived: false,
          });
        }
      }

      const goals = [
        { name: "Gowri Tuition", ownerParticipantId: gowri.id },
        { name: "Nathaniel Tuition", ownerParticipantId: nathaniel.id },
      ];

      for (const goal of goals) {
        const exists = await db.goals
          .where("ownerParticipantId")
          .equals(goal.ownerParticipantId)
          .and((record) => record.name === goal.name)
          .first();

        if (!exists) {
          await db.goals.add({
            id: uuid(),
            name: goal.name,
            ownerParticipantId: goal.ownerParticipantId,
            targetCents: cents(650_000),
            currentSavedCents: cents(0),
            deadlineMonth: "2027-02",
          });
        }
      }
    },
  );
}

export const seedIds = {
  householdId,
  participantId,
  categoryId,
  budgetPeriodId,
  paymentMethodId,
  goalId,
};
