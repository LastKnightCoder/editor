import { startFrameSample } from "./whiteboard-frame-sample.mjs";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build, preview } from "vite";
import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL("../../../examples/whiteboard/", import.meta.url));
const outDir = await mkdtemp(join(tmpdir(), "tau-board-bench-"));
const config = {
  root,
  configLoader: "runner",
  logLevel: "error",
  build: {
    outDir,
    rolldownOptions: { input: join(root, "bench/index.html") },
  },
};
const cases = [
  ["pan", 100],
  ["pan", 5000],
  ["pan-rich", 1000],
  ["pan-rich", 1000, 4],
  ["wheel", 5000],
  ["zoom", 1000],
  ["drag", 1000],
];

function readViewport(svg) {
  const root = svg.closest("[data-whiteboard-root]").getBoundingClientRect();
  const inverse = svg.getScreenCTM().inverse();
  const start = new DOMPoint(root.x, root.y).matrixTransform(inverse);
  return [start.x, start.y, root.width * inverse.a];
}

async function verifyWheelTracking(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  try {
    await page.goto(url + "?size=100");
    const canvas = page.locator("svg[data-whiteboard-canvas]");
    await canvas.waitFor();
    await page.mouse.move(450, 350);
    const [x, y] = await canvas.evaluate(readViewport);
    for (let step = 1; step <= 5; step++) {
      await page.mouse.wheel(3, 4);
      await page.evaluate(
        () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      );
      const [left, top] = await canvas.evaluate(readViewport);
      assert.ok(
        Math.abs(left - x - 3 * step) < 0.01 && Math.abs(top - y - 4 * step) < 0.01,
        `第 ${step} 次滚动未到达预期的屏幕位置`
      );
    }
  } finally {
    await page.close();
  }
}

async function measure(browser, url, action, size, cpuRate = 1) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto(url + "?size=" + size + (action === "pan-rich" ? "&rich" : ""));
    const canvas = page.locator("svg[data-whiteboard-canvas]");
    await canvas.waitFor();
    await page.evaluate(() => document.fonts.ready);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    if (cpuRate > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpuRate });
    const taskTime = async () =>
      (await cdp.send("Performance.getMetrics")).metrics.find(
        metric => metric.name === "TaskDuration"
      ).value * 1000;
    const origin = await canvas.evaluate(readViewport);
    const node = await page.evaluate(() => window.readBenchElement());
    const x = action === "drag" ? node.x - origin[0] + 30 : 480;
    const y = action === "drag" ? node.y - origin[1] + 30 : 380;
    await page.mouse.move(x, y);
    await page.evaluate(
      () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    );
    const sample = await canvas.evaluateHandle(startFrameSample);
    const start = await taskTime();
    if (action === "wheel" || action === "zoom") {
      if (action === "zoom") await page.keyboard.down("Control");
      for (let i = 0; i < 48; i++)
        await page.mouse.wheel(action === "wheel" ? 6 : 0, action === "zoom" ? -2 : 1);
      if (action === "zoom") await page.keyboard.up("Control");
    } else {
      const button = action === "drag" ? "left" : "right";
      await page.mouse.down({ button });
      await page.mouse.move(x + 240, y + 48, { steps: 48 });
      await page.mouse.up({ button });
    }
    await page.evaluate(
      () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    );
    const taskMs = (await taskTime()) - start;
    const metrics = await sample.evaluate(stop => stop());
    await sample.dispose();
    const final = await canvas.evaluate(readViewport);
    const viewport = await page.evaluate(() => window.readBenchViewport());
    for (const [i, value] of [viewport.minX, viewport.minY, viewport.width].entries()) {
      assert.ok(Math.abs(final[i] - value) < 0.05, JSON.stringify({ final, viewport }));
    }
    const moved = await page.evaluate(() => window.readBenchElement());
    if (action === "drag") assert.ok(moved.x > node.x + 150, JSON.stringify({ moved, node }));
    else if (action === "zoom") assert.ok(final[2] < origin[2]);
    else if (action === "wheel") assert.ok(final[0] > origin[0] + 200);
    else assert.ok(final[0] < origin[0] - 190);
    assert.deepEqual(errors, []);
    assert.ok(metrics.frames >= 10);
    return {
      action,
      size,
      cpuRate,
      taskMs: Math.round(taskMs),
      ...metrics,
      panDistance: action.startsWith("pan") ? origin[0] - final[0] : undefined,
    };
  } finally {
    await page.close();
  }
}

let server;
let browser;
try {
  await build(config);
  server = await preview({ ...config, preview: { host: "127.0.0.1", port: 0, open: false } });
  const url = server.resolvedUrls.local[0] + "bench/index.html";
  browser = await chromium.launch();
  console.log("Chromium", browser.version());
  if (process.argv.includes("--quick")) {
    const result = await measure(browser, url, "pan-rich", 1000, 4);
    console.log(JSON.stringify(result));
    assert.ok(
      result.displayed >= 40 &&
        result.p95MotionMs <= 25 &&
        result.firstMotionMs <= 65 &&
        result.longFrames <= 1 &&
        Math.abs(result.panDistance - 240) < 0.1,
      "快速平移未达跟手门限"
    );
  } else {
    await verifyWheelTracking(browser, url);
    for (let round = 0; round <= 3; round++) {
      for (const [action, size, cpuRate] of cases) {
        if (process.argv.includes("--cpu-stress-only") && !cpuRate) continue;
        console.log(
          JSON.stringify({ round, ...(await measure(browser, url, action, size, cpuRate)) })
        );
      }
    }
  }
} finally {
  await browser?.close();
  await server?.close();
  await rm(outDir, { recursive: true, force: true });
}
