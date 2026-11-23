import { expect, _electron, type ElectronApplication, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import { DatabaseSync } from "node:sqlite";
import * as Y from "yjs";
import {
  NodeTree,
  type ContentNode,
  type ContentSessionSnapshot,
  type NodeDocumentIdentity,
} from "@tau/collaboration";
import { prepareContentContract } from "@tau/db-schema/content-contracts";

export const desktop = resolve(__dirname, "../..");
const localRequire = createRequire(join(desktop, "package.json"));
export const output = resolve(desktop, "output/playwright/content-production");

export type Card = { id: number; contentId: number };
export type ContentSession = {
  documentId: string;
  viewId: string;
  state: number[];
  documentIdentity: NodeDocumentIdentity;
};
export type Audit = {
  entry: string;
  directory: string;
  port: number;
  listening: boolean;
  nodeRemaps: number;
  rendererRemaps: number;
  externalBlocked: number;
  systemBlocked: number;
  stages: string[];
};

export async function availablePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("未取得隔离端口");
  await new Promise<void>((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve()))
  );
  if (address.port === 24678) return availablePort();
  return address.port;
}

export async function launch(
  directory: string,
  port: number,
  started: (application: ElectronApplication) => void,
  collaborationUrl?: string,
  bootstrap = "bootstrap.cjs"
) {
  const app = await _electron.launch({
    executablePath: localRequire("electron"),
    args: [join(desktop, "e2e/content-production", bootstrap)],
    cwd: desktop,
    env: {
      PATH: process.env.PATH ?? "",
      HOME: join(directory, "home"),
      USERPROFILE: join(directory, "home"),
      XDG_CONFIG_HOME: join(directory, "home/.config"),
      XDG_CACHE_HOME: join(directory, "home/.cache"),
      TMPDIR: join(directory, "temporary"),
      TAU_TELEMETRY_DISABLED: "1",
      TAU_CONTENT_PRODUCTION_DIRECTORY: directory,
      TAU_CONTENT_PRODUCTION_APP: desktop,
      TAU_CONTENT_PRODUCTION_PORT: String(port),
      ...(collaborationUrl ? { TAU_COLLAB_DEV_SERVER_URL: collaborationUrl } : {}),
    },
    timeout: 60_000,
  });
  started(app);
  app.process().stdout?.on("data", bytes => process.stdout.write(bytes));
  app.process().stderr?.on("data", bytes => process.stderr.write(bytes));
  const page = await app.firstWindow();
  await page.waitForFunction(() => Boolean(window.electron?.invoke), { timeout: 30_000 });
  await expect
    .poll(
      () =>
        app.evaluate(
          () =>
            (globalThis as unknown as { __tauContentProductionAudit: Audit })
              .__tauContentProductionAudit.listening
        ),
      { timeout: 45_000 }
    )
    .toBe(true);
  await expect
    .poll(
      async () => {
        const stages = await app.evaluate(
          () =>
            (globalThis as unknown as { __tauContentProductionAudit: Audit })
              .__tauContentProductionAudit.stages
        );
        if (!stages.includes("startup:shell-ready")) {
          const onboarding = page.getByRole("button", { name: "先全部打开", exact: true });
          if (await onboarding.isVisible()) await onboarding.click();
        }
        return stages;
      },
      { timeout: 45_000 }
    )
    .toEqual(
      expect.arrayContaining([
        "startup:settings-ready",
        "startup:database-ready",
        "startup:shell-ready",
      ])
    );
  return { app, page };
}

export async function invoke<T>(page: Page, channel: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(({ channel, args }) => window.electron.invoke(channel, ...args), {
    channel,
    args,
  });
}

export async function verifyContentStartup(page: Page, directory: string) {
  // RPC 监听就绪时 BACKGROUND 装配已经结束，用不存在的视图检查正式 IPC。
  await invoke(page, "local-content:freeze-ack", "startup-probe-without-view");
  const store = new DatabaseSync(join(directory, "home/.editor/local-content/content.db"), {
    readOnly: true,
  });
  try {
    const tables = store
      .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")
      .all()
      .map(row => row.name);
    expect(tables).toEqual(
      expect.arrayContaining([
        "sessions",
        "updates",
        "input_drafts",
        "document_drafts",
        "content_suggestions",
        "content_agent_permissions",
      ])
    );
    return tables;
  } finally {
    store.close();
  }
}

export async function open(page: Page, card: Card) {
  return invoke<ContentSessionSnapshot>(page, "local-content:open-content", {
    contentId: card.contentId,
    sourceType: "card",
    sourceId: card.id,
  });
}

export async function subscribe(
  page: Page,
  documentId: string,
  viewId: string,
  runtime: "local-content" | "collaboration" = "local-content"
): Promise<ContentSession> {
  const snapshot = await page.evaluate(
    async ({ documentId, viewId, runtime }) => {
      const value = await window.electron.invoke<{
        state: Uint8Array;
        documentIdentity: NodeDocumentIdentity;
      }>(`${runtime}:subscribe`, documentId, viewId);
      return {
        state: Array.from(value.state),
        documentIdentity: value.documentIdentity,
      };
    },
    { documentId, viewId, runtime }
  );
  return { documentId, viewId, ...snapshot };
}

