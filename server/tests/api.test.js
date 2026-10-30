import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import app from "../src/index.js";

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
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

describe("Express Backend REST API Integration Tests", () => {
  let createdExamId;

  test("GET /health returns healthy status", async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, "healthy");
    assert.equal(data.service, "omr-express-backend");
  });

  test("POST /api/exams creates an exam with valid answer key", async () => {
    const payload = {
      title: "Chemistry Midterm 2026",
      subject: "Chemistry",
      className: "Grade 11",
      totalQuestions: 5,
      answerKey: {
        "1": "A",
        "2": "C",
        "3": "B",
        "4": "D",
        "5": "A",
      },
      markingScheme: {
        correctMarks: 2,
        incorrectMarks: 0.5,
        unansweredMarks: 0,
      },
    };

    const res = await fetch(`${baseUrl}/api/exams`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.title, "Chemistry Midterm 2026");
    assert.equal(body.data.totalQuestions, 5);
    createdExamId = body.data._id;
  });

  test("POST /api/exams rejects invalid answer key with Zod validation error", async () => {
    const invalidPayload = {
      title: "Test Exam",
      subject: "Math",
      className: "Grade 9",
      answerKey: {
        "1": "INVALID_OPTION_E", // Invalid
      },
    };

    const res = await fetch(`${baseUrl}/api/exams`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(invalidPayload),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error_code, "VALIDATION_ERROR");
  });

  test("GET /api/exams lists created exams", async () => {
    const res = await fetch(`${baseUrl}/api/exams`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
    assert.ok(body.data.length >= 1);
  });

  test("GET /api/exams/:id retrieves specific exam and preserves full master answerKey", async () => {
    const res = await fetch(`${baseUrl}/api/exams/${createdExamId}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data._id, createdExamId);
    assert.equal(body.data.subject, "Chemistry");
    assert.ok(body.data.answerKey, "answerKey should exist");
    assert.equal(body.data.answerKey["1"], "A");
    assert.equal(body.data.answerKey["2"], "C");
    assert.equal(body.data.answerKey["3"], "B");
    assert.equal(body.data.answerKey["4"], "D");
    assert.equal(body.data.answerKey["5"], "A");
  });

  test("PUT /api/exams/:id updates and preserves master answer key", async () => {
    const res = await fetch(`${baseUrl}/api/exams/${createdExamId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Chemistry Midterm 2026 (Updated)",
        answerKey: {
          "1": "B", // Changed from A to B
          "2": "C",
          "3": "B",
          "4": "D",
          "5": "A",
        },
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.title, "Chemistry Midterm 2026 (Updated)");
    assert.equal(body.data.answerKey["1"], "B");

    // Re-fetch to ensure master answerKey is persisted in database and returned
    const getRes = await fetch(`${baseUrl}/api/exams/${createdExamId}`);
    const getBody = await getRes.json();
    assert.equal(getBody.data.answerKey["1"], "B");
    assert.equal(getBody.data.answerKey["2"], "C");
  });

  test("GET /api/exams/:id/results lists results for exam", async () => {
    const res = await fetch(`${baseUrl}/api/exams/${createdExamId}/results`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
  });

  test("GET /api/exams/:id/results/export downloads CSV", async () => {
    const res = await fetch(`${baseUrl}/api/exams/${createdExamId}/results/export`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "text/csv; charset=utf-8");
    const csvText = await res.text();
    assert.ok(csvText.startsWith("Roll Number,Student Name,Score"));
  });

  test("PUT /api/scans/:id/review with finalize=true confirms in a single atomic call", async () => {
    const { dbStore } = await import("../src/services/dbStore.js");
    const testScan = await dbStore.createScanResult({
      examId: createdExamId,
      studentName: "Pending Student",
      rollNumber: "999",
      detectedAnswers: { "1": "B" },
      reviewRequired: true,
      reviewStatus: "PENDING",
      scanMetadata: {
        nameFlagged: true,
        rollNumberFlagged: true,
      },
    });

    const res = await fetch(`${baseUrl}/api/scans/${testScan._id}/review`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentName: "Confirmed Student",
        rollNumber: "999-OK",
        correctedAnswers: { "1": "A" },
        finalize: true,
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.studentName, "Confirmed Student");
    assert.equal(body.data.rollNumber, "999-OK");
    assert.equal(body.data.reviewStatus, "CONFIRMED");
    assert.equal(body.data.reviewRequired, false);
    assert.equal(body.data.scanMetadata.nameFlagged, false);
    assert.equal(body.data.scanMetadata.rollNumberFlagged, false);
  });

  test("DELETE /api/scans/:id deletes a single student scan result", async () => {
    const { dbStore } = await import("../src/services/dbStore.js");
    const testScan = await dbStore.createScanResult({
      examId: createdExamId,
      studentName: "Student To Delete",
      rollNumber: "DEL-01",
      detectedAnswers: { "1": "A" },
    });

    const res = await fetch(`${baseUrl}/api/scans/${testScan._id}`, {
      method: "DELETE",
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.deleted, true);

    const getRes = await fetch(`${baseUrl}/api/scans/${testScan._id}`);
    assert.equal(getRes.status, 404);
  });

  test("POST /api/scans/delete-batch deletes multiple student scan results", async () => {
    const { dbStore } = await import("../src/services/dbStore.js");
    const s1 = await dbStore.createScanResult({
      examId: createdExamId,
      studentName: "Batch Student 1",
      rollNumber: "BAT-01",
      detectedAnswers: { "1": "A" },
    });
    const s2 = await dbStore.createScanResult({
      examId: createdExamId,
      studentName: "Batch Student 2",
      rollNumber: "BAT-02",
      detectedAnswers: { "1": "B" },
    });

    const res = await fetch(`${baseUrl}/api/scans/delete-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [s1._id, s2._id] }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.deletedCount, 2);

    const getRes1 = await fetch(`${baseUrl}/api/scans/${s1._id}`);
    assert.equal(getRes1.status, 404);
    const getRes2 = await fetch(`${baseUrl}/api/scans/${s2._id}`);
    assert.equal(getRes2.status, 404);
  });

  test("DELETE /api/scans/exam/:examId deletes all scan results for an exam", async () => {
    const { dbStore } = await import("../src/services/dbStore.js");
    await dbStore.createScanResult({
      examId: createdExamId,
      studentName: "Purge Student 1",
      rollNumber: "PUR-01",
      detectedAnswers: { "1": "C" },
    });
    await dbStore.createScanResult({
      examId: createdExamId,
      studentName: "Purge Student 2",
      rollNumber: "PUR-02",
      detectedAnswers: { "1": "D" },
    });

    const res = await fetch(`${baseUrl}/api/scans/exam/${createdExamId}`, {
      method: "DELETE",
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.deletedCount >= 2);

    const listRes = await fetch(`${baseUrl}/api/exams/${createdExamId}/results`);
    const listBody = await listRes.json();
    assert.equal(listBody.data.length, 0);
  });

  test("DELETE /api/exams/:id deletes exam and cascades deletion of its scans", async () => {
    const { dbStore } = await import("../src/services/dbStore.js");
    const tempExam = await dbStore.createExam({
      title: "Temporary Exam For Delete",
      subject: "Test Subject",
      className: "Grade 10",
      totalQuestions: 5,
      answerKey: { "1": "A" },
      markingScheme: { correctMarks: 1, incorrectMarks: 0, unansweredMarks: 0 },
    });

    await dbStore.createScanResult({
      examId: tempExam._id,
      studentName: "Cascade Delete Student",
      rollNumber: "CAS-01",
      detectedAnswers: { "1": "A" },
    });

    const res = await fetch(`${baseUrl}/api/exams/${tempExam._id}`, {
      method: "DELETE",
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);

    const getExamRes = await fetch(`${baseUrl}/api/exams/${tempExam._id}`);
    assert.equal(getExamRes.status, 404);

    const getScansRes = await fetch(`${baseUrl}/api/exams/${tempExam._id}/results`);
    const scansBody = await getScansRes.json();
    assert.equal(scansBody.data.length, 0);
  });
});
