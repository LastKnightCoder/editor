export const LIMITS = Object.freeze({
  sourceBytes: 64 * 1024,
  messageBytes: 16 * 1024,
  memoryBytes: 8 * 1024 * 1024,
  stackBytes: 256 * 1024,
  calls: 64,
  concurrentCalls: 8,
  executionMs: 1000,
  lifetimeMs: 5000,
});

export function boundedText(value, max = LIMITS.messageBytes) {
  return typeof value === "string" && Buffer.byteLength(value, "utf8") <= max;
}

export function exactKeys(value, keys) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every(key => Object.hasOwn(value, key))
  );
}
