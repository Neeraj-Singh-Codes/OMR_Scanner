import mongoose from "mongoose";

const scanResultSchema = new mongoose.Schema(
  {
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Exam",
      required: [true, "Exam ID reference is required"],
      index: true,
    },
    studentName: {
      type: String,
      trim: true,
      default: "Unassigned Student",
    },
    rollNumber: {
      type: String,
      trim: true,
      default: "UNASSIGNED",
      index: true,
    },
    detectedAnswers: {
      type: Map,
      of: {
        type: String,
        default: null,
      },
      required: true,
    },
    correctedAnswers: {
      type: Map,
      of: {
        type: String,
        enum: ["A", "B", "C", "D", null],
        default: null,
      },
      default: {},
    },
    correctCount: {
      type: Number,
      default: 0,
    },
    incorrectCount: {
      type: Number,
      default: 0,
    },
    unansweredCount: {
      type: Number,
      default: 0,
    },
    reviewRequired: {
      type: Boolean,
      default: false,
      index: true,
    },
    reviewStatus: {
      type: String,
      enum: ["PENDING", "RESOLVED", "CONFIRMED"],
      default: "PENDING",
      index: true,
    },
    score: {
      type: Number,
      default: 0,
    },
    maximumMarks: {
      type: Number,
      default: 0,
    },
    percentage: {
      type: Number,
      default: 0,
    },
    scanMetadata: {
      sharpness: Number,
      processingTimeMs: Number,
      ambiguousQuestions: [Number],
      multipleMarkedQuestions: [Number],
      annotatedImageBase64: String, // Store lightweight preview or reference
      headerImageBase64: String,
      nameImageBase64: String,
      rollImageBase64: String,
      rollNumberFlagged: { type: Boolean, default: false },
      rollNumberConfidence: Number,
      rollNumberReason: String,
      nameFlagged: { type: Boolean, default: false },
      nameConfidence: Number,
      nameReason: String,
      nameCrossedOutDetected: { type: Boolean, default: false },
      rollCrossedOutDetected: { type: Boolean, default: false },
      nameCorrectionSuspected: { type: Boolean, default: false },
      rollCorrectionSuspected: { type: Boolean, default: false },
      rawOcrText: String,
      rawRollText: String,
      reviewReasons: [String],
      recognitionEngine: String,
      rosterMatch: {
        matched: { type: Boolean, default: false },
        rosterName: String,
        similarity: Number,
      },
      detectedStudentName: String,
      detectedRollNumber: String,
      detectedDivision: String,
      manuallyCorrected: { type: Boolean, default: false },
      originalRecognizedName: String,
      originalRecognizedRoll: String,
      studentNameDetails: {
        value: String,
        status: { type: String, enum: ["accepted", "needs_review"], default: "accepted" },
        rawPredictions: [mongoose.Schema.Types.Mixed],
        reviewReasons: [String],
      },
      rollNumberDetails: {
        value: String,
        status: { type: String, enum: ["accepted", "needs_review"], default: "accepted" },
        rawPredictions: [mongoose.Schema.Types.Mixed],
        reviewReasons: [String],
      },
      identityStatus: { type: String, enum: ["accepted", "needs_review"], default: "accepted" },
    },
  },
  {
    timestamps: true,
    toJSON: { flattenMaps: true },
    toObject: { flattenMaps: true },
  }
);

// Compound index: allows fast lookup of results for an exam sorted by score or roll number
scanResultSchema.index({ examId: 1, score: -1 });
scanResultSchema.index({ examId: 1, rollNumber: 1 });
scanResultSchema.index({ examId: 1, reviewRequired: 1 });

export const ScanResult = mongoose.model("ScanResult", scanResultSchema);
