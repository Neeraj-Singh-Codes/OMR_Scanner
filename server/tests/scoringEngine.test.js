import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { ScoringEngine } from "../src/services/scoringEngine.js";

describe("ScoringEngine Service Unit Tests", () => {
  const sampleAnswerKey = {
    "1": "A",
    "2": "B",
    "3": "C",
    "4": "D",
    "5": "A",
  };

  test("evaluates standard 1-mark scheme with all correct answers", () => {
    const engine = new ScoringEngine({ correctMarks: 1, incorrectMarks: 0, unansweredMarks: 0 });
    const detected = { "1": "A", "2": "B", "3": "C", "4": "D", "5": "A" };

    const result = engine.evaluate({
      answerKey: sampleAnswerKey,
      detectedAnswers: detected,
    });

    assert.equal(result.totalQuestions, 5);
    assert.equal(result.correctCount, 5);
    assert.equal(result.incorrectCount, 0);
    assert.equal(result.unansweredCount, 0);
    assert.equal(result.score, 5);
    assert.equal(result.maximumMarks, 5);
    assert.equal(result.percentage, 100);
    assert.equal(result.reviewRequired, false);
    assert.equal(result.isFinalized, true);
  });

  test("evaluates mixed answers with unanswered questions", () => {
    const engine = new ScoringEngine({ correctMarks: 2, incorrectMarks: 0, unansweredMarks: 0 });
    const detected = {
      "1": "A", // Correct (+2)
      "2": "C", // Incorrect (0)
      "3": null, // Unanswered (0)
      "4": "D", // Correct (+2)
      "5": null, // Unanswered (0)
    };

    const result = engine.evaluate({
      answerKey: sampleAnswerKey,
      detectedAnswers: detected,
    });

    assert.equal(result.correctCount, 2);
    assert.equal(result.incorrectCount, 1);
    assert.equal(result.unansweredCount, 2);
    assert.equal(result.score, 4);
    assert.equal(result.maximumMarks, 10);
    assert.equal(result.percentage, 40);
  });

  test("applies negative marking penalty correctly", () => {
    const engine = new ScoringEngine({ correctMarks: 4, incorrectMarks: 1, unansweredMarks: 0 });
    const detected = {
      "1": "A", // Correct (+4)
      "2": "C", // Incorrect (-1)
      "3": "A", // Incorrect (-1)
      "4": "D", // Correct (+4)
      "5": "B", // Incorrect (-1)
    };

    const result = engine.evaluate({
      answerKey: sampleAnswerKey,
      detectedAnswers: detected,
    });

    // Score: 4 - 1 - 1 + 4 - 1 = 5
    assert.equal(result.correctCount, 2);
    assert.equal(result.incorrectCount, 3);
    assert.equal(result.score, 5);
    assert.equal(result.maximumMarks, 20);
    assert.equal(result.percentage, 25);
  });

  test("does not finalize score when unresolved ambiguous questions exist", () => {
    const engine = new ScoringEngine();
    const detected = {
      "1": "A",
      "2": "B",
      "3": null, // Ambiguous / multiple-marked on Q3
      "4": "D",
      "5": "A",
    };

    const result = engine.evaluate({
      answerKey: sampleAnswerKey,
      detectedAnswers: detected,
      unresolvedReviewQuestions: [3],
    });

    assert.equal(result.reviewRequired, true);
    assert.equal(result.isFinalized, false);
    assert.deepEqual(result.pendingReviewList, [3]);
    assert.equal(result.breakdown[2].status, "NEEDS_REVIEW");
  });

  test("recalculates and finalizes when teacher provides corrections", () => {
    const engine = new ScoringEngine();
    const detected = {
      "1": "A",
      "2": "B",
      "3": null, // Ambiguous on scan
      "4": "D",
      "5": "A",
    };

    // Teacher inspects scan and enters 'C' for Q3
    const result = engine.evaluate({
      answerKey: sampleAnswerKey,
      detectedAnswers: detected,
      correctedAnswers: { "3": "C" },
      unresolvedReviewQuestions: [3],
    });

    assert.equal(result.reviewRequired, false);
    assert.equal(result.isFinalized, true);
    assert.equal(result.correctCount, 5);
    assert.equal(result.score, 5);
    assert.equal(result.percentage, 100);
    assert.equal(result.breakdown[2].correctedAnswer, "C");
  });

  test("awards 0 marks for unmarked questions and 0 marks for questions with multiple options marked", () => {
    // Exam with correctMarks = 4, negative marking penalty of 1 mark (-1) for incorrect single answers
    const engine = new ScoringEngine({ correctMarks: 4, incorrectMarks: 1, unansweredMarks: 0 });
    const detected = {
      "1": "A", // Correct (+4)
      "2": "C", // Incorrect single answer (-1 penalty)
      "3": null, // Unmarked / blank -> MUST give 0 marks (NOT -1)
      "4": null, // Multiple options marked (Q4) -> MUST give 0 marks (NOT -1)
      "5": null, // More than 2 options marked (Q5) -> MUST give 0 marks (NOT -1)
    };

    const result = engine.evaluate({
      answerKey: sampleAnswerKey,
      detectedAnswers: detected,
      multipleMarkedQuestions: [4, 5],
    });

    // Q1 (+4), Q2 (-1), Q3 (0), Q4 (0), Q5 (0) => Total = 3
    assert.equal(result.breakdown[2].marksAwarded, 0); // Q3 blank
    assert.equal(result.breakdown[2].status, "UNANSWERED");
    assert.equal(result.breakdown[3].marksAwarded, 0); // Q4 multiple marked
    assert.equal(result.breakdown[3].status, "MULTIPLE_MARKED");
    assert.equal(result.breakdown[4].marksAwarded, 0); // Q5 multiple marked
    assert.equal(result.breakdown[4].status, "MULTIPLE_MARKED");
    assert.equal(result.score, 3);
  });
});
