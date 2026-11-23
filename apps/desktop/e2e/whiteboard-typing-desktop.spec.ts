import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import * as Y from "yjs";
import { WhiteboardModel } from "@tau/collaboration";
import { prepareBuiltinWhiteboardTypes } from "@tau/whiteboard/contracts";
import type { WhiteboardDocumentOpen } from "@/types/whiteboard-document";
import {
  availablePort,
  createSandbox,
  disposeSandbox,
  invoke,
  launch,
  prepareParagraphFixture,
} from "./content-production/harness";
import { seedInk } from "./whiteboard-ink/fixture";
import { addMixedScene } from "./whiteboard-mixed-fixture";

const sample = "abcdefghijklmnopqrstuvwx";
const rates = [1, 4, 4, 1, 1, 4];

const percentile95 = (values: number[]) =>
  values.toSorted((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1];

async function measure(page: Page, rate: number) {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate });
    const dispatch: number[] = [];
    cdp.on("Tracing.dataCollected", ({ value }) => {
      for (const event of value)
        if (
          event.name === "EventDispatch" &&
          event.ph === "X" &&
          event.args?.data?.type === "keypress"
        )
          dispatch.push(event.dur / 1000);
    });
    await cdp.send("Tracing.start", {
      categories: "devtools.timeline",
      transferMode: "ReportEvents",
    });
    const capture = await page.evaluateHandle(() => {
      let last: number | undefined, frameId: number;
      const frames: number[] = [],
        keys: number[] = [];
      function frame(now: number) {
        if (last !== undefined) frames.push(now - last);
        last = now;
        frameId = requestAnimationFrame(frame);
      }
      function key(event: KeyboardEvent) {
        const start = event.timeStamp;
        requestAnimationFrame(() =>
          requestAnimationFrame(() => keys.push(performance.now() - start))
        );
      }
      frameId = requestAnimationFrame(frame);
      document.addEventListener("keydown", key, true);
      return () => {
        cancelAnimationFrame(frameId);
        document.removeEventListener("keydown", key, true);
        return { frames, keys };
      };
    });
    await page.keyboard.type(sample, { delay: 70 });
    // 包含停笔后投影、保存回执和列表预览刷新。
    await page.waitForTimeout(700);
    const { frames, keys } = await capture.evaluate(stop => stop());
    await capture.dispose();
    const completed = new Promise(resolve => cdp.once("Tracing.tracingComplete", resolve));
    await cdp.send("Tracing.end");
    await completed;
    expect(dispatch).toHaveLength(sample.length);
    expect(keys).toHaveLength(sample.length);
    expect(frames.length).toBeGreaterThan(0);
    return {
      rate,
      keypressP95Ms: percentile95(dispatch),
      twoFrameP95Ms: percentile95(keys),
      longestFrameMs: Math.max(...frames),
      slowFrames: frames.filter(ms => ms >= 49.9).length,
    };
  } finally {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await cdp.detach();
  }
}

test("混合白板文本输入的按键耗时、帧间隔与保存", async () => {
  test.skip(!process.env.WHITEBOARD_TYPING_DESKTOP);
  test.setTimeout(480_000);
  const directory = await createSandbox("tau-typing-desktop-");
  let running: ElectronApplication | undefined;
  const model = new WhiteboardModel(new Y.Doc({ gc: false }));
  try {
    const { app } = await launch(directory, await availablePort(), value => {
      running = value;
    });
    const windows = await Promise.all(
      app
        .windows()
        .map(async page => ({ page, role: await page.evaluate(() => window.electron?.windowRole) }))
    );
    const page = windows.find(window => window.role === "main")?.page;
    if (!page) throw new Error("找不到白板主窗口");
    const title = "白板文字输入";
    await invoke(page, "create-or-connect-database", "data.db");
    await invoke(page, "create-card", (await prepareParagraphFixture())(title));
    const schema = await prepareBuiltinWhiteboardTypes();
    seedInk(model, schema, 240);
    await addMixedScene(model, schema, 12);
    model.submit([{ type: "edit_title", edit: { offset: 0, remove: 0, text: title } }], null);
    const contentId = await page.evaluate(
      async ({ bytes, title }) =>
        (
          await window.electron.invoke<{ contentIds: number[] }>(
            "whiteboard-document:create",
            "data.db",
            title,
            Uint8Array.from(bytes),
            "board"
          )
        ).contentIds[0],
      { bytes: Array.from(Y.encodeStateAsUpdate(model.doc)), title: "typing-bench" }
    );
    await page.reload();
    await page.getByText("白板", { exact: true }).first().click();
    await page.locator("article[data-whiteboard-id]").filter({ hasText: title }).first().click();
    await page.bringToFront();
    const root = page.locator("[data-whiteboard-root]:visible").first();
    const rich = root.locator("#rich-text-container-text-0");
    await root.getByRole("button", { name: "切换指针模式" }).click();
    await page.getByRole("menuitemradio", { name: "文本", exact: true }).click();
    await rich.click({ position: { x: 35, y: 10 } });
    const editor = rich.locator('[contenteditable="true"]').first();
    await expect(editor).toBeFocused();
    for (const [index, rate] of rates.entries()) {
      console.log("WHITEBOARD_TYPING", JSON.stringify(await measure(page, rate)));
      expect(await editor.textContent()).toContain(sample.repeat(index + 1));
    }
    const ime = await page.context().newCDPSession(page);
    await ime.send("Input.imeSetComposition", {
      text: "zhongwen",
      selectionStart: 8,
      selectionEnd: 8,
    });
    await ime.send("Input.insertText", { text: "中文输入" });
    await ime.detach();
    const typed = sample.repeat(rates.length) + "中文输入";
    await expect(editor).toContainText(typed);
    await page.getByText("白板", { exact: true }).first().click();
    await expect(root).toBeHidden();
    const state = await page.evaluate(async id => {
      const opened = await window.electron.invoke<WhiteboardDocumentOpen>(
        "whiteboard-document:open",
        "data.db",
        id,
        "typing-verify"
      );
      try {
        return Array.from(opened.state);
      } finally {
        await window.electron.invoke("whiteboard-document:release", opened.leaseId);
      }
    }, contentId);
    const saved = new WhiteboardModel(new Y.Doc({ gc: false }));
    try {
      Y.applyUpdate(saved.doc, Uint8Array.from(state));
      expect(JSON.stringify(saved.richText("text-0").read())).toContain(typed);
    } finally {
      saved.doc.destroy();
    }
  } finally {
    model.doc.destroy();
    await disposeSandbox(directory, running);
  }
});
