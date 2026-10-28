/**
 * Roster Matching and Cross-Validation Utility for OMR Candidate Identification.
 * 
 * Provides string distance, token-level fuzzy matching, and cross-validation between
 * recognized candidate roll numbers, handwritten student names, and the optional exam roster.
 */

/**
 * Computes Levenshtein distance between two strings.
 */
export function levenshteinDistance(s1, s2) {
  const m = s1.length;
  const n = s2.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

/**
 * Computes normalized fuzzy similarity between two names (range: 0.0 to 1.0).
 * Handles differences in middle initials, abbreviations, casing, and spacing.
 */
export function computeNameSimilarity(nameA, nameB) {
  if (!nameA || !nameB) return 0.0;

  const clean = (str) =>
    str
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const strA = clean(nameA);
  const strB = clean(nameB);

  if (!strA || !strB) return 0.0;
  if (strA === strB) return 1.0;

  // Direct Levenshtein similarity
  const maxLen = Math.max(strA.length, strB.length);
  const editDist = levenshteinDistance(strA, strB);
  const directSim = 1.0 - editDist / maxLen;

  // Token-level jaccard/subset similarity (handles middle initials like "Jeet D Rawat" vs "Jeet Rawat")
  const tokensA = strA.split(" ").filter(Boolean);
  const tokensB = strB.split(" ").filter(Boolean);

  let tokenMatches = 0;
  for (const tA of tokensA) {
    for (const tB of tokensB) {
      if (tA === tB) {
        tokenMatches += 1;
        break;
      } else if (
        (tA.length === 1 && tB.startsWith(tA)) ||
        (tB.length === 1 && tA.startsWith(tB))
      ) {
        // Initial match, e.g. "D" with "Dev" or "D."
        tokenMatches += 0.8;
        break;
      } else {
        const tDist = levenshteinDistance(tA, tB);
        const tMax = Math.max(tA.length, tB.length);
        if (tDist / tMax <= 0.3) {
          tokenMatches += 0.7;
          break;
        }
      }
    }
  }

  const tokenSim = (2.0 * tokenMatches) / (tokensA.length + tokensB.length);

  // Return weighted maximum of direct similarity and token similarity
  return Math.max(directSim, tokenSim * 0.95);
}

/**
 * Cross-validates candidate identification against the exam student roster.
 *
 * @param {Object} params
 * @param {string} params.recognizedName - Student name recognized by candidate OCR
 * @param {string} params.recognizedRoll - Student roll number recognized by candidate OCR
 * @param {Array<{rollNumber: string, studentName: string}>} [params.roster] - Exam student roster
 * @returns {Object} Structured validation output
 */
export function matchStudentWithRoster({ recognizedName, recognizedRoll, roster }) {
  const result = {
    matched: false,
    rosterName: null,
    similarity: 0,
    flag: false,
    reason: null,
    suggestedName: recognizedName || "Unassigned Student",
  };

  if (!Array.isArray(roster) || roster.length === 0) {
    return result;
  }

  const normRoll = String(recognizedRoll || "").trim().toLowerCase();
  const isRollValid = normRoll && normRoll !== "unassigned";
  const isNameValid =
    recognizedName &&
    recognizedName !== "Unassigned Student" &&
    !recognizedName.startsWith("Student ") &&
    recognizedName.trim().length > 2;

  // 1. Look up by Roll Number if recognized
  if (isRollValid) {
    const rosterByRoll = roster.find(
      (entry) => String(entry.rollNumber).trim().toLowerCase() === normRoll
    );

    if (rosterByRoll) {
      const rosterName = rosterByRoll.studentName;
      if (!isNameValid) {
        // Name was blank or unassigned, but roll matches roster exactly
        return {
          matched: true,
          rosterName,
          similarity: 100,
          flag: false,
          reason: null,
          suggestedName: rosterName,
        };
      }

      const sim = computeNameSimilarity(recognizedName, rosterName);
      const simPercent = Math.round(sim * 100);

      if (sim >= 0.55) {
        // High/moderate agreement between OCR name and roster entry
        return {
          matched: true,
          rosterName,
          similarity: simPercent,
          flag: false,
          reason: null,
          suggestedName: rosterName, // Use canonical roster name spelling
        };
      } else if (sim < 0.35) {
        // Strong discrepancy: roll number belongs to Student A, but name appears to be Student B
        return {
          matched: false,
          rosterName,
          similarity: simPercent,
          flag: true,
          reason: `Discrepancy: Roll number '${recognizedRoll}' is registered to "${rosterName}", but handwritten name looks like "${recognizedName}".`,
          suggestedName: recognizedName,
        };
      } else {
        // Borderline similarity
        return {
          matched: false,
          rosterName,
          similarity: simPercent,
          flag: true,
          reason: `Low confidence match with roster student "${rosterName}" (${simPercent}%). Please verify student identity.`,
          suggestedName: recognizedName,
        };
      }
    } else {
      // Roll number was recognized, but is NOT present in the class roster!
      result.flag = true;
      result.reason = `Roll number '${recognizedRoll}' is not registered in this examination's student roster.`;
    }
  }

  // 2. If roll was not found or was UNASSIGNED, try matching by Name across roster
  if (isNameValid) {
    const scoredRoster = roster
      .map((entry) => ({
        entry,
        sim: computeNameSimilarity(recognizedName, entry.studentName),
      }))
      .filter((s) => s.sim >= 0.6)
      .sort((a, b) => b.sim - a.sim);

    if (scoredRoster.length === 1) {
      const best = scoredRoster[0];
      return {
        matched: true,
        rosterName: best.entry.studentName,
        similarity: Math.round(best.sim * 100),
        flag: false,
        reason: null,
        suggestedName: best.entry.studentName,
        suggestedRoll: best.entry.rollNumber,
      };
    } else if (scoredRoster.length > 1) {
      const diff = scoredRoster[0].sim - scoredRoster[1].sim;
      if (diff >= 0.2) {
        // Clear winner
        const best = scoredRoster[0];
        return {
          matched: true,
          rosterName: best.entry.studentName,
          similarity: Math.round(best.sim * 100),
          flag: false,
          reason: null,
          suggestedName: best.entry.studentName,
          suggestedRoll: best.entry.rollNumber,
        };
      } else {
        // Multiple close candidates
        return {
          matched: false,
          rosterName: null,
          similarity: Math.round(scoredRoster[0].sim * 100),
          flag: true,
          reason: `Multiple roster students match the handwritten name "${recognizedName}" (${scoredRoster.map((s) => s.entry.studentName).join(", ")}).`,
          suggestedName: recognizedName,
        };
      }
    }
  }

  return result;
}
