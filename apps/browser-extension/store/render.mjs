/**
 * 把 store/screenshots/*.html 渲染成商店要求的图片，输出到 store/output/。
 * 尺寸取页面 <meta name="shot-size" content="宽x高">，缺省 1280x800；按 1 倍像素输出（商店要求精确尺寸）。
 *
 *   pnpm --filter browser-extension store:shots
 */
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = path.join(here, "screenshots");
const outputDir = path.join(here, "output");
const DEFAULT_SIZE = "1280x800";

const sizeOf = html => {
  const [width, height] = (
    /<meta name="shot-size" content="(\d+x\d+)"/.exec(html)?.[1] ?? DEFAULT_SIZE
  )
    .split("x")
    .map(Number);
  return { width, height };
};

/** 结构检查（在页面里执行）：浮层不能越出画布，也不能压住标题区 */
function findLayoutProblems() {
  const problems = [];
  const caption = document.querySelector(".caption")?.getBoundingClientRect();
  for (const element of document.querySelectorAll(".float, .panel, .orb, .card")) {
    const rect = element.getBoundingClientRect();
    const name = element.className.split(" ").slice(0, 2).join(".");
    if (rect.left < 0 || rect.top < 0 || rect.right > innerWidth || rect.bottom > innerHeight)
      problems.push(
        `.${name} 越出画布 (${Math.round(rect.left)},${Math.round(rect.top)} ${Math.round(rect.width)}×${Math.round(rect.height)})`
      );
    if (
      caption &&
      rect.top < caption.bottom &&
      rect.bottom > caption.top &&
      rect.right > caption.left &&
      rect.left < caption.right
    )
      problems.push(`.${name} 压住标题区`);
  }
  for (const icon of document.querySelectorAll("svg.icon"))
    if (!icon.innerHTML) problems.push("有图标名不在 icons.js 里");
  return [...new Set(problems)];
}

mkdirSync(outputDir, { recursive: true });
const browser = await chromium.launch();
try {
  for (const file of readdirSync(sourceDir)
    .filter(name => name.endsWith(".html"))
    .sort()) {
    const source = path.join(sourceDir, file);
    const viewport = sizeOf(readFileSync(source, "utf8"));
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(source).href, { waitUntil: "load" });
    // scene.js 在字体就绪后摆放浮层，再等一帧
    await page.evaluate(() => document.fonts.ready.then(() => new Promise(requestAnimationFrame)));
    for (const problem of await page.evaluate(findLayoutProblems))
      console.warn(`  ⚠ ${file}：${problem}`);
    const target = path.join(outputDir, file.replace(/\.html$/, ".png"));
    await page.screenshot({ path: target, clip: { x: 0, y: 0, ...viewport } });
    await page.close();
    console.log(`${file} → ${path.relative(here, target)} (${viewport.width}×${viewport.height})`);
  }
} finally {
  await browser.close();
}
