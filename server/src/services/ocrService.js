import { createWorker } from "tesseract.js";

let cachedWorker = null;
let isInitializing = false;
let initPromise = null;

/**
 * Gets or initializes a singleton Tesseract.js OCR worker.
 */
async function getWorker() {
  if (cachedWorker) return cachedWorker;

  if (isInitializing && initPromise) {
    return await initPromise;
  }

  isInitializing = true;
  initPromise = (async () => {
    try {
      const worker = await createWorker("eng");
      cachedWorker = worker;
      return worker;
    } finally {
      isInitializing = false;
    }
  })();

  return await initPromise;
}

/**
 * Parses raw text extracted from candidate header to find Name, Roll No, and Division.
 */
export function parseCandidateText(rawText) {
  if (!rawText) {
    return { name: "", roll: "", div: "" };
  }

  // Replace newlines, pipes, vertical bars, and repeated spaces
  const norm = rawText.replace(/[\r\n|│┃]+/g, " ").replace(/\s+/g, " ");

  let name = "";
  let roll = "";
  let div = "";

  // 1. Name match: matches Name:, ame:, dame:, Candidate Name:, Student Name:
  const nameMatch = norm.match(
    /(?:(?:^|\s)(?:[A-Za-z]?ame|Candidate(?:\s*Name)?|Student(?:\s*Name)?))\s*[:.\-_]*\s*(.+?)(?=(?:\s*(?:\bRoll|\bRollo|\bReg|\bDivision|\bDivison|\bDiv|\bSection|\bClass|\bDate|\bTotal)|$))/i
  );
  if (nameMatch) {
    name = nameMatch[1].replace(/^[\s_.:|\\/-]+|[\s_.:|\\/-]+$/g, "").trim();
    // Strip leading document title fragments if any
    name = name.replace(/^(?:OMR|ANSWER|SHEET|ASSESSMENT|EXAM)\s+/i, "").trim();
  }

  // 2. Roll number match: matches Roll No:, Rollo:, Roll Number:, Roll:, Reg No:
  const rollMatch = norm.match(
    /(?:(?:^|\s)(?:Roll\s*No\.?|Rollo\.?|Roll\s*Number|Roll|Reg\s*No\.?))\s*[:.\-_]*\s*(.+?)(?=(?:\s*(?:\bDivision|\bDivison|\bDiv|\bSection|\bClass|\bDate|\bTotal|\bScore|\bSignature)|$))/i
  );
  if (rollMatch) {
    let r = rollMatch[1].replace(/^[\s_.:|\\/-]+|[\s_.:|\\/-]+$/g, "").trim();
    const tokens = r.split(/\s+/);
    if (tokens.length > 0) {
      roll = tokens[0];
    }
  }

  // 3. Division match: matches Division:, Divison:, Div:, Section:, Class:
  const divMatch = norm.match(
    /(?:(?:^|\s)(?:Division|Divison|Div|Section|Class))\s*[:.\-_]*\s*(.+?)(?=(?:\s*(?:\bDate|\bTotal|\bScore|\bSignature)|$))/i
  );
  if (divMatch) {
    let d = divMatch[1].replace(/^[\s_.:|\\/-]+|[\s_.:|\\/-]+$/g, "").trim();
    const tokens = d.split(/\s+/);
    if (tokens.length > 0) {
      div = tokens[0];
    }
  }

  return { name, roll, div };
}

/**
 * Extracts candidate identification from a header image base64 or buffer.
 */
export async function extractCandidateInfo({ headerImageBase64, imageBuffer }) {
  try {
    let inputSource = null;
    if (headerImageBase64) {
      inputSource = Buffer.from(headerImageBase64, "base64");
    } else if (imageBuffer) {
      inputSource = imageBuffer;
    }

    if (!inputSource) {
      return {
        studentName: "Unassigned Student",
        rollNumber: "UNASSIGNED",
        division: null,
        confidence: 0,
        isAmbiguous: true,
        ambiguityReason: "No header image available for candidate OCR.",
        rawOcrText: "",
      };
    }

    const worker = await getWorker();
    const ret = await worker.recognize(inputSource);

    const rawText = ret.data.text || "";
    const confidence = Math.round(ret.data.confidence || 0);

    const { name, roll, div } = parseCandidateText(rawText);

    // Sanitize roll number
    let cleanRoll = roll.replace(/^[\s_.:|\\/-]+|[\s_.:|\\/-]+$/g, "").trim();
    cleanRoll = cleanRoll.replace(/[_.:-]+/g, "");

    let isRollAmbiguous = false;
    let ambiguityReason = null;

    // "Only very confused one should be flagged":
    // Only flag if completely empty, only punctuation, or excessively long noise
    if (!cleanRoll || cleanRoll.length === 0 || cleanRoll.toUpperCase() === "UNASSIGNED") {
      isRollAmbiguous = true;
      ambiguityReason = "Roll number was not found on the answer sheet.";
      cleanRoll = "UNASSIGNED";
    } else if (cleanRoll.replace(/[^A-Za-z0-9]/g, "").length === 0) {
      isRollAmbiguous = true;
      ambiguityReason = "Roll number contains only symbols or punctuation.";
      cleanRoll = "UNASSIGNED";
    } else if (cleanRoll.length > 15) {
      isRollAmbiguous = true;
      ambiguityReason = "Roll number format unclear (exceeds 15 characters).";
    }

    const cleanName =
      name && name.length >= 2
        ? name
        : cleanRoll !== "UNASSIGNED"
        ? `Student ${cleanRoll}`
        : "Unassigned Student";

    return {
      studentName: cleanName,
      rollNumber: cleanRoll,
      division: div || null,
      confidence,
      isAmbiguous: isRollAmbiguous,
      ambiguityReason,
      rawOcrText: rawText.trim(),
    };
  } catch (err) {
    console.error("OCR extraction failed:", err);
    return {
      studentName: "Unassigned Student",
      rollNumber: "UNASSIGNED",
      division: null,
      confidence: 0,
      isAmbiguous: true,
      ambiguityReason: `OCR extraction error: ${err.message}`,
      rawOcrText: "",
    };
  }
}

/**
 * Terminates the worker during app shutdown or test cleanup.
 */
export async function terminateWorker() {
  if (cachedWorker) {
    await cachedWorker.terminate();
    cachedWorker = null;
  }
}
