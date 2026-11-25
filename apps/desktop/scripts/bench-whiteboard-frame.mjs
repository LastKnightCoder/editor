import { stressFrame } from "./whiteboard-frame-stress.mjs";
import { build, preview } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwind from "@tailwindcss/vite";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

// 通过 CLI 运行浏览器，便于复用现有 Playwright 会话与工具安装。
async function sample(page, url, cases, rounds, verify = false) {
  await page.setViewportSize({ width: 1000, height: 700 });
  const results = (page.frameResults = []);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error" && !message.text().includes("404")) errors.push(message.text());
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  try {
    for (const [action, size, mode, rate] of cases) {
      for (let round = 0; round < rounds; round++) {
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
        await page.goto(`${url}?size=${size}&mode=${mode}`);
        await page
          .waitForFunction(() => window.frameBench?.ready)
          .catch(error => {
            throw new Error(
              JSON.stringify({ action, size, mode, round, errors, reason: error.message })
            );
          });
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(
          () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
        );
        const before = await page.evaluate(() => window.frameBench.api.children);
        const baseline = verify
          ? await page.evaluate(() => JSON.stringify(window.frameBench.model.read()))
          : null;
        const beforeViewport = await page.evaluate(() => window.frameBench.api.viewPort);
        if (action === "resize" || action === "dissolve" || action === "fit")
          await page.evaluate(() => window.frameBench.api.select(["frame"]));
        if (action === "create")
          await page.evaluate(mode => {
            const { api } = window.frameBench;
            if (mode === "column" || mode === "mind") {
              api.apply({ type: "remove_node", path: [0], node: api.children[0] });
              api.updateElement("outside", { x: 200 });
            }
            api.setActiveTool("tau.frame.create");
          }, mode);
        await cdp.send("Emulation.setCPUThrottlingRate", { rate });
        await page.evaluate(() => {
          const fixture = window.frameBench;
          const stages = {};
          for (const [object, names, prefix] of [
            [
              fixture.binding.board,
              ["apply", "moveElement", "getBounds", "publishDocument"],
              "board",
            ],
            [fixture.model, ["submit", "validateState", "assertBudget", "read"], "model"],
            [fixture.binding, ["endGesture"], "binding"],
          ])
            for (const name of names) {
              const original = object[name];
              if (typeof original !== "function") continue;
              object[name] = function (...args) {
                const start = performance.now();
                try {
                  return original.apply(this, args);
                } finally {
                  const key = prefix + "." + name;
                  stages[key] = (stages[key] ?? 0) + performance.now() - start;
                }
              };
            }
          const frames = [];
          let previous, handle;
          function tick(t) {
            if (previous !== undefined) frames.push(t - previous);
            previous = t;
            handle = requestAnimationFrame(tick);
          }
          handle = requestAnimationFrame(tick);
          let releaseMs;
          window.addEventListener(
            "pointerup",
            event => {
              requestAnimationFrame(() => {
                releaseMs = performance.now() - event.timeStamp;
              });
            },
            { once: true, capture: true }
          );
          fixture.stop = () => {
            cancelAnimationFrame(handle);
            frames.sort((a, b) => a - b);
            return {
              frames: frames.length,
              p95: frames[Math.ceil(frames.length * 0.95) - 1],
              max: Math.max(0, ...frames),
              longFrames: frames.filter(t => t >= 50).length,
              releaseMs,
              stages,
            };
          };
        });
        const metrics = async () =>
          (await cdp.send("Performance.getMetrics")).metrics.find(
            row => row.name === "TaskDuration"
          ).value * 1000;
        const startTask = await metrics();
        if (action === "fit" || action === "dissolve") {
          await page.mouse.click(110, 350, { button: "right" });
          await page
            .getByRole("menu")
            .getByText(action === "fit" ? "自适应内容" : "解散画框", { exact: true })
            .click();
        } else if (action === "zoom") {
          await page.mouse.move(450, 350);
          await page.keyboard.down("Control");
          for (let i = 0; i < 30; i++) await page.mouse.wheel(0, -2);
          await page.keyboard.up("Control");
        } else {
          const [x, y, dx, dy] =
            action === "drag"
              ? [110, 350, 220, 40]
              : action === "entry"
                ? [700, 270, -300, 0]
                : action === "resize"
                  ? [100, 120, -60, -40]
                  : action === "create"
                    ? [100, 120, 700, 450]
                    : action === "pan"
                      ? [800, 600, 180, 40]
                      : action === "exit"
                        ? [145, 185, -130, 0]
                        : [145, 185, 200, 30];
          await page.keyboard.down("Alt");
          await page.mouse.move(x, y);
          const button = action === "pan" ? "right" : "left";
          await page.mouse.down({ button });
          await page.mouse.move(x + dx, y + dy, { steps: 48 });
          await page.mouse.up({ button });
          await page.keyboard.up("Alt");
        }
        await page.evaluate(
          () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
        );
        const taskMs = (await metrics()) - startTask;
        const measurement = await page.evaluate(() => window.frameBench.stop());
        const after = await page.evaluate(() => window.frameBench.api.children);
        const afterViewport = await page.evaluate(() => window.frameBench.api.viewPort);
        const frame = after.find(node => node.id === "frame");
        const flat = nodes => nodes.flatMap(node => [node, ...flat(node.children ?? [])]);
        const moved = flat(after).find(
          node => node.id === (action === "entry" ? "outside" : "node-0")
        );
        const from = flat(before).find(node => node.id === "node-0");
        const outcome = {
          beforeViewport,
          afterViewport,
          rootCount: after.length,
          frameChildren: frame?.children?.length,
          frameX: frame?.x,
          frameWidth: frame?.width,
          childDx: from && moved ? moved.x - from.x : undefined,
          outsideDx:
            action === "entry" && moved
              ? moved.x - flat(before).find(node => node.id === "outside").x
              : undefined,
          outsideInFrame: (frame ?? after.find(node => node.type === "frame"))?.children?.some(
            node => node.id === "outside"
          ),
          createdFrameChildren:
            action === "create"
              ? after.find(node => node.type === "frame")?.children?.length
              : undefined,
          committedFrameX: await page.evaluate(
            () => window.frameBench.model.elements.get("frame")?.get("geometry")?.x
          ),
        };
        let failure;
        if (action === "dissolve" && frame) failure = "画框未实际解散";
        if (action === "pan" && Math.abs(afterViewport.minX - beforeViewport.minX) < 100)
          failure = "画布没有实际平移";
        if (action === "zoom" && Math.abs(afterViewport.zoom - beforeViewport.zoom) < 0.01)
          failure = "画布没有实际缩放";
        if (action === "drag" && Math.abs(frame.x - 320) > 1) failure = "画框没有实际移动";
        if ((action === "child" || action === "exit") && Math.abs(outcome.childDx) < 100)
          failure = "子元素没有实际移动";
        if (action === "entry" && Math.abs(outcome.outsideDx) < 150)
          failure = "待拖入元素未实际移动";
        if (action === "resize" && frame.width <= before[0].width) failure = "画框没有实际缩放";
        if (action === "create" && !after.some(node => node.type === "frame"))
          failure = "画框没有创建";
        if (verify && action === "drag" && !failure) {
          const committed = await page.evaluate(() =>
            JSON.stringify(window.frameBench.model.read())
          );
          await page.evaluate(() => window.frameBench.binding.undo());
          outcome.undoRestored =
            (await page.evaluate(() => JSON.stringify(window.frameBench.model.read()))) ===
            baseline;
          await page.evaluate(() => window.frameBench.binding.redo());
          outcome.redoRestored =
            (await page.evaluate(() => JSON.stringify(window.frameBench.model.read()))) ===
            committed;
          if (!outcome.undoRestored || !outcome.redoRestored)
            failure = "整次拖动的撤销或重做不完整";
        }
        const row = {
          action,
          size,
          mode,
          rate,
          round,
          taskMs,
          ...measurement,
          outcome,
          failure,
          errors: errors.splice(0),
        };
        results.push(row);
        console.log(JSON.stringify(row));
      }
    }
  } finally {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await cdp.detach();
  }
  return results;
}

