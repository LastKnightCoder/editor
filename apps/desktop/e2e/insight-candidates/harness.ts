import * as Y from "yjs";
import { WhiteboardModel } from "@tau/collaboration";
import type { WhiteboardDocumentOpen } from "../../src/types/whiteboard-document";
import type { ElectronApplication, Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { build } from "vite";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import type { createInsightBench, InsightBenchOptions } from "./runtime";

type Bench = ReturnType<typeof createInsightBench>;
declare global {
  var __tauInsightBench: Bench | undefined;
}

export async function prepareInsightBench(app: ElectronApplication, directory: string) {
  const desktop = resolve(__dirname, "../..");
  const out = join(desktop, "output/knowledge-insights-performance/runtime");
  await build({
    configFile: false,
    root: desktop,
    logLevel: "error",
    build: {
      ssr: join(desktop, "e2e/insight-candidates/runtime.ts"),
      outDir: out,
      target: "node24",
      minify: false,
      rolldownOptions: { output: { format: "cjs", entryFileNames: "runtime.cjs" } },
    },
  });
  const options: InsightBenchOptions = {
    file: join(directory, "candidate-index.db"),
    workerPath: join(
      process.env.TAU_CONTENT_PRODUCTION_APP_OVERRIDE ?? desktop,
      "dist-electron/main/topic-insights-candidate-worker.js"
    ),
    sqliteModulePath: createRequire(join(desktop, "package.json")).resolve("better-sqlite3"),
    extensionPath: createRequire(join(desktop, "package.json"))("sqlite-vec").getLoadablePath(),
    notes: Number(process.env.INSIGHT_NOTE_VECTORS ?? 10000),
    prompts: Number(process.env.INSIGHT_PROMPTS ?? 2000),
    dimensions: 1024,
    writes: process.env.INSIGHT_INDEX_WRITES === "1",
    faultEvery: Number(process.env.INSIGHT_FAULT_EVERY ?? 0),
  };
  await app.evaluate(
    (_context, { runtime, options }) => {
      const entry = process.getBuiltinModule("module").createRequire(runtime)(runtime) as {
        createInsightBench: typeof createInsightBench;
      };
      globalThis.__tauInsightBench = entry.createInsightBench(options);
    },
    { runtime: join(out, "runtime.cjs"), options }
  );
  return options;
}

const percentile = (values: number[], p: number) =>
  values.toSorted((a, b) => a - b)[Math.ceil(values.length * p) - 1] ?? 0;

export async function measureInsightTyping(
  page: Page,
  editor: Locator,
  text: string,
  rate: number
) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate });
  if (process.env.INSIGHT_RENDERER_PROFILE) {
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 10000 });
    await cdp.send("Profiler.start");
  }
  const capture = await editor.evaluateHandle(element => {
    const pending: Array<{ at: number; length: number }> = [];
    const longtasks: number[] = [];
    const tasks = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) longtasks.push(entry.duration);
    });
    tasks.observe({ type: "longtask" });
    const frames: number[] = [],
      latencies: number[] = [],
      eventLag: number[] = [];
    let expectedLength = (element.textContent ?? "").replaceAll("\uFEFF", "").length;
    let received = 0,
      last: number | undefined,
      frameId: number;
    function frame(now: number) {
      if (last !== undefined) frames.push(now - last);
      last = now;
      frameId = requestAnimationFrame(frame);
    }
    const input = (event: Event) => {
      if (
        !(event instanceof InputEvent) ||
        event.inputType !== "insertText" ||
        !event.data ||
        event.isComposing
      )
        return;
      expectedLength += event.data.length;
      received += event.data.length;
      eventLag.push(Math.max(0, performance.now() - event.timeStamp));
      pending.push({ at: performance.now(), length: expectedLength });
    };
    element.addEventListener("beforeinput", input, true);
    const observer = new MutationObserver(() => {
      const length = (element.textContent ?? "").replaceAll("\uFEFF", "").length;
      while (pending[0] && pending[0].length <= length) {
        const value = pending.shift();
        if (value) requestAnimationFrame(() => latencies.push(performance.now() - value.at));
      }
    });
    observer.observe(element, { subtree: true, childList: true, characterData: true });
    frameId = requestAnimationFrame(frame);
    return () => {
      tasks.disconnect();
      observer.disconnect();
      element.removeEventListener("beforeinput", input, true);
      cancelAnimationFrame(frameId);
      return { frames, latencies, eventLag, longtasks, received, pending: pending.length };
    };
  });
  try {
    const sentAt = performance.now();
    await page.keyboard.type(text, { delay: Number(process.env.INSIGHT_INPUT_DELAY_MS ?? 10) });
    const sendMs = performance.now() - sentAt;
    await expect(editor).toContainText(text);
    await page.evaluate(
      () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    );
    const data = await capture.evaluate(stop => stop());
    expect(data.received).toBe(text.length);
    expect(data.pending).toBe(0);
    expect(data.latencies).toHaveLength(text.length);
    return {
      longTaskCount: data.longtasks.length,
      maxLongTaskMs: Math.max(0, ...data.longtasks),
      samples: data.latencies.length,
      sendMs,
      inputP95Ms: percentile(data.latencies, 0.95),
      inputP99Ms: percentile(data.latencies, 0.99),
      eventLagP99Ms: percentile(data.eventLag, 0.99),
      longestFrameMs: Math.max(0, ...data.frames),
      slowFrames: data.frames.filter(ms => ms >= 50).length,
    };
  } catch (error) {
    const data = await capture.evaluate(stop => stop());
    const focus = await editor.evaluate(element => ({
      editorFocused: element === document.activeElement || element.contains(document.activeElement),
      actualLength: (element.textContent ?? "").length,
    }));
    console.log(
      "INSIGHT_INPUT_FAILURE",
      JSON.stringify({
        expected: text.length,
        received: data.received,
        pending: data.pending,
        longTasks: data.longtasks.length,
        maxLongTaskMs: Math.max(0, ...data.longtasks),
        ...focus,
      })
    );
    throw error;
  } finally {
    await capture.evaluate(stop => stop()).catch(() => undefined);
    if (process.env.INSIGHT_RENDERER_PROFILE) {
      const { profile } = await cdp.send("Profiler.stop");
      await writeFile(
        resolve(
          __dirname,
          `../../output/knowledge-insights-performance/renderer-${Date.now()}.cpuprofile`
        ),
        JSON.stringify(profile)
      );
    }
    await capture.dispose();
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await cdp.detach();
  }
}

