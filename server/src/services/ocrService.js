import { createWorker } from "tesseract.js";

let cachedWorker = null;
let isInitializing = false;
let initPromise = null;
let workerQueue = Promise.resolve();

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
 * Executes OCR through a serialized queue to prevent concurrent race conditions
 * or WASM worker collisions during batch processing (50-100 files).
 */
export async function recognizeQueued(inputSource) {
  return new Promise((resolve, reject) => {
    workerQueue = workerQueue.then(async () => {
      try {
        const worker = await getWorker();
        const ret = await worker.recognize(inputSource);
        resolve(ret);
      } catch (err) {
        reject(err);
      }
    });
  });
}

/**
 * Cleans and converts candidate roll string to numeric digits,
 * resolving common OCR handwriting confusions.
 */
export function cleanRollNumber(raw) {
  if (!raw) return "UNASSIGNED";
  // Remove noise symbols, underscores, hashes, brackets
  let s = raw.replace(/[^A-Za-z0-9§]/g, "");
  if (!s || /^(50|150|Score|Total|Date)$/i.test(s)) {
    return "UNASSIGNED";
  }

  // If it already has numeric digits, prioritize them
  const digitMatch = s.match(/\d+/);
  if (digitMatch && digitMatch[0].length > 0) {
    return digitMatch[0];
  }

  // Map handwriting OCR confusions (e.g. 'ga' -> '52', '§' -> '5')
  const mapped = s
    .replace(/[§sSgG]/g, "5")
    .replace(/[OoQD]/g, "0")
    .replace(/[a]/g, "2")
    .replace(/[Il|i!t\]\[]/g, "1")
    .replace(/[Zz]/g, "2")
    .replace(/[bB]/g, "8");

  const m2 = mapped.match(/\d+/);
  return m2 ? m2[0] : s;
}

/**
 * Parses raw text extracted from candidate header to find Name, Roll No, and Division.
 */
export function parseCandidateText(rawText) {
  if (!rawText) {
    return { name: "", roll: "", div: "" };
  }

  const lines = rawText.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);

  let name = "";
  let roll = "";
  let div = "";

  for (const line of lines) {
    if (/^OMR\s*ANSWER\s*SHEET/i.test(line) || /^Fill\s*one\s*circle/i.test(line)) {
      continue;
    }

    const lNorm = line.replace(/[\r\n|]+/g, " ");

    // 1. Roll Number (order longest match first)
    if (!roll) {
      const rMatch = lNorm.match(
        /(?:Roll\s*(?:No\.?|Number|Num)|Rollo|Roto|Roil|Roli|Reg\s*No|Roll|rte|rto|R\s*No|one\s*a)[.:\-_=|\s#]*([0-9A-Za-z§#]+)/i
      );
      if (rMatch) {
        let token = rMatch[1].replace(/^[_\s.:#=-]+|[_\s.:#=-]+$/g, "");
        if (token && !/^(50|150|Score|Total|Date)$/i.test(token)) {
          roll = token;
        }
      }
    }

    // 2. Division
    if (!div) {
      const dMatch = lNorm.match(
        /(?:Division|Divison|Div|Section|pvision|bivision|oon|onion|Class)[.:\-_=|\s]*([A-Za-z0-9]+)/i
      );
      if (dMatch) {
        div = dMatch[1].replace(/^[_\s.:=-]+|[_\s.:=-]+$/g, "");
      }
    }

    // 3. Name (only check candidate header row, not score row)
    if (!name && !/^(Total|Date|Score|50\s*marks)/i.test(lNorm)) {
      const nMatch = lNorm.match(
        /(?:Name|Candidate\s*Name|Student\s*Name|Namel|Na:?|Namo|\bNa\b)[.:\-_=|\s]*([A-Za-z0-9\s]{2,40}?)(?=(?:\bRoll|\bRollo|\bRoto|\brte|\brto|\bone|\bDivision|\bpvision|\bDiv|\bClass|\bDate|\bTotal|$))/i
      );
      if (nMatch) {
        name = nMatch[1].replace(/^[\s_.:|\\/=-]+|[\s_.:|\\/=-]+$/g, "").trim();
      }

      if (!name || name.length < 2) {
        const preRoll = lNorm.match(/([A-Za-z0-9\s]{3,35})\s*[\[.:\-_=]*\s*(?:Roll\s*No|Rollo|Roto|rte|rto|Roll)/i);
        if (preRoll) {
          name = preRoll[1].replace(/^[\s_.:|\\/=-]+|[\s_.:|\\/=-]+$/g, "").trim();
        }
      }
    }
  }

  // Remove common template words if they slipped in
  if (name) {
    const cleanWords = name
      .split(/\s+/)
      .filter((w) => !/^(OMR|ANSWER|SHEET|Total|Score|Date|Division|Section|Roll|Rollo|Roto|one|marks)$/i.test(w));
    name = cleanWords.join(" ").trim();
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

    const ret = await recognizeQueued(inputSource);

    const rawText = ret.data.text || "";
    const confidence = Math.round(ret.data.confidence || 0);

    const { name, roll, div } = parseCandidateText(rawText);

    let cleanRoll = cleanRollNumber(roll);
    let isRollAmbiguous = false;
    let ambiguityReason = null;

    if (!cleanRoll || cleanRoll === "UNASSIGNED") {
      isRollAmbiguous = true;
      ambiguityReason = "Roll number could not be detected from answer sheet. Please verify header image.";
      cleanRoll = "UNASSIGNED";
    } else if (!/^\d+$/.test(cleanRoll)) {
      isRollAmbiguous = true;
      ambiguityReason = `Detected roll number '${cleanRoll}' contains uncertain or non-numeric characters. Flagged for verification.`;
    }

    // Name normalization: If recognized even a bit, use it!
    let cleanName = name ? name.trim() : "";
    if (!cleanName || cleanName.length < 2) {
      cleanName = cleanRoll !== "UNASSIGNED" ? `Student ${cleanRoll}` : "Unassigned Student";
    }

    // Only flag red for review if roll number is missing/ambiguous OR candidate is completely unassigned
    const isCandidateAmbiguous = isRollAmbiguous || (cleanRoll === "UNASSIGNED" && cleanName === "Unassigned Student");

    return {
      studentName: cleanName,
      rollNumber: cleanRoll,
      division: div || null,
      confidence,
      isAmbiguous: isCandidateAmbiguous,
      ambiguityReason: isCandidateAmbiguous ? (ambiguityReason || "Candidate identification requires teacher review.") : null,
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
