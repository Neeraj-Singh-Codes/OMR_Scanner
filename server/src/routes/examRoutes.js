import express from "express";
import {
  createExam,
  getExams,
  getExamById,
  updateExam,
  getExamTemplatePdf,
} from "../controllers/examController.js";
import { getExamResults, exportExamResultsCSV } from "../controllers/scanController.js";
import { validateBody } from "../middleware/validate.js";
import { createExamSchema, updateExamSchema } from "../validators/examValidator.js";

const router = express.Router();

router.post("/", validateBody(createExamSchema), createExam);
router.get("/", getExams);
router.get("/:id", getExamById);
router.put("/:id", validateBody(updateExamSchema), updateExam);
router.get("/:id/template", getExamTemplatePdf);
router.get("/:examId/results", getExamResults);
router.get("/:examId/results/export", exportExamResultsCSV);

export default router;
