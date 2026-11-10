import {
  test,
  expect,
  _electron,
  type ElectronApplication,
  type Locator,
  type Page,
} from "@playwright/test";
import { build } from "esbuild";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer as createTcpServer, connect, type Socket, type Server } from "node:net";
import { createHash } from "node:crypto";
import type { ScopedContentEdits } from "@tau/collaboration";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, rmSync, createWriteStream } from "node:fs";
import { readFile } from "node:fs/promises";
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
let server: Awaited<
  ReturnType<typeof import("../../collaboration-server/src/server").createServer>
>;
let serverUrl: string;
let desktopUrl: string;
let viteUrl: string;
let proxy: Server | undefined;
let online = true;
const sockets = new Set<Socket>();
function setOnline(value: boolean) {
  online = value;
  if (!online) for (const socket of sockets) socket.destroy();
}
async function launchDesktop(workspace: string) {
  electron = await _electron.launch({
    executablePath: localRequire("electron"),
    args: [join(output, "main.cjs")],
    env: {
      ...process.env,
      TAU_COLLAB_E2E_DIR: directory,
      TAU_COLLAB_E2E_SCHEMA: resolve(root, "../../packages/db-schema/schema/main.sql"),
      TAU_COLLAB_E2E_PRELOAD: resolve(root, "e2e/collaboration/preload.cjs"),
      TAU_COLLAB_E2E_URL: viteUrl,
      TAU_COLLAB_E2E_WORKSPACE: workspace,
      TAU_COLLAB_DEV_SERVER_URL: desktopUrl,
    },
  });
  page = await electron.firstWindow();
  page.on("pageerror", error => {
    errors.push(error.message);
    console.error("协作测试页面错误", error.message);
  });
  await expect(page.getByTestId("first-view").locator('[data-slate-editor="true"]')).toBeVisible({
    timeout: 45000,
  });
}
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
    external: ["electron", "better-sqlite3", "@node-rs/jieba"],
    alias: {
      "@": resolve(root, "src"),
      "@tau/db-schema": resolve(root, "../../packages/db-schema"),
    },
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
  const serverPort = server.app.server.address().port;
  serverUrl = `http://127.0.0.1:${serverPort}`;
  desktopUrl = serverUrl;
  if (process.env.TAU_COEDIT_E2E === "1") {
    proxy = createTcpServer(client => {
      if (!online) {
        client.destroy();
        return;
      }
      const peer = connect(serverPort, "127.0.0.1");
      for (const socket of [client, peer]) {
        sockets.add(socket);
        socket.on("close", () => {
          sockets.delete(socket);
          client.destroy();
          peer.destroy();
        });
        socket.on("error", () => socket.destroy());
      }
      client.pipe(peer).pipe(client);
    });
    await new Promise<void>(done => proxy?.listen(0, "127.0.0.1", done));
    desktopUrl = `http://127.0.0.1:${(proxy.address() as { port: number }).port}`;
  }
  const probe = createTcpServer();
  await new Promise<void>(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>(resolve => probe.close(() => resolve()));
  const url = (viteUrl = `http://127.0.0.1:${port}`);
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
  await launchDesktop(process.env.TAU_COEDIT_E2E === "1" ? "coedit" : "primary");
});

test.afterAll(async () => {
  await electron?.close();
  if (vite && vite.exitCode === null) {
    vite.kill("SIGTERM");
    await new Promise<void>(resolve => vite.once("exit", () => resolve()));
  }
  setOnline(false);
  if (proxy) await new Promise<void>(done => proxy?.close(() => done()));
  await server?.app.close();
  if (directory) rmSync(directory, { recursive: true, force: true });
});

