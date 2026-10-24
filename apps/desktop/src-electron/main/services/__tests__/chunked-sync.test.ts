// @vitest-environment node
import { mkdtemp, writeFile, readFile, open, mkdir, rm, readdir, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, expect, it } from "vitest";
import { uploadChunkedPath, downloadChunkedPath, chunkDigest } from "../chunked-sync";
import {
  CHUNK_BYTES,
  chunkObject,
  decodeChunkManifest,
  resourceManifestObject,
  databaseVersionObject,
  uploadChunkedFile,
  decodeSessionDirectory,
} from "@tau/db-schema/sync-protocol";
let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "tau-chunked-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
it("TypeScript 与 Rust 共用清单、根哈希和对象名夹具", async () => {
  const fixture = JSON.parse(
    await readFile(
      new URL(
        "../../../../../../packages/db-schema/fixtures/chunked-storage-v1.json",
        import.meta.url
      ),
      "utf8"
    )
  );
  const bytes = new TextEncoder().encode(JSON.stringify(fixture.manifest));
  expect(await decodeChunkManifest(bytes, chunkDigest)).toEqual(fixture.manifest);
  expect(await resourceManifestObject(fixture.manifest.name, chunkDigest)).toBe(
    fixture.resourceObject
  );
  expect(await databaseVersionObject(fixture.databaseName, chunkDigest)).toBe(
    fixture.versionObject
  );
  fixture.manifest.name = "../escape";
  await expect(
    decodeChunkManifest(new TextEncoder().encode(JSON.stringify(fixture.manifest)), chunkDigest)
  ).rejects.toThrow("文件名");
});
function backend() {
  let max = 0;
  let failing = false;
  const store = {
    uploadFile: async (name: string, bytes: Uint8Array) => {
      if (failing) return false;
      max = Math.max(max, bytes.length);
      const target = path.join(root, "remote", name);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, bytes);
      return true;
    },
    downloadFile: async (name: string) => {
      const bytes = await readFile(path.join(root, "remote", name));
      max = Math.max(max, bytes.length);
      return bytes;
    },
  };
  return {
    store,
    get max() {
      return max;
    },
    fail() {
      failing = true;
    },
  };
}
async function fileHash(file: string) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest("hex");
}
it("129 MiB 文件双向同步每次至多 8 MiB，恢复字节一致", async () => {
  const source = path.join(root, "large.bin"),
    target = path.join(root, "result.bin");
  const file = await open(source, "wx");
  const length = 129 * 1024 * 1024 + 17;
  const block = Buffer.alloc(CHUNK_BYTES, 71);
  for (let offset = 0; offset < length; offset += block.length)
    await file.write(block.subarray(0, Math.min(block.length, length - offset)));
  await file.close();
  const remote = backend();
  const manifest = await uploadChunkedPath(remote.store, "manifest", source);
  expect(manifest.chunks).toHaveLength(17);
  await downloadChunkedPath(remote.store, "manifest", target);
  expect((await stat(target)).size).toBe(length);
  expect(await fileHash(target)).toBe(await fileHash(source));
  expect(remote.max).toBe(CHUNK_BYTES);
}, 15000);
it("坏块和断网不覆盖现有文件，临时文件清理；上传失败不发布清单", async () => {
  const source = path.join(root, "input.bin"),
    target = path.join(root, "target.bin");
  await writeFile(source, new Uint8Array([1, 2, 3]));
  await writeFile(target, "original");
  const remote = backend();
  const manifest = await uploadChunkedPath(remote.store, "manifest", source);
  await writeFile(
    path.join(root, "remote", chunkObject(manifest.chunks[0].sha256)),
    new Uint8Array([9])
  );
  await expect(downloadChunkedPath(remote.store, "manifest", target)).rejects.toThrow("校验");
  expect(await readFile(target, "utf8")).toBe("original");
  expect((await readdir(root)).filter(name => name.endsWith(".chunks.tmp"))).toEqual([]);
  remote.fail();
  await expect(uploadChunkedPath(remote.store, "unpublished", source)).rejects.toThrow("上传失败");
  await expect(stat(path.join(root, "remote/unpublished"))).rejects.toMatchObject({
    code: "ENOENT",
  });
});
it("取消不发布清单，本地变化不提交；空文件也可验证与恢复", async () => {
  const remote = backend();
  await expect(
    uploadChunkedFile(
      remote.store,
      "cancelled",
      "file",
      { size: 1, read: async () => new Uint8Array([1]) },
      chunkDigest,
      () => {
        throw new DOMException("取消", "AbortError");
      }
    )
  ).rejects.toThrow("取消");
  await expect(
    uploadChunkedFile(
      remote.store,
      "changed",
      "file",
      {
        size: 1,
        read: async () => new Uint8Array([1]),
        assertUnchanged: async () => {
          throw new Error("变化");
        },
      },
      chunkDigest
    )
  ).rejects.toThrow("变化");
  const source = path.join(root, "empty");
  await writeFile(source, "");
  await uploadChunkedPath(remote.store, "empty", source);
  await downloadChunkedPath(remote.store, "empty", path.join(root, "empty-out"));
  expect((await stat(path.join(root, "empty-out"))).size).toBe(0);
});
it("会话目录清单拒绝路径穿越、重复项和外部对象地址", () => {
  const encode = (files: unknown[]) =>
    new TextEncoder().encode(
      JSON.stringify({ format: "tau-session-directory", version: 1, files })
    );
  expect(decodeSessionDirectory(encode([])).files).toEqual([]);
  expect(() =>
    decodeSessionDirectory(encode([{ name: "../escape", object: "tau-sync-v1/snapshots/a.json" }]))
  ).toThrow();
  expect(() =>
    decodeSessionDirectory(encode([{ name: "a.jsonl", object: "../../escape" }]))
  ).toThrow();
  const entry = { name: "a.jsonl", object: "tau-sync-v1/snapshots/a.json" };
  expect(() => decodeSessionDirectory(encode([entry, entry]))).toThrow();
});

