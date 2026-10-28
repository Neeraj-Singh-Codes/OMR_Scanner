export type OptionLetter = "A" | "B" | "C" | "D";

export interface RosterStudent {
  rollNumber: string;
  studentName: string;
}

export interface Exam {
  _id: string;
  title: string;
  subject: string;
  className: string;
  examDate: string;
  totalQuestions: number;
  answerKey: Record<string, OptionLetter>;
  markingScheme: {
    correctMarks: number;
    incorrectMarks: number;
    unansweredMarks: number;
  };
  roster?: RosterStudent[];
  templateVersion: string;
  totalScans?: number;
  pendingReviews?: number;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionBreakdown {
  questionNumber: number;
  correctAnswer: OptionLetter;
  detectedAnswer: OptionLetter | null;
  correctedAnswer: OptionLetter | null;
  finalAnswer: OptionLetter | null;
  status: "CORRECT" | "INCORRECT" | "UNANSWERED" | "NEEDS_REVIEW";
  marksAwarded: number;
}

export interface EvaluationResult {
  totalQuestions: number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  reviewRequiredCount: number;
  pendingReviewList: number[];
  score: number;
  maximumMarks: number;
  percentage: number;
  reviewRequired: boolean;
  isFinalized: boolean;
  breakdown: QuestionBreakdown[];
}

export interface ScanResult {
  _id: string;
  examId: string | Exam;
  studentName: string;
  rollNumber: string;
  detectedAnswers: Record<string, OptionLetter | null>;
  correctedAnswers: Record<string, OptionLetter | null>;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  reviewRequired: boolean;
  reviewStatus: "PENDING" | "RESOLVED" | "CONFIRMED";
  score: number;
  maximumMarks: number;
  percentage: number;
  scanMetadata?: {
    sharpness?: number;
    processingTimeMs?: number;
    ambiguousQuestions?: number[];
    multipleMarkedQuestions?: number[];
    annotatedImageBase64?: string;
    headerImageBase64?: string;
    nameImageBase64?: string;
    rollImageBase64?: string;
    rollNumberFlagged?: boolean;
    rollNumberConfidence?: number;
    rollNumberReason?: string;
    nameFlagged?: boolean;
    nameConfidence?: number;
    nameReason?: string;
    nameCrossedOutDetected?: boolean;
    rollCrossedOutDetected?: boolean;
    nameCorrectionSuspected?: boolean;
    rollCorrectionSuspected?: boolean;
    rawOcrText?: string;
    rawRollText?: string;
    reviewReasons?: string[];
    recognitionEngine?: string;
    rosterMatch?: {
      matched: boolean;
      rosterName?: string;
      similarity?: number;
    };
    detectedStudentName?: string;
    detectedRollNumber?: string;
    detectedDivision?: string;
    studentNameDetails?: {
      value: string;
      status: "accepted" | "needs_review";
      rawPredictions?: Array<{ engine: string; text: string; confidence: number }>;
      reviewReasons?: string[];
    };
    rollNumberDetails?: {
      value: string;
      status: "accepted" | "needs_review";
      rawPredictions?: Array<{ engine: string; text: string; confidence: number }>;
      reviewReasons?: string[];
    };
    identityStatus?: "accepted" | "needs_review";
  };
  evaluation?: EvaluationResult;
  createdAt: string;
  updatedAt: string;
}

export interface BatchItemResult {
  fileName: string;
  success: boolean;
  scanId?: string;
  scanResult?: ScanResult;
  reviewRequired?: boolean;
  rollNumberFlagged?: boolean;
  rollNumberReason?: string;
  nameFlagged?: boolean;
  nameReason?: string;
  nameConfidence?: number;
  nameCrossedOutDetected?: boolean;
  rollCrossedOutDetected?: boolean;
  rosterMatch?: {
    matched: boolean;
    rosterName?: string;
    similarity?: number;
  };
  score?: number;
  maximumMarks?: number;
  percentage?: number;
  studentName?: string;
  rollNumber?: string;
  error?: string;
  errorCode?: string;
}

export interface BatchUploadResponse {
  success: boolean;
  message: string;
  data: {
    totalFiles: number;
    successfulCount: number;
    failedCount: number;
    reviewRequiredCount: number;
    results: BatchItemResult[];
  };
}
