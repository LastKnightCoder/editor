import { createHash } from "node:crypto";
import { brotliCompressSync, brotliDecompressSync, constants } from "node:zlib";
import { canonical } from "./replica.mjs";

const MAX_BYTES = 16 * 1024 * 1024;
const CHUNK_BYTES = 16 * 1024;
const GEAR = Array.from({ length: 256 }, (_, index) => {
  let value = (index + 1) * 0x9e3779b1;
  value ^= value << 13;
  value ^= value >>> 17;
  return (value ^ (value << 5)) >>> 0;
});
function contentChunks(bytes) {
  const chunks = [];
  let start = 0;
  let hash = 0;
  for (let index = 0; index < bytes.length; index++) {
    hash = ((hash << 1) + GEAR[bytes[index]]) >>> 0;
    const size = index + 1 - start;
    if (size >= CHUNK_BYTES || (size >= 2048 && (hash & 8191) === 0)) {
      chunks.push(bytes.subarray(start, index + 1));
      start = index + 1;
      hash = 0;
    }
  }
  if (start < bytes.length) chunks.push(bytes.subarray(start));
  return chunks;
}
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const compress = bytes =>
  brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } });
const bytesOf = value =>
  typeof value === "string" ? Buffer.from(value) : Buffer.from(value.$blob, "hex");
const isLarge = value =>
  typeof value === "string"
    ? Buffer.byteLength(value) >= 4096
    : value !== null && typeof value === "object" && typeof value.$blob === "string";

export class FieldCodec {
  constructor(db) {
    this.db = db;
    db.exec(
      "CREATE TABLE IF NOT EXISTS _spike_chunks(hash TEXT PRIMARY KEY, raw_size INTEGER NOT NULL, data BLOB NOT NULL)"
    );
  }

  pack(value) {
    if (!isLarge(value)) return value;
    const bytes = bytesOf(value);
    if (bytes.length > MAX_BYTES) throw new Error("大字段超过 16 MiB");
    const chunks = [];
    for (const chunk of contentChunks(bytes)) {
      const hash = digest(chunk);
      if (!this.db.prepare("SELECT 1 FROM _spike_chunks WHERE hash=?").get(hash))
        this.db
          .prepare("INSERT INTO _spike_chunks VALUES(?,?,?)")
          .run(hash, chunk.length, compress(chunk));
      chunks.push(hash);
    }
    return {
      $chunks: chunks,
      size: bytes.length,
      hash: digest(bytes),
      kind: typeof value === "string" ? "text" : "blob",
    };
  }

  unpack(value) {
    if (!value || typeof value !== "object" || !value.$chunks) return value;
    if (!Number.isSafeInteger(value.size) || value.size < 0 || value.size > MAX_BYTES)
      throw new Error("分块长度无效");
    if (!Array.isArray(value.$chunks) || value.$chunks.length > MAX_BYTES / 2048 + 1)
      throw new Error("分块数量无效");
    let total = 0;
    const parts = value.$chunks.map(hash => {
      const stored = this.db.prepare("SELECT * FROM _spike_chunks WHERE hash=?").get(hash);
      if (!stored) throw new Error("缺少内容块");
      const bytes = brotliDecompressSync(stored.data, { maxOutputLength: CHUNK_BYTES });
      if (bytes.length !== stored.raw_size || digest(bytes) !== hash)
        throw new Error("内容块校验失败");
      total += bytes.length;
      if (total > value.size) throw new Error("分块总长超限");
      return bytes;
    });
    return this.fromBytes(Buffer.concat(parts), value);
  }

  fromBytes(bytes, descriptor) {
    if (bytes.length !== descriptor.size || digest(bytes) !== descriptor.hash)
      throw new Error("字段摘要校验失败");
    if (descriptor.kind === "blob") return { $blob: bytes.toString("hex").toUpperCase() };
    if (descriptor.kind !== "text") throw new Error("字段类型无效");
    const text = bytes.toString("utf8");
    if (!Buffer.from(text).equals(bytes)) throw new Error("字段不是合法 UTF-8");
    return text;
  }

  encode(value, previous) {
    if (!isLarge(value)) return { value };
    const bytes = bytesOf(value);
    if (bytes.length > MAX_BYTES) throw new Error("大字段超过 16 MiB");
    const common = {
      kind: typeof value === "string" ? "text" : "blob",
      hash: digest(bytes),
      size: bytes.length,
    };
    const snapshot = { ...common, codec: "snapshot", data: compress(bytes).toString("base64") };
    if (typeof value !== typeof previous || previous === null || previous === undefined)
      return snapshot;
    const before = bytesOf(previous);
    let prefix = 0;
    while (prefix < Math.min(bytes.length, before.length) && bytes[prefix] === before[prefix])
      prefix++;
    let suffix = 0;
    while (
      suffix < Math.min(bytes.length, before.length) - prefix &&
      bytes[bytes.length - suffix - 1] === before[before.length - suffix - 1]
    )
      suffix++;
    const patch = {
      ...common,
      codec: "splice",
      baseHash: digest(before),
      offset: prefix,
      remove: before.length - prefix - suffix,
      data: compress(bytes.subarray(prefix, bytes.length - suffix)).toString("base64"),
    };
    return Buffer.byteLength(canonical(patch)) < Buffer.byteLength(canonical(snapshot))
      ? patch
      : snapshot;
  }

  decode(encoded, previous) {
    if (Object.hasOwn(encoded, "value")) return encoded.value;
    if (!Number.isSafeInteger(encoded.size) || encoded.size < 0 || encoded.size > MAX_BYTES)
      throw new Error("差量长度无效");
    const inserted = brotliDecompressSync(Buffer.from(encoded.data, "base64"), {
      maxOutputLength: MAX_BYTES,
    });
    if (encoded.codec === "snapshot") return this.fromBytes(inserted, encoded);
    if (encoded.codec !== "splice" || previous === undefined || previous === null)
      throw new Error("缺少差量基线");
    const before = bytesOf(previous);
    if (
      digest(before) !== encoded.baseHash ||
      !Number.isSafeInteger(encoded.offset) ||
      !Number.isSafeInteger(encoded.remove) ||
      encoded.offset < 0 ||
      encoded.remove < 0 ||
      encoded.offset + encoded.remove > before.length
    )
      throw new Error("差量基线或范围无效");
    if (before.length - encoded.remove + inserted.length > MAX_BYTES)
      throw new Error("差量结果超限");
    return this.fromBytes(
      Buffer.concat([
        before.subarray(0, encoded.offset),
        inserted,
        before.subarray(encoded.offset + encoded.remove),
      ]),
      encoded
    );
  }

  packRow(row) {
    return row === null
      ? null
      : Object.fromEntries(Object.entries(row).map(([key, value]) => [key, this.pack(value)]));
  }

  unpackRow(row) {
    return row === null
      ? null
      : Object.fromEntries(Object.entries(row).map(([key, value]) => [key, this.unpack(value)]));
  }
}
