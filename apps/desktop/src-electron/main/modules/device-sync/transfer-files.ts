import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  fstatSync,
  fsyncSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  rmSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export const TRANSFER_CHUNK_BYTES = 256 * 1024;
export const TRANSFER_CONCURRENCY = 2;
const fail = () => new Error("DEVICE_SYNC_TRANSFER: 文件分块缺失、校验失败或传输已过期");
export const transferHash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
export interface TransferFile {
  id: string;
  size: number;
  sha256: string;
}
export interface TransferChunk {
  offset: number;
  bytes: string;
  sha256: string;
}
export function assertTransferFile(value: TransferFile) {
  if (
    !value ||
    typeof value.id !== "string" ||
    !Number.isSafeInteger(value.size) ||
    value.size <= 0 ||
    typeof value.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.sha256)
  )
    throw fail();
}
function fileHash(path: string) {
  const fd = openSync(path, "r"),
    hash = createHash("sha256"),
    buffer = Buffer.alloc(TRANSFER_CHUNK_BYTES);
  try {
    let size: number;
    while ((size = readSync(fd, buffer)) > 0) hash.update(buffer.subarray(0, size));
  } finally {
    closeSync(fd);
  }
  return hash.digest("hex");
}
interface Entry {
  file: TransferFile;
  owner: string;
  receiving: boolean;
  received: Set<number>;
  touched: number;
}

/** 仅持有传输临时文件；组装完整后才把原载荷交还同步引擎。 */
export class TransferFiles {
  private readonly directory = mkdtempSync(join(tmpdir(), "tau-device-transfer-"));
  private readonly entries = new Map<string, Entry>();
  private readonly timer: ReturnType<typeof setInterval>;
  constructor() {
    this.timer = setInterval(() => this.expire(), 60_000);
    this.timer.unref();
  }
  private path(id: string) {
    return join(this.directory, `${id}.bin`);
  }
  private expire() {
    for (const [id, entry] of this.entries)
      if (Date.now() - entry.touched > 30 * 60_000) this.remove(id);
  }
  private add(owner: string, size: number, sha256: string, receiving: boolean) {
    this.expire();
    if (this.entries.size >= 16) throw new Error("DEVICE_SYNC_BUSY: 文件传输繁忙，稍后重试");
    const file = { id: randomUUID(), size, sha256 };
    assertTransferFile(file);
    this.entries.set(file.id, { file, owner, receiving, received: new Set(), touched: Date.now() });
    return file;
  }
  private entry(id: string, owner: string) {
    const entry = this.entries.get(id);
    if (!entry || entry.owner !== owner || Date.now() - entry.touched > 30 * 60_000) throw fail();
    entry.touched = Date.now();
    return entry;
  }
  publish(bytes: Buffer, owner: string): TransferFile {
    const file = this.add(owner, bytes.length, transferHash(bytes), false);
    try {
      writeFileSync(this.path(file.id), bytes, { mode: 0o600, flag: "wx" });
    } catch (error) {
      this.remove(file.id);
      throw error;
    }
    return file;
  }
  begin(descriptor: TransferFile, owner: string): TransferFile {
    assertTransferFile(descriptor);
    const file = this.add(owner, descriptor.size, descriptor.sha256, true);
    try {
      closeSync(openSync(this.path(file.id), "wx", 0o600));
    } catch (error) {
      this.remove(file.id);
      throw error;
    }
    return file;
  }
  read(id: string, offset: number, owner: string): TransferChunk {
    const entry = this.entry(id, owner);
    if (
      entry.receiving ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset >= entry.file.size ||
      offset % TRANSFER_CHUNK_BYTES
    )
      throw fail();
    const bytes = Buffer.alloc(Math.min(TRANSFER_CHUNK_BYTES, entry.file.size - offset));
    const fd = openSync(this.path(id), "r");
    try {
      if (readSync(fd, bytes, 0, bytes.length, offset) !== bytes.length) throw fail();
    } finally {
      closeSync(fd);
    }
    return { offset, bytes: bytes.toString("base64"), sha256: transferHash(bytes) };
  }
  write(id: string, chunk: TransferChunk, owner: string) {
    const entry = this.entry(id, owner);
    if (
      !entry.receiving ||
      !chunk ||
      typeof chunk.bytes !== "string" ||
      chunk.bytes.length > Math.ceil(TRANSFER_CHUNK_BYTES / 3) * 4 ||
      !Number.isSafeInteger(chunk.offset) ||
      chunk.offset < 0 ||
      chunk.offset >= entry.file.size ||
      chunk.offset % TRANSFER_CHUNK_BYTES
    )
      throw fail();
    const bytes = Buffer.from(chunk.bytes, "base64");
    if (
      bytes.length !== Math.min(TRANSFER_CHUNK_BYTES, entry.file.size - chunk.offset) ||
      transferHash(bytes) !== chunk.sha256
    )
      throw fail();
    const fd = openSync(this.path(id), "r+");
    try {
      if (entry.received.has(chunk.offset)) {
        const previous = Buffer.alloc(bytes.length);
        if (
          readSync(fd, previous, 0, previous.length, chunk.offset) !== previous.length ||
          !previous.equals(bytes)
        )
          throw fail();
      } else {
        if (writeSync(fd, bytes, 0, bytes.length, chunk.offset) !== bytes.length) throw fail();
        entry.received.add(chunk.offset);
      }
    } finally {
      closeSync(fd);
    }
  }
  consume<T>(id: string, owner: string): T {
    const entry = this.entry(id, owner);
    try {
      if (
        !entry.receiving ||
        entry.received.size !== Math.ceil(entry.file.size / TRANSFER_CHUNK_BYTES)
      )
        throw fail();
      const path = this.path(id),
        fd = openSync(path, "r+");
      try {
        if (fstatSync(fd).size !== entry.file.size) throw fail();
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      if (fileHash(path) !== entry.file.sha256) throw fail();
      return JSON.parse(readFileSync(path, "utf8")) as T;
    } finally {
      this.remove(id);
    }
  }
  drop(id: string, owner: string) {
    this.entry(id, owner);
    this.remove(id);
  }
  private remove(id: string) {
    this.entries.delete(id);
    rmSync(this.path(id), { force: true });
  }
  close() {
    clearInterval(this.timer);
    this.entries.clear();
    rmSync(this.directory, { recursive: true, force: true });
  }
}

export async function transferChunks(size: number, work: (offset: number) => Promise<void>) {
  let next = 0,
    failure: unknown;
  const worker = async () => {
    while (next < size && failure === undefined) {
      const offset = next;
      next += TRANSFER_CHUNK_BYTES;
      try {
        await work(offset);
      } catch (error) {
        failure ??= error;
      }
    }
  };
  await Promise.all(Array.from({ length: TRANSFER_CONCURRENCY }, worker));
  if (failure !== undefined) throw failure;
}
