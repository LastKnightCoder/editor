import { expect, it } from "vitest";
import {
  publishSnapshot,
  assertCompatibleSync,
  readSnapshotHead,
  successorObject,
  type SnapshotPublicationProvider,
} from "@tau/db-schema/sync-protocol";

const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
function backend() {
  const files = new Map<string, Uint8Array>([["head", encode({ version: 1 })]]);
  const provider: SnapshotPublicationProvider = {
    fileExists: async name => files.has(name),
    downloadFile: async name => {
      const value = files.get(name);
      if (!value) throw new Error("404");
      return value;
    },
    uploadFile: async (name, data) => {
      files.set(name, data);
      return true;
    },
    createFileIfAbsent: async (name, data) => {
      if (files.has(name)) return false;
      files.set(name, data);
      return true;
    },
  };
  return { files, provider };
}
const snapshot = (id: string, parent = 1) => ({
  version: parent + 1,
  parentVersion: parent,
  commitId: id,
  dataModelVersion: 4,
  databaseObject: `${id}.db`,
  sessionsObject: `${id}.zip`,
});

it("两个发布者读取相同父版本，只有一个完整快照胜出", async () => {
  const { provider } = backend();
  const parent = await readSnapshotHead(provider, "head");
  const outcomes = await Promise.allSettled([
    publishSnapshot(provider, "head", parent, snapshot("a")),
    publishSnapshot(provider, "head", parent, snapshot("b")),
  ]);
  expect(outcomes.filter(item => item.status === "fulfilled")).toHaveLength(1);
  expect(await readSnapshotHead(provider, "head")).toEqual(snapshot("a"));
});

it("提交成功但响应丢失时按身份核验，指针失败仍能下载已提交快照", async () => {
  const { files, provider } = backend();
  const create = provider.createFileIfAbsent;
  provider.createFileIfAbsent = async (name, data) => {
    await create(name, data);
    throw new Error("响应丢失");
  };
  provider.uploadFile = async () => false;
  await publishSnapshot(provider, "head", { version: 1 }, snapshot("a"));
  expect(JSON.parse(new TextDecoder().decode(files.get("head")))).toEqual({ version: 1 });
  expect(await readSnapshotHead(provider, "head")).toEqual(snapshot("a"));
});

it("旧发布者的指针迟到不会使已提交的新版本倒退", async () => {
  const { files, provider } = backend();
  await publishSnapshot(provider, "head", { version: 1 }, snapshot("a"));
  await publishSnapshot(provider, "head", snapshot("a"), snapshot("b", 2));
  files.set("head", encode(snapshot("a")));
  expect(await readSnapshotHead(provider, "head")).toEqual(snapshot("b", 2));
});

it("未知提交结果不会推进本地状态，坏链不能作为新版本使用", async () => {
  const { files, provider } = backend();
  provider.createFileIfAbsent = async () => {
    throw new Error("断网");
  };
  await expect(publishSnapshot(provider, "head", { version: 1 }, snapshot("a"))).rejects.toThrow(
    "无法确认"
  );
  files.set(successorObject("head", 1), encode({ ...snapshot("bad"), parentVersion: 0 }));
  await expect(readSnapshotHead(provider, "head")).rejects.toThrow("版本链无效");
});

it("旧协议元信息可衔接升级，旧指针也能发现新提交", async () => {
  const { files, provider } = backend();
  const old = { ...snapshot("old", 743), dataModelVersion: 3 };
  files.set("head", encode(old));
  expect(await readSnapshotHead(provider, "head")).toEqual(old);
  expect(() => assertCompatibleSync(old)).toThrow("DB_MODEL_INCOMPATIBLE");
  provider.uploadFile = async () => false;
  const next = snapshot("upgraded", 744);
  await publishSnapshot(provider, "head", old, next);
  expect(await readSnapshotHead(provider, "head")).toEqual(next);
  expect(() => assertCompatibleSync(next)).not.toThrow();
});

it.each([undefined, 0, 1, 2, 3, 5, "4", -1, 4.5])(
  "下载和发布拒绝非当前协议 %s",
  async dataModelVersion => {
    const { provider } = backend();
    const invalid = { ...snapshot("bad"), dataModelVersion };
    expect(() => assertCompatibleSync(invalid)).toThrow("DB_MODEL_INCOMPATIBLE");
    await expect(publishSnapshot(provider, "head", { version: 1 }, invalid as any)).rejects.toThrow(
      "DB_MODEL_INCOMPATIBLE"
    );
  }
);

it.each([5, "3", -1, 3.5])("元信息读取拒绝未来或无效协议 %s", async dataModelVersion => {
  const { files, provider } = backend();
  files.set("head", encode({ ...snapshot("bad"), dataModelVersion }));
  await expect(readSnapshotHead(provider, "head")).rejects.toThrow("DB_MODEL_INCOMPATIBLE");
});
