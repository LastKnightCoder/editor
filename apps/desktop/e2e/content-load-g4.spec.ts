import { expect, test, type ElectronApplication } from "@playwright/test";
import { join } from "node:path";
import type { Duplex } from "node:stream";
import { readNodeDocument, type CollaborationState } from "@tau/collaboration";
import {
  availablePort,
  bodyText,
  close,
  createSandbox,
  desktop,
  disposeSandbox,
  invoke,
  launch,
  output,
  sendOnFreeze,
  subscribe,
  update,
  type ContentSession,
} from "./content-production/harness";
import {
  artifactSha,
  attachCard,
  ContentReplica,
  fixedSeeds,
  flushProjection,
  journalPath,
  mainPath,
  makeCard,
  makeHeldPage,
  percentile,
  projection,
  readOnly,
  saveReport,
  seeded,
  timedUpdate,
  waitUntil,
} from "./content-production/g4-content";
import { startCollaborationServer, type CollaborationTestServer } from "./collaboration/server";

const phase = process.env.TAU_CONTENT_G4;
const smoke = process.env.TAU_CONTENT_G4_SMOKE === "1";
const quick = process.env.TAU_CONTENT_G4_QUICK === "1";

const latency = (samples: number[]) => ({
  samples: samples.length,
  p50Ms: percentile(samples, 0.5),
  p95Ms: percentile(samples, 0.95),
  maxMs: percentile(samples, 1),
  ...(samples.length >= 1_000 ? { p99Ms: percentile(samples, 0.99) } : {}),
});

