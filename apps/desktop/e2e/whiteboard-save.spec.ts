import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import * as Y from "yjs";
import { exportWhiteboardTransfer, WhiteboardModel } from "@tau/collaboration";
import { prepareContentContract } from "@tau/db-schema/content-contracts";
import { prepareBuiltinWhiteboardTypes } from "@tau/whiteboard/contracts";
import {
  availablePort,
  close,
  createSandbox,
  disposeSandbox,
  invoke,
  launch,
} from "./content-production/harness";

test("真实粘贴经 IndexedDB 和 IPC 保存，日志写入失败硬杀后恢复完整批次", async () => {
  test.setTimeout(180_000);
  const rounds = process.env.TAU_WHITEBOARD_SAVE_STRESS === "1" ? 150 : 30;
  const directory = await createSandbox("tau-whiteboard-save-");
  let running: ElectronApplication | undefined;
  let inspector: DatabaseSync | undefined, journal: DatabaseSync | undefined;
  const repairs: string[] = [];
  const watchRepairs = (page: Page) =>
    page.on("console", message => {
      if (message.text().includes("[whiteboard-sync] 缺失依赖已进入草稿队列"))
        repairs.push(message.text());
    });
  try {
    // 每轮独立端口；进程使用同一个隔离用户目录，真实保留 IndexedDB。
    const first = await launch(directory, await availablePort(), app => {
      running = app;
    });
    const { page, app } = first;
    watchRepairs(page);
    const paragraph = await prepareContentContract("tau.paragraph", {
      type: "paragraph",
      dataVersion: 1,
      kind: "block",
    });
    await invoke(page, "create-or-connect-database", "data.db");
    await invoke(page, "create-card", {
      tags: [],
      isTop: false,
      count: 0,
      contracts: { [paragraph.id]: paragraph.contract },
      content: [{ type: "paragraph", tauContract: paragraph.id, children: [{ text: "隔离测试" }] }],
    });
    const builtin = await prepareBuiltinWhiteboardTypes();
    const doc = new Y.Doc({ gc: false }),
      model = new WhiteboardModel(doc);
    let state: number[], bundle: ReturnType<typeof exportWhiteboardTransfer>;
    try {
      await model.installContracts(
        Object.fromEntries(
          [...builtin.prepared, paragraph].map(entry => [entry.id, entry.contract])
        )
      );
      const pageId = model.submit(
        [
          { type: "create_page", title: "第一页" },
          { type: "edit_title", edit: { offset: 0, remove: 0, text: "保存压力白板" } },
        ],
        {}
      ).createdIds[0];
      model.submit(
        [
          {
            type: "create",
            contractId: builtin.types.geometry.contractId,
            parent: { kind: "page", id: pageId },
            geometry: { x: 100, y: 100, width: 180, height: 80, rotation: 0 },
            data: { geometryType: "rect", paths: [], text: { align: "center" } },
            body: [
              {
                type: "paragraph",
                tauContract: paragraph.id,
                children: [{ text: "数据治理汉😀" }],
              },
            ],
          },
        ],
        {}
      );
      state = Array.from(Y.encodeStateAsUpdate(doc));
      bundle = exportWhiteboardTransfer(model, "source");
    } finally {
      model.dispose();
      doc.destroy();
    }
    const created = await page.evaluate(
      async state =>
        window.electron.invoke<{ documentId: string; boardId: number }>(
          "whiteboard-document:create",
          "data.db",
          "save-regression",
          Uint8Array.from(state),
          "board"
        ),
      state
    );
    inspector = new DatabaseSync(join(directory, "home/.editor/data.db"));
    journal = new DatabaseSync(join(directory, "home/.editor/whiteboard-documents/journal.db"));
    const read = () => {
      const row = inspector!
        .prepare("SELECT snapshot FROM whiteboard_documents WHERE document_id=?")
        .get(created.documentId);
      return JSON.parse(String(row?.snapshot)) as ReturnType<WhiteboardModel["read"]>;
    };
    const openCanvas = async (page: Page) => {
      await page.getByText("白板", { exact: true }).first().click();
      await page.getByText("保存压力白板", { exact: true }).first().click();
      const canvas = page.locator("svg[data-whiteboard-canvas]:visible");
      await expect(canvas).toBeVisible();
      await canvas.click({ position: { x: 450, y: 350 } });
      return canvas;
    };
    const paste = async (page: Page) => {
      await page.locator("svg[data-whiteboard-canvas]:visible").evaluate((canvas, payload) => {
        const clipboardData = new DataTransfer();
        clipboardData.setData("application/json", JSON.stringify(payload));
        canvas.dispatchEvent(
          new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true })
        );
      }, bundle);
    };
    const drafts = (page: Page) =>
      page.evaluate(
        () =>
          new Promise<number>((resolve, reject) => {
            const request = indexedDB.open("tau-whiteboard-outbox", 1);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const db = request.result,
                tx = db.transaction("updates", "readonly"),
                count = tx.objectStore("updates").count();
              tx.oncomplete = () => {
                db.close();
                resolve(count.result);
              };
              tx.onerror = () => {
                db.close();
                reject(tx.error);
              };
            };
          })
      );
    await openCanvas(page);
    for (let round = 0; round < rounds; round++) {
      await paste(page);
      await expect.poll(() => read().pages[0].children.length).toBe(round + 2);
    }
    await expect.poll(() => drafts(page)).toBe(0);
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => read().pages[0].children.length).toBe(rounds);
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await expect.poll(() => read().pages[0].children.length).toBe(rounds + 1);
    journal.exec(
      "CREATE TRIGGER fail_save BEFORE INSERT ON updates BEGIN SELECT RAISE(ABORT,'injected journal failure'); END"
    );
    await paste(page);
    await expect.poll(() => drafts(page)).toBeGreaterThan(0);
    await expect(page.getByRole("button", { name: "重试保存", exact: true })).toBeVisible();
    expect(read().pages[0].children).toHaveLength(rounds + 1);
    const exited = new Promise<void>(resolve => app.process().once("exit", () => resolve()));
    app.process().kill("SIGKILL");
    await exited;
    running = undefined;
    journal.exec("DROP TRIGGER fail_save");
    const reopened = await launch(directory, await availablePort(), app => {
      running = app;
    });
    watchRepairs(reopened.page);
    await openCanvas(reopened.page);
    await expect.poll(() => read().pages[0].children.length).toBe(rounds + 2);
    await expect.poll(() => drafts(reopened.page)).toBe(0);
    const saved = read().pages[0].children;
    expect(new Set(saved.map(node => node.id)).size).toBe(rounds + 2);
    for (const node of saved)
      expect(node.body).toMatchObject([{ children: [{ text: "数据治理汉😀" }] }]);
    expect(repairs).toEqual([]);
    await close(reopened.app);
    running = undefined;
    console.info(
      "WHITEBOARD_SAVE_ELECTRON",
      JSON.stringify({
        pastes: rounds + 1,
        nodes: rounds + 2,
        undoRedo: true,
        realIndexedDB: true,
        journalFailure: true,
        hardKillRecovery: true,
      })
    );
  } finally {
    journal?.close();
    inspector?.close();
    await disposeSandbox(directory, running);
  }
});
