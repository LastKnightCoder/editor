// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import {
  TransferFiles,
  transferHash,
  transferChunks,
  TRANSFER_CHUNK_BYTES,
} from "../transfer-files";
import { DeviceSyncServer } from "../server";
import { DeviceAssetStore } from "../asset-store";
import { requestDevice, parseDevicePairCode } from "../transport";
import { DeviceSyncEngine } from "@tau/collaboration/src/device-sync/engine";
import {
  DEVICE_SYNC_PROTOCOL,
  type DeviceOffer,
  type DeviceReply,
} from "@tau/collaboration/src/device-sync/protocol";

const cleanups: (() => unknown | Promise<unknown>)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
const pool = () => {
  const files = new TransferFiles();
  cleanups.push(() => files.close());
  return files;
};

it("乱序和重复分块组装成原文件，未授权设备不能读取", () => {
  const files = pool(),
    value = { text: "资料🚀".repeat(80_000) };
  const source = files.publish(Buffer.from(JSON.stringify(value)), "source");
  const target = files.begin(source, "receiver");
  expect(() => files.read(source.id, 0, "stranger")).toThrow("DEVICE_SYNC_TRANSFER");
  const offsets = Array.from(
    { length: Math.ceil(source.size / TRANSFER_CHUNK_BYTES) },
    (_, index) => index * TRANSFER_CHUNK_BYTES
  ).reverse();
  for (const offset of offsets) {
    const chunk = files.read(source.id, offset, "source");
    files.write(target.id, chunk, "receiver");
    files.write(target.id, chunk, "receiver");
  }
  expect(files.consume(target.id, "receiver")).toEqual(value);
  expect(() => files.drop(target.id, "receiver")).toThrow("DEVICE_SYNC_TRANSFER");
});

it("缺块、坏块和整体摘要错误均不能交给安装流程", () => {
  const files = pool(),
    bytes = Buffer.from(JSON.stringify({ value: "a".repeat(TRANSFER_CHUNK_BYTES) }));
  const source = files.publish(bytes, "owner");
  const missing = files.begin(source, "owner");
  files.write(missing.id, files.read(source.id, TRANSFER_CHUNK_BYTES, "owner"), "owner");
  expect(() => files.consume(missing.id, "owner")).toThrow("DEVICE_SYNC_TRANSFER");
  const bad = files.begin(source, "owner"),
    chunk = files.read(source.id, 0, "owner");
  expect(() => files.write(bad.id, { ...chunk, sha256: "0".repeat(64) }, "owner")).toThrow(
    "DEVICE_SYNC_TRANSFER"
  );
  const wrong = files.begin({ ...source, sha256: transferHash(Buffer.from("different")) }, "owner");
  for (let offset = 0; offset < source.size; offset += TRANSFER_CHUNK_BYTES)
    files.write(wrong.id, files.read(source.id, offset, "owner"), "owner");
  expect(() => files.consume(wrong.id, "owner")).toThrow("DEVICE_SYNC_TRANSFER");
});

it("最多同时传两块，一块失败后等待在途块结束再清理", async () => {
  let active = 0,
    peak = 0,
    completed = 0;
  await expect(
    transferChunks(8 * TRANSFER_CHUNK_BYTES, async offset => {
      active++;
      peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, offset ? 10 : 1));
      active--;
      completed++;
      if (!offset) throw new Error("interrupted");
    })
  ).rejects.toThrow("interrupted");
  expect(peak).toBe(2);
  expect(active).toBe(0);
  expect(completed).toBe(2);
});

async function host() {
  const root = mkdtempSync(join(tmpdir(), "tau-device-file-test-"));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  const state = {
    library: randomUUID(),
    schema: "fixture",
    node: randomUUID(),
    authority: "",
    epoch: randomUUID(),
    head: randomUUID(),
    ackHead: "",
    ackSeq: 0,
    enabled: true,
    revision: 0,
  };
  state.authority = state.node;
  const text = "x".repeat(65 * 1024 * 1024) + "末尾校验";
  const reply: DeviceReply = {
    protocol: DEVICE_SYNC_PROTOCOL,
    kind: "snapshot",
    state,
    changes: [],
    documents: [],
    snapshot: { rows: { fixture: [{ text }] }, documents: [] },
  };
  const accept = vi.fn(async (offer: DeviceOffer): Promise<DeviceReply> =>
    offer.snapshot
      ? { protocol: DEVICE_SYNC_PROTOCOL, kind: "delta", state, changes: [], documents: [] }
      : reply
  );
  const engine = {
    offer: async () => ({ protocol: DEVICE_SYNC_PROTOCOL, state, changes: [], documents: [] }),
    accept,
    download: async () => reply,
  } as unknown as DeviceSyncEngine;
  const server = new DeviceSyncServer(
    join(root, "server"),
    engine,
    new DeviceAssetStore(join(root, "resources")),
    vi.fn(async () => undefined),
    vi.fn()
  );
  cleanups.push(() => server.close());
  await server.listen(0);
  const code = {
    ...parseDevicePairCode((await server.pairingCode()).code),
    addresses: ["127.0.0.1"],
  };
  return { server, code, reply, accept, text };
}

for (const mobile of [false, true]) {
  it.skipIf(mobile && !process.env.TAU_DEVICE_SYNC_PEER)(
    `${mobile ? "移动 Rust" : "桌面 Node"}首次配对和上行同步传输超过 64 MiB 的文件`,
    async () => {
      const { code, reply, accept, text } = await host();
      const request = <T>(body: unknown, token?: string): Promise<T> => {
        if (!mobile) return requestDevice<T>(code, body, token);
        return new Promise((resolve, reject) => {
          const child = execFile(
            process.env.TAU_DEVICE_SYNC_PEER ?? "",
            ["unused", "request"],
            { maxBuffer: 256 * 1024 * 1024, encoding: "utf8" },
            (error, stdout, stderr) =>
              error ? reject(new Error(stderr || error.message)) : resolve(JSON.parse(stdout))
          );
          child.stdin?.end(JSON.stringify({ ...code, token, body }));
        });
      };
      const paired = await request<{ reply: DeviceReply; token: string }>({
        kind: "pair",
        secret: code.secret,
        node: randomUUID(),
        name: "file test",
        existing: false,
      });
      expect(paired.reply.snapshot?.rows.fixture[0].text).toBe(text);
      const node = accept.mock.calls[0][0].state.node;
      const offer = {
        protocol: DEVICE_SYNC_PROTOCOL,
        state: { ...reply.state, node },
        sequence: 0,
        changes: [],
        documents: [],
        snapshot: paired.reply.snapshot,
      };
      await request({ kind: "sync", offer }, paired.token);
      expect(accept.mock.calls.at(-1)?.[0].snapshot?.rows.fixture[0].text).toBe(text);
    },
    120_000
  );
}
