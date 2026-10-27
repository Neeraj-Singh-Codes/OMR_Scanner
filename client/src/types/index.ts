export type OptionLetter = "A" | "B" | "C" | "D";

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
    rollNumberFlagged?: boolean;
    rollNumberConfidence?: number;
    rollNumberReason?: string;
    detectedStudentName?: string;
    detectedRollNumber?: string;
    detectedDivision?: string;
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
