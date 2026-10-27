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

  test("GET /api/exams/:id retrieves specific exam", async () => {
    const res = await fetch(`${baseUrl}/api/exams/${createdExamId}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data._id, createdExamId);
    assert.equal(body.data.subject, "Chemistry");
  });

  test("PUT /api/exams/:id updates exam metadata", async () => {
    const res = await fetch(`${baseUrl}/api/exams/${createdExamId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Chemistry Midterm 2026 (Updated)",
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.title, "Chemistry Midterm 2026 (Updated)");
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
});
