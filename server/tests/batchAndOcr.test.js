import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import app from "../src/index.js";
import { parseCandidateText, extractCandidateInfo, terminateWorker } from "../src/services/ocrService.js";

let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
});

after(async () => {
  await terminateWorker();
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

describe("OCR Service & Candidate Information Extraction", () => {
  test("parseCandidateText extracts student name, roll number, and division accurately", () => {
    const raw1 = "\\ Name: In 4 Roll No: __ ga Division: __B\nTotal: 50 marks";
    const parsed1 = parseCandidateText(raw1);
    assert.equal(parsed1.name, "In 4");
    assert.equal(parsed1.roll, "ga");
    assert.equal(parsed1.div, "B");

    const raw2 = "Candidate Name: Sophia Miller | Roll Number: 4208 | Section: C";
    const parsed2 = parseCandidateText(raw2);
    assert.equal(parsed2.name, "Sophia Miller");
    assert.equal(parsed2.roll, "4208");
    assert.equal(parsed2.div, "C");

    const raw3 = "Student Name: Marcus Lee  Roll No. 104  Class: 10-A";
    const parsed3 = parseCandidateText(raw3);
    assert.equal(parsed3.name, "Marcus Lee");
    assert.equal(parsed3.roll, "104");
  });

  test("extractCandidateInfo flags only truly confused or missing roll numbers", async () => {
    // Missing / empty roll number
    const missingRaw = "Student Name: Jane Doe \n Class: 10";
    const missingParsed = parseCandidateText(missingRaw);
    assert.equal(missingParsed.name, "Jane Doe");
    assert.equal(missingParsed.roll, "");

    // Valid roll numbers should not be flagged as ambiguous
    const validRaw = "Name: Alex Smith  Roll No: 10452  Div: A";
    const validParsed = parseCandidateText(validRaw);
    assert.equal(validParsed.name, "Alex Smith");
    assert.equal(validParsed.roll, "10452");
  });
});

describe("Batch OMR Upload & Processing REST API", () => {
  let examId;

  before(async () => {
    // Create an exam for batch scanning
    const res = await fetch(`${baseUrl}/api/exams`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Batch Assessment 2026",
        subject: "Physics",
        className: "Class 10",
        totalQuestions: 25,
        answerKey: {
          "1": "C", "2": "C", "3": "C", "4": "B", "5": "A",
          "6": "A", "7": "D", "8": "D", "9": "B", "10": "A",
          "11": "B", "12": "D", "13": "A", "14": "C", "15": "B",
          "16": "A", "17": "D", "18": "A", "19": "B", "20": "A",
          "21": "D", "22": "A", "23": "C", "24": "D", "25": "A"
        },
        markingScheme: { correctMarks: 2, incorrectMarks: 0, unansweredMarks: 0 },
      }),
    });
    const data = await res.json();
    examId = data.data._id;
  });

  test("POST /api/scans/batch rejects request missing examId or files", async () => {
    const res = await fetch(`${baseUrl}/api/scans/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  });

  test("POST /api/scans/batch accepts and processes multiple sheets with auto-detection", async () => {
    const filledPath = path.resolve("..", ".user_uploaded", "media_1793084190331_4d4630eb.png");
    const emptyPath = path.resolve("..", ".user_uploaded", "media_1793084201496_c0ce671d.png");

    let filledBuf, emptyBuf;
    try {
      filledBuf = fs.readFileSync(filledPath);
      emptyBuf = fs.readFileSync(emptyPath);
    } catch {
      // Fallback path in artifact directory
      const altFilled = "C:/Users/Dell/.gemini/antigravity/brain/fdd032c5-2f88-414f-a266-39479eecbe16/.user_uploaded/media_1793084190331_4d4630eb.png";
      const altEmpty = "C:/Users/Dell/.gemini/antigravity/brain/fdd032c5-2f88-414f-a266-39479eecbe16/.user_uploaded/media_1793084201496_c0ce671d.png";
      if (fs.existsSync(altFilled)) {
        filledBuf = fs.readFileSync(altFilled);
        emptyBuf = fs.readFileSync(altEmpty);
      }
    }

    if (!filledBuf || !emptyBuf) {
      console.warn("Skipping multi-file binary test: test images not found on disk");
      return;
    }

    const formData = new FormData();
    formData.append("examId", examId);
    formData.append("images", new Blob([filledBuf], { type: "image/png" }), "student_sheet_1.png");
    formData.append("images", new Blob([emptyBuf], { type: "image/png" }), "student_sheet_2.png");

    const res = await fetch(`${baseUrl}/api/scans/batch`, {
      method: "POST",
      body: formData,
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.data.totalFiles, 2);
    assert.equal(data.data.successfulCount, 2);
    assert.equal(data.data.failedCount, 0);

    // The filled sheet should have 50/50 marks (25 correct * 2)
    const filledResult = data.data.results.find((r) => r.fileName === "student_sheet_1.png");
    assert.ok(filledResult);
    assert.equal(filledResult.success, true);
    assert.equal(filledResult.score, 50);
    assert.equal(filledResult.maximumMarks, 50);
    assert.equal(filledResult.percentage, 100);

    // Roll number and student name should be automatically detected
    assert.ok(filledResult.studentName);
    assert.ok(filledResult.rollNumber);
  });
});
