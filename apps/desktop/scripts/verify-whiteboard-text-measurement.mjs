import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build, preview } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwind from "@tailwindcss/vite";
import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL("../e2e/whiteboard-text-measurement/", import.meta.url));
const outDir = await mkdtemp(join(tmpdir(), "tau-text-measurement-"));
const config = {
  root,
  configFile: false,
  plugins: [react(), tailwind()],
  logLevel: "error",
  build: { outDir, target: "esnext" },
  resolve: { dedupe: ["react", "react-dom", "react-dnd", "slate", "slate-react", "yjs"] },
};
let server;
let browser;
try {
  await build(config);
  server = await preview({ ...config, preview: { host: "127.0.0.1", port: 0, open: false } });
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.measurementApi?.children.length === 4);
  await page.evaluate(() => document.fonts.ready);

  const read = () =>
    page.evaluate(() =>
      Object.fromEntries(
        window.measurementApi.children.map(({ id, x, y, width, height }) => [
          id,
          { x, y, width, height },
        ])
      )
    );
  // 事故回归：文档只存初始小宽度，重新进入后必须直接恢复内容尺寸，不能靠选中后逐像素增长。
  const settled = async () => {
    await page.evaluate(
      () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    );
    const first = await read();
    assert.ok(first.mind.width > 100, "脑图首次挂载未按内容恢复宽度");
    assert.ok(first.text.width > 100, "普通文本在非编辑状态未恢复宽度");
    await page.evaluate(async () => {
      for (let frame = 0; frame < 12; frame++) await new Promise(requestAnimationFrame);
    });
    assert.deepEqual(await read(), first, "无内容变化时尺寸仍在漂移");
    return first;
  };
  const initial = await settled();
  const stored = await page.evaluate(() =>
    Object.fromEntries(
      window.measurement.model.read().pages[0].children.map(node => [node.id, node.geometry])
    )
  );
  assert.equal(initial.fixed.width, stored.fixed.width, "手动设置的宽度被自动测量覆盖");
  assert.equal(initial.fixed.height, stored.fixed.height, "手动设置的高度被自动测量覆盖");
  assert.equal(initial.auto.width, stored.auto.width, "自适应高度改变了固定宽度");
  assert.ok(initial.auto.height > stored.auto.height, "自适应高度未恢复内容高度");
  assert.equal(
    await page.evaluate(() => window.measurement.model.read().pages[0].children[0].geometry.width),
    stored.mind.width
  );
  const state = await page.evaluate(() => window.measurement.state());
  for (let round = 0; round < 3; round++) {
    await page.evaluate(() => window.measurement.toggle());
    await page.waitForFunction(() => !document.querySelector("[data-whiteboard-root]"));
    await page.evaluate(() => window.measurement.toggle());
    await page.waitForFunction(() => document.querySelectorAll("[data-slate-editor]").length === 4);
    assert.deepEqual(await settled(), initial, "退出到列表再进入后尺寸改变");
  }
  await page.evaluate(() => window.measurement.hide(true));
  await page.waitForFunction(
    () => !document.querySelector("[data-whiteboard-root]")?.getClientRects().length
  );
  await page.evaluate(() => window.measurement.hide(false));
  await page.waitForFunction(
    () => document.querySelector("[data-whiteboard-root]")?.getClientRects().length
  );
  assert.deepEqual(await settled(), initial, "Activity 隐藏恢复改变尺寸");
  assert.deepEqual(
    await page.evaluate(() => window.measurement.state()),
    state,
    "自动测量改写了文档"
  );

  await page.evaluate(() => {
    window.measurement.replaceText(
      "mind",
      "长文本需要在达到最大宽度后正确换行，同时直接测量出高度，不应逐像素增长。".repeat(3)
    );
  });
  await page.waitForFunction(
    height => window.measurementApi.getElement("mind").height > height,
    initial.mind.height
  );
  const expanded = await settled();
  assert.ok(expanded.mind.width > initial.mind.width, "文字增长未扩大脑图节点");
  await page.evaluate(() => {
    window.measurement.replaceText("mind", "短");
    window.measurement.replaceText("text", "短");
  });
  await page.waitForFunction(({ mind, text }) => {
    const api = window.measurementApi;
    return api.getElement("mind").width < mind.width && api.getElement("text").width < text.width;
  }, initial);
  const short = await read();
  await page.evaluate(() => {
    const api = window.measurementApi;
    api.apply(
      {
        type: "set_viewport",
        properties: api.viewPort,
        newProperties: {
          ...api.viewPort,
          zoom: 0.8,
          width: api.viewPort.width / 0.8,
          height: api.viewPort.height / 0.8,
        },
      },
      false
    );
  });
  await page.evaluate(async () => {
    for (let frame = 0; frame < 12; frame++) await new Promise(requestAnimationFrame);
  });
  assert.deepEqual(await read(), short, "屏幕缩放污染了画布中的文字尺寸");
  assert.deepEqual(errors, []);
  console.log("白板文字重新进入、Activity 恢复与稳定尺寸回归通过", initial);
} finally {
  await browser?.close();
  await server?.close();
  await rm(outDir, { recursive: true, force: true });
}