it("未标记当前同步格式的本地版本从零开始，避免旧计数覆盖新命名空间", async () => {
  const { localSyncVersion } = await import("@tau/db-schema/sync-protocol");
  expect(localSyncVersion({ version: 999 })).toBe(0);
  expect(localSyncVersion({ version: 7, syncFormat: 6 })).toBe(7);
});

it.runIf(Boolean(process.env.TAU_CHUNK_INTEROP_DIR))(
  "跨语言导出 TypeScript 分块并读取 Rust 分块",
  async () => {
    const directory = process.env.TAU_CHUNK_INTEROP_DIR!;
    await mkdir(directory, { recursive: true });
    const store = {
      uploadFile: async (name: string, bytes: Uint8Array) => {
        const target = path.join(directory, name);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, bytes);
        return true;
      },
      downloadFile: (name: string) => readFile(path.join(directory, name)),
    };
    const source = path.join(directory, "typescript.bin");
    const file = await open(source, "w");
    await file.write(Buffer.alloc(CHUNK_BYTES, 31));
    await file.write(new Uint8Array([0, 255, 3]));
    await file.close();
    await uploadChunkedPath(store, "typescript.json", source);
    if (await stat(path.join(directory, "rust.json")).catch(() => null)) {
      const target = path.join(directory, "rust-received.bin");
      await downloadChunkedPath(store, "rust.json", target);
      expect(await readFile(target, "utf8")).toBe("Rust to TypeScript");
    }
  }
);

it("重试复用已校验的内容块，损坏的同名块会修复后再发布", async () => {
  const files = new Map<string, Uint8Array>();
  const puts: string[] = [];
  let failed = false;
  const source = {
    size: CHUNK_BYTES + 1,
    read: async (offset: number, length: number) => new Uint8Array(length).fill(offset ? 2 : 1),
  };
  const store = {
    fileExists: async (name: string) => files.has(name),
    downloadFile: async (name: string) => files.get(name)!,
    uploadFile: async (name: string, bytes: Uint8Array) => {
      if (!failed && bytes.length === 1) {
        failed = true;
        return false;
      }
      puts.push(name);
      files.set(name, bytes.slice());
      return true;
    },
  };
  await expect(
    uploadChunkedFile(store, "manifest", "file.bin", source, chunkDigest)
  ).rejects.toThrow("上传失败");
  const first = [...files.keys()][0];
  expect(files.has("manifest")).toBe(false);
  await uploadChunkedFile(store, "manifest", "file.bin", source, chunkDigest);
  expect(puts.filter(name => name === first)).toHaveLength(1);
  files.set(first, new Uint8Array([9]));
  await uploadChunkedFile(store, "manifest", "file.bin", source, chunkDigest);
  expect(puts.filter(name => name === first)).toHaveLength(2);
});
