import { dbStore } from "../services/dbStore.js";
import { ScoringEngine } from "../services/scoringEngine.js";
import axios from "axios";

const VISION_SERVICE_URL = process.env.PYTHON_VISION_SERVICE_URL || "http://localhost:8000";

export const createExam = async (req, res, next) => {
  try {
    const { title, subject, className, examDate, totalQuestions = 30, answerKey, markingScheme, roster } = req.body;

    const exam = await dbStore.createExam({
      title,
      subject,
      className,
      examDate: examDate || new Date(),
      totalQuestions: totalQuestions || Object.keys(answerKey).length,
      answerKey,
      markingScheme: markingScheme || { correctMarks: 1, incorrectMarks: 0, unansweredMarks: 0 },
      roster: roster || [],
    });

    res.status(201).json({
      success: true,
      message: "Exam created successfully.",
      data: exam,
    });
  } catch (error) {
    next(error);
  }
};

export const getExams = async (req, res, next) => {
  try {
    const exams = await dbStore.findExams();

    const examsWithStats = await Promise.all(
      exams.map(async (exam) => {
        const totalScans = await dbStore.countScans({ examId: exam._id });
        const pendingReviews = await dbStore.countScans({ examId: exam._id, reviewRequired: true });
        return {
          ...exam,
          totalScans,
          pendingReviews,
        };
      })
    );

    res.status(200).json({
      success: true,
      data: examsWithStats,
    });
  } catch (error) {
    next(error);
  }
};

export const getExamById = async (req, res, next) => {
  try {
    const exam = await dbStore.findExamById(req.params.id);
    if (!exam) {
      return res.status(404).json({ success: false, message: "Exam not found." });
    }

    const totalScans = await dbStore.countScans({ examId: exam._id });
    const pendingReviews = await dbStore.countScans({ examId: exam._id, reviewRequired: true });

    res.status(200).json({
      success: true,
      data: {
        ...(typeof exam.toObject === "function" ? exam.toObject() : exam),
        totalScans,
        pendingReviews,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateExam = async (req, res, next) => {
  try {
    const updatePayload = { ...req.body };

    // If totalQuestions or answerKey is provided, trim answerKey to totalQuestions
    if (updatePayload.totalQuestions && updatePayload.answerKey) {
      const trimmedKey = {};
      for (let i = 1; i <= updatePayload.totalQuestions; i++) {
        if (updatePayload.answerKey[String(i)]) {
          trimmedKey[String(i)] = updatePayload.answerKey[String(i)];
        }
      }
      updatePayload.answerKey = trimmedKey;
    }

    const updated = await dbStore.updateExam(req.params.id, updatePayload);
    if (!updated) {
      return res.status(404).json({ success: false, message: "Exam not found." });
    }

    // Automatically recalculate all existing scans if answerKey, markingScheme, or totalQuestions was altered
    if (req.body.answerKey || req.body.markingScheme || req.body.totalQuestions) {
      const existingScans = await dbStore.findScanResults({ examId: req.params.id });
      const rawKey = updated.answerKey instanceof Map ? Object.fromEntries(updated.answerKey) : updated.answerKey;

      // Filter answerKey to totalQuestions
      const totalQ = updated.totalQuestions || Object.keys(rawKey).length;
      const answerKeyObj = {};
      for (let i = 1; i <= totalQ; i++) {
        if (rawKey[String(i)]) {
          answerKeyObj[String(i)] = rawKey[String(i)];
        }
      }

      const scoringEngine = new ScoringEngine({
        correctMarks: updated.markingScheme.correctMarks,
        incorrectMarks: updated.markingScheme.incorrectMarks,
        unansweredMarks: updated.markingScheme.unansweredMarks,
      });

      for (const scan of existingScans) {
        const detectedObj = scan.detectedAnswers instanceof Map ? Object.fromEntries(scan.detectedAnswers) : scan.detectedAnswers;
        const correctedObj = scan.correctedAnswers instanceof Map ? Object.fromEntries(scan.correctedAnswers) : scan.correctedAnswers || {};

        const ambiguousList = scan.scanMetadata?.ambiguousQuestions || [];
        const remainingPending = ambiguousList
          .filter((q) => q <= totalQ)
          .filter((q) => !Object.prototype.hasOwnProperty.call(correctedObj, String(q)));

        const evalResult = scoringEngine.evaluate({
          answerKey: answerKeyObj,
          detectedAnswers: detectedObj,
          correctedAnswers: correctedObj,
          unresolvedReviewQuestions: remainingPending,
        });

        await dbStore.updateScanResult(scan._id, {
          correctCount: evalResult.correctCount,
          incorrectCount: evalResult.incorrectCount,
          unansweredCount: evalResult.unansweredCount,
          score: evalResult.score,
          maximumMarks: evalResult.maximumMarks,
          percentage: evalResult.percentage,
          reviewRequired: evalResult.reviewRequired,
          reviewStatus: evalResult.reviewRequired ? "PENDING" : (scan.reviewStatus === "CONFIRMED" ? "CONFIRMED" : "RESOLVED"),
        });
      }
    }

    res.status(200).json({
      success: true,
      message: "Exam updated successfully.",
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteExam = async (req, res, next) => {
  try {
    const deleted = await dbStore.deleteExam(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Exam not found." });
    }
    res.status(200).json({
      success: true,
      message: "Exam and associated scans deleted successfully.",
    });
  } catch (error) {
    next(error);
  }
};

export const getExamTemplatePdf = async (req, res, next) => {
  try {
    const exam = await dbStore.findExamById(req.params.id);
    if (!exam) {
      return res.status(404).json({ success: false, message: "Exam not found." });
    }

    const response = await axios.get(`${VISION_SERVICE_URL}/template/pdf`, {
      params: {
        exam_id: String(exam._id),
        exam_title: exam.title,
        subject: exam.subject,
        class_name: exam.className,
        exam_date: exam.examDate ? new Date(exam.examDate).toISOString().split("T")[0] : "2026-10-27",
        total_questions: exam.totalQuestions,
        template_type: req.query.template_type || exam.templateVersion || (exam.totalQuestions <= 25 ? "SCHOOL_25Q" : "STANDARD_30Q"),
      },
      responseType: "stream",
      timeout: 10000,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="OMR_${exam.title.replace(/\s+/g, "_")}.pdf"`);
    response.data.pipe(res);
  } catch (error) {
    next(error);
  }
};
