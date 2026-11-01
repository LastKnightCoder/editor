import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Descendant } from "slate";
import * as Y from "yjs";
import { createNodeDocument } from "@tau/collaboration";
import { prepareDeviceDocument } from "@tau/collaboration/src/device-sync/documents";
import { DeviceSyncEngine } from "@tau/collaboration/src/device-sync/engine";
import { prepareContentContract } from "@tau/db-schema/content-contracts";
import { useEditContent } from "../useEditContent";
import { updateContent } from "../../services/tauri";
import {
  beginDeviceReplacement,
  nativeDeviceStorage,
  setDeviceSyncDatabase,
} from "../../services/device-sync/native";
import { captureContentWriteContext } from "../../services/content-write-context";

const bridge = vi.hoisted(() => ({ invoke: undefined as any }));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => bridge.invoke(...args),
  convertFileSrc: (path: string) => path,
}));
vi.mock("../../app/plugins/content", async () => {
  const { createContentMetrics } = await import("@tau/db-schema/content-metrics");
  return { mobileContentMetrics: createContentMetrics([]), mobileContentPlugins: [] };
});

const binary = resolve("src-tauri/target/debug/device-sync-peer");
const directories: string[] = [];
let root: Root | undefined;
const quote = (value: unknown) => `'${String(value).replaceAll("'", "''")}'`;
function native(file: string, action: string, payload: unknown = {}) {
  return JSON.parse(
    execFileSync(binary, [file, action], {
      input: JSON.stringify(payload),
      encoding: "utf8",
      maxBuffer: 128 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    })
  );
}
async function fixture(durable: boolean) {
  const directory = mkdtempSync(join(tmpdir(), "tau-p1-native-"));
  directories.push(directory);
  const file = join(directory, "mobile.db"),
    name = basename(file);
  const node = randomUUID(),
    library = randomUUID(),
    head = randomUUID();
  const state = {
    library,
    schema: "p1",
    node,
    authority: node,
    epoch: randomUUID(),
    head,
    ackHead: head,
    ackSeq: 0,
    revision: 0,
    enabled: true,
  };
  native(file, "init", state);
  const contract = await prepareContentContract("tau.editor", {
    type: "paragraph",
    dataVersion: 1,
    kind: "block",
  });
  const identity = { documentId: randomUUID(), baselineId: randomUUID(), epoch: 0 };
  const doc = await createNodeDocument(
    identity,
    {
      title: "",
      bannerBg: "",
      bannerPosition: "center",
      content: [
        {
          type: "paragraph",
          collabId: "p1",
          tauContract: contract.id,
          children: [{ text: "远端基线" }],
        },
      ],
    },
    { [contract.id]: contract.contract }
  );
  const document = await prepareDeviceDocument({
    contentId: 1,
    ...identity,
    state: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64"),
    paths: {},
    updatedAt: 1000,
  });
  doc.destroy();
  native(file, "sql", {
    sql: `
    INSERT INTO library_identity VALUES(1,${quote(library)},${quote(node)},NULL,1000);
    INSERT INTO contents(id,create_time,update_time,content,count,ref_count) VALUES(1,1000,1000,${quote(JSON.stringify(document.projection.content))},4,1);
    INSERT INTO content_documents(content_id,document_id,format_version,contracts,revision) VALUES(1,${quote(identity.documentId)},2,${quote(JSON.stringify(document.projection.contracts))},'same-revision');
    INSERT INTO cards(id,create_time,update_time,content_id) VALUES(1,1000,1000,1);`,
  });
  native(file, "save", { document, expectedGeneration: "" });
  const run = (action: string, payload: unknown = {}) => native(file, action, payload);
  const read = () =>
    JSON.parse(
      run("query", {
        sql: `SELECT json_object('contentId',c.id,'createTime',c.create_time,'updateTime',c.update_time,'count',c.count,'content',json(c.content),'contracts',json(d.contracts),'revision',d.revision,'documentId',d.document_id,'librarySourceId',l.source_id) FROM contents c JOIN content_documents d ON d.content_id=c.id CROSS JOIN library_identity l WHERE c.id=1`,
      })[0]
    );
  let fail = false,
    saves = 0;
  bridge.invoke = async (command: string, args: any) => {
    if (command === "get_content_detail") return read();
    if (command === "update_content") {
      saves++;
      if (fail) throw new Error("SQLITE_FULL: 定向模拟保存失败");
      run("json-save", args.payload);
      return read();
    }
    if (command !== "device_sync_store") throw new Error(`未处理 ${command}`);
    if (args.action === "intents") return [];
    if (args.action === "document")
      return run("documents", { ids: [args.payload.contentId] })[0] ?? null;
    if (args.action === "save-document") {
      saves++;
      if (fail) throw new Error("SQLITE_FULL: 定向模拟保存失败");
      return run("save", args.payload);
    }
    return run(args.action, args.payload);
  };
  setDeviceSyncDatabase(name);
  const baseline = run("read", { snapshot: true });
  const withoutCheckpoint = () => {
    if (!durable) run("sql", { sql: "DELETE FROM _tau_device_documents;" });
  };
  withoutCheckpoint();
  const replace = async (failure = false) => {
    const finish = beginDeviceReplacement(name);
    try {
      if (failure) throw new Error("定向模拟下载失败");
      await new DeviceSyncEngine(nativeDeviceStorage(name)).replace({
        protocol: 2,
        kind: "snapshot",
        state: baseline.state,
        changes: [],
        documents: baseline.snapshot.documents,
        snapshot: baseline.snapshot,
      });
      withoutCheckpoint();
    } finally {
      finish();
    }
  };
  const changed = (text: string) => {
    const content = structuredClone(read().content);
    content[0].children[0].text = text;
    return content as Descendant[];
  };
  return {
    run,
    read,
    replace,
    changed,
    name,
    setFail: (value: boolean) => {
      fail = value;
    },
    saves: () => saves,
  };
}
afterEach(async () => {
  vi.useRealTimers();
  if (root) await act(async () => root!.unmount());
  root = undefined;
  setDeviceSyncDatabase("");
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe.skipIf(process.env.TAU_DEVICE_SYNC_NATIVE !== "1")(
  "覆盖边界：真实 hook、生产 JSON 路径与 Rust SQLite",
  () => {
    for (const durable of [false, true]) {
      it(`${durable ? "有" : "无"}耐久正文：旧节流、队列、失败重试失效，新会话继续保存`, async () => {
        const f = await fixture(durable);
        let editing!: ReturnType<typeof useEditContent>;
        let beforeSave: (() => Promise<void>) | undefined;
        function Harness() {
          editing = useEditContent(1, {
            transport: { load: async () => f.read(), save: updateContent },
            wait: 500,
            beforeSave: () => beforeSave?.() ?? Promise.resolve(),
          });
          return null;
        }
        root = createRoot(document.createElement("div"));
        await act(async () => root!.render(<Harness />));
        await vi.waitFor(() => expect(editing.loading).toBe(false));
        const revision = f.read().revision;
        vi.useFakeTimers();
        await act(async () => {
          editing.handleEditorContentChange(f.changed("应丢弃的节流输入"));
          await f.replace();
        });
        expect(f.read().revision).toBe(revision);
        await act(async () => {
          await vi.advanceTimersByTimeAsync(600);
        });
        expect(f.saves()).toBe(0);
        expect(JSON.stringify(f.read().content)).not.toContain("应丢弃");
        vi.useRealTimers();

        let release!: () => void,
          entered = false;
        beforeSave = () => {
          entered = true;
          return new Promise<void>(resolve => {
            release = resolve;
          });
        };
        let first!: Promise<boolean>, second!: Promise<boolean>;
        await act(async () => {
          editing.handleEditorContentChange(f.changed("应丢弃的排队一"));
          first = editing.flushNow();
          await Promise.resolve();
        });
        expect(entered).toBe(true);
        await act(async () => {
          editing.handleEditorContentChange(f.changed("应丢弃的排队二"));
          second = editing.flushNow();
          await f.replace();
        });
        beforeSave = undefined;
        await act(async () => {
          release();
          expect(await first).toBe(false);
          expect(await second).toBe(false);
        });
        expect(f.saves()).toBe(0);

        f.setFail(true);
        await act(async () => {
          editing.handleEditorContentChange(f.changed("应丢弃的失败重试"));
          expect(await editing.flushNow()).toBe(false);
        });
        expect(editing.error).toContain("自动保存失败");
        f.setFail(false);
        await act(async () => {
          await f.replace();
        });
        const savedBeforeRetry = f.saves();
        await act(async () => {
          await editing.retryLastFailed();
        });
        expect(f.saves()).toBe(savedBeforeRetry);
        expect(JSON.stringify(f.read().content)).not.toContain("应丢弃");

        await act(async () => {
          editing.handleEditorContentChange(f.changed("新会话可保存"));
          expect(await editing.flushNow()).toBe(true);
        });
        expect(JSON.stringify(f.read().content)).toContain("新会话可保存");
        await act(async () => {
          await expect(f.replace(true)).rejects.toThrow("下载失败");
        });
        await act(async () => {
          editing.handleEditorContentChange(f.changed("覆盖失败后可保存"));
          expect(await editing.flushNow()).toBe(true);
        });
        expect(JSON.stringify(f.read().content)).toContain("覆盖失败后可保存");
      });
    }

    it.each([false, true])(
      "耐久正文=%s：原生最终事务拒绝旧 generation；其他库覆盖不废弃当前库任务",
      async durable => {
        const f = await fixture(durable);
        const context = await captureContentWriteContext();
        const oldDocument = durable
          ? await prepareDeviceDocument(f.run("documents", { ids: [1] })[0])
          : null;
        const payload = {
          contentId: 1,
          content: f.changed("旧原生任务"),
          count: 4,
          contracts: f.read().contracts,
          expectedRevision: f.read().revision,
          expectedGeneration: context.generation,
          expectedDatabaseName: f.name,
        };
        await f.replace();
        expect(() => f.run("json-save", payload)).toThrow(/DEVICE_SYNC_REPLACED/);
        if (oldDocument)
          expect(() =>
            f.run("save", { document: oldDocument, expectedGeneration: context.generation })
          ).toThrow(/DEVICE_SYNC_REPLACED/);
        const current = await captureContentWriteContext();
        const finishOther = beginDeviceReplacement("another.db");
        finishOther();
        await updateContent({
          contentId: 1,
          content: f.changed("本库仍可保存"),
          count: 4,
          contracts: f.read().contracts,
          expectedRevision: f.read().revision,
          expectedDocumentId: f.read().documentId,
          expectedSourceId: f.read().librarySourceId,
          writeContext: current,
        });
        expect(JSON.stringify(f.read().content)).toContain("本库仍可保存");
      }
    );

    it("同一版本的普通刷新仍保留未发出的本地输入及原始保存上下文", async () => {
      const f = await fixture(false);
      let editing!: ReturnType<typeof useEditContent>;
      function Harness({ refreshKey }: { refreshKey: number }) {
        editing = useEditContent(1, {
          transport: { load: async () => f.read(), save: updateContent },
          wait: 500,
          refreshKey,
        });
        return null;
      }
      root = createRoot(document.createElement("div"));
      await act(async () => root!.render(<Harness refreshKey={1} />));
      await act(async () => {
        editing.handleEditorContentChange(f.changed("普通刷新保留输入"));
      });
      await act(async () => root!.render(<Harness refreshKey={2} />));
      expect(editing.error).toContain("本机输入仍保留");
      await act(async () => {
        expect(await editing.flushNow()).toBe(true);
      });
      expect(JSON.stringify(f.read().content)).toContain("普通刷新保留输入");
    });

    it("版本表独立恢复后，旧上下文被拒绝，新会话继续保存健康正文", async () => {
      const f = await fixture(true);
      const context = await captureContentWriteContext();
      const before = f.read();
      f.run("sql", {
        sql: "ALTER TABLE _tau_device_local RENAME COLUMN generation TO broken_generation",
      });
      f.run("open");
      const current = await captureContentWriteContext();
      expect(current.generation).not.toBe(context.generation);
      expect(f.read()).toEqual(before);
      const payload = {
        contentId: 1,
        content: f.changed("恢复前旧任务"),
        count: 4,
        contracts: before.contracts,
        expectedRevision: before.revision,
        expectedDocumentId: before.documentId,
        expectedSourceId: before.librarySourceId,
      };
      await expect(updateContent({ ...payload, writeContext: context })).rejects.toThrow(
        /DEVICE_SYNC_REPLACED/
      );
      expect(f.read()).toEqual(before);
      await updateContent({
        ...payload,
        content: f.changed("恢复后新会话"),
        writeContext: current,
      });
      expect(JSON.stringify(f.read().content)).toContain("恢复后新会话");
      expect(JSON.stringify(f.read().content)).not.toContain("恢复前旧任务");
    });
  }
);
