// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";
import { exportWhiteboardTransfer, prepareWhiteboardTransfer } from "@tau/collaboration";
import { WhiteboardDocumentClient } from "../client";
import { cleanups, cleanupClients, edit, fixture, applyUnstagedBatch } from "./client-fixture";

const appendWorker = vi.hoisted(() => ({ filename: "", starts: 0 }));
vi.mock("node:worker_threads", async importOriginal => {
  const actual = await importOriginal<typeof import("node:worker_threads")>();
  return {
    ...actual,
    Worker: class extends actual.Worker {
      constructor(filename: string | URL, options?: import("node:worker_threads").WorkerOptions) {
        appendWorker.starts++;
        super(appendWorker.filename || filename, options);
      }
    },
  };
});

afterEach(() => {
  cleanupClients();
  vi.restoreAllMocks();
});

it.runIf(process.env.TAU_WHITEBOARD_SAVE_STRESS === "1")(
  "多种子三视图批量导入、并发编辑、旧故障补齐及冷重开逐轮核对独立账本",
  async () => {
    const workerDirectory = mkdtempSync(join(tmpdir(), "tau-whiteboard-worker-"));
    appendWorker.filename = join(workerDirectory, "append.cjs");
    await build({
      entryPoints: [join(process.cwd(), "src-electron/main/workers/whiteboard-append.worker.ts")],
      bundle: true,
      platform: "node",
      format: "cjs",
      outfile: appendWorker.filename,
      logLevel: "silent",
    });
    try {
      const started = performance.now(),
        samples: number[] = [];
      const totals = {
        seeds: 12,
        rounds: 0,
        imported: 0,
        repaired: 0,
        failures: 0,
        restarts: 0,
        rendererRestarts: 0,
      };
      for (let seed = 1; seed <= totals.seeds; seed++) {
        const directory = mkdtempSync(join(tmpdir(), "tau-whiteboard-save-"));
        cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
        const f = await fixture(directory);
        let random = seed;
        const next = () => (random = (Math.imul(random, 1664525) + 1013904223) >>> 0);
        const peers: WhiteboardDocumentClient[] = [];
        const faults: ("none" | "offline" | "ack")[] = ["none", "none", "none"];
        const open = async (index: number) => {
          const backend = f.backend(index + 1),
            append = backend.api.append;
          backend.api.append = async (...args) => {
            if (faults[index] === "offline") throw new Error("stress transport offline");
            const receipt = await append(...args);
            if (faults[index] === "ack") throw new Error("stress ack lost");
            return receipt;
          };
          peers[index] = await f.open(index + 1, backend.api);
        };
        await open(0);
        edit(peers[0], f.id, "源🙂");
        const secondPage = peers[0].model.submit([{ type: "create_page", title: "另一页" }], {})
          .createdIds[0];
        await peers[0].flush();
        await open(1);
        await open(2);
        const bundle = exportWhiteboardTransfer(peers[0].model, "doc", [f.id]);
        const expected = new Map([[f.id, { text: "源🙂", page: f.page }]]);
        const check = async () => {
          await Promise.all(peers.map(peer => peer.flush()));
          const ledger = [...expected].map(([id, entry]) => [id, entry.text, entry.page]).sort();
          for (const peer of peers) {
            const snapshot = peer.model.read();
            expect(
              snapshot.pages
                .flatMap(page => page.children.map(node => [node.id, node.data.source, page.id]))
                .sort()
            ).toEqual(ledger);
            expect(snapshot.pages.flatMap(page => page.recovery)).toEqual([]);
            expect(peer.getSnapshot()).toMatchObject({ phase: "saved", pending: 0 });
          }
          const stored = f.db
            .prepare("SELECT snapshot FROM whiteboard_documents WHERE document_id='doc'")
            .get() as { snapshot: string };
          const snapshot = JSON.parse(stored.snapshot) as ReturnType<
            (typeof peers)[0]["model"]["read"]
          >;
          expect(
            snapshot.pages
              .flatMap(page => page.children.map(node => [node.id, node.data.source, page.id]))
              .sort()
          ).toEqual(ledger);
          expect(f.outbox.records.size).toBe(0);
        };
        for (let round = 0; round < 80; round++) {
          const began = performance.now(),
            index = next() % 3,
            peer = peers[index];
          const page = next() % 2 ? f.page : secondPage;
          const origin = {},
            history = peer.model.createUndoManager({
              trackedOrigins: new Set([origin]),
              captureTimeout: 0,
            });
          const mode = round % 16;
          if (mode === 3) faults[index] = "offline";
          if (mode === 5) faults[index] = "ack";
          if (mode === 7) f.outbox.fail = true;
          if (mode === 9)
            f.db.exec(
              "CREATE TRIGGER fail_save BEFORE UPDATE ON whiteboard_documents BEGIN SELECT RAISE(ABORT,'stress projection failure'); END"
            );
          const created: string[] = [];
          try {
            for (let copy = 0, count = 1 + (next() % 3); copy < count; copy++) {
              const plan = await prepareWhiteboardTransfer(peer.model, bundle, {
                pageId: page,
                targetDocumentId: "doc",
              });
              peer.model.submitChunks(plan.commands, origin, plan.prepared, plan.initialBodies);
              const id = plan.ids.get(f.id)!;
              created.push(id);
              const suffix = `·${seed}/${round}/${copy}汉😀`;
              edit(peer, id, suffix);
              expected.set(id, { text: "源🙂" + suffix, page });
              totals.imported++;
            }
            if ([3, 5, 7, 9].includes(mode)) {
              await expect(peer.flush()).rejects.toThrow(/stress|outbox full/);
              totals.failures++;
              faults[index] = "none";
              f.outbox.fail = false;
              if (mode === 9) f.db.exec("DROP TRIGGER fail_save");
            }
            // 完整草稿在渲染进程重建后恢复；其它视图仍保持独立租约。
            if (mode === 3) {
              peer.dispose();
              f.sessions.abandon(index + 1);
              await open(index);
              totals.rendererRestarts++;
            }
            await peers[index].flush();
            if (round % 10 === 0) {
              created.forEach(() => history.undo());
              const undone = new Map(created.map(id => [id, expected.get(id)!]));
              created.forEach(id => expected.delete(id));
              await check();
              created.forEach(() => history.redo());
              undone.forEach((entry, id) => expected.set(id, entry));
            }
            if (round % 17 === 0) {
              const target = peers[(index + 1) % 3];
              const { id } = applyUnstagedBatch(target, f.contract.id);
              edit(target, id, "·补齐");
              expected.set(id, { text: "数据治理·补齐", page: f.page });
              totals.repaired++;
            }
            if (round % 6 === 0) {
              const target = peers[(index + 2) % 3];
              const id = created[0];
              const otherPage = page === f.page ? secondPage : f.page;
              await check();
              target.model.submit(
                [{ type: "move_node", id, parent: { kind: "page", id: otherPage } }],
                {}
              );
              expected.get(id)!.page = otherPage;
            }
            await check();
            if ((round + 1) % 40 === 0) {
              await Promise.all(peers.map(client => client.release()));
              f.restart();
              for (let i = 0; i < 3; i++) await open(i);
              await check();
              totals.restarts++;
            }
            totals.rounds++;
            samples.push(performance.now() - began);
          } finally {
            history.destroy();
          }
        }
        console.info(
          "WHITEBOARD_SAVE_STRESS_SEED",
          JSON.stringify({
            seed,
            elements: expected.size,
            rounds: 80,
            elapsedMs: Math.round(performance.now() - started),
          })
        );
        // 每个种子关闭文件句柄，避免把同时打开文件数变成压力条件。
        cleanupClients();
      }
      samples.sort((a, b) => a - b);
      expect(appendWorker.starts).toBeGreaterThan(0);
      console.info(
        "WHITEBOARD_SAVE_STRESS",
        JSON.stringify({
          ...totals,
          workers: appendWorker.starts,
          elapsedMs: Math.round(performance.now() - started),
          roundP50ms: samples[Math.floor(samples.length * 0.5)],
          roundP95ms: samples[Math.floor(samples.length * 0.95)],
        })
      );
    } finally {
      rmSync(workerDirectory, { recursive: true, force: true });
    }
  },
  600_000
);
