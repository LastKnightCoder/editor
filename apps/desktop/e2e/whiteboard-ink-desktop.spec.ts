import { test, expect, type ElectronApplication } from "@playwright/test";
import { pathToFileURL } from "node:url";
import * as Y from "yjs";
import { WhiteboardModel } from "@tau/collaboration";
import { prepareBuiltinWhiteboardTypes } from "@tau/whiteboard/contracts";
import {
  addIntegrityScene,
  verifyMixedDocument,
  type InkPoint,
} from "./whiteboard-ink/mixed-integrity";
import { seedInk } from "./whiteboard-ink/fixture";
import {
  availablePort,
  close,
  createSandbox,
  disposeSandbox,
  invoke,
  launch,
  prepareParagraphFixture,
} from "./content-production/harness";
import type { WhiteboardDocumentOpen } from "@/types/whiteboard-document";

test("密集手写的桌面帧间隔与持久化采样点", async () => {
  test.skip(!process.env.WHITEBOARD_INK_DESKTOP);
  test.setTimeout(240_000);
  const directory = await createSandbox("tau-ink-desktop-");
  let running: ElectronApplication | undefined;
  const doc = new Y.Doc({ gc: false });
  const model = new WhiteboardModel(doc);
  try {
    // 大场景在启动前准备，避免测试驱动同步造数与后台索引启动重叠。
    const title = "手写压测";
    const mixed = process.env.WHITEBOARD_INK_MIXED === "1";
    const schema = await prepareBuiltinWhiteboardTypes();
    seedInk(model, schema, 800);
    if (mixed) await addIntegrityScene(model, schema);
    model.submit([{ type: "edit_title", edit: { offset: 0, remove: 0, text: title } }], null);
    const before = mixed ? model.read() : null;
    const state = Array.from(Y.encodeStateAsUpdate(doc));
    const { app } = await launch(directory, await availablePort(), value => {
      running = value;
    });
    const windows = await Promise.all(
      app
        .windows()
        .map(async page => ({ page, role: await page.evaluate(() => window.electron?.windowRole) }))
    );
    const page = windows.find(window => window.role === "main")!.page;
    if (process.env.WHITEBOARD_RENDERER_HTML)
      await page.goto(pathToFileURL(process.env.WHITEBOARD_RENDERER_HTML).href);
    await invoke(page, "create-or-connect-database", "data.db");
    const paragraph = await prepareParagraphFixture();
    await invoke(page, "create-card", paragraph(title));
    const renderErrors: string[] = [];
    if (mixed) {
      page.on("pageerror", error => renderErrors.push(error.message));
      page.on("console", entry => {
        if (/白板扩展 .* 的元素 .* 失败/.test(entry.text())) renderErrors.push(entry.text());
      });
    }
    const contentId = await page.evaluate(
      async bytes =>
        (
          await window.electron.invoke<{ contentIds: number[] }>(
            "whiteboard-document:create",
            "data.db",
            "ink-bench",
            Uint8Array.from(bytes),
            "board"
          )
        ).contentIds[0],
      state
    );
    await page.reload();
    await page.getByText("白板", { exact: true }).first().click();
    await page.locator("article[data-whiteboard-id]").filter({ hasText: title }).first().click();
    const root = page.locator("[data-whiteboard-root]:visible").first();
    await root.getByRole("button", { name: "手写", exact: true }).click();
    if (mixed) {
      await expect(root.locator('[id^="rich-text-container-text-"]').first()).toBeVisible();
      await expect(root.locator("#frame-title-mixed-frame")).toBeVisible();
      await expect(root.locator("[data-unknown-element]")).toHaveCount(0);
    }
    const longStroke = process.env.WHITEBOARD_INK_LONG === "1";
    const steps = mixed
      ? [1, 62, 63, 64, 127, 128, 256]
      : longStroke
        ? [512]
        : [12, 12, 72, 12, 12];
    if (longStroke) await page.getByRole("button", { name: "展开元素树" }).click();
    const box = (await root.boundingBox())!;
    await (
      await app.browserWindow(page)
    ).evaluate(win => {
      win.show();
      win.focus();
    });
    await page.bringToFront();
    const captured = mixed
      ? await root.evaluateHandle(element => {
          const svg = element.querySelector<SVGSVGElement>("svg[data-whiteboard-canvas]")!;
          const strokes: InkPoint[][] = [];
          const observe = (e: PointerEvent) => {
            if (e.pointerType !== "pen" || e.buttons !== 1) return;
            if (e.type === "pointerdown") strokes.push([]);
            const matrix = svg.getScreenCTM()!;
            const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
            strokes.at(-1)?.push({ x: point.x, y: point.y, pressure: e.pressure });
          };
          window.addEventListener("pointerdown", observe, true);
          window.addEventListener("pointermove", observe, true);
          return () => {
            window.removeEventListener("pointerdown", observe, true);
            window.removeEventListener("pointermove", observe, true);
            return strokes;
          };
        })
      : null;
    const cdp = await page.context().newCDPSession(page);
    const pen = (
      type: "mousePressed" | "mouseMoved" | "mouseReleased",
      x: number,
      y: number,
      force = 0.5
    ) =>
      cdp.send("Input.dispatchMouseEvent", {
        type,
        pointerType: "pen",
        x,
        y,
        button: type === "mouseMoved" ? "none" : "left",
        buttons: type === "mouseReleased" ? 0 : 1,
        force,
        clickCount: 1,
      });
    for (let round = 0; round < 4; round++) {
      const sample = await page.evaluateHandle(() => {
        const frames: number[] = [];
        let last = performance.now(),
          handle = 0;
        function frame(now: number) {
          frames.push(now - last);
          last = now;
          handle = requestAnimationFrame(frame);
        }
        handle = requestAnimationFrame(frame);
        return async () => {
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          cancelAnimationFrame(handle);
          return frames.slice(1);
        };
      });
      for (const [index, n] of steps.entries()) {
        const x = box.x + box.width * 0.27,
          y = box.y + box.height * 0.45 + index * 10;
        const penX = (i: number) =>
          x + 4 * (longStroke || mixed ? 60 - Math.abs(60 - (i % 120)) : i);
        await pen("mousePressed", x, y);
        for (let i = 1; i <= n; i++)
          await pen(
            "mouseMoved",
            penX(i),
            y + 16 * Math.sin(i / 4),
            mixed ? 0.25 + (i % 5) / 8 : 0.5
          );
        await pen("mouseReleased", penX(n), y + 16 * Math.sin(n / 4));
      }
      const frames = await sample.evaluate(stop => stop());
      console.log(
        "INK_DESKTOP",
        JSON.stringify({
          round,
          frames: frames.length,
          maxMs: Math.max(...frames),
          slow: frames.filter(ms => ms >= 49.9).length,
        })
      );
      await sample.dispose();
    }
    if (mixed) expect(renderErrors).toEqual([]);
    const expected = captured ? await captured.evaluate(read => read()) : [];
    await captured?.dispose();
    if (mixed)
      expect(expected.map(points => points.length)).toEqual(
        Array.from({ length: 4 }, () => steps.map(s => s + 1)).flat()
      );
    // 离页经过正式保存屏障，再从主进程打开该页以核对写入。
    await page.getByText("白板", { exact: true }).first().click();
    await expect(root).toBeHidden();
    let verifyPage = page;
    if (mixed) {
      await close(app);
      running = undefined;
      const reopened = await launch(directory, await availablePort(), value => {
        running = value;
      });
      verifyPage = reopened.page;
      await invoke(verifyPage, "create-or-connect-database", "data.db");
    }
    const points = await verifyPage.evaluate(async id => {
      const opened = await window.electron.invoke<WhiteboardDocumentOpen>(
        "whiteboard-document:open",
        "data.db",
        id,
        "ink-bench-verify"
      );
      try {
        return Array.from(opened.state);
      } finally {
        await window.electron.invoke("whiteboard-document:release", opened.leaseId);
      }
    }, contentId);
    const saved = new Y.Doc();
    try {
      Y.applyUpdate(saved, Uint8Array.from(points));
      const after = new WhiteboardModel(saved).read();
      if (before) {
        verifyMixedDocument(directory, before, after, expected);
        return;
      }
      const stored = after.pages[0].children;
      expect(stored).toHaveLength(800 + 4 * steps.length);
      expect(
        stored
          .slice(800)
          .map(stroke =>
            stroke.children.reduce((sum, s) => sum + (s.data.points as unknown[]).length, 0)
          )
      ).toEqual(Array.from({ length: 4 }, () => steps.map(n => n + 1)).flat());
    } finally {
      saved.destroy();
    }
  } finally {
    model.dispose();
    doc.destroy();
    await disposeSandbox(directory, running);
  }
});
