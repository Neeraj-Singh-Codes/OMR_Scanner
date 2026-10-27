import { dbStore } from "../services/dbStore.js";
import { ScoringEngine } from "../services/scoringEngine.js";
import { extractCandidateInfo } from "../services/ocrService.js";
import axios from "axios";

const VISION_SERVICE_URL = process.env.PYTHON_VISION_SERVICE_URL || "http://localhost:8000";

export const processScan = async (req, res, next) => {
  try {
    const { examId, studentName = "Unassigned Student", rollNumber = "UNASSIGNED" } = req.body;

    if (!examId) {
      return res.status(400).json({ success: false, message: "Exam ID is required." });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: "No image file provided for scanning." });
    }

    const exam = await dbStore.findExamById(examId);
    if (!exam) {
      return res.status(404).json({ success: false, message: "Exam not found." });
    }

    // Call Python Computer Vision Service
    const formData = new FormData();
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
    formData.append("file", blob, req.file.originalname);

    let cvResponse;
    try {
      cvResponse = await axios.post(`${VISION_SERVICE_URL}/scan`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        params: {
          return_annotated: true,
          check_blur: true,
        },
        timeout: 20000,
      });
    } catch (cvErr) {
      if (cvErr.response) {
        return res.status(cvErr.response.status).json(cvErr.response.data);
      }
      return res.status(503).json({
        success: false,
        message: "Computer vision service is temporarily unavailable. Ensure Python service is running.",
      });
    }

    const cvData = cvResponse.data;
    const detectedAnswers = cvData.detected_answers;
    const reviewQuestionNumbers = cvData.summary.review_question_numbers || [];

    // Automated Candidate OCR Extraction (Name & Roll Number)
    const headerB64 = cvData.diagnostics?.header_image_base64;
    let ocrResult = {
      studentName: studentName || "Unassigned Student",
      rollNumber: rollNumber || "UNASSIGNED",
      division: null,
      confidence: 100,
      isAmbiguous: false,
      ambiguityReason: null,
    };

    const isNameManual = studentName && studentName !== "Unassigned Student" && studentName.trim() !== "";
    const isRollManual = rollNumber && rollNumber !== "UNASSIGNED" && rollNumber.trim() !== "";

    if (!isNameManual || !isRollManual) {
      try {
        const ocr = await extractCandidateInfo({
          headerImageBase64: headerB64,
          imageBuffer: req.file.buffer,
        });
        ocrResult = ocr;
      } catch (ocrErr) {
        console.error("Candidate OCR extraction failed:", ocrErr);
      }
    }

    const finalStudentName = isNameManual ? studentName.trim() : ocrResult.studentName;
    const finalRollNumber = isRollManual ? rollNumber.trim() : ocrResult.rollNumber;
    const isRollAmbiguous = !isRollManual && ocrResult.isAmbiguous;

    // Duplicate Submission Protection
    if (finalRollNumber && finalRollNumber !== "UNASSIGNED" && !isRollAmbiguous) {
      const existingScans = await dbStore.findScanResults({
        examId: exam._id,
        rollNumber: finalRollNumber,
      });

      const confirmedScan = existingScans.find((s) => s.reviewStatus === "CONFIRMED");
      if (confirmedScan && !req.query.allow_overwrite) {
        return res.status(409).json({
          success: false,
          error_code: "DUPLICATE_SUBMISSION",
          message: `A finalized scan already exists for roll number '${finalRollNumber}' in this examination (Score: ${confirmedScan.score}/${confirmedScan.maximumMarks}).`,
          existingScanId: confirmedScan._id,
        });
      }
    }

    // Convert answerKey Map from Mongoose/object to plain JS object
    const answerKeyObj = exam.answerKey instanceof Map ? Object.fromEntries(exam.answerKey) : exam.answerKey;

    // Evaluate score using separate backend ScoringEngine
    const scoringEngine = new ScoringEngine({
      correctMarks: exam.markingScheme.correctMarks,
      incorrectMarks: exam.markingScheme.incorrectMarks,
      unansweredMarks: exam.markingScheme.unansweredMarks,
    });

    const evalResult = scoringEngine.evaluate({
      answerKey: answerKeyObj,
      detectedAnswers,
      unresolvedReviewQuestions: reviewQuestionNumbers,
    });

    const totalReviewRequired = evalResult.reviewRequired || isRollAmbiguous;

    const scanResult = await dbStore.createScanResult({
      examId: exam._id,
      studentName: finalStudentName,
      rollNumber: finalRollNumber,
      detectedAnswers,
      correctedAnswers: {},
      correctCount: evalResult.correctCount,
      incorrectCount: evalResult.incorrectCount,
      unansweredCount: evalResult.unansweredCount,
      reviewRequired: totalReviewRequired,
      reviewStatus: totalReviewRequired ? "PENDING" : "CONFIRMED",
      score: evalResult.score,
      maximumMarks: evalResult.maximumMarks,
      percentage: evalResult.percentage,
      scanMetadata: {
        sharpness: cvData.diagnostics?.sharpness_score,
        processingTimeMs: cvData.diagnostics?.processing_time_ms,
        ambiguousQuestions: reviewQuestionNumbers,
        multipleMarkedQuestions: cvData.summary?.multiple_marked_count > 0 ? reviewQuestionNumbers : [],
        annotatedImageBase64: cvData.annotated_image_base64,
        headerImageBase64: headerB64,
        rollNumberFlagged: isRollAmbiguous,
        rollNumberConfidence: ocrResult.confidence,
        rollNumberReason: ocrResult.ambiguityReason,
        detectedStudentName: ocrResult.studentName,
        detectedRollNumber: ocrResult.rollNumber,
        detectedDivision: ocrResult.division,
      },
    });

    res.status(201).json({
      success: true,
      message: totalReviewRequired
        ? isRollAmbiguous
          ? "Sheet scanned: Roll number requires teacher verification."
          : "Sheet scanned with questions requiring teacher verification."
        : "Sheet scanned and evaluated successfully.",
      data: {
        ...(typeof scanResult.toObject === "function" ? scanResult.toObject() : scanResult),
        evaluation: evalResult,
        cvDiagnostics: cvData.diagnostics,
        candidateOCR: ocrResult,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Batch OMR Scanning Endpoint: Handles 50-100 answer sheet photographs simultaneously.
 * Employs controlled concurrency, automated OCR detection of Name & Roll No,
 * per-file error isolation, and comprehensive batch evaluation.
 */
export const processBatchScans = async (req, res, next) => {
  try {
    const { examId } = req.body;
    if (!examId) {
      return res.status(400).json({ success: false, message: "Exam ID is required for batch scanning." });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: "No image files provided for batch scanning." });
    }

    const exam = await dbStore.findExamById(examId);
    if (!exam) {
      return res.status(404).json({ success: false, message: "Exam not found." });
    }

    const answerKeyObj = exam.answerKey instanceof Map ? Object.fromEntries(exam.answerKey) : exam.answerKey;
    const scoringEngine = new ScoringEngine({
      correctMarks: exam.markingScheme.correctMarks,
      incorrectMarks: exam.markingScheme.incorrectMarks,
      unansweredMarks: exam.markingScheme.unansweredMarks,
    });

    const results = [];
    let successfulCount = 0;
    let failedCount = 0;
    let reviewRequiredCount = 0;

    // Process with controlled concurrency of 3 to balance speed and memory
    const concurrency = 3;
    const files = req.files;

    for (let i = 0; i < files.length; i += concurrency) {
      const chunk = files.slice(i, i + concurrency);
      await Promise.all(
        chunk.map(async (file) => {
          try {
            // 1. Call Python Computer Vision Service
            const formData = new FormData();
            const blob = new Blob([file.buffer], { type: file.mimetype });
            formData.append("file", blob, file.originalname);

            const cvResponse = await axios.post(`${VISION_SERVICE_URL}/scan`, formData, {
              headers: { "Content-Type": "multipart/form-data" },
              params: { return_annotated: true, check_blur: true },
              timeout: 25000,
            });

            const cvData = cvResponse.data;
            const detectedAnswers = cvData.detected_answers;
            const reviewQuestionNumbers = cvData.summary.review_question_numbers || [];

            // 2. Automated Candidate OCR
            const headerB64 = cvData.diagnostics?.header_image_base64;
            const ocrResult = await extractCandidateInfo({
              headerImageBase64: headerB64,
              imageBuffer: file.buffer,
            });

            // 3. Score Evaluation
            const evalResult = scoringEngine.evaluate({
              answerKey: answerKeyObj,
              detectedAnswers,
              unresolvedReviewQuestions: reviewQuestionNumbers,
            });

            const isRollAmbiguous = ocrResult.isAmbiguous;
            const reviewRequired = evalResult.reviewRequired || isRollAmbiguous;

            // 4. Save to Database
            const scanResult = await dbStore.createScanResult({
              examId: exam._id,
              studentName: ocrResult.studentName || "Unassigned Student",
              rollNumber: ocrResult.rollNumber || "UNASSIGNED",
              detectedAnswers,
              correctedAnswers: {},
              correctCount: evalResult.correctCount,
              incorrectCount: evalResult.incorrectCount,
              unansweredCount: evalResult.unansweredCount,
              reviewRequired,
              reviewStatus: reviewRequired ? "PENDING" : "CONFIRMED",
              score: evalResult.score,
              maximumMarks: evalResult.maximumMarks,
              percentage: evalResult.percentage,
              scanMetadata: {
                sharpness: cvData.diagnostics?.sharpness_score,
                processingTimeMs: cvData.diagnostics?.processing_time_ms,
                ambiguousQuestions: reviewQuestionNumbers,
                multipleMarkedQuestions: cvData.summary?.multiple_marked_count > 0 ? reviewQuestionNumbers : [],
                annotatedImageBase64: cvData.annotated_image_base64,
                headerImageBase64: headerB64,
                rollNumberFlagged: isRollAmbiguous,
                rollNumberConfidence: ocrResult.confidence,
                rollNumberReason: ocrResult.ambiguityReason,
                detectedStudentName: ocrResult.studentName,
                detectedRollNumber: ocrResult.rollNumber,
                detectedDivision: ocrResult.division,
              },
            });

            successfulCount++;
            if (reviewRequired) reviewRequiredCount++;

            results.push({
              fileName: file.originalname,
              success: true,
              scanId: scanResult._id,
              scanResult: typeof scanResult.toObject === "function" ? scanResult.toObject() : scanResult,
              reviewRequired,
              rollNumberFlagged: isRollAmbiguous,
              rollNumberReason: ocrResult.ambiguityReason,
              score: evalResult.score,
              maximumMarks: evalResult.maximumMarks,
              percentage: evalResult.percentage,
              studentName: ocrResult.studentName,
              rollNumber: ocrResult.rollNumber,
            });
          } catch (itemErr) {
            failedCount++;
            const errData = itemErr.response?.data;
            const message = errData?.message || itemErr.message || "Failed to process OMR sheet";
            const errorCode = errData?.error_code || "PROCESSING_ERROR";

            results.push({
              fileName: file.originalname,
              success: false,
              error: message,
              errorCode,
            });
          }
        })
      );
    }

    res.status(200).json({
      success: true,
      message: `Batch complete: ${successfulCount} processed (${reviewRequiredCount} need review), ${failedCount} failed.`,
      data: {
        totalFiles: files.length,
        successfulCount,
        failedCount,
        reviewRequiredCount,
        results,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getScanById = async (req, res, next) => {
  try {
    const scan = await dbStore.findScanResultById(req.params.id);
    if (!scan) {
      return res.status(404).json({ success: false, message: "Scan result not found." });
    }

    res.status(200).json({
      success: true,
      data: scan,
    });
  } catch (error) {
    next(error);
  }
};

export const reviewScan = async (req, res, next) => {
  try {
    const { studentName, rollNumber, correctedAnswers = {} } = req.body;
    const scan = await dbStore.findScanResultById(req.params.id);

    if (!scan) {
      return res.status(404).json({ success: false, message: "Scan result not found." });
    }

    const examId = typeof scan.examId === "object" && scan.examId ? scan.examId._id : scan.examId;
    const exam = await dbStore.findExamById(examId);
    if (!exam) {
      return res.status(404).json({ success: false, message: "Associated exam not found." });
    }

    // Merge new corrected answers
    const currentCorrected = scan.correctedAnswers instanceof Map
      ? Object.fromEntries(scan.correctedAnswers)
      : scan.correctedAnswers || {};

    const updatedCorrected = { ...currentCorrected, ...correctedAnswers };

    // Recalculate evaluation with ScoringEngine
    const answerKeyObj = exam.answerKey instanceof Map ? Object.fromEntries(exam.answerKey) : exam.answerKey;
    const detectedObj = scan.detectedAnswers instanceof Map ? Object.fromEntries(scan.detectedAnswers) : scan.detectedAnswers;

    // Determine which questions still require review
    const ambiguousList = scan.scanMetadata?.ambiguousQuestions || [];
    const remainingPending = ambiguousList.filter((q) => !Object.prototype.hasOwnProperty.call(updatedCorrected, String(q)));

    const scoringEngine = new ScoringEngine({
      correctMarks: exam.markingScheme.correctMarks,
      incorrectMarks: exam.markingScheme.incorrectMarks,
      unansweredMarks: exam.markingScheme.unansweredMarks,
    });

    const evalResult = scoringEngine.evaluate({
      answerKey: answerKeyObj,
      detectedAnswers: detectedObj,
      correctedAnswers: updatedCorrected,
      unresolvedReviewQuestions: remainingPending,
    });

    const updated = await dbStore.updateScanResult(req.params.id, {
      studentName: studentName || scan.studentName,
      rollNumber: rollNumber || scan.rollNumber,
      correctedAnswers: updatedCorrected,
      correctCount: evalResult.correctCount,
      incorrectCount: evalResult.incorrectCount,
      unansweredCount: evalResult.unansweredCount,
      score: evalResult.score,
      maximumMarks: evalResult.maximumMarks,
      percentage: evalResult.percentage,
      reviewRequired: evalResult.reviewRequired,
      reviewStatus: evalResult.reviewRequired ? "PENDING" : "RESOLVED",
    });

    res.status(200).json({
      success: true,
      message: "Scan result updated and recalculated successfully.",
      data: {
        ...(typeof updated.toObject === "function" ? updated.toObject() : updated),
        evaluation: evalResult,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const finalizeScan = async (req, res, next) => {
  try {
    const updated = await dbStore.updateScanResult(req.params.id, {
      reviewStatus: "CONFIRMED",
      reviewRequired: false,
    });

    if (!updated) {
      return res.status(404).json({ success: false, message: "Scan result not found." });
    }

    res.status(200).json({
      success: true,
      message: "Scan result confirmed and finalized.",
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

export const getExamResults = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const { search, reviewStatus, sortBy = "score", sortOrder = "desc" } = req.query;

    const query = { examId };

    if (reviewStatus) {
      query.reviewStatus = reviewStatus;
    }

    if (search) {
      query.$or = [
        { studentName: { $regex: search, $options: "i" } },
        { rollNumber: { $regex: search, $options: "i" } },
      ];
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === "asc" ? 1 : -1;

    const results = await dbStore.findScanResults(query, sortOptions);

    res.status(200).json({
      success: true,
      total: results.length,
      data: results,
    });
  } catch (error) {
    next(error);
  }
};

export const exportExamResultsCSV = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const exam = await dbStore.findExamById(examId);
    if (!exam) {
      return res.status(404).json({ success: false, message: "Exam not found." });
    }

    const results = await dbStore.findScanResults({ examId }, { score: -1 });

    let csv = "Roll Number,Student Name,Score,Maximum Marks,Percentage,Correct,Incorrect,Unanswered,Review Status,Created At\n";

    for (const r of results) {
      const row = [
        `"${r.rollNumber || "N/A"}"`,
        `"${r.studentName || "N/A"}"`,
        r.score,
        r.maximumMarks,
        `${r.percentage}%`,
        r.correctCount,
        r.incorrectCount,
        r.unansweredCount,
        r.reviewStatus,
        `"${new Date(r.createdAt).toISOString()}"`,
      ];
      csv += row.join(",") + "\n";
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="Results_${exam.title.replace(/\s+/g, "_")}.csv"`);
    res.status(200).send(csv);
  } catch (error) {
    next(error);
  }
};
