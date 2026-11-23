import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build, preview } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwind from "@tailwindcss/vite";
import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL("../e2e/whiteboard-ink/", import.meta.url));
const outDir = await mkdtemp(join(tmpdir(), "tau-ink-"));
const config = {
  root,
  configFile: false,
  plugins: [react(), tailwind()],
  logLevel: "error",
  build: { outDir, target: "esnext" },
  resolve: { dedupe: ["react", "react-dom", "react-dnd", "slate", "slate-react", "yjs"] },
};
async function measure(browser, url, size) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  const errors = [];
  page.on("pageerror", error => {
    errors.push(error.message);
    console.error(error.message);
  });
  try {
    await page.goto(url + "?size=" + size);
    await page.waitForFunction(() => window.inkBench?.binding.board?.extensions);
    await page.evaluate(() => window.inkBench.binding.board.setActiveTool("tau.handwrite.create"));
    await page.evaluate(() => document.fonts.ready);
    const session = await page.context().newCDPSession(page);
    const pen = (type, x, y) =>
      session.send("Input.dispatchMouseEvent", {
        type,
        pointerType: "pen",
        x,
        y,
        button: type === "mouseMoved" ? "none" : "left",
        buttons: type === "mouseReleased" ? 0 : 1,
        force: 0.5,
        clickCount: 1,
      });
    const draw = async (stroke, steps) => {
      const y = 290 + stroke * 12;
      await pen("mousePressed", 280, y);
      for (let i = 1; i <= steps; i++)
        await pen("mouseMoved", 280 + 4 * i, y + 16 * Math.sin(i / 4));
      await pen("mouseReleased", 280 + 4 * steps, y + 16 * Math.sin(steps / 4));
    };
    await draw(0, 12);
    const sample = await page.evaluateHandle(async () => {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const { binding, model } = window.inkBench;
      const append = [],
        submit = [],
        frames = [];
      function time(object, method, times) {
        const original = object[method];
        object[method] = function (...args) {
          const start = performance.now();
          try {
            return original.apply(this, args);
          } finally {
            times.push(performance.now() - start);
          }
        };
      }
      time(binding, "appendStroke", append);
      time(model, "submit", submit);
      let last, handle;
      function frame(now) {
        if (last !== undefined) frames.push(now - last);
        last = now;
        handle = requestAnimationFrame(frame);
      }
      handle = requestAnimationFrame(frame);
      return async () => {
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        cancelAnimationFrame(handle);
        return {
          frames,
          append,
          submit,
          points: binding.board.children.slice(-5).map(node => node.points.length),
        };
      };
    });
    for (const [index, steps] of [12, 12, 72, 12, 12].entries()) await draw(index + 1, steps);
    const { frames, append, submit, points } = await sample.evaluate(stop => stop());
    assert.deepEqual(errors, []);
    assert.deepEqual(points, [13, 13, 73, 13, 13]);
    assert.equal(append.length, 6);
    assert.ok(frames.length > 20);
    const total = values => Math.round(values.reduce((a, b) => a + b, 0));
    const sorted = frames.toSorted((a, b) => a - b);
    return {
      size,
      frames: frames.length,
      p95Ms: +sorted[Math.ceil(frames.length * 0.95) - 1].toFixed(1),
      maxMs: +sorted.at(-1).toFixed(1),
      slow: frames.filter(ms => ms >= 49.9).length,
      appendMs: total(append),
      submitMs: total(submit),
    };
  } finally {
    await page.close();
  }
}

let browser, server;
try {
  await build(config);
  server = await preview({ ...config, preview: { host: "127.0.0.1", port: 0 } });
  browser = await chromium.launch();
  console.log("Chromium", browser.version());
  for (let round = 1; round <= 3; round++) {
    for (const size of process.argv.includes("--large") ? [800] : [0, 240])
      console.log(
        JSON.stringify({ round, ...(await measure(browser, server.resolvedUrls.local[0], size)) })
      );
  }
} finally {
  await browser?.close();
  await server?.close();
  await rm(outDir, { recursive: true, force: true });
}