test("真实生产正文容量矩阵与单篇连续操作", async () => {
  // 门控：45 分钟容量验证，默认跳过；TAU_CONTENT_G4=capacity 启用，QUICK/SMOKE 可缩短（docs/guides/dev-content-verification.md §3）。
  test.skip(phase !== "capacity", "按需运行正文容量");
  test.setTimeout(45 * 60_000);
  const directory = await createSandbox("tau-g4-capacity-");
  const name = "content-g4-capacity";
  const database = mainPath(directory, name);
  const report = smoke
    ? "g4-capacity-smoke.json"
    : quick
      ? "g4-capacity-quick.json"
      : "g4-capacity.json";
  const candidate = await artifactSha();
  const results: object[] = [];
  let app: ElectronApplication | undefined;
  let location: object | undefined;
  try {
    const { page } = await launch(directory, await availablePort(), running => (app = running));
    await invoke(page, "create-or-connect-database", name);
    const documents = smoke ? [1, 2] : [1, 5, 20];
    const views = smoke ? [1, 2] : [1, 2, 5, 10];
    await makeCard(page, "库来源基准");
    const board = await makeHeldPage(page);
    const cards = [];
    for (let index = 0; index < documents.at(-1)!; index++) {
      cards.push(await makeCard(page, `文档 ${index}`, board.reference));
    }
    const heads = cards.map(card => projection(database, card));
    const matches = (index: number, saved: ReturnType<typeof projection>) => {
      const { documentId, nodes, holders, dictionary, relations } = heads[index];
      expect(saved).toMatchObject({ documentId, nodes, holders, dictionary, relations });
    };
    for (const documentCount of documents) {
      for (const viewCount of views) {
        location = { documentCount, viewCount };
        const snapshots = await Promise.all(
          cards.slice(0, documentCount).map(async (card, index) => {
            const lease = await attachCard(page, card, `capacity:${index}:0`);
            const others = await Promise.all(
              Array.from({ length: viewCount - 1 }, (_, view) =>
                subscribe(page, lease.documentId, `capacity:${index}:${view + 1}`)
              )
            );
            return [lease, ...others];
          })
        );
        const started = performance.now();
        const samples: number[] = [];
        try {
          await Promise.all(
            snapshots.map(async (group, index) => {
              const replica = new ContentReplica(group[0]);
              let last = "";
              try {
                for (let view = 0; view < group.length; view++) {
                  last = `${documentCount}/${viewCount}/${index}/${view}🙂`;
                  samples.push(
                    await timedUpdate(page, group[view], replica.edit(last), "local-content")
                  );
                }
              } finally {
                replica.close();
              }
              matches(index, await flushProjection(database, cards[index], last));
              const follow = await subscribe(page, group[0].documentId, group.at(-1)!.viewId);
              const recovered = new ContentReplica(follow);
              try {
                expect(recovered.text()).toBe(last);
              } finally {
                recovered.close();
              }
            })
          );
        } finally {
          await Promise.all(
            snapshots.flat().map(view => invoke(page, "local-content:unsubscribe", view.viewId))
          );
        }
        const holders = readOnly(
          database,
          db =>
            db
              .prepare("SELECT ref_count FROM white_board_contents WHERE id=?")
              .get(board.content.id)?.ref_count
        );
        expect(holders).toBe(cards.length);
        const result = {
          documentCount,
          viewCount,
          elapsedMs: performance.now() - started,
          editing: latency(samples),
          holderCount: holders,
        };
        results.push(result);
        await saveReport(report, { candidate, status: "running", results });
        console.info("[g4-capacity]", JSON.stringify(result));
      }
    }
    const editsPerSeed = smoke ? 5 : quick ? 50 : 500;
    const seeds = smoke ? fixedSeeds.slice(0, 2) : fixedSeeds;
    const lease = await attachCard(page, cards[0], "capacity-single");
    const unchanged = projection(database, cards[0]);
    await expect(
      page.evaluate(
        ({ documentId, viewId }) =>
          window.electron.invoke(
            "local-content:update",
            documentId,
            new Uint8Array(8 * 1024 * 1024 + 1),
            viewId
          ),
        lease
      )
    ).rejects.toThrow(/编辑更新超过大小限制/);
    expect(projection(database, cards[0])).toEqual(unchanged);
    const replica = new ContentReplica(lease);
    const samples: number[] = [];
    const started = performance.now();
    try {
      for (const seed of seeds) {
        const next = seeded(seed);
        location = { seed, count: samples.length };
        let final = "";
        for (let index = 0; index < editsPerSeed; index++) {
          final = String.fromCharCode(0x4e00 + (next() % 1024));
          samples.push(await timedUpdate(page, lease, replica.edit(final), "local-content"));
        }
        matches(0, await flushProjection(database, cards[0], final));
        console.info(
          `[g4-capacity] 单篇 ${samples.length}/${editsPerSeed * seeds.length} seed=${seed}`
        );
      }
    } finally {
      replica.close();
      await invoke(page, "local-content:unsubscribe", lease.viewId);
    }
    expect(readOnly(database, db => db.prepare("PRAGMA foreign_key_check").all())).toEqual([]);
    await close(app!);
    app = undefined;
    await saveReport(report, {
      candidate,
      status: "passed",
      results,
      oversizeRejectedWithoutWrite: true,
      single: {
        elapsedMs: performance.now() - started,
        editing: latency(samples),
        seeds,
        editsPerSeed,
      },
    });
  } catch (error) {
    await saveReport(report, { candidate, status: "failed", results, location });
    throw error;
  } finally {
    await disposeSandbox(directory, app);
  }
});

