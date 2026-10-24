import { open, mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  uploadChunkedFile,
  downloadChunkedFile,
  type ObjectStorage,
  CHUNK_BYTES,
} from "@tau/db-schema/sync-protocol";
export const chunkDigest = async (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
export async function uploadChunkedPath(
  store: ObjectStorage,
  object: string,
  filePath: string,
  check?: () => void
) {
  const file = await open(filePath, "r");
  try {
    const before = await file.stat();
    return await uploadChunkedFile(
      store,
      object,
      path.basename(filePath),
      {
        size: before.size,
        read: async (offset, length) => {
          const bytes = Buffer.alloc(length);
          let total = 0;
          while (total < length) {
            const result = await file.read(bytes, total, length - total, offset + total);
            if (!result.bytesRead) break;
            total += result.bytesRead;
          }
          return bytes.subarray(0, total);
        },
        assertUnchanged: async () => {
          const after = await file.stat();
          if (after.size !== before.size || after.mtimeMs !== before.mtimeMs)
            throw new Error("同步期间本地文件已变化");
        },
      },
      chunkDigest,
      check
    );
  } finally {
    await file.close();
  }
}
export async function downloadChunkedPath(
  store: Pick<ObjectStorage, "downloadFile">,
  object: string,
  target: string,
  check?: () => void,
  expectedName?: string
) {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.chunks.tmp`;
  const file = await open(temporary, "wx", 0o600);
  try {
    const manifest = await downloadChunkedFile(
      store,
      object,
      async (bytes, offset) => {
        let total = 0;
        while (total < bytes.length) {
          const result = await file.write(bytes, total, bytes.length - total, offset + total);
          if (!result.bytesWritten) throw new Error("同步文件写入失败");
          total += result.bytesWritten;
        }
      },
      chunkDigest,
      check
    );
    if (expectedName && manifest.name !== expectedName) throw new Error("资源文件身份不匹配");
    await file.sync();
    await file.close();
    check?.();
    await rename(temporary, target);
    return manifest;
  } finally {
    await file.close().catch(() => undefined);
    await rm(temporary, { force: true });
  }
}
export async function readFileSlice(filePath: string, offset: number, length: number) {
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    !Number.isSafeInteger(length) ||
    length < 0 ||
    length > CHUNK_BYTES
  )
    throw new Error("文件分块范围无效");
  const file = await open(filePath, "r");
  try {
    const bytes = Buffer.alloc(length);
    let total = 0;
    while (total < length) {
      const result = await file.read(bytes, total, length - total, offset + total);
      if (!result.bytesRead) break;
      total += result.bytesRead;
    }
    return bytes.subarray(0, total);
  } finally {
    await file.close();
  }
}
export async function writeFileSlice(filePath: string, offset: number, bytes: Uint8Array) {
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    !(bytes instanceof Uint8Array) ||
    bytes.length > CHUNK_BYTES
  )
    throw new Error("文件分块范围无效");
  const file = await open(filePath, offset === 0 ? "w" : "r+", 0o600);
  try {
    if ((await file.stat()).size !== offset) throw new Error("文件分块写入顺序无效");
    let total = 0;
    while (total < bytes.length) {
      const result = await file.write(bytes, total, bytes.length - total, offset + total);
      if (!result.bytesWritten) throw new Error("文件写入失败");
      total += result.bytesWritten;
    }
  } finally {
    await file.close();
  }
}
export const fileSize = async (filePath: string) => (await stat(filePath)).size;
