import { DatabaseSync } from "node:sqlite";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  measureInsightTyping,
  prepareInsightBench,
  measureInsightSaves,
  insightText,
  insightDocumentStats,
} from "./insight-candidates/harness";
import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import * as Y from "yjs";
import { WhiteboardModel } from "@tau/collaboration";
import { prepareBuiltinWhiteboardTypes } from "@tau/whiteboard/contracts";
import type { WhiteboardDocumentOpen } from "@/types/whiteboard-document";
import {
  availablePort,
  createSandbox,
  close,
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
  const stabilityMs = Number(process.env.INSIGHT_STABILITY_MS ?? 0);
  test.setTimeout(
    process.env.WHITEBOARD_TYPING_INSIGHTS ? Math.max(1800000, stabilityMs + 600000) : 480_000
  );
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
    seedInk(model, schema, process.env.INSIGHT_SCENE === "plain" ? 0 : 240);
    await addMixedScene(model, schema, process.env.INSIGHT_SCENE === "plain" ? 1 : 12);
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
    let finalText = "";
    let performanceFailures: string[] = [];
    if (process.env.WHITEBOARD_TYPING_INSIGHTS) {
      const options = await prepareInsightBench(app, directory);
      if (process.env.INSIGHT_PARITY === "1")
        console.log(
          "INSIGHT_PARITY",
          JSON.stringify(await app.evaluate(async () => globalThis.__tauInsightBench?.parity()))
        );
      const modes = (process.env.INSIGHT_MODES ?? "idle,sync,worker").split(",") as Array<
        "idle" | "sync" | "worker"
      >;
      const cpuRates = (process.env.INSIGHT_CPU_RATES ?? "1,4").split(",").map(Number);
      const rounds = Number(process.env.INSIGHT_ROUNDS ?? 3);
      const count = Number(process.env.INSIGHT_SAMPLES ?? 2000);
      const text = sample.repeat(Math.ceil(count / sample.length)).slice(0, count);
      const reports: unknown[] = [],
        failures: string[] = [],
        saves: number[] = [];
      const pending = new Set<Promise<void>>();
      page.on("console", message => {
        if (!message.text().includes("[whiteboard-sync] 本机耐久保存完成")) return;
        const argument = message.args()[1];
        if (!argument) return;
        const read = argument
          .jsonValue()
          .then((value: { elapsedMs?: number }) => {
            if (typeof value.elapsedMs === "number") saves.push(value.elapsedMs);
          })
          .catch(() => undefined);
        pending.add(read);
        void read.finally(() => pending.delete(read));
      });
      const output = join(__dirname, "../output/knowledge-insights-performance");
      await mkdir(output, { recursive: true });
      const record = async () =>
        writeFile(
          join(output, `typing-${process.env.INSIGHT_REPORT_NAME ?? "report"}.json`),
          JSON.stringify(
            {
              options,
              reports,
              failures,
              testKind: stabilityMs > 0 ? "stability" : "timing",
              inputDelayMs: Number(process.env.INSIGHT_INPUT_DELAY_MS ?? 10),
              scene: process.env.INSIGHT_SCENE ?? "mixed",
              performanceGateApplied: stabilityMs === 0,
            },
            null,
            2
          )
        );
      const started = Date.now();
      try {
        for (const rate of cpuRates)
          for (const mode of modes) {
            for (
              let round = process.env.INSIGHT_WARMUP === "0" ? 0 : -1;
              round < rounds || (stabilityMs > 0 && Date.now() - started < stabilityMs);
              round++
            ) {
              const nativeWindow = await app.browserWindow(page);
              await nativeWindow.evaluate(window => {
                window.webContents.setBackgroundThrottling(false);
                window.show();
                window.restore();
                window.focus();
                window.webContents.focus();
              });
              await expect
                .poll(() =>
                  nativeWindow.evaluate(
                    window => window.isVisible() && !window.isMinimized() && window.isFocused()
                  )
                )
                .toBe(true);
              const nativeBefore = await nativeWindow.evaluate(window => ({
                id: window.id,
                visible: window.isVisible(),
                minimized: window.isMinimized(),
                focused: window.isFocused(),
              }));
              await page.bringToFront();
              await editor.click();
              await expect.poll(() => page.evaluate(() => document.hasFocus())).toBe(true);
              await page.keyboard.up("Control");
              await page.keyboard.up("Meta");
              await editor.press("Control+A");
              await page.keyboard.up("Control");
              await editor.press("Backspace");
              await expect
                .poll(async () => ((await editor.textContent()) ?? "").replaceAll("\uFEFF", ""))
                .toBe("");
              const saveStart = saves.length;
              await app.evaluate(async (_context, mode) => {
                if (!globalThis.__tauInsightBench) throw new Error("洞察压测未初始化");
                await globalThis.__tauInsightBench.start(mode);
              }, mode);
              if (process.env.INSIGHT_MAIN_PROFILE)
                await app.evaluate(async () => globalThis.__tauInsightBench?.startProfile());
              const tag = `${mode}${rate}${round < 0 ? "warm" : round}`;
              const measuredText = (tag + text).slice(0, round < 0 ? Math.min(200, count) : count);
              const input = await measureInsightTyping(page, editor, measuredText, rate);
              if (process.env.INSIGHT_MAIN_PROFILE) {
                const profile = await app.evaluate(async () =>
                  globalThis.__tauInsightBench?.stopProfile()
                );
                await writeFile(
                  join(output, `main-${mode}-${rate}-${round}.cpuprofile`),
                  JSON.stringify(profile)
                );
              }
              const nativeAfter = await nativeWindow.evaluate(window => ({
                visible: window.isVisible(),
                minimized: window.isMinimized(),
                focused: window.isFocused(),
              }));
              await nativeWindow.dispose();
              const savedPressure =
                Number(process.env.INSIGHT_SAVE_BATCHES ?? 0) > 0
                  ? await measureInsightSaves(
                      page,
                      contentId,
                      measuredText,
                      Number(process.env.INSIGHT_SAVE_BATCHES)
                    )
                  : undefined;
              const expectedRound = savedPressure?.text ?? measuredText;
              const during = await app.evaluate(() => globalThis.__tauInsightBench?.snapshot());
              const completed = await app.evaluate(async () =>
                globalThis.__tauInsightBench?.finish()
              );
              await expect
                .poll(
                  async () => {
                    const bytes = await page.evaluate(async id => {
                      const opened = await window.electron.invoke<WhiteboardDocumentOpen>(
                        "whiteboard-document:open",
                        "data.db",
                        id,
                        "typing-round-verify"
                      );
                      try {
                        return Array.from(opened.state);
                      } finally {
                        await window.electron.invoke("whiteboard-document:release", opened.leaseId);
                      }
                    }, contentId);
                    const doc = new Y.Doc({ gc: false });
                    const verified = new WhiteboardModel(doc);
                    try {
                      Y.applyUpdate(doc, Uint8Array.from(bytes));
                      return JSON.stringify(verified.richText("text-0").read()).includes(
                        measuredText
                      );
                    } finally {
                      verified.dispose();
                      doc.destroy();
                    }
                  },
                  { timeout: 30000 }
                )
                .toBe(true);
              await Promise.all([...pending]);
              const documentStats = process.env.INSIGHT_DOCUMENT_STATS
                ? await insightDocumentStats(page, contentId)
                : undefined;
              const saveValues = saves.slice(saveStart);
              const sorted = [...saveValues].sort((a, b) => a - b);
              const save = {
                samples: sorted.length,
                p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0,
                p99Ms: sorted[Math.ceil(sorted.length * 0.99) - 1] ?? 0,
                maxMs: Math.max(0, ...sorted),
              };
              const focus = await page.evaluate(() => ({
                focused: document.hasFocus(),
                visibility: document.visibilityState,
              }));
              const result = {
                mode,
                rate,
                round,
                focus,
                input,
                during,
                completed,
                save,
                durableVerified: true,
                documentStats,
                nativeBefore,
                nativeAfter,
                savedPressure: savedPressure
                  ? {
                      samples: savedPressure.samples,
                      p95Ms: savedPressure.p95Ms,
                      p99Ms: savedPressure.p99Ms,
                      maxMs: savedPressure.maxMs,
                    }
                  : undefined,
              };
              reports.push(result);
              console.log("INSIGHT_TYPING", JSON.stringify(result));
              await record();
              expect(completed?.errors).toEqual([]);
              if (completed?.maxActiveWorkers !== undefined)
                expect(completed.maxActiveWorkers).toBeLessThanOrEqual(1);
              if (completed?.activeWorkers !== undefined) expect(completed.activeWorkers).toBe(0);
              if (options.writes) expect(completed?.writes).toBeGreaterThan(0);
              expect(completed?.checkpoint).toEqual(
                expect.arrayContaining([expect.objectContaining({ busy: 0 })])
              );
              if (mode !== "idle") expect(completed?.cycles).toBeGreaterThan(0);
              if (round >= 0 && mode !== "sync" && stabilityMs === 0) {
                if (
                  input.inputP95Ms > (rate === 1 ? 50 : 100) ||
                  input.inputP99Ms > (rate === 1 ? 100 : 200)
                )
                  failures.push(`${mode}/${rate}/${round}: input latency`);
                if (mode === "worker" && rate === 1) {
                  if (!save.samples || save.p95Ms > 100 || save.p99Ms > 200 || save.maxMs >= 500)
                    failures.push(`${mode}/${rate}/${round}: save confirmation`);
                  if (!during || during.loopP99Ms > 50 || during.loopMaxMs >= 200)
                    failures.push(`${mode}/${rate}/${round}: main event loop`);
                }
              }
              finalText = expectedRound;
              if (stabilityMs > 0 && Date.now() - started >= stabilityMs) break;
            }
          }
        await record();
        performanceFailures = failures;
      } finally {
        await app.evaluate(async () => {
          await globalThis.__tauInsightBench?.dispose();
        });
      }
    } else {
      for (const [index, rate] of rates.entries()) {
        console.log("WHITEBOARD_TYPING", JSON.stringify(await measure(page, rate)));
        expect(await editor.textContent()).toContain(sample.repeat(index + 1));
      }
      finalText = sample.repeat(rates.length);
    }
    await editor.press("Control+End");
    await page.keyboard.up("Control");
    const ime = await page.context().newCDPSession(page);
    await ime.send("Input.imeSetComposition", {
      text: "zhongwen",
      selectionStart: 8,
      selectionEnd: 8,
    });
    await ime.send("Input.insertText", { text: "中文输入" });
    await ime.detach();
    const typed = finalText + "中文输入";
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
      expect(insightText(saved.richText("text-0").read())).toContain(typed);
    } finally {
      saved.doc.destroy();
    }
    if (process.env.WHITEBOARD_TYPING_INSIGHTS) {
      await close(app);
      running = undefined;
      const database = new DatabaseSync(join(directory, "home/.editor/data.db"), {
        readOnly: true,
      });
      const doc = new Y.Doc({ gc: false });
      const verified = new WhiteboardModel(doc);
      try {
        const row = database
          .prepare(
            "SELECT state FROM whiteboard_documents WHERE document_id=(SELECT document_id FROM whiteboard_document_pages WHERE content_id=?)"
          )
          .get(contentId) as { state: Uint8Array } | undefined;
        if (!row) throw new Error("重开主库未找到白板检查点");
        Y.applyUpdate(doc, row.state);
        expect(insightText(verified.richText("text-0").read())).toContain(typed);
      } finally {
        verified.dispose();
        doc.destroy();
        database.close();
      }
      const file = join(
        __dirname,
        `../output/knowledge-insights-performance/typing-${process.env.INSIGHT_REPORT_NAME ?? "report"}.json`
      );
      const report = JSON.parse(await readFile(file, "utf8"));
      report.coldPersistenceVerified = true;
      report.imeVerified = true;
      await writeFile(file, JSON.stringify(report, null, 2));
      expect(performanceFailures).toEqual([]);
    }
  } finally {
    model.doc.destroy();
    await disposeSandbox(directory, running);
  }
});
