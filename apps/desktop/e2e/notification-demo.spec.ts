import { test, expect, _electron, type ElectronApplication, type Page } from "@playwright/test";
import { build } from "esbuild";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer as createTcpServer } from "node:net";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, rmSync, createWriteStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join, dirname } from "node:path";

const localRequire = createRequire(resolve(__dirname, "../package.json"));
const root = resolve(__dirname, "..");
const output = resolve(root, "output/playwright/collaboration-notification-demo");
let directory: string;
let electron: ElectronApplication;
let vite: ChildProcess;
let page: Page;
let server: {
  app: {
    listen: (value: object) => Promise<unknown>;
    close: () => Promise<void>;
    server: { address: () => { port: number } };
  };
};
let serverUrl: string;

test.beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), "tau-collab-demo-"));
  mkdirSync(output, { recursive: true });
  await build({
    entryPoints: [resolve(root, "e2e/collaboration/main.ts")],
    outfile: join(output, "main.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["electron", "better-sqlite3", "@node-rs/jieba"],
    alias: { "@": resolve(root, "src") },
    plugins: [
      {
        // src-electron 内任何位置对真实 database / tables/content / PathUtil 的引用
        // 都重定向到 e2e 替身，避免把整套主进程模块拉进测试 bundle
        name: "isolated-database",
        setup(build) {
          build.onResolve(
            { filter: /(?:^|[/\\])(?:database|content|PathUtil)(?:\.ts)?$/ },
            args => {
              if (!args.importer.includes("src-electron/") || !args.path.startsWith(".")) return;
              const resolved = resolve(dirname(args.importer), args.path);
              let target: string | undefined;
              if (resolved.endsWith("/src-electron/main/modules/database")) target = "database.ts";
              else if (resolved.endsWith("/src-electron/main/modules/tables/content"))
                target = "content-table.ts";
              else if (resolved.endsWith("/src-electron/main/utils/PathUtil")) target = "paths.ts";
              if (!target) return;
              return { path: resolve(root, "e2e/collaboration", target) };
            }
          );
        },
      },
      {
        // vite 风格的 ?raw 导入（db-schema SQL、内置技能 markdown 等）转为内容字符串
        name: "vite-raw-asset",
        setup(build) {
          build.onResolve({ filter: /\?raw$/ }, args => {
            const path = args.path.replace(/\?raw$/, "");
            if (path.startsWith("@/"))
              return { path: resolve(root, "src", path.slice(2)), namespace: "raw-asset" };
            if (path.startsWith("."))
              return {
                path: resolve(dirname(args.importer), path),
                namespace: "raw-asset",
              };
            // 裸包导入（如 @tau/db-schema/schema/main.sql）：解析包根后拼接子路径
            const [scope, name, ...rest] = path.split("/");
            const pkg = scope.startsWith("@") ? `${scope}/${name}` : scope;
            const require = createRequire(args.importer);
            const pkgRoot = dirname(require.resolve(`${pkg}/package.json`));
            return { path: resolve(pkgRoot, ...rest), namespace: "raw-asset" };
          });
          build.onLoad({ filter: /.*/, namespace: "raw-asset" }, async args => ({
            contents: `export default ${JSON.stringify(await readFile(args.path, "utf8"))}`,
            loader: "js",
          }));
        },
      },
    ],
  });
  const serverRequire = createRequire(resolve(root, "../collaboration-server/package.json"));
  await build({
    entryPoints: [resolve(root, "../collaboration-server/src/server.ts")],
    outfile: join(output, "server.cjs"),
    external: ["yjs", "y-protocols/*"],
    bundle: true,
    platform: "node",
    plugins: [
      {
        name: "server-native-runtime",
        setup(build) {
          build.onResolve({ filter: /^better-sqlite3$/ }, () => ({
            path: serverRequire.resolve("better-sqlite3"),
            external: true,
          }));
        },
      },
    ],
  });
  server = await localRequire(join(output, "server.cjs")).createServer({
    dataDir: join(directory, "server"),
    logger: false,
  });
  await server.app.listen({ host: "127.0.0.1", port: 0 });
  serverUrl = `http://127.0.0.1:${server.app.server.address().port}`;
  const probe = createTcpServer();
  await new Promise<void>(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>(resolve => probe.close(() => resolve()));
  const url = `http://127.0.0.1:${port}`;
  vite = spawn(
    process.execPath,
    [
      resolve(dirname(localRequire.resolve("vite/package.json")), "bin/vite.js"),
      "--config",
      "e2e/collaboration/vite.config.mts",
      "--port",
      String(port),
      "--strictPort",
    ],
    { cwd: root, stdio: ["ignore", "pipe", "pipe"] }
  );
  const log = createWriteStream(join(output, "vite.log"));
  vite.stdout?.pipe(log);
  vite.stderr?.pipe(log);
  await expect
    .poll(
      async () => {
        try {
          return (await fetch(`${url}/e2e/collaboration/index.html`)).ok;
        } catch {
          return false;
        }
      },
      { timeout: 30000 }
    )
    .toBe(true);
  electron = await _electron.launch({
    executablePath: localRequire("electron"),
    args: [join(output, "main.cjs")],
    env: {
      ...process.env,
      TAU_COLLAB_E2E_DIR: directory,
      TAU_COLLAB_E2E_SCHEMA: resolve(root, "../../packages/db-schema/schema/main.sql"),
      TAU_COLLAB_E2E_PRELOAD: resolve(root, "e2e/collaboration/preload.cjs"),
      TAU_COLLAB_E2E_URL: url,
      // 服务地址不对用户开放，测试经开发模式变量指向本地服务
      TAU_COLLAB_DEV_SERVER_URL: serverUrl,
    },
  });
  page = await electron.firstWindow();
  await page.bringToFront();
  await expect(page.getByTestId("first-view").locator('[data-slate-editor="true"]')).toBeVisible({
    timeout: 45000,
  });
});

