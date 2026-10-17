import { createHash, randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import { join, resolve } from "node:path";
import type { JsonValue } from "./index";
import { assertLocalId, copyJson } from "./values";
import {
  assertStorageActive,
  storageNamespace,
  type StorageAdapter,
  type StorageScope,
} from "./storage";

/** 同一数据目录由一个适配器负责写入；宿主之间共享该适配器。 */
export function createFileStorage(options: {
  directory: string;
  maxBytes?: number;
}): StorageAdapter {
  const directory = resolve(options.directory);
  const maxBytes = options.maxBytes ?? 1024 * 1024;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error("插件存储限额必须为正整数");
  const queues = new Map<string, Promise<void>>();

  function run<T>(
    scope: StorageScope,
    key: string,
    action: (path: string) => Promise<T>
  ): Promise<T> {
    assertLocalId(key);
    const namespace = storageNamespace(scope);
    const path = join(directory, `${createHash("sha256").update(namespace).digest("hex")}.json`);
    const result = (queues.get(namespace) ?? Promise.resolve()).then(() => {
      assertStorageActive(scope);
      return action(path);
    });
    const settled = result.then(
      () => undefined,
      () => undefined
    );
    queues.set(namespace, settled);
    void settled.then(() => {
      if (queues.get(namespace) === settled) queues.delete(namespace);
    });
    return result;
  }

  async function read(path: string, scope: StorageScope): Promise<Map<string, JsonValue>> {
    let text: string;
    try {
      const info = await fs.stat(path);
      if (info.size > maxBytes) throw new Error("插件存储超过限额");
      text = await fs.readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Map();
      throw error;
    }
    assertStorageActive(scope);
    if (Buffer.byteLength(text) > maxBytes) throw new Error("插件存储超过限额");
    const data = JSON.parse(text) as {
      version?: unknown;
      namespace?: unknown;
      entries?: unknown;
    } | null;
    if (
      !data ||
      data.version !== 1 ||
      data.namespace !== storageNamespace(scope) ||
      !Array.isArray(data.entries)
    ) {
      throw new Error("插件存储格式或版本不兼容");
    }
    const values = new Map<string, JsonValue>();
    for (const entry of data.entries) {
      if (
        !Array.isArray(entry) ||
        entry.length !== 2 ||
        typeof entry[0] !== "string" ||
        values.has(entry[0])
      ) {
        throw new Error("插件存储条目格式错误");
      }
      assertLocalId(entry[0]);
      values.set(entry[0], copyJson(entry[1]));
    }
    return values;
  }

  async function write(path: string, scope: StorageScope, values: Map<string, JsonValue>) {
    const text = JSON.stringify({
      version: 1,
      namespace: storageNamespace(scope),
      entries: [...values],
    });
    if (Buffer.byteLength(text) > maxBytes) throw new Error("插件存储超过限额");
    assertStorageActive(scope);
    await fs.mkdir(directory, { recursive: true });
    const temporary = `${path}.${randomUUID()}.tmp`;
    const file = await fs.open(temporary, "wx", 0o600);
    try {
      try {
        await file.writeFile(text, "utf8");
        await file.sync();
      } finally {
        await file.close();
      }
      // rename 是本次提交点；提交已发起后的停用不承诺回滚该写入。
      assertStorageActive(scope);
      await fs.rename(temporary, path);
    } finally {
      await fs.rm(temporary, { force: true });
    }
  }

  return {
    get(scope, key) {
      return run(scope, key, async path => {
        const values = await read(path, scope);
        assertStorageActive(scope);
        return values.get(key);
      });
    },
    set(scope, key, value) {
      const snapshot = copyJson(value);
      return run(scope, key, async path => {
        const values = await read(path, scope);
        values.set(key, snapshot);
        await write(path, scope, values);
      });
    },
    delete(scope, key) {
      return run(scope, key, async path => {
        const values = await read(path, scope);
        assertStorageActive(scope);
        if (values.delete(key)) await write(path, scope, values);
      });
    },
  };
}
