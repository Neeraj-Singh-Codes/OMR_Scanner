/**
 * OMR Scoring Engine Service.
 * Implements rigorous evaluation logic, configurable marking schemes,
 * review requirement enforcement, and precision percentage calculations.
 */

export class ScoringEngine {
  /**
   * @param {Object} options
   * @param {number} [options.correctMarks=1]
   * @param {number} [options.incorrectMarks=0]
   * @param {number} [options.unansweredMarks=0]
   */
  constructor(options = {}) {
    this.correctMarks = options.correctMarks ?? 1;
    this.incorrectMarks = options.incorrectMarks ?? 0;
    this.unansweredMarks = options.unansweredMarks ?? 0;
  }

  /**
   * Evaluates student answers against official answer key.
   *
   * @param {Object} params
   * @param {Record<string, string>} params.answerKey - Map of question number to correct option (e.g. {"1": "A", "2": "C"})
   * @param {Record<string, string | null>} params.detectedAnswers - Raw detected answers from scanner
   * @param {Record<string, string | null>} [params.correctedAnswers={}] - Teacher-corrected answers
   * @param {number[]} [params.unresolvedReviewQuestions=[]] - List of question numbers requiring manual teacher review
   * @returns {Object} Structured evaluation result
   */
  evaluate({
    answerKey,
    detectedAnswers,
    correctedAnswers = {},
    unresolvedReviewQuestions = []
  }) {
    if (!answerKey || Object.keys(answerKey).length === 0) {
      throw new Error("Answer key is required for scoring evaluation.");
    }

    const questionNumbers = Object.keys(answerKey)
      .map(Number)
      .sort((a, b) => a - b);

    const totalQuestions = questionNumbers.length;
    const maximumMarks = totalQuestions * this.correctMarks;

    let correctCount = 0;
    let incorrectCount = 0;
    let unansweredCount = 0;
    let reviewRequiredCount = 0;
    let totalScore = 0;

    const questionBreakdown = [];
    const pendingReviewList = [];

    for (const qNum of questionNumbers) {
      const qKey = String(qNum);
      const correctAnswer = answerKey[qKey];

      // Final answer preference: teacher correction > detected answer
      const hasCorrection = Object.prototype.hasOwnProperty.call(correctedAnswers, qKey);
      const finalAnswer = hasCorrection ? correctedAnswers[qKey] : detectedAnswers[qKey] ?? null;

      // Check if this question is in unresolved review state
      const isUnresolved = unresolvedReviewQuestions.includes(qNum) && !hasCorrection;

      let status = "UNANSWERED";
      let marksAwarded = 0;

      if (isUnresolved) {
        status = "NEEDS_REVIEW";
        reviewRequiredCount++;
        pendingReviewList.push(qNum);
        marksAwarded = 0; // Never assign marks to unresolved ambiguous questions
      } else if (!finalAnswer) {
        status = "UNANSWERED";
        unansweredCount++;
        marksAwarded = this.unansweredMarks;
      } else if (finalAnswer.toUpperCase() === correctAnswer.toUpperCase()) {
        status = "CORRECT";
        correctCount++;
        marksAwarded = this.correctMarks;
      } else {
        status = "INCORRECT";
        incorrectCount++;
        marksAwarded = -Math.abs(this.incorrectMarks);
      }

      totalScore += marksAwarded;

      questionBreakdown.push({
        questionNumber: qNum,
        correctAnswer: correctAnswer.toUpperCase(),
        detectedAnswer: detectedAnswers[qKey] ?? null,
        correctedAnswer: hasCorrection ? correctedAnswers[qKey] : null,
        finalAnswer,
        status,
        marksAwarded: Number(marksAwarded.toFixed(2)),
      });
    }

    // Percentage calculation clamped between 0 and 100
    const rawPercentage = maximumMarks > 0 ? (totalScore / maximumMarks) * 100 : 0;
    const percentage = Number(Math.max(0, Math.min(100, rawPercentage)).toFixed(2));

    const reviewRequired = reviewRequiredCount > 0;
    const isFinalized = !reviewRequired;

    return {
      totalQuestions,
      correctCount,
      incorrectCount,
      unansweredCount,
      reviewRequiredCount,
      pendingReviewList,
      score: Number(totalScore.toFixed(2)),
      maximumMarks: Number(maximumMarks.toFixed(2)),
      percentage,
      reviewRequired,
      isFinalized,
      breakdown: questionBreakdown,
    };
  }
}