test("真实生产正文预热五分钟后连续六十分钟混合长稳", async () => {
  // 门控：60 分钟墙钟长稳，默认跳过；TAU_CONTENT_G4=soak 启用，SMOKE 可缩短（docs/guides/dev-content-verification.md §3）。
  test.skip(phase !== "soak", "按需运行实际墙钟长稳");
  test.setTimeout(80 * 60_000);
  const directory = await createSandbox("tau-g4-soak-");
  const name = "content-g4-soak";
  const library = mainPath(directory, name);
  const report = smoke ? "g4-soak-smoke.json" : "g4-soak.json";
  const candidate = await artifactSha();
  const warmMs = smoke ? 2_000 : 5 * 60_000;
  const measuredMs = smoke ? 12_000 : 60 * 60_000;
  const stepMs = smoke ? 2_000 : 20_000;
  const sampleEvery = smoke ? 4_000 : 5 * 60_000;
  const checkEvery = 2 * sampleEvery;
  const samples: object[] = [];
  const audits: object[] = [];
  const operations: number[] = [];
  let running: ElectronApplication | undefined;
  let server: CollaborationTestServer | undefined;
  let isolatedWebSocket = false;
  let reconnects = 0;
  let reopenings = 0;
  let librarySwitches = 0;
  let started = 0;
  let tick = 0;
  const sockets = new Set<Duplex>();
  const result = (status: string) =>
    saveReport(report, {
      candidate,
      status,
      warmMs,
      measuredMs,
      measuredElapsedMs: started ? performance.now() - started : 0,
      reconnects,
      reopenings,
      librarySwitches,
      tick,
      samples,
      audits,
      ...(operations.length ? { editing: latency(operations) } : {}),
    });
  try {
    const service = await startCollaborationServer(
      desktop,
      join(output, "g4-soak-server"),
      join(directory, "service"),
      ({ app }) => {
        app.server.on("upgrade", (request, socket) => {
          if (!request.url?.startsWith("/ws")) return;
          sockets.add(socket);
          socket.once("close", () => sockets.delete(socket));
        });
        app.addHook("onRequest", async (request, reply) => {
          if (isolatedWebSocket && request.url.startsWith("/ws")) await reply.code(503).send();
        });
      }
    );
    server = service.server;
    const { app, page } = await launch(
      directory,
      await availablePort(),
      opened => (running = opened),
      service.url
    );
    const otherName = "content-g4-soak-other";
    await invoke(page, "create-or-connect-database", otherName);
    const untouched = await makeCard(page, "另一资料库的正文");
    const other = mainPath(directory, otherName);
    const otherBaseline = projection(other, untouched);
    await invoke(page, "create-or-connect-database", name);
    await makeCard(page, "库来源基准");
    const board = await makeHeldPage(page);
    const local = await makeCard(page, "本机基准", board.reference);
    const shared = await makeCard(page, "共享基准", board.reference);
    await invoke(page, "collaboration:set-nickname", "G4 长稳设备");
    const { documentId: room } = await invoke<{ documentId: string }>(
      page,
      "collaboration:create-content",
      shared.contentId,
      "card",
      shared.id
    );
    const openLeases = async () =>
      Promise.all([
        attachCard(page, local, "soak-local"),
        attachCard(page, shared, "soak-shared", "collaboration"),
      ]);
    let leases = await openLeases();
    let replicas = leases.map(snapshot => new ContentReplica(snapshot));
    const truth = ["本机基准", "共享基准"];
    const heads = [local, shared].map(card => projection(library, card));
    const connected = async () =>
      (await invoke<CollaborationState>(page, "collaboration:state")).sessions.find(
        item => item.id === room
      )?.connection;
    const unsubscribe = async (views: ContentSession[]) =>
      Promise.all(
        views.map((entry, index) =>
          invoke(page, `${index ? "collaboration" : "local-content"}:unsubscribe`, entry.viewId)
        )
      );
    let lastLocalBytes: number[] = [];
    const writeTick = async (measured: boolean) => {
      tick++;
      for (let edit = 1; edit <= 4; edit++) {
        await Promise.all(
          replicas.map(async (replica, index) => {
            truth[index] = `${index ? "共享" : "本机"}｜${tick}｜${edit}🙂`;
            const bytes = replica.edit(truth[index]);
            if (!index) lastLocalBytes = bytes;
            const took = await timedUpdate(
              page,
              leases[index],
              bytes,
              index ? "collaboration" : "local-content"
            );
            if (measured) operations.push(took);
          })
        );
      }
    };
    const audit = async () => {
      for (const [index, card] of [local, shared].entries()) {
        const actual = await flushProjection(library, card, truth[index]);
        const { documentId, nodes, holders, dictionary, relations } = heads[index];
        expect(actual).toMatchObject({ documentId, nodes, holders, dictionary, relations });
      }
      await expect
        .poll(() => {
          const doc = service.server.store.loadDocument(room);
          try {
            return bodyText(readNodeDocument(doc).content.slice(0, 1));
          } finally {
            doc.destroy();
          }
        })
        .toBe(truth[1]);
      expect(
        readOnly(library, db => ({
          foreignKeys: db.prepare("PRAGMA foreign_key_check").all(),
          refs: db
            .prepare("SELECT ref_count FROM white_board_contents WHERE id=?")
            .get(board.content.id)?.ref_count,
        }))
      ).toEqual({ foreignKeys: [], refs: 2 });
      expect(projection(other, untouched)).toEqual(otherBaseline);
      audits.push({
        sinceStartMs: performance.now() - started,
        checkedThroughTick: tick,
        projections: 2,
        remoteConverged: true,
        heldPages: 2,
      });
    };
    const sample = async () => {
      const info = await app.evaluate(({ app }) => ({
        memory: process.memoryUsage(),
        children: app
          .getAppMetrics()
          .map(child => ({ type: child.type, residentKiB: child.memory.workingSetSize })),
      }));
      const localJournal = readOnly(journalPath(directory), db => ({
        pendingUpdates: Number(db.prepare("SELECT count(*) n FROM updates").get()?.n),
        durableHolds: Number(db.prepare("SELECT count(*) n FROM entity_holds").get()?.n),
      }));
      samples.push({ sinceStartMs: performance.now() - started, tick, ...info, localJournal });
      console.info("[g4-soak]", JSON.stringify(samples.at(-1)));
      await result("running");
    };

    await expect.poll(connected).toBe("connected");
    const warmEnd = performance.now() + warmMs;
    while (performance.now() < warmEnd) {
      await writeTick(false);
      await waitUntil(Math.min(warmEnd, performance.now() + stepMs));
    }
    started = performance.now();
    const end = started + measuredMs;
    let nextSample = started + sampleEvery;
    let nextAudit = started + checkEvery;
    let nextTick = started;
    await audit();
    await sample();
    while (performance.now() < end) {
      await writeTick(true);
      if (performance.now() >= nextAudit) {
        isolatedWebSocket = true;
        expect(sockets.size).toBeGreaterThan(0);
        for (const socket of sockets) socket.destroy();
        await expect.poll(connected).not.toBe("connected");
        await writeTick(true);
        isolatedWebSocket = false;
        await expect.poll(connected).toBe("connected");
        reconnects++;
        await audit();
        await unsubscribe(leases);
        if (reconnects % 2 === 1) {
          await invoke(page, "create-or-connect-database", otherName);
          await expect(update(page, leases[0], lastLocalBytes)).rejects.toThrow(
            /视图已失效|会话已失效/
          );
          expect(projection(other, untouched)).toEqual(otherBaseline);
          await invoke(page, "create-or-connect-database", name);
          librarySwitches++;
        }
        for (const replica of replicas) replica.close();
        await waitUntil(performance.now() + 550);
        leases = await openLeases();
        replicas = leases.map(snapshot => new ContentReplica(snapshot));
        expect(replicas.map(replica => replica.text())).toEqual(truth);
        reopenings++;
        nextAudit += checkEvery;
      }
      if (performance.now() >= nextSample) {
        await sample();
        nextSample += sampleEvery;
      }
      nextTick += stepMs;
      await waitUntil(Math.min(end, nextTick));
    }
    await audit();
    await sample();
    expect(performance.now() - started).toBeGreaterThanOrEqual(measuredMs);
    expect(samples.length).toBeGreaterThanOrEqual(smoke ? 3 : 12);
    expect(audits.length).toBeGreaterThanOrEqual(smoke ? 2 : 7);
    for (const replica of replicas) replica.close();
    await Promise.all(
      leases.map((entry, index) =>
        sendOnFreeze(page, entry, null, index ? "collaboration" : "local-content")
      )
    );
    await close(app);
    running = undefined;
    await result("passed");
  } catch (error) {
    await result("failed");
    throw error;
  } finally {
    isolatedWebSocket = false;
    await disposeSandbox(directory, running, () => server?.app.close() ?? Promise.resolve());
  }
});
