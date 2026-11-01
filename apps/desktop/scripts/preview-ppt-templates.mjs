import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, watch, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { injectPPTRuntime } from "../src/utils/ppt-runtime-inject.ts";

const desktopDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pptDir = join(desktopDir, "src/assets/ppt");
const runtimeDir = join(pptDir, "runtime");
const outDir = join(desktopDir, ".ppt-preview");

function printHelp() {
  console.log(`用法: pnpm --filter desktop preview:ppt [选项]

把公共运行时注入 src/assets/ppt/ 下的每个模板，输出到 .ppt-preview/，
直接用浏览器打开即可翻页、按 O 全览。

选项:
  --open      生成后用默认浏览器打开索引页
  --watch     模板或运行时变化时重新生成，浏览器刷新即可看到
  -h, --help  显示帮助`);
}

function build() {
  const runtime = {
    css: readFileSync(join(runtimeDir, "deck.css"), "utf8"),
    js: readFileSync(join(runtimeDir, "deck.js"), "utf8"),
  };
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const rows = readdirSync(pptDir)
    .filter(file => /^template-.+\.html$/.test(file))
    .sort()
    .map(file => {
      const html = readFileSync(join(pptDir, file), "utf8");
      writeFileSync(join(outDir, file), injectPPTRuntime(html, runtime));
      const title = html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? file;
      const slides = (html.match(/class="slide[\s"]/g) ?? []).length;
      const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
      return `<li><a href="./${file}">${file.slice(9, -5)}</a><span>${title}</span><span>${slides} 页 · ${kb} KB</span></li>`;
    });

  writeFileSync(
    join(outDir, "index.html"),
    `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>PPT 模板预览</title>
<style>
body { font: 15px/1.6 system-ui, sans-serif; margin: 40px auto; max-width: 860px; padding: 0 24px; color: #222; }
li { display: grid; grid-template-columns: 9rem 1fr 8rem; gap: 16px; padding: 10px 0; border-bottom: 1px solid #eee; }
a { color: #1a5f7a; font-weight: 600; }
span:last-child { color: #888; text-align: right; }
</style>
</head>
<body>
<h1>PPT 模板预览</h1>
<p>方向键 / 空格翻页，O 全览，F 全屏。修改模板后重新生成再刷新。</p>
<ul style="list-style:none;padding:0">
${rows.join("\n")}
</ul>
</body>
</html>
`
  );
  console.log(`✔ 已生成 ${rows.length} 个模板预览: ${join(outDir, "index.html")}`);
}

function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("-h") || args.has("--help")) {
    printHelp();
    return;
  }
  build();
  if (args.has("--open")) {
    const index = join(outDir, "index.html");
    if (process.platform === "win32") execFile("cmd", ["/c", "start", "", index]);
    else execFile(process.platform === "darwin" ? "open" : "xdg-open", [index]);
  }
  if (args.has("--watch")) {
    let timer;
    const rebuild = () => {
      clearTimeout(timer);
      timer = setTimeout(build, 150);
    };
    watch(pptDir, { recursive: true }, (_, file) => {
      if (file && !file.startsWith(".")) rebuild();
    });
    console.log("▶ 监听模板与运行时变化中（Ctrl-C 退出）");
  }
}

main();