export function insightText(value: unknown): string {
  if (Array.isArray(value)) return value.map(insightText).join("");
  if (!value || typeof value !== "object") return "";
  if ("children" in value) return insightText(value.children);
  return "text" in value && typeof value.text === "string" ? value.text : "";
}

export async function readInsightWhiteboard(page: Page, id: number): Promise<string> {
  const bytes = await page.evaluate(async id => {
    const opened = await window.electron.invoke<WhiteboardDocumentOpen>(
      "whiteboard-document:open",
      "data.db",
      id,
      "typing-read-verify"
    );
    try {
      return Array.from(opened.state);
    } finally {
      await window.electron.invoke("whiteboard-document:release", opened.leaseId);
    }
  }, id);
  const doc = new Y.Doc({ gc: false });
  Y.applyUpdate(doc, Uint8Array.from(bytes));
  const model = new WhiteboardModel(doc);
  try {
    return insightText(model.richText("text-0").read());
  } finally {
    model.dispose();
    doc.destroy();
  }
}

export async function measureInsightSaves(page: Page, id: number, expected: string, count: number) {
  await expect.poll(() => readInsightWhiteboard(page, id), { timeout: 30000 }).toBe(expected);
  const opened = await page.evaluate(async id => {
    const value = await window.electron.invoke<WhiteboardDocumentOpen>(
      "whiteboard-document:open",
      "data.db",
      id,
      "typing-save-pressure"
    );
    return { leaseId: value.leaseId, state: Array.from(value.state) };
  }, id);
  const doc = new Y.Doc({ gc: false });
  Y.applyUpdate(doc, Uint8Array.from(opened.state));
  const model = new WhiteboardModel(doc);
  const samples: number[] = [];
  try {
    const tree = model.richText("text-0");
    const nodeId = tree.read()[0].collabId;
    if (typeof nodeId !== "string") throw new Error("保存压测缺少段落身份");
    let at = tree.content(nodeId).length;
    for (let index = 0; index < count; index++) {
      const vector = Y.encodeStateVector(doc);
      tree.insertText(nodeId, at++, "x", null);
      const update = Array.from(Y.encodeStateAsUpdate(doc, vector));
      const start = performance.now();
      await page.evaluate(
        ({ leaseId, update, batchId }) =>
          window.electron.invoke(
            "whiteboard-document:append",
            leaseId,
            batchId,
            Uint8Array.from(update)
          ),
        { leaseId: opened.leaseId, update, batchId: crypto.randomUUID() }
      );
      samples.push(performance.now() - start);
    }
    const text = expected + "x".repeat(count);
    await expect.poll(() => readInsightWhiteboard(page, id), { timeout: 30000 }).toBe(text);
    return {
      text,
      samples: samples.length,
      p95Ms: percentile(samples, 0.95),
      p99Ms: percentile(samples, 0.99),
      maxMs: Math.max(0, ...samples),
    };
  } finally {
    model.dispose();
    doc.destroy();
    await page.evaluate(
      lease => window.electron.invoke("whiteboard-document:release", lease),
      opened.leaseId
    );
  }
}

export async function insightDocumentStats(page: Page, id: number) {
  const bytes = await page.evaluate(async id => {
    const opened = await window.electron.invoke<WhiteboardDocumentOpen>(
      "whiteboard-document:open",
      "data.db",
      id,
      "typing-state-stats"
    );
    try {
      return Array.from(opened.state);
    } finally {
      await window.electron.invoke("whiteboard-document:release", opened.leaseId);
    }
  }, id);
  const doc = new Y.Doc({ gc: false });
  Y.applyUpdate(doc, Uint8Array.from(bytes));
  const model = new WhiteboardModel(doc);
  try {
    const tree = model.richText("text-0");
    const nodeId = tree.read()[0].collabId;
    if (typeof nodeId !== "string") throw new Error("缺少段落身份");
    let items = 0,
      deleted = 0;
    for (let item = tree.content(nodeId)._start; item; item = item.right) {
      items++;
      if (item.deleted) deleted++;
    }
    return {
      stateBytes: bytes.length,
      structs: [...doc.store.clients.values()].reduce((sum, list) => sum + list.length, 0),
      items,
      deleted,
      segments: tree.segments.list(nodeId).length,
      textLength: tree.content(nodeId).length,
    };
  } finally {
    model.dispose();
    doc.destroy();
  }
}
