import { test, expect, _electron, type ElectronApplication, type Page } from "@playwright/test";
import { build } from "esbuild";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer as createTcpServer } from "node:net";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, rmSync, createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join, dirname } from "node:path";
import * as Y from "yjs";
import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import { WebSocket } from "ws";

const localRequire = createRequire(resolve(__dirname, "../package.json"));
const root = resolve(__dirname, "..");
const output = resolve(root, "output/playwright/collaboration-runtime");
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
const errors: string[] = [];

test.beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), "tau-collaboration-e2e-"));
  mkdirSync(output, { recursive: true });
  await build({
    entryPoints: [resolve(root, "e2e/collaboration/main.ts")],
    outfile: join(output, "main.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["electron", "better-sqlite3"],
    alias: { "@": resolve(root, "src") },
    plugins: [
      {
        name: "isolated-database",
        setup(build) {
          build.onResolve(
            { filter: /(?:\.\.\/database|\.\.\/tables\/content|\.\/content|PathUtil)$/ },
            args => {
              if (!args.importer.includes("src-electron/main/modules/collaboration/")) return;
              const target = args.path.endsWith("PathUtil")
                ? "paths.ts"
                : args.path.endsWith("database")
                  ? "database.ts"
                  : "content-table.ts";
              return { path: resolve(root, "e2e/collaboration", target) };
            }
          );
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
    format: "cjs",
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
    },
  });
  page = await electron.firstWindow();
  page.on("pageerror", error => errors.push(error.message));
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

// Playwright 要求首参为解构模式；这里不需要任何夹具。
// eslint-disable-next-line no-empty-pattern
test.afterEach(async ({}, info) => {
  if (info.status !== info.expectedStatus && page && !page.isClosed()) {
    await page.screenshot({ path: join(output, "failure.png"), fullPage: true });
    console.log("页面错误", errors);
    console.log("当前会话", await page.evaluate(() => window.electron.invoke("e2e:database")));
  }
});

test("本机多视图、跨窗口光标、标题和原地共享", async () => {
  const first = page.getByTestId("first-view").locator('[data-slate-editor="true"]');
  const second = page.getByTestId("second-view").locator('[data-slate-editor="true"]');
  await first.click();
  await page.keyboard.press("End");
  await page.keyboard.insertText("甲方编辑");
  await expect(second).toContainText("甲方编辑");
  await expect(
    page.getByTestId("second-view").locator("[data-collaboration-cursor]").first()
  ).toBeVisible();
  await second.click();
  await page.keyboard.press("End");
  await page.keyboard.insertText("乙方编辑");
  await expect(first).toContainText("乙方编辑");
  const nextWindow = electron.waitForEvent("window");
  await page.evaluate(() => window.electron.invoke("e2e:open-window", "primary"));
  const other = await nextWindow;
  const otherEditor = other.getByTestId("first-view").locator('[data-slate-editor="true"]');
  await expect(otherEditor).toContainText("乙方编辑");
  await otherEditor.click();
  await other.keyboard.press("End");
  await other.keyboard.insertText("窗口编辑");
  await expect(first).toContainText("窗口编辑");
  await expect(
    page.getByTestId("first-view").locator("[data-collaboration-cursor]").first()
  ).toBeVisible();
  const title = page.locator('main > span [contenteditable="plaintext-only"]');
  await title.fill("实时统一标题");
  await expect(other.locator('main > span [contenteditable="plaintext-only"]')).toHaveText(
    "实时统一标题"
  );
  await expect
    .poll(async () => (await page.evaluate(() => window.electron.invoke("e2e:database"))).titles)
    .toEqual(["实时统一标题", "实时统一标题", "实时统一标题"]);
  const isolatedWindow = electron.waitForEvent("window");
  await page.evaluate(() => window.electron.invoke("e2e:open-window", "secondary"));
  const isolated = await isolatedWindow;
  await expect(isolated.getByTestId("first-view")).toContainText("另一个数据库");
  await expect(isolated.getByTestId("first-view")).not.toContainText("窗口编辑");
  await page.evaluate(
    url =>
      window.electron.invoke("collaboration:configure", { serverUrl: url, nickname: "测试作者" }),
    serverUrl
  );
  await page.getByRole("button", { name: "发起协作", exact: true }).click();
  const codeField = page.getByTestId("collaboration-code");
  await expect(codeField).not.toHaveText(/^—/);
  const code = (await codeField.textContent())?.trim() || "";
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(first).toContainText("窗口编辑");
  await first.click();
  await page.keyboard.press("End");
  await page.keyboard.insertText("共享之后");
  await expect(otherEditor).toContainText("共享之后");
  const identity = await (
    await fetch(`${serverUrl}/v1/devices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: "测试协作者" }),
    })
  ).json();
  const request = async (path: string, method = "GET", body?: object) => {
    const response = await fetch(`${serverUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${identity.id}:${identity.secret}`,
        "Content-Type": "application/json",
      },
      body: body && JSON.stringify(body),
    });
    expect(response.ok).toBe(true);
    return response.json();
  };
  await request("/v1/join-requests", "POST", { code });
  await page.locator("footer button").click();
  await expect(page.getByText("测试协作者 申请加入", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "批准", exact: true }).click();
  await expect(page.getByText("测试协作者", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  const { documents } = await request("/v1/documents");
  const guestDoc = new Y.Doc();
  const transport = new HocuspocusProviderWebsocket({
    url: serverUrl.replace("http", "ws") + "/ws",
    WebSocketPolyfill: WebSocket,
  });
  const guest = new HocuspocusProvider({
    name: documents[0].id,
    document: guestDoc,
    websocketProvider: transport,
    token: async () =>
      (await request("/v1/tickets", "POST", { documentId: documents[0].id })).ticket,
  });
  try {
    guest.attach();
    await expect.poll(() => guest.synced).toBe(true);
    guest.awareness?.setLocalStateField("user", { viewLabel: "远端窗口" });
    guest.awareness?.setLocalStateField("activity", "editing");
    guestDoc.getText("title").insert(0, "远端");
    await expect(title).toHaveText("远端实时统一标题");
    await page.bringToFront();
    await first.click();
    await expect(page.locator("footer")).toContainText("2 人正在编辑");
  } finally {
    guest.destroy();
    transport.destroy();
    guestDoc.destroy();
  }
  await page.screenshot({ path: join(output, "desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 420, height: 780 });
  await page.screenshot({ path: join(output, "narrow.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.electron.invoke("collaboration:state"))).sessions[0]
          ?.pending
    )
    .toBe(false);
  await other.reload();
  await expect(other.getByTestId("first-view")).toContainText("共享之后");
  await page.locator("footer button").click();
  await page.getByRole("button", { name: "结束共享", exact: true }).click();
  await page
    .getByRole("dialog", { name: "结束共享？", exact: true })
    .getByRole("button", { name: "结束共享", exact: true })
    .click();
  await expect(page.locator("footer button")).toHaveAttribute("aria-label", "发起协作");
  await expect(first).toHaveAttribute("contenteditable", "true");
  await other.close();
  await first.click();
  await page.keyboard.press("End");
  await page.keyboard.insertText("结束后继续编辑");
  await expect(second).toContainText("结束后继续编辑");
  await page.getByRole("button", { name: "关闭第二个视图", exact: true }).click();
  await expect(page.getByTestId("second-view")).toHaveCount(0);
  await expect(first).toContainText("结束后继续编辑");
  expect(errors).toEqual([]);
});

test("活跃协作不会阻止退出应用", async () => {
  await page.getByRole("button", { name: "发起协作", exact: true }).click();
  await expect(page.getByTestId("collaboration-code")).not.toHaveText(/^—/);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  const sessionId = await page.evaluate(
    async () => (await window.electron.invoke("collaboration:state")).sessions[0].id
  );
  await page.evaluate(
    id => window.electron.invoke("collaboration:subscribe", id, "stale-view-without-listener"),
    sessionId
  );

  const exited = new Promise<void>(resolve => electron.process().once("exit", () => resolve()));
  await page.evaluate(() => window.electron.invoke("e2e:quit"));
  await exited;
});
