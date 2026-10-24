import protocol from "../storage-protocol.json";
export const STORAGE_PROTOCOL = Object.freeze(protocol);
export const CHUNK_BYTES = protocol.chunkBytes;
export const MANIFEST_BYTES = protocol.manifestBytes;
export const RESOURCE_OBJECT_PREFIX = `${protocol.namespace}/resources/`;
export type Digest = (bytes: Uint8Array) => Promise<string>;
export interface Chunk {
  size: number;
  sha256: string;
}
export interface ChunkManifest {
  format: string;
  version: number;
  size: number;
  rootHash: string;
  name: string;
  chunks: Chunk[];
}
export interface ObjectStorage {
  fileExists?(name: string): Promise<boolean>;
  uploadFile(name: string, bytes: Uint8Array): Promise<boolean>;
  downloadFile(name: string): Promise<Uint8Array>;
}
export const chunkObject = (hash: string) =>
  `${protocol.namespace}/chunks/${hash.slice(0, 2)}/${hash.slice(2)}.bin`;
export const snapshotObject = (id: string) => `${protocol.namespace}/snapshots/${id}.json`;
export const databaseVersionObject = async (name: string, digest: Digest) =>
  `${protocol.namespace}/databases/${await digest(new TextEncoder().encode(name))}.json`;
export async function resourceManifestObject(name: string, digest: Digest): Promise<string> {
  const hash = await digest(new TextEncoder().encode(name));
  return `${RESOURCE_OBJECT_PREFIX}${hash.slice(0, 2)}/${hash.slice(2)}.json`;
}
const sha = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export function assertFileName(name: unknown): asserts name is string {
  if (typeof name !== "string" || !name || name === "." || name === "..")
    throw new Error("同步文件名无效");
  for (const character of name) {
    const code = character.charCodeAt(0);
    if (character === "/" || character === "\\" || code <= 31 || (code >= 127 && code <= 159))
      throw new Error("同步文件名无效");
  }
}
export function rootPayload(manifest: Pick<ChunkManifest, "name" | "size" | "chunks">): Uint8Array {
  return new TextEncoder().encode(
    `${protocol.format}:${protocol.version}\n${manifest.name}\n${manifest.size}\n${manifest.chunks.map(chunk => `${chunk.size}:${chunk.sha256}\n`).join("")}`
  );
}
export async function decodeChunkManifest(
  bytes: Uint8Array,
  digest: Digest
): Promise<ChunkManifest> {
  if (bytes.length > MANIFEST_BYTES) throw new Error("同步文件清单过大");
  const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (
    !value ||
    value.format !== protocol.format ||
    value.version !== protocol.version ||
    !Number.isSafeInteger(value.size) ||
    value.size < 0 ||
    !sha(value.rootHash) ||
    !Array.isArray(value.chunks)
  )
    throw new Error("同步文件清单格式无效");
  assertFileName(value.name);
  let size = 0;
  for (let index = 0; index < value.chunks.length; index++) {
    const chunk = value.chunks[index];
    if (
      !chunk ||
      !Number.isSafeInteger(chunk.size) ||
      chunk.size <= 0 ||
      chunk.size > CHUNK_BYTES ||
      (index < value.chunks.length - 1 && chunk.size !== CHUNK_BYTES) ||
      !sha(chunk.sha256)
    )
      throw new Error("同步分块描述无效");
    size += chunk.size;
  }
  if (size !== value.size || (await digest(rootPayload(value))) !== value.rootHash)
    throw new Error("同步清单长度或校验值不匹配");
  return value;
}
export async function uploadChunkedFile(
  store: ObjectStorage,
  object: string,
  name: string,
  source: {
    size: number;
    read(offset: number, length: number): Promise<Uint8Array>;
    assertUnchanged?(): Promise<void>;
  },
  digest: Digest,
  check: () => void = () => undefined
): Promise<ChunkManifest> {
  assertFileName(name);
  if (!Number.isSafeInteger(source.size) || source.size < 0) throw new Error("本地文件大小无效");
  const manifest: ChunkManifest = {
    format: protocol.format,
    version: protocol.version,
    name,
    size: source.size,
    chunks: [],
    rootHash: "",
  };
  for (let offset = 0; offset < source.size; offset += CHUNK_BYTES) {
    check();
    const length = Math.min(CHUNK_BYTES, source.size - offset);
    const bytes = await source.read(offset, length);
    if (bytes.length !== length) throw new Error("本地文件读取不完整");
    const hash = await digest(bytes);
    let reusable = false;
    const key = chunkObject(hash);
    if (await store.fileExists?.(key)) {
      const existing = await store.downloadFile(key);
      reusable = existing.length === length && (await digest(existing)) === hash;
    }
    if (!reusable && !(await store.uploadFile(key, bytes))) throw new Error("同步分块上传失败");
    manifest.chunks.push({ size: length, sha256: hash });
    if (manifest.chunks.length * 100 > MANIFEST_BYTES) throw new Error("同步文件清单过大");
  }
  await source.assertUnchanged?.();
  manifest.rootHash = await digest(rootPayload(manifest));
  const bytes = new TextEncoder().encode(JSON.stringify(manifest));
  if (bytes.length > MANIFEST_BYTES) throw new Error("同步文件清单过大");
  check();
  if (!(await store.uploadFile(object, bytes))) throw new Error("同步文件清单上传失败");
  return manifest;
}
export async function downloadChunkedFile(
  store: Pick<ObjectStorage, "downloadFile">,
  object: string,
  write: (bytes: Uint8Array, offset: number) => Promise<void>,
  digest: Digest,
  check: () => void = () => undefined
): Promise<ChunkManifest> {
  check();
  const manifest = await decodeChunkManifest(await store.downloadFile(object), digest);
  let offset = 0;
  for (const chunk of manifest.chunks) {
    check();
    const bytes = await store.downloadFile(chunkObject(chunk.sha256));
    if (bytes.length !== chunk.size || (await digest(bytes)) !== chunk.sha256)
      throw new Error("同步分块内容校验失败");
    await write(bytes, offset);
    offset += bytes.length;
  }
  check();
  return manifest;
}
export interface SessionDirectoryManifest {
  format: "tau-session-directory";
  version: 1;
  files: { name: string; object: string }[];
}
export function decodeSessionDirectory(bytes: Uint8Array): SessionDirectoryManifest {
  if (bytes.length > MANIFEST_BYTES) throw new Error("会话清单过大");
  const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (
    value?.format !== "tau-session-directory" ||
    value.version !== 1 ||
    !Array.isArray(value.files)
  )
    throw new Error("会话清单格式无效");
  const names = new Set<string>();
  for (const entry of value.files) {
    assertFileName(entry?.name);
    if (
      !entry.name.endsWith(".jsonl") ||
      names.has(entry.name) ||
      typeof entry.object !== "string" ||
      !entry.object.startsWith(`${protocol.namespace}/snapshots/`) ||
      !/^[a-zA-Z0-9-]+\.json$/.test(entry.object.slice(`${protocol.namespace}/snapshots/`.length))
    )
      throw new Error("会话清单条目无效");
    names.add(entry.name);
  }
  return value;
}
