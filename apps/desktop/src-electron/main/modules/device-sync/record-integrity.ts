import { createHash } from "node:crypto";

const fields = [
  "content_id",
  "document_id",
  "baseline_id",
  "epoch",
  "state",
  "paths",
  "updated_at",
  "metric_rules",
];
export function documentChecksum(values: readonly unknown[]) {
  const hash = createHash("sha256");
  for (const value of values) {
    const text = String(value);
    hash.update(`${Buffer.byteLength(text)}:`).update(text);
  }
  return hash.digest("hex");
}
export function validDocumentRecord(row: Record<string, unknown>) {
  return (
    Number(row.content_id) > 0 &&
    ["content_id", "epoch", "updated_at"].every(
      key => Number.isSafeInteger(row[key]) && Number(row[key]) >= 0
    ) &&
    ["document_id", "baseline_id", "state", "paths", "metric_rules"].every(
      key => typeof row[key] === "string"
    ) &&
    row.checksum === documentChecksum(fields.map(key => row[key]))
  );
}
