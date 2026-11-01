import { openSync, writeSync, fsyncSync, closeSync, renameSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

export function writeDeviceState(path: string, value: unknown) {
  const temporary = `${path}.${randomUUID()}.tmp`,
    bytes = Buffer.from(JSON.stringify(value)),
    fd = openSync(temporary, "wx", 0o600);
  try {
    let offset = 0;
    while (offset < bytes.length) {
      const size = writeSync(fd, bytes, offset, bytes.length - offset);
      if (!size) throw new Error("DEVICE_SYNC_STORAGE: 写入设备状态中断");
      offset += size;
    }
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, path);
  if (process.platform !== "win32") {
    const directory = openSync(dirname(path), "r");
    try {
      fsyncSync(directory);
    } finally {
      closeSync(directory);
    }
  }
}