const root = fileURLToPath(new URL("../e2e/whiteboard-frame/", import.meta.url));
const outDir = await mkdtemp(join(tmpdir(), "tau-frame-bench-"));
const cli = process.env.PLAYWRIGHT_CLI ?? "npx";
function run(args) {
  return new Promise((resolve, reject) => {
    const prefix = process.env.PLAYWRIGHT_CLI
      ? []
      : ["--yes", "--package", "@playwright/cli", "playwright-cli"];
    const child = spawn(cli, [...prefix, "-s=frame-bench", ...args], {
      stdio: ["ignore", "pipe", "inherit"],
    });
    let output = "";
    child.stdout.on("data", chunk => {
      output += chunk;
      process.stdout.write(chunk);
    });
    child.on("error", reject);
    child.on("exit", code =>
      code ? reject(new Error(`Playwright CLI: ${code}`)) : resolve(output)
    );
  });
}
let server;
try {
  const config = {
    root,
    configFile: false,
    plugins: [react(), tailwind()],
    logLevel: "error",
    build: { outDir, target: "esnext" },
    resolve: { dedupe: ["react", "react-dom", "react-dnd", "slate", "slate-react", "yjs"] },
  };
  await build(config);
  server = await preview({ ...config, preview: { host: "127.0.0.1", port: 0 } });
  await run(["open", "about:blank"]);
  if (process.argv.includes("--stress")) {
    const target = process.argv.find(arg => arg.startsWith("--output="))?.slice(9);
    if (target) await writeFile(target, JSON.stringify({ status: "running" }) + "\n");
    try {
      const output = await run([
        "run-code",
        `async page => (${stressFrame.toString()})(page, ${JSON.stringify(server.resolvedUrls.local[0])}, 20)`,
      ]);
      const match = output.match(/### Result\n([^\n]+)/);
      if (!match) throw new Error("压力场景未返回结果");
      if (target) await writeFile(target, JSON.stringify(JSON.parse(match[1]), null, 2) + "\n");
    } catch (error) {
      if (target)
        await writeFile(target, JSON.stringify({ status: "failed", error: error.message }) + "\n");
      throw error;
    }
  } else {
    const only = process.argv.find(arg => arg.startsWith("--only="))?.slice(7) ?? null;
    const target = process.argv.find(arg => arg.startsWith("--output="))?.slice(9);
    const cases = process.argv.includes("--quick")
      ? [["drag", 100, "frame", 1]]
      : [
          ["drag", 100, "frame", 1],
          ["drag", 255, "frame", 1],
          ["drag", 256, "frame", 1],
          ["drag", 500, "frame", 1],
          ["drag", 1000, "frame", 1],
          ["drag", 1000, "frame", 4],
          ["child", 1000, "frame", 1],
          ["child", 1000, "loose", 1],
          ["child", 1000, "many", 1],
          ["pan", 1000, "frame", 1],
          ["zoom", 1000, "frame", 1],
          ["resize", 1000, "frame", 1],
          ["create", 1000, "create", 1],
          ["create", 0, "create", 1],
          ["create", 1, "create", 1],
          ["entry", 1, "entry", 1],
          ["entry", 1, "column", 1],
          ["entry", 1, "mind", 1],
          ["create", 1, "column", 1],
          ["create", 1, "mind", 1],
          ["exit", 1000, "frame", 1],
          ["fit", 1000, "frame", 1],
          ["dissolve", 1000, "frame", 1],
        ];

    const results = [];
    for (const scenario of cases) {
      const [action, size, mode, rate] = scenario;
      const key = `${action}:${mode}:${size}:${rate}`;
      if (only && !only.split(",").some(value => key === value || key.startsWith(value + ":")))
        continue;
      const rounds = process.argv.includes("--quick")
        ? 1
        : Number(process.argv.find(arg => arg.startsWith("--rounds="))?.slice(9) ?? 4);
      const output = await run([
        "run-code",
        `async page => {
      try { return await (${sample.toString()})(page, ${JSON.stringify(server.resolvedUrls.local[0])}, ${JSON.stringify([scenario])}, ${rounds}, ${process.argv.includes("--verify")}); }
      catch (error) { return [...(page.frameResults ?? []), { scenario: ${JSON.stringify(scenario)}, failure: error.message }]; }
      finally { page.removeAllListeners("pageerror"); page.removeAllListeners("console"); }
    }`,
      ]);
      const match = output.match(/### Result\n([^\n]+)/);
      if (!match) throw new Error("Playwright 未返回采样结果");
      results.push(...JSON.parse(match[1]));
      if (target) await writeFile(target, JSON.stringify(results, null, 2) + "\n");
      console.log("COMPLETED", key);
    }
    if (process.argv.includes("--verify") && results.some(row => row.failure || row.errors?.length))
      throw new Error("画框功能验证失败，详见采样结果");
  }
} finally {
  await run(["close"]).catch(error => console.error("关闭基准浏览器失败", error));
  await server?.close();
  await rm(outDir, { recursive: true, force: true });
}
