import { z } from "zod";

const optionLetterOrNull = z
  .union([z.enum(["A", "B", "C", "D", "a", "b", "c", "d"]), z.null()])
  .transform((val) => (typeof val === "string" ? val.toUpperCase() : null));

export const reviewScanSchema = z.object({
  studentName: z.string().trim().optional(),
  rollNumber: z.string().trim().optional(),
  correctedAnswers: z.record(z.string(), optionLetterOrNull).optional(),
  finalize: z.boolean().optional(),
});
