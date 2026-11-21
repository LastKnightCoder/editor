import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build, preview } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwind from "@tailwindcss/vite";
import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL("../e2e/whiteboard-release/", import.meta.url));
const outDir = await mkdtemp(join(tmpdir(), "tau-release-"));
const config = {
  root,
  configFile: false,
  plugins: [react(), tailwind()],
  logLevel: "error",
  build: { outDir, target: "esnext" },
  resolve: { dedupe: ["react", "react-dom", "react-dnd", "slate", "slate-react", "yjs"] },
};
let browser, server;
try {
  await build(config);
  server = await preview({ ...config, preview: { host: "127.0.0.1", port: 0 } });
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  const errors = [];
  page.on("pageerror", error => {
    errors.push(error.message);
    console.error(error.message);
  });
  await page.setContent("<h1>Release benchmark</h1><p>PDF document card</p>");
  const pdf = await page.pdf();
  await page.route("**/sample.pdf", route =>
    route.fulfill({ contentType: "application/pdf", body: pdf })
  );
  await page.goto(server.resolvedUrls.local[0]);
  const card = page.locator('[data-pdf-card="paper-5"]');
  await card.waitFor({ timeout: 12000 });
  await page.evaluate(() => {
    const { model, binding } = window.releaseFixture;
    let active = false;
    let timings = {};
    function observe(object, name, label) {
      const original = object[name];
      if (typeof original !== "function") return;
      object[name] = function (...args) {
        if (!active) return original.apply(this, args);
        const start = performance.now();
        try {
          return original.apply(this, args);
        } finally {
          timings[label] = (timings[label] ?? 0) + performance.now() - start;
        }
      };
    }
    for (const method of ["submit", "clone", "validateState", "assertBudget", "read"])
      observe(Object.getPrototypeOf(model), method, "model." + method);
    for (const method of ["publishDocument", "onPointerUp", "onGlobalPointerUp"])
      observe(binding.board, method, "board." + method);
    observe(model, "tryLocalTranslation", "model.tryLocalTranslation");
    observe(binding, "endGesture", "endGesture");
    window.armRelease = () => {
      const measured = new Promise(resolve =>
        window.addEventListener(
          "pointerup",
          e => {
            const fromX = model.elements.get("paper-5").get("geometry").x;
            active = true;
            timings = {};
            const start = performance.now();
            requestAnimationFrame(() => {
              active = false;
              const frame = performance.now();
              const stages = Object.fromEntries(
                Object.entries(timings).map(([k, v]) => [k, +v.toFixed(1)])
              );
              requestAnimationFrame(() =>
                resolve({
                  releaseMs: +(frame - e.timeStamp).toFixed(1),
                  dispatchDelayMs: +(start - e.timeStamp).toFixed(1),
                  nextFrameMs: +(performance.now() - frame).toFixed(1),
                  committedDx: model.elements.get("paper-5").get("geometry").x - fromX,
                  stages,
                })
              );
            });
          },
          { once: true, capture: true }
        )
      );
      return () => measured;
    };
  });
  const results = [];
  for (let round = 0; round < 4; round++) {
    const box = await card.boundingBox();
    const x = box.x + box.width * 0.28,
      y = box.y + box.height * 0.32;
    const dx = round % 2 ? -66 : 66;
    await page.mouse.move(x, y);
    await page.mouse.down();
    const sample = await page.evaluateHandle(() => window.armRelease());
    await page.mouse.move(x + dx, y, { steps: 5 });
    await page.mouse.up();
    const result = await sample.evaluate(
      read =>
        new Promise((resolve, reject) => {
          const deadline = setTimeout(() => reject(new Error("未收到松手后的动画帧")), 2500);
          read().then(
            value => {
              clearTimeout(deadline);
              resolve(value);
            },
            error => {
              clearTimeout(deadline);
              reject(error);
            }
          );
        })
    );
    await sample.dispose();
    const stored = await page.evaluate(
      () =>
        window.releaseFixture.model.read().pages[0].children.find(n => n.id === "paper-5").geometry
          .x
    );
    const end = await card.boundingBox();
    assert.ok(
      Math.abs(end.x - box.x - dx) < 12 && Math.abs(end.x - stored) < 1,
      "卡片落点与模型不一致"
    );
    console.log("RELEASE", JSON.stringify({ round, ...result }));
    assert.ok(Math.abs(result.committedDx - dx) < 12, "采样的松手事件必须实际提交位置");
    if (round) results.push(result);
  }
  assert.deepEqual(errors, []);
  const median = results.map(sample => sample.releaseMs).sort((a, b) => a - b)[1];
  console.log("RELEASE_MEDIAN_MS", median);
  assert.ok(
    median <= 25 && results.every(sample => sample.releaseMs <= 50 && sample.nextFrameMs <= 50),
    "PDF 卡松手中位数须在 25 ms 内，单轮与后续帧须在 50 ms 内"
  );
} finally {
  await browser?.close();
  await server?.close();
  await rm(outDir, { recursive: true, force: true });
}
