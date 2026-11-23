import { startFrameSample } from "../scripts/whiteboard-frame-sample.mjs";
import { addMixedScene } from "./whiteboard-mixed-fixture";
import { expect, test, type ElectronApplication } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import * as Y from "yjs";
import { WhiteboardModel, type WhiteboardModelCommand } from "@tau/collaboration";
import type { ContentEntityReference } from "@tau/db-schema/content-identities";
import { prepareBuiltinWhiteboardTypes } from "@tau/whiteboard/contracts";
import {
  availablePort,
  createSandbox,
  disposeSandbox,
  invoke,
  launch,
  prepareParagraphFixture,
} from "./content-production/harness";

const mixed = process.env.WHITEBOARD_COMPLEX === "1";
test(
  mixed ? "混合白板连续平移、缩放和移动 PDF 卡" : "PDF 卡面加载后连续平移保持页图和指针落点",
  async () => {
    test.setTimeout(150_000);
    const directory = await createSandbox("tau-pdf-pan-");
    let running: ElectronApplication | undefined;
    try {
      const { app } = await launch(directory, await availablePort(), value => {
        running = value;
      });
      const windows = await Promise.all(
        app.windows().map(async page => ({
          page,
          role: await page.evaluate(() => window.electron?.windowRole),
        }))
      );
      const page = windows.find(window => window.role === "main")!.page;
      if (process.env.WHITEBOARD_RENDERER_HTML) {
        await page.goto(pathToFileURL(process.env.WHITEBOARD_RENDERER_HTML).href);
      }
      await invoke(page, "create-or-connect-database", "data.db");
      const paragraph = await prepareParagraphFixture();
      await invoke(page, "create-card", paragraph("白板基准资料库"));
      const filePath = join(directory, "sample.pdf");
      const bytes = await app.evaluate(async ({ BrowserWindow }) => {
        const window = new BrowserWindow({ show: false });
        try {
          await window.loadURL("data:text/html,<h1>Whiteboard PDF</h1><p>Page preview</p>");
          return Array.from(await window.webContents.printToPDF({ pageSize: "A4" }));
        } finally {
          window.destroy();
        }
      });
      await writeFile(filePath, Uint8Array.from(bytes));
      const pdf = await invoke<{ id: number }>(page, "create-pdf", {
        isLocal: true,
        fileName: "sample.pdf",
        filePath,
        remoteUrl: "",
        category: "",
        tags: [],
      });
      const entity = await invoke<ContentEntityReference>(
        page,
        "whiteboard-document:reference-entity",
        "data.db",
        "pdf",
        pdf.id
      );
      const schema = await prepareBuiltinWhiteboardTypes();
      const doc = new Y.Doc();
      const model = new WhiteboardModel(doc);
      const title = mixed ? "混合画布验收" : "PDF 平移基准";
      let contentId: number;
      try {
        const contract = schema.prepared.find(row => row.id === schema.types.document.contractId)!;
        await model.installContracts({ [contract.id]: contract.contract });
        const nodes: WhiteboardModelCommand[] = Array.from({ length: 12 }, (_, index) => ({
          type: "create",
          id: `paper-${index}`,
          contractId: contract.id,
          entity,
          parent: { kind: "page", id: "p" },
          data: { title: "sample" },
          geometry: {
            x: (mixed ? 35 : 100) + (index % 4) * 170,
            y: (mixed ? 40 : 100) + Math.floor(index / 4) * (mixed ? 168 : 160),
            width: mixed ? 120 : 150,
            height: mixed ? 75 : 140,
            rotation: 0,
          },
        }));
        model.submit(
          [
            { type: "edit_title", edit: { offset: 0, remove: 0, text: title } },
            { type: "create_page", id: "p", title: "PDF" },
            ...nodes,
          ],
          null
        );
        if (mixed) {
          await addMixedScene(model, schema);
          expect(model.read().pages[0].children).toHaveLength(972);
        }
        const created = await page.evaluate(
          bytes =>
            window.electron.invoke<{ contentIds: number[] }>(
              "whiteboard-document:create",
              "data.db",
              "bench-pdf",
              Uint8Array.from(bytes),
              "board"
            ),
          [...Y.encodeStateAsUpdate(doc)]
        );
        contentId = created.contentIds[0];
      } finally {
        model.dispose();
        doc.destroy();
      }
      await page.reload();
      await page.getByText("白板", { exact: true }).first().click();
      await page
        .locator("article[data-whiteboard-id]")
        .filter({ hasText: title })
        .first()
        .click({ timeout: 15_000 });
      const canvas = page.locator("svg[data-whiteboard-canvas]:visible").first();
      if (mixed) {
        await expect(canvas.locator('[id^="rich-text-container-text-"]').first()).toBeVisible();
        expect(await canvas.locator("[data-unknown-element]").count()).toBe(0);
      }
      const image = canvas.locator("[data-pdf-face] img").first();
      await expect
        .poll(() =>
          canvas
            .locator("[data-pdf-face] img")
            .evaluateAll(
              images => images.filter(img => (img as HTMLImageElement).naturalWidth > 0).length
            )
        )
        .toBe(12);
      const root = canvas.locator("xpath=ancestor::*[@data-whiteboard-root][1]");
      const box = (await root.boundingBox())!;
      const x = box.x + box.width * 0.45;
      const y = box.y + box.height * 0.55;
      const mainWindow = await app.browserWindow(page);
      await mainWindow.evaluate(window => {
        window.show();
        window.focus();
      });
      await page.bringToFront();
      await expect
        .poll(() => page.evaluate(() => document.hasFocus() && !document.hidden))
        .toBe(true);
      const idle = await page.evaluate(
        () =>
          new Promise<number[]>(resolve => {
            const times: number[] = [];
            function tick(now: number) {
              times.push(now);
              if (times.length < 61) requestAnimationFrame(tick);
              else
                resolve(
                  times
                    .slice(1)
                    .map((t, i) => t - times[i])
                    .sort((a, b) => a - b)
                );
            }
            requestAnimationFrame(tick);
          })
      );
      console.log(
        "PDF_IDLE",
        JSON.stringify({
          p95: idle[56],
          images: await canvas.locator("[data-pdf-face] img").count(),
        })
      );
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Performance.enable");
      const taskMs = async () =>
        (await cdp.send("Performance.getMetrics")).metrics.find(v => v.name === "TaskDuration")!
          .value * 1000;
      for (let round = 0; round < 4; round++) {
        const dx = round % 2 ? -120 : 120;
        await page.mouse.move(x, y);
        const initial = await canvas.evaluate(svg => (svg as SVGSVGElement).getScreenCTM()!.e);
        const sample = await canvas.evaluateHandle(startFrameSample);
        const start = await taskMs();
        await page.mouse.down({ button: "right" });
        await page.mouse.move(x + dx, y + 24, { steps: 48 });
        await page.mouse.up({ button: "right" });
        await page.evaluate(
          () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        );
        const task = (await taskMs()) - start;
        const metrics = await sample.evaluate(stop => stop());
        await sample.dispose();
        const end = await canvas.evaluate(svg => (svg as SVGSVGElement).getScreenCTM()!.e);
        console.log(
          mixed ? "MIXED_PAN" : "PDF_PAN",
          JSON.stringify({ round, taskMs: Math.round(task), ...metrics, distance: end - initial })
        );
        expect(Math.abs(end - initial - dx)).toBeLessThan(mixed ? 1 : 20);
        expect(metrics.frames).toBeGreaterThan(10);
        await expect(image).toBeVisible();
        if (mixed && round > 0) {
          expect.soft(metrics.displayed).toBeGreaterThanOrEqual(40);
          expect.soft(metrics.p95MotionMs).toBeLessThanOrEqual(25);
          expect.soft(metrics.firstMotionMs).toBeLessThanOrEqual(65);
          expect.soft(metrics.longFrames).toBeLessThanOrEqual(1);
        }
      }
      if (mixed) {
        const matrix = () =>
          canvas.evaluate(svg => {
            const { a, e, f } = (svg as SVGSVGElement).getScreenCTM()!;
            return { a, e, f };
          });
        const start = await matrix();
        const moveToPaper = async () => {
          const blank = await canvas.evaluate(svg => {
            const bounds = svg.closest("[data-whiteboard-root]")!.getBoundingClientRect();
            for (let top = bounds.top + 70; top < bounds.bottom - 30; top += 21) {
              for (let left = bounds.left + 20; left < bounds.right - 20; left += 27) {
                if (document.elementFromPoint(left, top) === svg) return { left, top };
              }
            }
            throw new Error("当前视口没有可进行滚轮平移的空白位置");
          });
          await page.mouse.move(blank.left, blank.top);
        };
        await moveToPaper();
        await page.mouse.wheel(1200, 700);
        await expect.poll(async () => (await matrix()).e).toBeLessThan(start.e - 1150);
        await expect(canvas.locator('[id^="rich-text-container-text-"]').first()).toBeAttached();
        await moveToPaper();
        await page.mouse.wheel(-1200, -700);
        await expect.poll(async () => Math.abs((await matrix()).e - start.e)).toBeLessThan(1);
        await page.mouse.move(x, y);
        await page.keyboard.down("Control");
        await page.mouse.wheel(0, -60);
        await page.keyboard.up("Control");
        await expect.poll(async () => (await matrix()).a).toBeGreaterThan(start.a);
        const zoomed = await matrix();
        expect(Math.abs((x - start.e) / start.a - (x - zoomed.e) / zoomed.a)).toBeLessThan(1);
        expect(Math.abs((y - start.f) / start.a - (y - zoomed.f) / zoomed.a)).toBeLessThan(1);
        const card = canvas.locator('[data-document-card="paper-5"]');
        const before = (await card.boundingBox())!;
        // 卡面中心和四边保留给连线抓手，从纸面内侧拖卡。
        const cx = before.x + before.width * 0.28;
        const cy = before.y + before.height * 0.32;
        await page.mouse.move(cx, cy);
        await expect
          .poll(
            () =>
              page.evaluate(
                ({ cx, cy }) =>
                  document
                    .elementFromPoint(cx, cy)
                    ?.closest("[data-document-card]")
                    ?.getAttribute("data-document-card"),
                { cx, cy }
              ),
            { timeout: 2000 }
          )
          .toBe("paper-5");
        const dragFrames = await canvas.evaluateHandle(startFrameSample);
        const dragStart = performance.now();
        await page.mouse.down();
        await page.mouse.move(cx + 74, cy + 38, { steps: 16 });
        await page.evaluate(
          () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        );
        const beforeRelease = performance.now();
        expect((await card.boundingBox())!.x - before.x).toBeGreaterThan(50);
        const motion = await dragFrames.evaluate(stop => stop());
        await dragFrames.dispose();
        const released = await page.evaluateHandle(() => {
          let firstFrame!: (ms: number) => void;
          const first = new Promise<number>(resolve => {
            firstFrame = resolve;
          });
          const tail = new Promise<number>(resolve =>
            window.addEventListener(
              "pointerup",
              event => {
                const started = event.timeStamp;
                requestAnimationFrame(() => {
                  let last = performance.now(),
                    worst = 0;
                  firstFrame(last - started);
                  const sample = () => {
                    const now = performance.now();
                    worst = Math.max(worst, now - last);
                    last = now;
                    if (now - started >= 500) resolve(worst);
                    else requestAnimationFrame(sample);
                  };
                  requestAnimationFrame(sample);
                });
              },
              { capture: true, once: true }
            )
          );
          return { first, tail };
        });
        await page.mouse.up();
        const releaseFrameMs = await released.evaluate(measurement => measurement.first);
        await page.evaluate(
          () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        );
        await expect
          .poll(async () => (await card.boundingBox())!.x - before.x, { timeout: 3000 })
          .toBeGreaterThan(50);
        const releaseCheckMs = Math.round(performance.now() - beforeRelease);
        const subsequentGapMs = Math.round(
          await released.evaluate(measurement => measurement.tail)
        );
        await released.dispose();
        console.log(
          "MIXED_ELEMENT_DRAG",
          JSON.stringify({
            movingMs: Math.round(beforeRelease - dragStart),
            releaseCheckMs,
            subsequentGapMs,
            releaseFrameMs: Math.round(releaseFrameMs),
            p95FrameMs: motion.p95FrameMs,
            maxFrameMs: motion.maxFrameMs,
          })
        );
        expect.soft(releaseFrameMs).toBeLessThanOrEqual(50);
        await expect(card.locator("[data-pdf-face] img")).toBeVisible();
        const savedBox = (await card.boundingBox())!;
        const expected = {
          x: (savedBox.x - zoomed.e) / zoomed.a,
          y: (savedBox.y - zoomed.f) / zoomed.a,
        };
        await expect
          .poll(
            async () => {
              const bytes = await page.evaluate(async id => {
                const opened = await window.electron.invoke<{ leaseId: string; state: Uint8Array }>(
                  "whiteboard-document:open",
                  "data.db",
                  id,
                  "verify-final-position"
                );
                try {
                  return Array.from(opened.state);
                } finally {
                  await window.electron.invoke("whiteboard-document:release", opened.leaseId);
                }
              }, contentId);
              const snapshot = new Y.Doc({ gc: false });
              const persisted = new WhiteboardModel(snapshot);
              try {
                Y.applyUpdate(snapshot, Uint8Array.from(bytes));
                const geometry = persisted
                  .read()
                  .pages[0].children.find(node => node.id === "paper-5")!.geometry;
                return Math.max(
                  Math.abs(geometry.x - expected.x),
                  Math.abs(geometry.y - expected.y)
                );
              } finally {
                persisted.dispose();
                snapshot.destroy();
              }
            },
            { timeout: 5000 }
          )
          .toBeLessThan(1);
        console.log(
          "MIXED_ACTIONS",
          JSON.stringify({
            elements: 972,
            pan: true,
            wheel: true,
            zoom: true,
            movedPdf: true,
            persisted: true,
          })
        );
      }
    } finally {
      await disposeSandbox(directory, running);
    }
  }
);
