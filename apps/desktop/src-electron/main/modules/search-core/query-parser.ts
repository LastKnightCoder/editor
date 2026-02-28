import { ParsedQuery } from "./types";

const SPLIT_PATTERN = /[^\p{L}\p{N}\u4e00-\u9fff]+/u;

export function parseQuery(rawQuery: string): ParsedQuery {
  const normalized = rawQuery.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return {
      raw: rawQuery,
      normalized: "",
      tokens: [],
      isEmpty: true,
    };
  }

  const lowered = normalized.toLowerCase();
  const rawTokens = lowered
    .split(SPLIT_PATTERN)
    .map((token) => token.trim())
    .filter(Boolean);

  const uniqueTokens = Array.from(new Set(rawTokens));

  if (uniqueTokens.length === 0) {
    uniqueTokens.push(lowered);
  }

  return {
    raw: rawQuery,
    normalized,
    tokens: uniqueTokens,
    isEmpty: false,
  };
}
