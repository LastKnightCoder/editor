import { afterEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFileStorage } from "../file-storage";
import type { StorageScope } from "../storage";

vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, rename: vi.fn(actual.rename) };
});

const directories: string[] = [];
async function directory() {
  const path = await fs.mkdtemp(join(tmpdir(), "tau-plugin-storage-"));
  directories.push(path);
  return path;
}
const scope = (workspaceId = "work", pluginId = "example.notes"): StorageScope => ({
  workspaceId,
  pluginId,
  signal: new AbortController().signal,
});

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map(path => fs.rm(path, { recursive: true, force: true }))
  );
  vi.clearAllMocks();
});

describe("插件私有文件存储", () => {
  it("重建适配器后从磁盘恢复，删除同样持久化", async () => {
    const path = await directory();
    const first = createFileStorage({ directory: path });
    await first.set(scope(), "config", { title: "正文", enabled: true });
    const second = createFileStorage({ directory: path });
    expect(await second.get(scope(), "config")).toEqual({ title: "正文", enabled: true });
    await second.delete(scope(), "config");
    expect(await createFileStorage({ directory: path }).get(scope(), "config")).toBeUndefined();
  });

  it("同一适配器的并发键写入不会互相覆盖", async () => {
    const path = await directory();
    const storage = createFileStorage({ directory: path });
    await Promise.all(
      Array.from({ length: 20 }, (_, index) => storage.set(scope(), `key-${index}`, index))
    );
    const restored = createFileStorage({ directory: path });
    expect(
      await Promise.all(
        Array.from({ length: 20 }, (_, index) => restored.get(scope(), `key-${index}`))
      )
    ).toEqual(Array.from({ length: 20 }, (_, index) => index));
  });

  it("插件和工作区分域，不将外部身份拼成文件路径", async () => {
    const path = await directory();
    const storage = createFileStorage({ directory: path });
    await storage.set(scope("../../other", "one"), "same", 1);
    await storage.set(scope("work", "two"), "same", 2);
    expect(await storage.get(scope("work", "one"), "same")).toBeUndefined();
    expect(await storage.get(scope("../../other", "one"), "same")).toBe(1);
    expect(await storage.get(scope("work", "two"), "same")).toBe(2);
    expect((await fs.readdir(path)).every(name => /^[a-f0-9]{64}\.json$/.test(name))).toBe(true);
  });

  it("超限写入失败后保留旧数据，后续小写入可以成功", async () => {
    const path = await directory();
    const storage = createFileStorage({ directory: path, maxBytes: 200 });
    await storage.set(scope(), "value", "原值");
    await expect(storage.set(scope(), "value", "长".repeat(200))).rejects.toThrow("限额");
    expect(await createFileStorage({ directory: path }).get(scope(), "value")).toBe("原值");
    await storage.set(scope(), "value", "新值");
    expect(await storage.get(scope(), "value")).toBe("新值");
  });

  it("替换文件失败不会破坏旧文件，也不会留下临时文件", async () => {
    const path = await directory();
    const storage = createFileStorage({ directory: path });
    await storage.set(scope(), "value", "原值");
    vi.mocked(fs.rename).mockRejectedValueOnce(new Error("磁盘写入失败"));
    await expect(storage.set(scope(), "value", "新值")).rejects.toThrow("磁盘写入失败");
    expect(await storage.get(scope(), "value")).toBe("原值");
    expect((await fs.readdir(path)).filter(name => name.endsWith(".tmp"))).toEqual([]);
    await storage.set(scope(), "value", "恢复");
    expect(await storage.get(scope(), "value")).toBe("恢复");
  });

  it("排队中的旧作用域写入取消，不阻断新实例", async () => {
    const path = await directory();
    const storage = createFileStorage({ directory: path });
    const controller = new AbortController();
    const current = { ...scope(), signal: controller.signal };
    const pending = storage.set(current, "value", "迟到");
    controller.abort();
    await expect(pending).rejects.toThrow("已停用");
    await storage.set(scope(), "value", "新实例");
    expect(await storage.get(scope(), "value")).toBe("新实例");
  });

  it("损坏数据拒绝覆盖，保留文件供恢复", async () => {
    const path = await directory();
    const storage = createFileStorage({ directory: path });
    await storage.set(scope(), "value", 1);
    const [name] = await fs.readdir(path);
    await fs.writeFile(join(path, name), "损坏的数据");
    await expect(storage.set(scope(), "value", 2)).rejects.toThrow();
    expect(await fs.readFile(join(path, name), "utf8")).toBe("损坏的数据");
  });
});
