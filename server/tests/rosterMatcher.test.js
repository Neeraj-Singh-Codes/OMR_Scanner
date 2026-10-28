import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  levenshteinDistance,
  computeNameSimilarity,
  matchStudentWithRoster,
} from "../src/utils/rosterMatcher.js";

describe("Student Roster Matcher & Cross-Validation", () => {
  const sampleRoster = [
    { rollNumber: "2026101", studentName: "Pika Singh" },
    { rollNumber: "2026102", studentName: "Virendra Singh" },
    { rollNumber: "2026103", studentName: "Azad Jaiswar" },
    { rollNumber: "2026104", studentName: "Jeet D. Rawat" },
  ];

  it("calculates Levenshtein distance correctly", () => {
    assert.strictEqual(levenshteinDistance("kitten", "sitting"), 3);
    assert.strictEqual(levenshteinDistance("Azad", "Azad"), 0);
  });

  it("computes high similarity for slight OCR variations and middle initials", () => {
    const sim1 = computeNameSimilarity("Azad Jaiswar", "Azad Jaiswar");
    assert.strictEqual(sim1, 1.0);

    const sim2 = computeNameSimilarity("Jeet D. Rawat", "Jeet D Rawat");
    assert.ok(sim2 >= 0.9, `Expected sim >= 0.9, got ${sim2}`);

    const sim3 = computeNameSimilarity("Foet D. Rawat", "Jeet D. Rawat");
    assert.ok(sim3 >= 0.7, `Expected sim >= 0.7, got ${sim3}`);
  });

  it("confirms identity when roll number and name match roster", () => {
    const res = matchStudentWithRoster({
      recognizedName: "Azad Jaiswar",
      recognizedRoll: "2026103",
      roster: sampleRoster,
    });

    assert.strictEqual(res.matched, true);
    assert.strictEqual(res.rosterName, "Azad Jaiswar");
    assert.strictEqual(res.flag, false);
    assert.strictEqual(res.suggestedName, "Azad Jaiswar");
  });

  it("flags conflict when roll number belongs to different student", () => {
    // Roll number 2026101 belongs to 'Pika Singh', but recognized name is 'Azad Jaiswar'
    const res = matchStudentWithRoster({
      recognizedName: "Azad Jaiswar",
      recognizedRoll: "2026101",
      roster: sampleRoster,
    });

    assert.strictEqual(res.matched, false);
    assert.strictEqual(res.flag, true);
    assert.ok(res.reason.includes("Discrepancy"), "Reason should mention discrepancy");
    assert.ok(res.reason.includes("Pika Singh"));
  });

  it("matches student by name when roll number is unassigned", () => {
    const res = matchStudentWithRoster({
      recognizedName: "Virendra Singh",
      recognizedRoll: "UNASSIGNED",
      roster: sampleRoster,
    });

    assert.strictEqual(res.matched, true);
    assert.strictEqual(res.rosterName, "Virendra Singh");
    assert.strictEqual(res.suggestedRoll, "2026102");
    assert.strictEqual(res.flag, false);
  });

  it("operates autonomously with no flags when roster is null or empty", () => {
    const resEmpty = matchStudentWithRoster({
      recognizedName: "Azad Jaiswar",
      recognizedRoll: "2026103",
      roster: [],
    });
    assert.strictEqual(resEmpty.matched, false);
    assert.strictEqual(resEmpty.flag, false);

    const resNull = matchStudentWithRoster({
      recognizedName: "Azad Jaiswar",
      recognizedRoll: "2026103",
      roster: null,
    });
    assert.strictEqual(resNull.matched, false);
    assert.strictEqual(resNull.flag, false);
  });
});
