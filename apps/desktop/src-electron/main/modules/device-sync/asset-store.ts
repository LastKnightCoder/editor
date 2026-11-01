import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  openSync,
  readSync,
  closeSync,
  fsyncSync,
} from "node:fs";
import { join } from "node:path";
import { DEVICE_SYNC_CHUNK_BYTES } from "@tau/collaboration/src/device-sync/protocol";

const namePattern = /^[a-f0-9]{64}\.(png|jpg|webp|gif|bin)$/;
export const deviceAssetReference = (name: string) => `~/.editor/resources/device-sync/${name}`;
export class DeviceAssetStore {
  private verified = new Map<string, string>();
  readonly directory: string;
  constructor(resourcesDirectory: string) {
    this.directory = join(resourcesDirectory, "device-sync");
    mkdirSync(this.directory, { recursive: true });
  }
  import(path: string): string {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 25 * 1024 * 1024)
      throw new Error("DEVICE_SYNC_ASSET: 图片必须为不超过 25 MiB 的普通文件");
    const bytes = readFileSync(path);
    const extension = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      ? "png"
      : bytes[0] === 255 && bytes[1] === 216
        ? "jpg"
        : bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP"
          ? "webp"
          : bytes.subarray(0, 3).toString() === "GIF"
            ? "gif"
            : "bin";
    const name = `${createHash("sha256").update(bytes).digest("hex")}.${extension}`;
    if (!this.has(name)) {
      const temporary = join(this.directory, `${name}.part`);
      copyFileSync(path, temporary);
      renameSync(temporary, join(this.directory, name));
    }
    return deviceAssetReference(name);
  }
  private path(name: string) {
    if (!namePattern.test(name)) throw new Error("DEVICE_SYNC_ASSET_PATH: 资源路径无效");
    return join(this.directory, name);
  }
  has(name: string) {
    const path = this.path(name);
    if (!existsSync(path)) return false;
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 25 * 1024 * 1024) return false;
    const fingerprint = [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(":");
    if (this.verified.get(name) === fingerprint) return true;
    const valid =
      createHash("sha256").update(readFileSync(path)).digest("hex") === name.slice(0, 64);
    if (valid) {
      this.verified.set(name, fingerprint);
      while (this.verified.size > 256) this.verified.delete(this.verified.keys().next().value!);
    }
    return valid;
  }
  read(name: string, offset: number) {
    if (!Number.isSafeInteger(offset) || offset < 0 || offset % DEVICE_SYNC_CHUNK_BYTES)
      throw new Error("DEVICE_SYNC_ASSET_OFFSET: 分块位置无效");
    if (!this.has(name)) throw new Error("DEVICE_SYNC_ASSET_MISSING: 资源尚未就绪");
    const path = this.path(name),
      size = lstatSync(path).size;
    if (offset > size) throw new Error("DEVICE_SYNC_ASSET_OFFSET: 分块位置无效");
    const bytes = Buffer.alloc(Math.min(DEVICE_SYNC_CHUNK_BYTES, size - offset)),
      fd = openSync(path, "r");
    try {
      if (readSync(fd, bytes, 0, bytes.length, offset) !== bytes.length)
        throw new Error("DEVICE_SYNC_ASSET_RETRY: 文件读取中断");
    } finally {
      closeSync(fd);
    }
    return {
      size,
      bytes: bytes.toString("base64"),
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  }
  write(name: string, offset: number, size: number, value: string, sha256: string) {
    const path = this.path(name),
      temporary = `${path}.part`,
      bytes = Buffer.from(value, "base64");
    if (
      !Number.isSafeInteger(size) ||
      size < 0 ||
      size > 25 * 1024 * 1024 ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset % DEVICE_SYNC_CHUNK_BYTES ||
      bytes.length > DEVICE_SYNC_CHUNK_BYTES ||
      offset + bytes.length > size ||
      (offset + bytes.length < size && bytes.length !== DEVICE_SYNC_CHUNK_BYTES)
    )
      throw new Error("DEVICE_SYNC_ASSET_CHUNK: 资源分块无效");
    if (createHash("sha256").update(bytes).digest("hex") !== sha256)
      throw new Error("DEVICE_SYNC_ASSET_CHUNK_HASH: 分块校验失败");
    if (offset === 0) writeFileSync(temporary, bytes, { mode: 0o600 });
    else {
      if (lstatSync(temporary).size !== offset)
        throw new Error("DEVICE_SYNC_ASSET_RETRY: 分块需要重传");
      writeFileSync(temporary, bytes, { flag: "a" });
    }
    if (offset + bytes.length === size) {
      if (createHash("sha256").update(readFileSync(temporary)).digest("hex") !== name.slice(0, 64))
        throw new Error("DEVICE_SYNC_ASSET_HASH: 图片校验失败");
      const fd = openSync(temporary, "r");
      try {
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      renameSync(temporary, path);
    }
  }
}
