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

  const norm = rawText.replace(/[\r\n|]+/g, " ");

  let name = "";
  let roll = "";
  let div = "";

  // 1. Name match
  const nameMatch = norm.match(
    /(?:Name|Candidate\s*Name|Student\s*Name)\s*[:.\-_]*\s*(.+?)(?=(?:\bRoll|\bDivision|\bDiv|\bClass|\bDate|\bTotal|$))/i
  );
  if (nameMatch) {
    name = nameMatch[1].replace(/^[\s_.:|\\/-]+|[\s_.:|\\/-]+$/g, "").trim();
  }

  // 2. Roll number match
  const rollMatch = norm.match(
    /(?:Roll\s*No\.?|Roll\s*Number|Roll|Reg\s*No)\s*[:.\-_]*\s*(.+?)(?=(?:\bDivision|\bDivison|\bDiv|\bClass|\bDate|\bTotal|\bSignature|$))/i
  );
  if (rollMatch) {
    roll = rollMatch[1].replace(/^[\s_.:|\\/-]+|[\s_.:|\\/-]+$/g, "").trim();
    // In case extra words leaked in before division
    const rollTokens = roll.split(/\s+/);
    if (rollTokens.length > 0) {
      roll = rollTokens[0];
    }
  }

  // 3. Division match
  const divMatch = norm.match(
    /(?:Division|Divison|Div|Section)\s*[:.\-_]*\s*(.+?)(?=(?:\bDate|\bTotal|\bScore|$))/i
  );
  if (divMatch) {
    div = divMatch[1].replace(/^[\s_.:|\\/-]+|[\s_.:|\\/-]+$/g, "").trim();
    const divTokens = div.split(/\s+/);
    if (divTokens.length > 0) {
      div = divTokens[0];
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

    // Filter clean roll number
    let cleanRoll = roll.replace(/[\s_]/g, "");
    let isRollAmbiguous = false;
    let ambiguityReason = null;

    if (!cleanRoll || cleanRoll.length === 0) {
      isRollAmbiguous = true;
      ambiguityReason = "Roll number could not be detected from answer sheet. Please verify header image.";
      cleanRoll = "UNASSIGNED";
    } else if (!/^\d+$/.test(cleanRoll)) {
      // Non-numeric characters in roll number
      isRollAmbiguous = true;
      ambiguityReason = `Detected roll number '${cleanRoll}' contains uncertain or non-numeric characters. Flagged for verification.`;
    } else if (confidence < 68) {
      isRollAmbiguous = true;
      ambiguityReason = `Roll number OCR confidence (${confidence}%) is below 68% threshold. Flagged for verification.`;
    }

    const cleanName = name || (cleanRoll !== "UNASSIGNED" ? `Student ${cleanRoll}` : "Unassigned Student");

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
