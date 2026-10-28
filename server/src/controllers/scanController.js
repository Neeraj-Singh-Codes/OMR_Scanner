import { dbStore } from "../services/dbStore.js";
import { ScoringEngine } from "../services/scoringEngine.js";
import { extractCandidateInfo } from "../services/ocrService.js";
import { matchStudentWithRoster } from "../utils/rosterMatcher.js";
import axios from "axios";

const VISION_SERVICE_URL = (process.env.PYTHON_VISION_SERVICE_URL || "http://127.0.0.1:8000").replace("localhost", "127.0.0.1");

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
          total_questions: exam?.totalQuestions,
          template_type: exam?.templateType,
        },
        timeout: 60000,
      });
    } catch (cvErr) {
      if (!req.file || !req.file.buffer) {
        if (cvErr.response) {
          return res.status(cvErr.response.status).json(cvErr.response.data);
        }
        return res.status(503).json({
          success: false,
          message: "Computer vision service is temporarily unavailable. Ensure Python service is running.",
        });
      }

      // Preserve image intact in database so user can view it and fulfill details manually
      const errData = cvErr.response?.data;
      const message = errData?.message || cvErr.message || "Could not automatically locate question tables or sheet content";
      const errorCode = errData?.error_code || "PROCESSING_ERROR";
      const fileBase64 = req.file.buffer.toString("base64");

      const failedScan = await dbStore.createScanResult({
        examId: exam._id,
        studentName: studentName && studentName !== "Unassigned Student" ? studentName.trim() : "Unassigned Student",
        rollNumber: rollNumber && rollNumber !== "UNASSIGNED" ? rollNumber.trim() : "UNASSIGNED",
        detectedAnswers: {},
        correctedAnswers: {},
        correctCount: 0,
        incorrectCount: 0,
        unansweredCount: exam.totalQuestions || 0,
        reviewRequired: true,
        reviewStatus: "PENDING",
        score: 0,
        maximumMarks: (exam.totalQuestions || 0) * (exam.markingScheme?.correctMarks || 1),
        percentage: 0,
        scanMetadata: {
          annotatedImageBase64: fileBase64,
          originalImageBase64: fileBase64,
          isFailedScan: true,
          processingError: message,
          errorCode,
          fileName: req.file.originalname,
          reviewReasons: [`Automated alignment issue: ${message}. Sheet image preserved intact for manual verification and entry.`],
          nameFlagged: true,
          nameReason: "Automated scan failed; enter student name manually.",
          rollNumberFlagged: true,
          rollNumberReason: "Automated scan failed; enter roll number manually.",
        },
      });

      return res.status(201).json({
        success: true,
        isFailedScan: true,
        message: `Sheet image kept intact for manual fulfillment: ${message}.`,
        data: typeof failedScan.toObject === "function" ? failedScan.toObject() : failedScan,
      });
    }

    const cvData = cvResponse.data;
    const detectedAnswers = cvData.detected_answers;
    const reviewQuestionNumbers = cvData.summary.review_question_numbers || [];

    // Automated Candidate OCR Extraction (Name & Roll Number)
    const headerB64 = cvData.diagnostics?.header_image_base64;
    const candInfo = cvData.candidate_info || {};
    const nameDetails = candInfo.name_details || {};
    const rollDetails = candInfo.roll_details || {};
    const nameImageBase64 = candInfo.name_image_base64 || nameDetails.name_crop_base64 || null;
    const rollImageBase64 = candInfo.roll_image_base64 || rollDetails.roll_crop_base64 || null;

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
      if (cvData.candidate_info) {
        ocrResult = {
          studentName: cvData.candidate_info.student_name || "Unassigned Student",
          rollNumber: cvData.candidate_info.roll_number || "UNASSIGNED",
          division: cvData.candidate_info.division || null,
          confidence: cvData.candidate_info.confidence ?? 100,
          isAmbiguous: cvData.candidate_info.is_ambiguous ?? false,
          ambiguityReason: cvData.candidate_info.ambiguity_reason || null,
        };
      } else {
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
    }

    let finalStudentName = isNameManual ? studentName.trim() : ocrResult.studentName;
    let finalRollNumber = isRollManual ? rollNumber.trim() : ocrResult.rollNumber;
    let isRollFlagged = !isRollManual && (Boolean(rollDetails.review_required) || finalRollNumber === "UNASSIGNED");
    let rollReason = !isRollManual && rollDetails.review_reasons?.length ? rollDetails.review_reasons.join("; ") : (finalRollNumber === "UNASSIGNED" ? "Roll number could not be determined" : null);
    const rollConfidence = rollDetails.confidence ?? ocrResult.confidence;
    const rawRollText = rollDetails.raw_ocr_text || ocrResult.rollNumber || "";

    let isNameFlagged = !isNameManual && (Boolean(nameDetails.review_required) || finalStudentName === "Unassigned Student");
    let nameReason = !isNameManual && nameDetails.review_reasons?.length ? nameDetails.review_reasons.join("; ") : (finalStudentName === "Unassigned Student" ? "Student name could not be determined" : null);
    const nameConfidence = nameDetails.confidence ?? ocrResult.confidence;
    const rawOcrText = nameDetails.raw_ocr_text || ocrResult.studentName || "";
    const recognitionEngine = nameDetails.recognition_engine || "RapidOCR-PP-OCRv4";

    const nameCrossedOutDetected = !isNameManual && Boolean(nameDetails.crossed_out_detected);
    const rollCrossedOutDetected = !isRollManual && Boolean(rollDetails.crossed_out_detected);
    const nameCorrectionSuspected = !isNameManual && Boolean(nameDetails.correction_suspected);
    const rollCorrectionSuspected = !isRollManual && Boolean(rollDetails.correction_suspected);

    // Cross-validate candidate identification against optional exam student roster
    let rosterMatch = {
      matched: false,
      rosterName: null,
      similarity: 0,
    };

    if (exam.roster && exam.roster.length > 0) {
      const rosterVal = matchStudentWithRoster({
        recognizedName: ocrResult.studentName,
        recognizedRoll: ocrResult.rollNumber,
        roster: exam.roster,
      });

      rosterMatch = {
        matched: rosterVal.matched,
        rosterName: rosterVal.rosterName,
        similarity: rosterVal.similarity,
      };

      if (rosterVal.flag && !isNameManual) {
        isNameFlagged = true;
        nameReason = nameReason ? `${nameReason}. ${rosterVal.reason}` : rosterVal.reason;
      }

      if (rosterVal.matched && !isNameManual && rosterVal.suggestedName) {
        finalStudentName = rosterVal.suggestedName;
      }
      if (rosterVal.matched && !isRollManual && rosterVal.suggestedRoll && (finalRollNumber === "UNASSIGNED" || rosterVal.similarity >= 85)) {
        finalRollNumber = rosterVal.suggestedRoll;
      }
    }

    // Duplicate Submission Protection
    if (finalRollNumber && finalRollNumber !== "UNASSIGNED" && !isRollFlagged) {
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

    const reviewReasons = [];
    if (evalResult.reviewRequired) {
      reviewReasons.push(`Answer key review required on question(s): ${reviewQuestionNumbers.join(", ")}`);
    }
    if (isRollFlagged && rollReason) {
      reviewReasons.push(`Roll Number: ${rollReason}`);
    }
    if (isNameFlagged && nameReason) {
      reviewReasons.push(`Student Name: ${nameReason}`);
    }
    if (nameCrossedOutDetected) {
      reviewReasons.push("Strike-through or crossed-out text detected in Student Name field.");
    }
    if (rollCrossedOutDetected) {
      reviewReasons.push("Strike-through or crossed-out digits detected in Roll Number field.");
    }

    const totalReviewRequired = evalResult.reviewRequired || isRollFlagged || isNameFlagged || nameCrossedOutDetected || rollCrossedOutDetected;

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
        nameImageBase64,
        rollImageBase64,
        rollNumberFlagged: isRollFlagged,
        rollNumberConfidence: rollConfidence,
        rollNumberReason: rollReason,
        nameFlagged: isNameFlagged,
        nameConfidence,
        nameReason,
        nameCrossedOutDetected,
        rollCrossedOutDetected,
        nameCorrectionSuspected,
        rollCorrectionSuspected,
        rawOcrText,
        rawRollText,
        reviewReasons,
        recognitionEngine,
        rosterMatch,
        detectedStudentName: ocrResult.studentName,
        detectedRollNumber: ocrResult.rollNumber,
        detectedDivision: ocrResult.division,
        studentNameDetails: {
          value: finalStudentName,
          status: isNameFlagged ? "needs_review" : "accepted",
          rawPredictions: nameDetails.raw_predictions || [],
          reviewReasons: nameDetails.review_reasons || [],
        },
        rollNumberDetails: {
          value: finalRollNumber,
          status: isRollFlagged ? "needs_review" : "accepted",
          rawPredictions: rollDetails.raw_predictions || [],
          reviewReasons: rollDetails.review_reasons || [],
        },
        identityStatus: (isNameFlagged || isRollFlagged) ? "needs_review" : "accepted",
      },
    });

    res.status(201).json({
      success: true,
      message: totalReviewRequired
        ? isRollFlagged
          ? "Sheet scanned: Roll number requires teacher verification."
          : isNameFlagged
            ? "Sheet scanned: Candidate name requires teacher verification."
            : nameCrossedOutDetected || rollCrossedOutDetected
              ? "Sheet scanned: Crossed-out writing detected, verification required."
              : "Sheet scanned with questions requiring teacher verification."
        : "Sheet scanned and evaluated successfully.",
      data: {
        ...(typeof scanResult.toObject === "function" ? scanResult.toObject() : scanResult),
        evaluation: evalResult,
        cvDiagnostics: cvData.diagnostics,
        candidateOCR: {
          ...ocrResult,
          nameImageBase64,
          nameFlagged: isNameFlagged,
          nameConfidence,
          nameReason,
          rawOcrText,
          recognitionEngine,
          rosterMatch,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Batch OMR Scanning Endpoint: Handles 50-100 answer sheet photographs simultaneously.
 * Employs controlled concurrency, automated OCR detection of Name & Roll No,
 * roster cross-validation, per-file error isolation, and comprehensive batch evaluation.
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

    // Track roll numbers encountered in current batch to detect intra-batch duplicates
    const seenBatchRolls = new Map();

    // Process with controlled concurrency to balance speed and memory
    const concurrency = 2;
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
              params: {
                return_annotated: true,
                check_blur: true,
                total_questions: exam?.totalQuestions,
                template_type: exam?.templateType,
              },
              timeout: 60000,
            });

            const cvData = cvResponse.data;
            const detectedAnswers = cvData.detected_answers;
            const reviewQuestionNumbers = cvData.summary.review_question_numbers || [];

            // 2. Automated Candidate OCR
            const headerB64 = cvData.diagnostics?.header_image_base64;
            const candInfo = cvData.candidate_info || {};
            const nameDetails = candInfo.name_details || {};
            const rollDetails = candInfo.roll_details || {};
            const nameImageBase64 = candInfo.name_image_base64 || nameDetails.name_crop_base64 || null;
            const rollImageBase64 = candInfo.roll_image_base64 || rollDetails.roll_crop_base64 || null;

            let ocrResult;
            if (cvData.candidate_info) {
              ocrResult = {
                studentName: cvData.candidate_info.student_name || "Unassigned Student",
                rollNumber: cvData.candidate_info.roll_number || "UNASSIGNED",
                division: cvData.candidate_info.division || null,
                confidence: cvData.candidate_info.confidence ?? 100,
                isAmbiguous: cvData.candidate_info.is_ambiguous ?? false,
                ambiguityReason: cvData.candidate_info.ambiguity_reason || null,
              };
            } else {
              ocrResult = await extractCandidateInfo({
                headerImageBase64: headerB64,
                imageBuffer: file.buffer,
              });
            }

            let batchStudentName = ocrResult.studentName || "Unassigned Student";
            let batchRollNumber = ocrResult.rollNumber || "UNASSIGNED";
            let isRollFlagged = Boolean(rollDetails.review_required) || batchRollNumber === "UNASSIGNED";
            let rollReason = rollDetails.review_reasons?.length ? rollDetails.review_reasons.join("; ") : (batchRollNumber === "UNASSIGNED" ? "Roll number could not be determined" : null);
            const rollConfidence = rollDetails.confidence ?? ocrResult.confidence;
            const rawRollText = rollDetails.raw_ocr_text || ocrResult.rollNumber || "";

            let isNameFlagged = Boolean(nameDetails.review_required) || batchStudentName === "Unassigned Student";
            let nameReason = nameDetails.review_reasons?.length ? nameDetails.review_reasons.join("; ") : (batchStudentName === "Unassigned Student" ? "Student name could not be determined" : null);
            const nameConfidence = nameDetails.confidence ?? ocrResult.confidence;
            const rawOcrText = nameDetails.raw_ocr_text || ocrResult.studentName || "";
            const recognitionEngine = nameDetails.recognition_engine || "RapidOCR-PP-OCRv4";

            const nameCrossedOutDetected = Boolean(nameDetails.crossed_out_detected);
            const rollCrossedOutDetected = Boolean(rollDetails.crossed_out_detected);
            const nameCorrectionSuspected = Boolean(nameDetails.correction_suspected);
            const rollCorrectionSuspected = Boolean(rollDetails.correction_suspected);

            let rosterMatch = {
              matched: false,
              rosterName: null,
              similarity: 0,
            };

            if (exam.roster && exam.roster.length > 0) {
              const rosterVal = matchStudentWithRoster({
                recognizedName: ocrResult.studentName,
                recognizedRoll: ocrResult.rollNumber,
                roster: exam.roster,
              });

              rosterMatch = {
                matched: rosterVal.matched,
                rosterName: rosterVal.rosterName,
                similarity: rosterVal.similarity,
              };

              if (rosterVal.flag) {
                isNameFlagged = true;
                nameReason = nameReason ? `${nameReason}. ${rosterVal.reason}` : rosterVal.reason;
              }

              if (rosterVal.matched && rosterVal.suggestedName) {
                batchStudentName = rosterVal.suggestedName;
              }
              if (rosterVal.matched && rosterVal.suggestedRoll && (batchRollNumber === "UNASSIGNED" || rosterVal.similarity >= 85)) {
                batchRollNumber = rosterVal.suggestedRoll;
              }
            }

            // 3. Score Evaluation
            const evalResult = scoringEngine.evaluate({
              answerKey: answerKeyObj,
              detectedAnswers,
              unresolvedReviewQuestions: reviewQuestionNumbers,
            });

            const batchReviewReasons = [];

            // Duplicate roll number tracking within this batch (record advisory note without false-positive rejection)
            if (batchRollNumber && batchRollNumber !== "UNASSIGNED") {
              const normBatchRoll = String(batchRollNumber).trim().toLowerCase();
              if (seenBatchRolls.has(normBatchRoll)) {
                const prevFileName = seenBatchRolls.get(normBatchRoll);
                batchReviewReasons.push(`Note: Roll number '${batchRollNumber}' was also detected on '${prevFileName}'.`);
              } else {
                seenBatchRolls.set(normBatchRoll, file.originalname);
              }
            }
            if (evalResult.reviewRequired) {
              batchReviewReasons.push(`Answer key review required on question(s): ${reviewQuestionNumbers.join(", ")}`);
            }
            if (isRollFlagged && rollReason) {
              batchReviewReasons.push(`Roll Number: ${rollReason}`);
            }
            if (isNameFlagged && nameReason) {
              batchReviewReasons.push(`Student Name: ${nameReason}`);
            }
            if (nameCrossedOutDetected) {
              batchReviewReasons.push("Strike-through or crossed-out text detected in Student Name field.");
            }
            if (rollCrossedOutDetected) {
              batchReviewReasons.push("Strike-through or crossed-out digits detected in Roll Number field.");
            }

            const reviewRequired = evalResult.reviewRequired || isRollFlagged || isNameFlagged || nameCrossedOutDetected || rollCrossedOutDetected;

            // 4. Save to Database
            const scanResult = await dbStore.createScanResult({
              examId: exam._id,
              studentName: batchStudentName,
              rollNumber: batchRollNumber,
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
                nameImageBase64,
                rollImageBase64,
                rollNumberFlagged: isRollFlagged,
                rollNumberConfidence: rollConfidence,
                rollNumberReason: rollReason,
                nameFlagged: isNameFlagged,
                nameConfidence,
                nameReason,
                nameCrossedOutDetected,
                rollCrossedOutDetected,
                nameCorrectionSuspected,
                rollCorrectionSuspected,
                rawOcrText,
                rawRollText,
                reviewReasons: batchReviewReasons,
                recognitionEngine,
                rosterMatch,
                detectedStudentName: ocrResult.studentName,
                detectedRollNumber: ocrResult.rollNumber,
                detectedDivision: ocrResult.division,
                studentNameDetails: {
                  value: batchStudentName,
                  status: isNameFlagged ? "needs_review" : "accepted",
                  rawPredictions: nameDetails.raw_predictions || [],
                  reviewReasons: nameDetails.review_reasons || [],
                },
                rollNumberDetails: {
                  value: batchRollNumber,
                  status: isRollFlagged ? "needs_review" : "accepted",
                  rawPredictions: rollDetails.raw_predictions || [],
                  reviewReasons: rollDetails.review_reasons || [],
                },
                identityStatus: (isNameFlagged || isRollFlagged) ? "needs_review" : "accepted",
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
              rollNumberFlagged: isRollFlagged,
              rollNumberReason: rollReason,
              nameFlagged: isNameFlagged,
              nameReason,
              nameConfidence,
              nameCrossedOutDetected,
              rollCrossedOutDetected,
              rosterMatch,
              score: evalResult.score,
              maximumMarks: evalResult.maximumMarks,
              percentage: evalResult.percentage,
              studentName: batchStudentName,
              rollNumber: batchRollNumber,
              studentNameDetails: {
                value: batchStudentName,
                status: isNameFlagged ? "needs_review" : "accepted",
                rawPredictions: nameDetails.raw_predictions || [],
                reviewReasons: nameDetails.review_reasons || [],
              },
              rollNumberDetails: {
                value: batchRollNumber,
                status: isRollFlagged ? "needs_review" : "accepted",
                rawPredictions: rollDetails.raw_predictions || [],
                reviewReasons: rollDetails.review_reasons || [],
              },
              identityStatus: (isNameFlagged || isRollFlagged) ? "needs_review" : "accepted",
            });
          } catch (itemErr) {
            failedCount++;
            const errData = itemErr.response?.data;
            const message = errData?.message || itemErr.message || "Failed to process OMR sheet";
            const errorCode = errData?.error_code || "PROCESSING_ERROR";

            let failedScanId = null;
            if (file && file.buffer) {
              try {
                const fileBase64 = file.buffer.toString("base64");
                const failedScan = await dbStore.createScanResult({
                  examId: exam._id,
                  studentName: "Unassigned Student",
                  rollNumber: "UNASSIGNED",
                  detectedAnswers: {},
                  correctedAnswers: {},
                  correctCount: 0,
                  incorrectCount: 0,
                  unansweredCount: exam.totalQuestions || 0,
                  reviewRequired: true,
                  reviewStatus: "PENDING",
                  score: 0,
                  maximumMarks: (exam.totalQuestions || 0) * (exam.markingScheme?.correctMarks || 1),
                  percentage: 0,
                  scanMetadata: {
                    annotatedImageBase64: fileBase64,
                    originalImageBase64: fileBase64,
                    isFailedScan: true,
                    processingError: message,
                    errorCode,
                    fileName: file.originalname,
                    reviewReasons: [`Automated alignment issue: ${message}. Sheet image preserved intact for manual verification and entry.`],
                    nameFlagged: true,
                    nameReason: "Automated scan failed; enter student name manually.",
                    rollNumberFlagged: true,
                    rollNumberReason: "Automated scan failed; enter roll number manually.",
                  },
                });
                failedScanId = failedScan._id;
                reviewRequiredCount++;
              } catch (dbErr) {
                console.error("Failed to persist failed scan record in batch:", dbErr);
              }
            }

            results.push({
              fileName: file.originalname,
              success: false,
              scanId: failedScanId,
              isFailedScan: true,
              reviewRequired: true,
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

    // Check if candidate metadata has been verified by the teacher
    const prevMetadata = scan.scanMetadata || {};
    const isManualIdentityEdit = studentName !== undefined || rollNumber !== undefined;
    const updatedMetadata = {
      ...prevMetadata,
      manuallyCorrected: isManualIdentityEdit ? true : Boolean(prevMetadata.manuallyCorrected),
      originalRecognizedName: prevMetadata.originalRecognizedName || prevMetadata.detectedStudentName || scan.studentName,
      originalRecognizedRoll: prevMetadata.originalRecognizedRoll || prevMetadata.detectedRollNumber || scan.rollNumber,
      nameFlagged: studentName !== undefined ? false : prevMetadata.nameFlagged,
      rollNumberFlagged: rollNumber !== undefined ? false : prevMetadata.rollNumberFlagged,
      nameCrossedOutDetected: studentName !== undefined ? false : prevMetadata.nameCrossedOutDetected,
      rollCrossedOutDetected: rollNumber !== undefined ? false : prevMetadata.rollCrossedOutDetected,
      nameCorrectionSuspected: studentName !== undefined ? false : prevMetadata.nameCorrectionSuspected,
      rollCorrectionSuspected: rollNumber !== undefined ? false : prevMetadata.rollCorrectionSuspected,
    };

    const reviewStillRequired = evalResult.reviewRequired || updatedMetadata.nameFlagged || updatedMetadata.rollNumberFlagged;

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
      reviewRequired: reviewStillRequired,
      reviewStatus: reviewStillRequired ? "PENDING" : "RESOLVED",
      scanMetadata: updatedMetadata,
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
    const scan = await dbStore.findScanResultById(req.params.id);
    if (!scan) {
      return res.status(404).json({ success: false, message: "Scan result not found." });
    }

    const prevMetadata = scan.scanMetadata || {};
    const updatedMetadata = {
      ...prevMetadata,
      nameFlagged: false,
      rollNumberFlagged: false,
      nameCrossedOutDetected: false,
      rollCrossedOutDetected: false,
      nameCorrectionSuspected: false,
      rollCorrectionSuspected: false,
    };

    const updated = await dbStore.updateScanResult(req.params.id, {
      reviewStatus: "CONFIRMED",
      reviewRequired: false,
      scanMetadata: updatedMetadata,
    });

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

    const results = await dbStore.findScanResults(query, sortOptions, {
      "scanMetadata.annotatedImageBase64": 0,
      "scanMetadata.headerImageBase64": 0,
      "scanMetadata.nameImageBase64": 0,
      "scanMetadata.rollImageBase64": 0,
    });

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
