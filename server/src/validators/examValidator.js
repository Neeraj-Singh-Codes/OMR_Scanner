import { z } from "zod";

const optionEnum = z.enum(["A", "B", "C", "D", "a", "b", "c", "d"]).transform((val) => val.toUpperCase());

const rosterEntrySchema = z.object({
  rollNumber: z.string().trim().min(1, "Roll number cannot be empty."),
  studentName: z.string().trim().min(1, "Student name cannot be empty."),
});

export const createExamSchema = z.object({
  title: z
    .string({ required_error: "Exam title is required." })
    .trim()
    .min(1, "Exam title cannot be empty.")
    .max(100, "Exam title cannot exceed 100 characters."),
  subject: z
    .string({ required_error: "Subject is required." })
    .trim()
    .min(1, "Subject cannot be empty.")
    .max(50, "Subject cannot exceed 50 characters."),
  className: z
    .string({ required_error: "Class or section is required." })
    .trim()
    .min(1, "Class cannot be empty.")
    .max(50, "Class name cannot exceed 50 characters."),
  examDate: z.string().optional(),
  totalQuestions: z.coerce.number().min(1).max(30).default(30),
  answerKey: z
    .record(z.string(), optionEnum)
    .refine((keyMap) => {
      const count = Object.keys(keyMap).length;
      return count >= 1 && count <= 30;
    }, {
      message: "Answer key must contain between 1 and 30 question entries.",
    }),
  markingScheme: z
    .object({
      correctMarks: z.coerce.number().min(0.1, "Correct marks must be positive.").default(1),
      incorrectMarks: z.coerce.number().min(0, "Penalty must be non-negative.").default(0),
      unansweredMarks: z.coerce.number().default(0),
    })
    .optional(),
  roster: z.array(rosterEntrySchema).optional(),
});

export const updateExamSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  subject: z.string().trim().min(1).max(50).optional(),
  className: z.string().trim().min(1).max(50).optional(),
  examDate: z.string().optional(),
  totalQuestions: z.coerce.number().min(1).max(30).optional(),
  answerKey: z.record(z.string(), optionEnum).optional(),
  markingScheme: z
    .object({
      correctMarks: z.coerce.number().min(0.1).optional(),
      incorrectMarks: z.coerce.number().min(0).optional(),
      unansweredMarks: z.coerce.number().optional(),
    })
    .optional(),
  roster: z.array(rosterEntrySchema).optional(),
});
