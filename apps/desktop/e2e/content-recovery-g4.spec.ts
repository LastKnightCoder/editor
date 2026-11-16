import { expect, test, type ElectronApplication } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  availablePort,
  close,
  createSandbox,
  disposeSandbox,
  invoke,
  launch,
  update,
} from "./content-production/harness";
import {
  artifactSha,
  attachCard,
  ContentReplica,
  flushProjection,
  journalPath,
  mainPath,
  makeCard,
  makeHeldPage,
  projection,
  readOnly,
  saveReport,
} from "./content-production/g4-content";

const enabled = process.env.TAU_CONTENT_G4 === "recovery";
const smoke = process.env.TAU_CONTENT_G4_SMOKE === "1";
const quick = process.env.TAU_CONTENT_G4_QUICK === "1";
const cuts = ["journal-before", "journal-after", "projection-before", "projection-after"] as const;

test("真实生产正文在四个持久化切点反复强退重开", async () => {
  // 门控：四切点 × 20 次真实 SIGKILL 循环（45 分钟），默认跳过；TAU_CONTENT_G4=recovery 启用（docs/guides/dev-content-verification.md §3）。
  test.skip(!enabled, "按需运行正文强退循环");
  test.setTimeout(45 * 60_000);
  const directory = await createSandbox("tau-g4-recovery-");
  const name = "content-g4-recovery";
  const library = mainPath(directory, name);
  const journal = journalPath(directory);
  const checkpoint = join(directory, "durability-cut.json");
  const report = smoke
    ? "g4-recovery-smoke.json"
    : quick
      ? "g4-recovery-quick.json"
      : "g4-recovery.json";
  const candidate = await artifactSha();
  const started = performance.now();
  const iterations = smoke ? 1 : quick ? 2 : 20;
  const results: object[] = [];
  let running: ElectronApplication | undefined;
  let step: object | undefined;
  const start = async () => {
    const connection = await launch(
      directory,
      await availablePort(),
      app => (running = app),
      undefined,
      "recovery-bootstrap.cjs"
    );
    await invoke(connection.page, "create-or-connect-database", name);
    return connection;
  };
  const snapshot = (status: string) =>
    saveReport(report, {
      candidate,
      status,
      iterations,
      elapsedMs: performance.now() - started,
      results,
      step,
    });
  try {
    let live = await start();
    await makeCard(live.page, "库来源基准");
    for (const cut of cuts) {
      for (let iteration = 0; iteration < iterations; iteration++) {
        const nonce = `${cut}:${iteration}`;
        step = { cut, iteration, nonce };
        const beforeText = `基准｜${nonce}`;
        const afterText = `候选｜${nonce}🙂`;
        const a = await makeHeldPage(live.page);
        const b = await makeHeldPage(live.page);
        const card = await makeCard(live.page, beforeText, a.reference);
        const view = await attachCard(live.page, card, `original:${nonce}`);
        const before = projection(library, card);
        expect(before.relations.map(row => row.entity_id)).toEqual([a.reference.entityId]);
        const replica = new ContentReplica(view);
        const bytes = replica.edit(afterText, b.reference);
        replica.close();

        const onJournal = cut.startsWith("journal-");
        const child = live.app.process();
        const exit = new Promise<NodeJS.Signals | null>(resolve =>
          child.once("exit", (_code, signal) => resolve(signal))
        );
        await live.app.evaluate(
          (_electron, fault) => {
            Object.assign(globalThis, { __tauG4DurabilityCut: fault });
          },
          {
            cut,
            nonce,
            database: onJournal ? journal : library,
            target: onJournal ? view.documentId : card.contentId,
          }
        );
        const send = update(live.page, view, bytes).catch(() => undefined);
        await expect.poll(() => child.signalCode, { timeout: 20_000 }).toBe("SIGKILL");
        expect(await exit).toBe("SIGKILL");
        running = undefined;
        await send;
        const transactionWitness = JSON.parse(await readFile(checkpoint, "utf8"));
        expect(transactionWitness).toEqual({ cut, nonce, inTransaction: cut.endsWith("-before") });

        const hash = createHash("sha256").update(Uint8Array.from(bytes)).digest("hex");
        const hasDurableDelta = readOnly(
          journal,
          db =>
            !!db
              .prepare("SELECT 1 FROM updates WHERE document_id=? AND hash=?")
              .get(view.documentId, hash)
        );
        expect(hasDurableDelta).toBe(cut !== "journal-before");
        const atCrash = projection(library, card);
        if (cut === "projection-after") {
          expect(atCrash).toMatchObject({ text: afterText, edits: before.edits + 1 });
          expect(atCrash.relations.map(row => row.entity_id)).toEqual([b.reference.entityId]);
        } else expect(atCrash).toEqual(before);
        const refs = () =>
          readOnly(library, db =>
            [a, b].map(
              page =>
                db
                  .prepare("SELECT ref_count FROM white_board_contents WHERE id=?")
                  .get(page.content.id)?.ref_count
            )
          );
        expect(refs()).toEqual(cut === "projection-after" ? [0, 1] : [1, 0]);

        live = await start();
        const reopened = await attachCard(live.page, card, `reopened:${nonce}`);
        const restored = new ContentReplica(reopened);
        expect(restored.text()).toBe(hasDurableDelta ? afterText : beforeText);
        restored.close();
        expect(reopened.documentIdentity).toEqual(view.documentIdentity);
        await update(live.page, reopened, bytes);
        await update(live.page, reopened, bytes);
        const saved = await flushProjection(library, card, afterText);
        expect(saved).toMatchObject({
          documentId: before.documentId,
          nodes: before.nodes,
          dictionary: before.dictionary,
          holders: before.holders,
          edits: before.edits + 1,
        });
        expect(saved.relations.map(row => row.entity_id)).toEqual([b.reference.entityId]);
        expect(refs()).toEqual([0, 1]);
        expect(readOnly(library, db => db.prepare("PRAGMA foreign_key_check").all())).toEqual([]);
        await invoke(live.page, "local-content:unsubscribe", reopened.viewId);
        results.push({
          cut,
          iteration,
          actualSignal: "SIGKILL",
          transactionWitness,
          hasDurableDelta,
          projectionWasDurable: atCrash.text === afterText,
          documentId: saved.documentId,
          finalRevision: saved.revision,
          newEdits: saved.edits - before.edits,
          relationMovedOnce: true,
        });
        step = undefined;
        await snapshot("running");
        console.info(`[g4-recovery] ${nonce} ${results.length}/${cuts.length * iterations}`);
      }
    }
    await close(live.app);
    running = undefined;
    await snapshot("passed");
  } catch (error) {
    await snapshot("failed");
    throw error;
  } finally {
    await disposeSandbox(directory, running);
  }
});