export function withTree<T>(session: ContentSession, read: (tree: NodeTree, doc: Y.Doc) => T): T {
  const doc = new Y.Doc({ gc: false });
  Y.applyUpdate(doc, Uint8Array.from(session.state));
  const tree = new NodeTree(doc);
  try {
    return read(tree, doc);
  } finally {
    tree.dispose();
    doc.destroy();
  }
}

export function append(session: ContentSession, expected: string, addition: string) {
  return withTree(session, (tree, doc) => {
    const before = Y.encodeStateVector(doc);
    const block = tree.snapshot()[0];
    expect(bodyText([block])).toBe(expected);
    tree.insertText(String(block.collabId), expected.length, addition, "production-baseline");
    return { bytes: Array.from(Y.encodeStateAsUpdate(doc, before)), blockId: block.collabId };
  });
}

export function update(
  page: Page,
  { documentId, viewId }: ContentSession,
  bytes: number[],
  runtime: "local-content" | "collaboration" = "local-content"
) {
  return page.evaluate(
    ({ documentId, bytes, viewId, runtime }) =>
      window.electron.invoke(`${runtime}:update`, documentId, Uint8Array.from(bytes), viewId),
    { documentId, bytes, viewId, runtime }
  );
}

export async function sendOnFreeze(
  page: Page,
  { documentId, viewId }: ContentSession,
  bytes: number[] | null,
  runtime: "local-content" | "collaboration" = "local-content"
) {
  await page.evaluate(
    ({ documentId, viewId, bytes, runtime }) => {
      let sent = false;
      window.electron.on("collaboration:freeze", (_event, value) => {
        const freeze = value as { documentId: string; frozen: boolean; requestId?: string };
        if (sent || !freeze.frozen || !freeze.requestId || freeze.documentId !== documentId) return;
        sent = true;
        // 像编辑器 outbox 一样，增量被主进程接纳后才确认本次冻结。
        const save = bytes
          ? window.electron.invoke(`${runtime}:update`, documentId, Uint8Array.from(bytes), viewId)
          : Promise.resolve();
        void save
          .then(() => window.electron.invoke(`${runtime}:freeze-ack`, viewId, freeze.requestId))
          .catch(error => console.error("冻结期间的正文保存失败", error));
      });
    },
    { documentId, viewId, bytes, runtime }
  );
}

export function persistedNodes(db: DatabaseSync, contentId: number) {
  const row = db.prepare("SELECT content FROM content_snapshots WHERE id=?").get(contentId) as {
    content: string;
  };
  return JSON.parse(row.content) as ContentNode[];
}

export function bodyText(nodes: ContentNode[]) {
  return nodes.map(node => node.children?.map(leaf => leaf.text).join("")).join("\n");
}

export function contentRefCount(db: DatabaseSync, contentId: number) {
  const row = db.prepare("SELECT ref_count FROM contents WHERE id=?").get(contentId) as
    | { ref_count: number }
    | undefined;
  return row?.ref_count ?? null;
}

export function documentHead(db: DatabaseSync, contentId: number) {
  return db
    .prepare("SELECT document_id,revision FROM content_documents WHERE content_id=?")
    .get(contentId);
}

export async function prepareParagraphFixture() {
  const contract = await prepareContentContract("g2.paragraph", {
    type: "paragraph",
    dataVersion: 1,
    kind: "block",
  });
  return (text: string) => ({
    count: 0,
    content: [
      {
        type: "paragraph",
        tauContract: contract.id,
        children: [{ type: "formatted", text }],
      },
    ],
    contracts: { [contract.id]: contract.contract },
  });
}

export async function close(app: ElectronApplication) {
  const exited = new Promise<number | null>(resolve =>
    app.process().once("exit", code => resolve(code))
  );
  await app.evaluate(({ app }) => app.quit());
  expect(await exited).toBe(0);
}

export async function createSandbox(prefix: string) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  await Promise.all([
    mkdir(join(directory, "home/.editor"), { recursive: true }),
    mkdir(join(directory, "temporary"), { recursive: true }),
    mkdir(output, { recursive: true }),
  ]);
  return directory;
}

export async function disposeSandbox(
  directory: string,
  running?: ElectronApplication,
  stopService?: () => Promise<unknown>
) {
  if (running) {
    const process = running.process();
    const exited =
      process.exitCode !== null || process.signalCode !== null
        ? Promise.resolve()
        : new Promise<void>(resolve => process.once("exit", () => resolve()));
    const timer = setTimeout(() => process.kill("SIGKILL"), 10_000);
    try {
      await running.close().catch(() => process.kill("SIGKILL"));
      await exited;
    } finally {
      clearTimeout(timer);
    }
  }
  try {
    await stopService?.();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