test.afterAll(async () => {
  await electron?.close();
  if (vite && vite.exitCode === null) {
    vite.kill("SIGTERM");
    await new Promise<void>(resolve => vite.once("exit", () => resolve()));
  }
  await server?.app.close();
  if (directory) rmSync(directory, { recursive: true, force: true });
});

// 冒烟：连发 4 个加入申请，验证右上角通知弹出数量与 Mac 式堆叠（3 完整 + 1 层叠）。
test("多个加入申请弹出通知并以堆叠呈现", async () => {
  await page.evaluate(
    (nickname: string) => window.electron.invoke("collaboration:set-nickname", nickname),
    "演示作者"
  );
  await page.getByRole("button", { name: "发起协作", exact: true }).click();
  // 先说明再确认：打开对话框不会静默共享
  await page.getByRole("button", { name: "发起共享", exact: true }).click();
  const codeField = page.getByTestId("collaboration-code");
  await expect(codeField).not.toHaveText(/^—/);
  const code = (await codeField.textContent())?.trim() || "";
  await page.getByRole("button", { name: "关闭", exact: true }).click();

  // /v1/devices 限流 5 次/小时：作者端已注册 1 次，这里最多再注册 4 个协作者
  for (let i = 1; i <= 4; i++) {
    const identity = await (
      await fetch(`${serverUrl}/v1/devices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: `演示协作者${i}` }),
      })
    ).json();
    const response = await fetch(`${serverUrl}/v1/join-requests`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${identity.id}:${identity.secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code }),
    });
    if (!response.ok) {
      console.log(`申请 ${i} 失败: ${response.status}`, await response.text());
    }
    expect(response.ok).toBe(true);
    await page.waitForTimeout(900);
  }
  await expect(
    page.locator('[data-testid="join-request-notification"]:not([data-stacked])')
  ).toHaveCount(3);
  await expect(page.locator('[data-testid="join-request-notification"][data-stacked]')).toHaveCount(
    1
  );

  await expect(
    page.locator('[data-testid="join-request-notification"]:not([data-stacked])')
  ).toHaveCount(3);
  await expect(page.locator('[data-testid="join-request-notification"][data-stacked]')).toHaveCount(
    1
  );
});
