/**
 * Safe Structured Logger.
 * Masks credentials, passwords, and tokens from log output.
 */

const SENSITIVE_KEYS = ["password", "secret", "token", "authorization", "key"];

function sanitize(data) {
  if (!data || typeof data !== "object") return data;
  if (Array.isArray(data)) return data.map(sanitize);

  const cleaned = {};
  for (const [k, v] of Object.entries(data)) {
    if (SENSITIVE_KEYS.some((sk) => k.toLowerCase().includes(sk))) {
      cleaned[k] = "[REDACTED]";
    } else if (typeof v === "object") {
      cleaned[k] = sanitize(v);
    } else {
      cleaned[k] = v;
    }
  }
  return cleaned;
}

export const logger = {
  info: (msg, meta = {}) => {
    console.log(`[INFO] ${new Date().toISOString()} - ${msg}`, Object.keys(meta).length ? sanitize(meta) : "");
  },
  warn: (msg, meta = {}) => {
    console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`, Object.keys(meta).length ? sanitize(meta) : "");
  },
  error: (msg, err = {}) => {
    console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`, err instanceof Error ? err.stack : sanitize(err));
  },
};
