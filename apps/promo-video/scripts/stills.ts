/**
 * 一次打包、连出多帧静帧（自检、核对界面用），比逐帧跑 `remotion still` 省掉每次重新打包的时间。
 * 用法（在 apps/promo-video 下，要关掉命令沙箱才能起 Chrome）：
 *   node --experimental-strip-types scripts/stills.ts <CompositionId> <输出目录> <帧号,帧号…> [--scale=0.5] [--props='{"page":"x"}']
 * 输出 <输出目录>/f<帧号>.png。
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { bundle } from "@remotion/bundler";
import { openBrowser, renderStill, selectComposition } from "@remotion/renderer";
import { hasSystemChrome, SYSTEM_CHROME, webpackOverride } from "../remotion.shared.ts";

const [id, outDir, frameList, ...rest] = process.argv.slice(2);
if (!id || !outDir || !frameList) {
  console.error("用法：node --experimental-strip-types scripts/stills.ts <CompositionId> <输出目录> <帧号,帧号…> [--scale=0.5] [--props='{…}']");
  process.exit(1);
}
const scale = Number(rest.find(arg => arg.startsWith("--scale="))?.slice(8) ?? 0.5);
const inputProps = JSON.parse(rest.find(arg => arg.startsWith("--props="))?.slice(8) ?? "{}");
const browserOptions = hasSystemChrome ? { browserExecutable: SYSTEM_CHROME, chromeMode: "chrome-for-testing" as const } : {};

const serveUrl = await bundle({ entryPoint: "src/index.ts", webpackOverride });
const browser = await openBrowser("chrome", browserOptions);
try {
  const composition = await selectComposition({ serveUrl, id, inputProps, puppeteerInstance: browser });
  mkdirSync(outDir, { recursive: true });
  for (const frame of frameList.split(",").map(Number)) {
    const output = join(outDir, `f${frame}.png`);
    await renderStill({ composition, serveUrl, output, frame, scale, inputProps, puppeteerInstance: browser, imageFormat: "png" });
    console.log(`→ ${output}`);
  }
} finally {
  await browser.close({ silent: true });
}