// Playwright 要求首参为解构模式；这里不需要任何夹具。
// eslint-disable-next-line no-empty-pattern
test.afterEach(async ({}, info) => {
  if (info.status !== info.expectedStatus && page && !page.isClosed()) {
    if (!info.title.startsWith("Agent 共编"))
      await page.screenshot({ path: join(output, "failure.png"), fullPage: true });
    console.log("页面错误", errors);
    console.log("当前会话", await page.evaluate(() => window.electron.invoke("e2e:database")));
  }
});

test("本机多视图、跨窗口光标、标题和原地共享", async () => {
  test.skip(process.env.TAU_COEDIT_E2E === "1", "使用独立的共编夹具");
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
  await page.evaluate(() => window.electron.invoke("collaboration:set-nickname", "测试作者"));
  await page.getByRole("button", { name: "发起协作", exact: true }).click();
  // 先说明再确认：打开对话框不会静默共享
  await page.getByRole("button", { name: "发起共享", exact: true }).click();
  const codeField = page.getByTestId("collaboration-code");
  await expect(codeField).not.toHaveText(/^—/);
  const code = (await codeField.textContent())?.trim() || "";
  await page.getByRole("button", { name: "关闭", exact: true }).click();
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
  await page.getByRole("button", { name: /^协作：/ }).click();
  const shareDialog = page.getByRole("dialog", { name: "内容协作", exact: true });
  await expect(shareDialog.getByText("测试协作者", { exact: true })).toBeVisible();
  await shareDialog.getByRole("button", { name: "同意", exact: true }).click();
  // 同意后申请行消失，成员列表出现对方
  await expect(shareDialog.getByRole("button", { name: "同意", exact: true })).toHaveCount(0);
  await expect(shareDialog.getByText("测试协作者", { exact: true })).toBeVisible();
  await shareDialog.getByRole("button", { name: "关闭", exact: true }).click();
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
    guest.awareness?.setLocalStateField("user", { name: "远端用户" });
    guest.awareness?.setLocalStateField("activity", "editing");
    guestDoc.getText("title").insert(0, "远端");
    await expect(title).toHaveText("远端实时统一标题");
    await page.bringToFront();
    await first.click();
    // 在线摘要只数他人
    await expect(
      page.getByRole("button", { name: "协作：1 人正在编辑", exact: true })
    ).toBeVisible();
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
  await page.getByRole("button", { name: /^协作：/ }).click();
  await page
    .getByRole("dialog", { name: "内容协作", exact: true })
    .getByRole("button", { name: "结束共享", exact: true })
    .click();
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
  test.skip(process.env.TAU_COEDIT_E2E === "1", "使用独立的共编夹具");
  await page.getByRole("button", { name: "发起协作", exact: true }).click();
  // 先说明再确认：打开对话框不会静默共享
  await page.getByRole("button", { name: "发起共享", exact: true }).click();
  await expect(page.getByTestId("collaboration-code")).not.toHaveText(/^—/);
  await page.getByRole("button", { name: "关闭", exact: true }).click();
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

type Staged = { id: string; proposalId: string; edit: ScopedContentEdits["edits"][number] };
const originalCoedit = ["甲段旧文保留", "乙段旧文保留", "丙段人工保留"];
const paragraphTexts = (content: { children?: { text?: string }[] }[]) =>
  content.map(node => node.children?.map(leaf => leaf.text).join("") ?? "");
const stage = (
  proposalId: string,
  blockId: string,
  before: string,
  text: string,
  agent = "校对",
  direct = false
) =>
  page.evaluate(spec => window.electron.invoke<Staged>("e2e:stage", spec), {
    proposalId,
    blockId,
    before,
    text,
    agent,
    direct,
  });
const coeditState = () =>
  page.evaluate(() =>
    window.electron.invoke<{
      documentId: string;
      content: { children?: { text?: string }[] }[];
      receipts: { key: string; inverse?: { edits: unknown[] } }[];
    }>("e2e:coedit-state")
  );
const suggestion = (view: Page, id: string) =>
  view.getByRole("complementary", { name: "AI 对话" }).locator(`[data-suggestion-card="${id}"]`);
const toggleSuggestionFocus = (view: Page, id: string) =>
  suggestion(view, id).click({ position: { x: 8, y: 8 } });
const suggestionUndoButton = (view: Page, id: string) =>
  suggestion(view, id).getByRole("button", { name: "撤销", exact: true });
const competeOnSuggestion = async (id: string, buttons: Locator[]) => {
  await page.evaluate(id => window.electron.invoke("e2e:arm-competing-suggestion-actions", id), id);
  await Promise.all(buttons.map(button => button.dispatchEvent("click")));
};
const listProposal = (id: string) =>
  page.evaluate(
    proposalId =>
      window.electron.invoke<{ status: string; id: string; afterText: string }[]>(
        "content:suggestions",
        { proposalId }
      ),
    id
  );
const undo = (id: string) =>
  page.evaluate(id => window.electron.invoke("content:suggestions-undo", 7, [id]), id);
const openPeer = async () => {
  const opened = electron.waitForEvent("window");
  await page.evaluate(() => window.electron.invoke("e2e:open-window", "coedit"));
  const peer = await opened;
  await expect(peer.getByTestId("first-view").locator('[data-slate-editor="true"]')).toBeVisible();
  return peer;
};

test.describe("Agent 共编", () => {
  test.skip(process.env.TAU_COEDIT_E2E !== "1", "显式启用真实 Electron 崩溃测试");

  test("真实双窗口同时接受，正文、建议状态和撤销回执一致", async () => {
    const peer = await openPeer();
    try {
      const [a, b, c] = await Promise.all([
        stage("two-a", "p1", "旧文", "甲改"),
        stage("two-b", "p2", "旧文", "乙改", "编辑"),
        stage("two-c", "p3", "人工", "第三", "注释"),
      ]);
      await Promise.all([toggleSuggestionFocus(page, a.id), toggleSuggestionFocus(peer, a.id)]);
      for (const view of [page, peer])
        await expect(
          view.getByTestId("first-view").locator(`[data-suggestion-mark="${a.id}"]`).first()
        ).toBeVisible();
      const clicks = [suggestion(page, a.id), suggestion(peer, a.id)].map(card =>
        card.getByRole("button", { name: "接受", exact: true })
      );
      await Promise.all(clicks.map(button => expect(button).toBeVisible()));
      // 两个 BrowserWindow 各走真实按钮事件和渲染端命令。
      await competeOnSuggestion(a.id, clicks);
      await expect.poll(async () => (await listProposal(a.proposalId))[0].status).toBe("accepted");
      await Promise.all([toggleSuggestionFocus(page, b.id), toggleSuggestionFocus(peer, c.id)]);
      const independent = [suggestion(page, b.id), suggestion(peer, c.id)].map(card =>
        card.getByRole("button", { name: "接受", exact: true })
      );
      await Promise.all(independent.map(button => expect(button).toBeEnabled()));
      await Promise.all(independent.map(button => button.dispatchEvent("click")));
      await expect
        .poll(async () => paragraphTexts((await coeditState()).content))
        .toEqual(["甲段甲改保留", "乙段乙改保留", "丙段第三保留"]);
      await expect(peer.getByTestId("first-view")).toContainText("甲段甲改保留");
      for (const item of [a, b, c]) {
        expect((await listProposal(item.proposalId))[0].status).toBe("accepted");
        const matching = (await coeditState()).receipts.filter(receipt =>
          receipt.key.endsWith(`:${item.id}`)
        );
        expect(matching).toHaveLength(1);
        expect(matching[0].inverse?.edits).toHaveLength(1);
      }
      await Promise.all([toggleSuggestionFocus(page, b.id), toggleSuggestionFocus(peer, c.id)]);
      for (const view of [page, peer]) {
        await expect(view.getByRole("complementary", { name: "建议" })).toHaveCount(0);
        await expect(view.locator("[data-suggestion-mark]")).toHaveCount(0);
      }
      await toggleSuggestionFocus(page, a.id);
      const firstEdit = suggestion(page, a.id);
      await expect(
        page.getByTestId("first-view").locator(`[data-suggestion-mark="${a.id}"]`).first()
      ).toBeVisible();
      await expect(firstEdit.getByText("甲改", { exact: true })).toBeVisible();
      await firstEdit.getByRole("button", { name: "继续修改", exact: true }).click();
      await expect(firstEdit.getByPlaceholder("告诉它接下来怎么改…")).toBeVisible();
      await firstEdit.getByRole("button", { name: "取消", exact: true }).click();
      await toggleSuggestionFocus(page, a.id);
      await expect(firstEdit.getByText("甲改", { exact: true })).toBeVisible();
      await expect(
        page.getByTestId("first-view").locator(`[data-suggestion-mark="${a.id}"]`)
      ).toHaveCount(0);
      await Promise.all([toggleSuggestionFocus(page, a.id), toggleSuggestionFocus(peer, a.id)]);
      const duplicateUndo = [suggestionUndoButton(page, a.id), suggestionUndoButton(peer, a.id)];
      await Promise.all(duplicateUndo.map(button => expect(button).toBeEnabled()));
      await competeOnSuggestion(a.id, duplicateUndo);
      await expect.poll(async () => (await listProposal(a.proposalId))[0].status).toBe("undone");
      await Promise.all([toggleSuggestionFocus(page, b.id), toggleSuggestionFocus(peer, c.id)]);
      const independentUndo = [suggestionUndoButton(page, b.id), suggestionUndoButton(peer, c.id)];
      await Promise.all(independentUndo.map(button => expect(button).toBeEnabled()));
      await Promise.all(independentUndo.map(button => button.dispatchEvent("click")));
      await expect
        .poll(async () => paragraphTexts((await coeditState()).content))
        .toEqual(originalCoedit);
      await expect(peer.getByTestId("first-view")).toContainText(originalCoedit[0]);
      for (const item of [a, b, c]) {
        expect((await listProposal(item.proposalId))[0].status).toBe("undone");
        expect(
          (await coeditState()).receipts.filter(row => row.key.endsWith(`:${item.id}-undo`))
        ).toHaveLength(1);
      }
      const raced = await stage("accept-or-reject", "p1", "旧文", "竞态修改", "竞态");
      await Promise.all([
        toggleSuggestionFocus(page, raced.id),
        toggleSuggestionFocus(peer, raced.id),
      ]);
      const accept = suggestion(page, raced.id).getByRole("button", { name: "接受", exact: true });
      const reject = suggestion(peer, raced.id).getByRole("button", { name: "退回", exact: true });
      await Promise.all([expect(accept).toBeEnabled(), expect(reject).toBeEnabled()]);
      await competeOnSuggestion(raced.id, [accept, reject]);
      await expect
        .poll(async () => (await listProposal(raced.proposalId))[0].status)
        .toMatch(/^(accepted|rejected)$/);
      const accepted = (await listProposal(raced.proposalId))[0].status === "accepted";
      const final = await coeditState();
      expect(paragraphTexts(final.content)).toEqual(
        accepted ? ["甲段竞态修改保留", ...originalCoedit.slice(1)] : originalCoedit
      );
      expect(final.receipts.filter(row => row.key.endsWith(`:${raced.id}`))).toHaveLength(
        accepted ? 1 : 0
      );
      if (accepted) await undo(raced.id);
      expect(paragraphTexts((await coeditState()).content)).toEqual(originalCoedit);
    } finally {
      await peer.close();
    }
  });

  for (const boundary of ["after-delta", "after-receipt", "before-suggestion-settle"] as const)
    test(`真实进程在 ${boundary} 强退后从原 SQLite 恢复`, async () => {
      const item = await stage(`kill-${boundary}`, "p1", "旧文", "故障后完整");
      const before = await coeditState();
      const accept = suggestion(page, item.id).getByRole("button", { name: "接受", exact: true });
      await suggestion(page, item.id).hover();
      await expect(accept).toBeEnabled();
      await page.evaluate(point => window.electron.invoke("e2e:arm-crash", point), boundary);
      const stopped = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
        resolve => {
          electron.process().once("exit", (code, signal) => resolve({ code, signal }));
        }
      );
      void accept.dispatchEvent("click").catch(() => undefined);
      expect((await stopped).signal).toBe("SIGKILL");
      expect(await readFile(join(directory, "crash-point"), "utf8")).toBe(boundary);
      await launchDesktop("coedit");
      const committed = boundary === "before-suggestion-settle";
      const reopened = await coeditState();
      expect(paragraphTexts(reopened.content)).toEqual(
        committed
          ? ["甲段故障后完整保留", ...originalCoedit.slice(1)]
          : paragraphTexts(before.content)
      );
      expect(reopened.receipts.filter(row => row.key.endsWith(`:${item.id}`))).toHaveLength(
        committed ? 1 : 0
      );
      expect((await listProposal(item.proposalId))[0].status).toBe("applying");
      await suggestion(page, item.id).getByRole("button", { name: "确认或恢复提交" }).click();
      await expect
        .poll(async () => (await listProposal(item.proposalId))[0].status)
        .toBe("accepted");
      expect(paragraphTexts((await coeditState()).content)).toEqual([
        "甲段故障后完整保留",
        ...originalCoedit.slice(1),
      ]);
      expect(
        (await coeditState()).receipts.filter(row => row.key.endsWith(`:${item.id}`))
      ).toHaveLength(1);
      await suggestion(page, item.id).hover();
      await suggestionUndoButton(page, item.id).click();
      await expect.poll(async () => (await listProposal(item.proposalId))[0].status).toBe("undone");
      expect(paragraphTexts((await coeditState()).content)).toEqual(originalCoedit);
      expect(
        (await coeditState()).receipts.filter(row => row.key.endsWith(`:${item.id}-undo`))
      ).toHaveLength(1);
    });
});

const grant = (agent: string, level: string) =>
  page.evaluate(
    ({ agent, level }) => window.electron.invoke("content:agent-permission-set", 7, agent, level),
    { agent, level }
  );
const runAgent = (id: string, execution: string) =>
  page.evaluate(
    ({ id, execution }) =>
      window.electron.invoke<{ status: string; error?: string }[]>("e2e:run-agent", id, execution),
    { id, execution }
  );

test.describe("Agent 共编混合故障", () => {
  test.skip(process.env.TAU_COEDIT_E2E !== "1", "显式启用真实 Electron 崩溃测试");

  test("真实进程在首段提交后强退，接续和撤销复用原回执", async () => {
    const agent = "恢复测试";
    await grant(agent, "direct");
    const text = "甲乙丙丁戊己";
    const item = await stage("kill-typing", "p1", "旧文", text, agent, true);
    await page.evaluate(() => window.electron.invoke("e2e:arm-crash", "after-chunk-commit"));
    const stopped = new Promise<NodeJS.Signals | null>(resolve => {
      electron.process().once("exit", (_code, signal) => resolve(signal));
    });
    void runAgent(item.id, "kill-typing-run").catch(() => undefined);
    expect(await stopped).toBe("SIGKILL");
    expect(await readFile(join(directory, "crash-point"), "utf8")).toBe("after-chunk-commit");
    await launchDesktop("coedit");
    expect(paragraphTexts((await coeditState()).content)).toEqual([
      "甲段甲乙保留",
      ...originalCoedit.slice(1),
    ]);
    expect(
      (await coeditState()).receipts.filter(row => row.key.includes(`:${item.id}.t`))
    ).toHaveLength(1);
    expect((await listProposal(item.proposalId))[0].status).toBe("applying");
    await suggestion(page, item.id).getByRole("button", { name: "确认或恢复提交" }).click();
    await expect.poll(async () => (await listProposal(item.proposalId))[0].status).toBe("accepted");
    expect(paragraphTexts((await coeditState()).content)).toEqual([
      `甲段${text}保留`,
      ...originalCoedit.slice(1),
    ]);
    const receipts = (await coeditState()).receipts.filter(row =>
      row.key.includes(`:${item.id}.t`)
    );
    expect(receipts).toHaveLength(3);
    expect(receipts.every(row => row.inverse?.edits.length === 1)).toBe(true);
    await suggestion(page, item.id).hover();
    await suggestionUndoButton(page, item.id).click();
    await expect.poll(async () => (await listProposal(item.proposalId))[0].status).toBe("undone");
    expect(paragraphTexts((await coeditState()).content)).toEqual(originalCoedit);
    expect(
      (await coeditState()).receipts.filter(row => row.key.endsWith(`:${item.id}-undo`))
    ).toHaveLength(1);
  });

  test("逐段写入过程中撤回权限，下一片段被拦下，已写入的仍能撤销", async () => {
    const agent = "逐段撤权";
    await grant(agent, "direct");
    const item = await stage("revoke-typing", "p1", "旧文", "甲乙丙丁戊己", agent, true);
    await grant(agent, "suggest");
    expect((await runAgent(item.id, "stale-grant"))[0].error).toContain("权限已撤回");
    expect(paragraphTexts((await coeditState()).content)).toEqual(originalCoedit);
    expect(
      (await coeditState()).receipts.filter(row => row.key.includes(`:${item.id}.t`))
    ).toHaveLength(0);
    await grant(agent, "direct");
    await page.evaluate(agent => window.electron.invoke("e2e:revoke-on-append", agent), agent);
    const results = await runAgent(item.id, "during-typing");
    expect(results).toMatchObject([
      { status: "accepted" },
      { status: "pending", error: expect.stringContaining("权限已撤回") },
    ]);
    expect(paragraphTexts((await coeditState()).content)).toEqual([
      "甲段甲乙保留",
      ...originalCoedit.slice(1),
    ]);
    const receipts = (await coeditState()).receipts.filter(row =>
      row.key.includes(`:${item.id}.t`)
    );
    expect(receipts).toHaveLength(1);
    expect(receipts[0].inverse?.edits).toHaveLength(1);
    await undo(item.id);
    expect(paragraphTexts((await coeditState()).content)).toEqual(originalCoedit);
    expect((await listProposal(item.proposalId))[0].status).toBe("undone");
  });

  test("多 Agent、真人离线输入、撤权和重连在同一轮核对正文与回执", async () => {
    test.setTimeout(180000);
    const peer = await openPeer();
    try {
      const shared = await page.evaluate(() =>
        window.electron.invoke<{ documentId: string; code: string }>("e2e:share")
      );
      const ownerId = server.store.document(shared.documentId).owner_id;
      const remoteBody = async () => {
        const doc = server.store.loadDocument(shared.documentId);
        try {
          const encoded = Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64");
          return await page.evaluate(
            state => window.electron.invoke<string[]>("e2e:decode-body", state),
            encoded
          );
        } finally {
          doc.destroy();
        }
      };
      let humanText = originalCoedit[2];
      const rounds = Number(process.env.TAU_COEDIT_E2E_ROUNDS ?? "6");
      expect(Number.isSafeInteger(rounds) && rounds > 0).toBe(true);
      for (let round = 0; round < rounds; round++) {
        const sequence = server.store.operations.sequence(shared.documentId);
        const agentA = "共享校对",
          agentB = "共享润色";
        await Promise.all([grant(agentA, "direct"), grant(agentB, "direct")]);
        const [a, b] = await Promise.all([
          stage(`mix-${round}-a`, "p1", "旧文", `校对${round}`, agentA, true),
          stage(`mix-${round}-b`, "p2", "旧文", `润色${round}`, agentB, true),
        ]);
        const guest = server.store.register(`临时成员-${round}`);
        const joinRequest = server.store.requestJoin(shared.code, guest.id);
        expect(joinRequest.id).toBeTruthy();
        server.store.decide(joinRequest.id!, ownerId, true);
        expect((await runAgent(a.id, `mix-active-${round}`))[0].status).toBe("accepted");
        const scope: ScopedContentEdits = { edits: [b.edit] };
        setOnline(false);
        const offlineAttempt = runAgent(b.id, `mix-offline-${round}`);
        const editor = peer.getByTestId("first-view").locator('[data-slate-editor="true"]');
        const last = editor.locator('[data-slate-node="element"]').last();
        await last.click();
        // End 只到当前视觉行尾；明确把光标放到段落末尾，长段折行时判据仍相同。
        await last.evaluate(block => {
          const range = document.createRange();
          range.selectNodeContents(block);
          range.collapse(false);
          const selection = document.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
          document.dispatchEvent(new Event("selectionchange"));
        });
        const addition = `·人工${round}`;
        await peer.keyboard.insertText(addition);
        humanText += addition;
        await expect
          .poll(async () => paragraphTexts((await coeditState()).content)[2])
          .toBe(humanText);
        expect((await offlineAttempt)[0].status).toBe("pending");
        await grant(agentB, "readonly");
        server.store.removeMember(shared.documentId, ownerId, guest.id);
        setOnline(true);
        expect((await runAgent(b.id, `mix-revoked-${round}`))[0].error).toContain("权限已撤回");
        const protocol = server.store.protocols.state(shared.documentId);
        const remoteOperation = `revoked-guest-${round}`;
        const response = await fetch(
          `${serverUrl}/v1/documents/${shared.documentId}/operations/${remoteOperation}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${guest.id}:${guest.secret}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              kind: "scoped-edit",
              version: 2,
              baselineId: protocol.baselineId,
              epoch: protocol.epoch,
              expiresAt: Date.now() + 60000,
              updateHash: createHash("sha256").update(JSON.stringify(scope)).digest("hex"),
              scope,
            }),
          }
        );
        expect(response.status).toBe(403);
        const expected = [`甲段校对${round}保留`, originalCoedit[1], humanText];
        await expect.poll(remoteBody, { timeout: 20000 }).toEqual(expected);
        await expect
          .poll(async () => paragraphTexts((await coeditState()).content))
          .toEqual(expected);
        const receipt = server.store.operations.get(shared.documentId, a.id, ownerId);
        expect(receipt?.state).toBe("COMMITTED");
        expect(receipt?.receipt?.inverse?.edits).toHaveLength(1);
        expect(server.store.operations.sequence(shared.documentId)).toBe(sequence + 2);
        expect(server.store.operations.get(shared.documentId, b.id, ownerId)).toBeNull();
        expect(
          server.store.operations.get(shared.documentId, remoteOperation, guest.id)
        ).toBeNull();
        await undo(a.id);
        expect((await listProposal(a.proposalId))[0].status).toBe("undone");
        expect(server.store.operations.get(shared.documentId, `${a.id}-undo`, ownerId)?.state).toBe(
          "COMMITTED"
        );
        await expect.poll(remoteBody).toEqual([...originalCoedit.slice(0, 2), humanText]);
        expect(server.store.operations.sequence(shared.documentId)).toBe(sequence + 3);
        await expect
          .poll(async () => paragraphTexts((await coeditState()).content))
          .toEqual([...originalCoedit.slice(0, 2), humanText]);
      }
      console.info(`真实双窗口混合故障：${rounds} 轮，逐轮比对完整正文与正向、逆向及拒绝操作回执`);
    } finally {
      setOnline(true);
      await peer.close();
    }
  });
});
