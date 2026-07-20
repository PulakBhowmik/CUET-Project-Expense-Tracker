import { z } from "zod";
import { takaToPaisa } from "@/lib/money";

/**
 * A BDT amount entered as a string (e.g. "120.50"), validated and transformed
 * to integer paisa (bigint). Rejects anything that isn't a positive amount with
 * at most two decimals.
 */
const takaAmountToPaisa = z
  .string()
  .trim()
  .min(1, "Amount is required.")
  .refine((v) => {
    try {
      return takaToPaisa(v) > 0n;
    } catch {
      return false;
    }
  }, "Enter a valid amount greater than zero (e.g. 120.50).")
  .transform((v) => takaToPaisa(v));

const title = z
  .string()
  .trim()
  .min(1, "Purpose is required.")
  .max(100, "Purpose must be at most 100 characters.");

const description = z
  .string()
  .trim()
  .max(500, "Description must be at most 500 characters.")
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

const expenseDate = z.coerce
  .date({ message: "Enter a valid date." })
  .refine(
    (d) => d.getTime() <= Date.now() + 24 * 60 * 60 * 1000,
    "The expense date can't be in the future.",
  );

export const createExpenseSchema = z.object({
  title,
  description,
  amountPaisa: takaAmountToPaisa,
  expenseDate,
});

export const updateExpenseSchema = z.object({
  title,
  description,
  amountPaisa: takaAmountToPaisa,
  expenseDate,
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
