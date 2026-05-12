export function parsePositiveInt(
  value: string | undefined,
  name: string,
): number | null {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    return null;
  }
  return n;
}

export function parsePositiveIntOrError(
  value: string | undefined,
  name: string,
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (!value) return { ok: true, value: null };
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    return { ok: false, error: `${name} must be a positive integer.` };
  }
  return { ok: true, value: n };
}

export function clampLimit(
  raw: string | undefined,
  defaultVal = 20,
  max = 200,
): number {
  if (!raw) return defaultVal;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return defaultVal;
  return Math.min(max, n);
}

export function validateEnum<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  name: string,
): { ok: true; value: T | undefined } | { ok: false; error: string } {
  if (!value) return { ok: true, value: undefined };
  if (allowed.includes(value as T)) return { ok: true, value: value as T };
  return { ok: false, error: `${name} must be one of: ${allowed.join(", ")}` };
}
