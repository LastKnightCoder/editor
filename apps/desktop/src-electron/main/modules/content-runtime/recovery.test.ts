// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Y from "yjs";
import {
  createNodeDocument,
  NodeTree,
  readNodeDocument,
  type CollaborationSession,
} from "@tau/collaboration";
import { prepareContentContract } from "@tau/db-schema/content-contracts";
import { CollaborationLocalStore } from "../collaboration/local-store";
import { ContentLocalState } from "../collaboration/content-local-state";
import { importLegacyContent, recoverContentDrafts } from "./recovery";
import { prepareContentAgentStore } from "./agent/store";
import agentSchema from "@tau/db-schema/schema/content-agent.sql?raw";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});
function directory() {
  const root = mkdtempSync(join(tmpdir(), "tau-content-recovery-"));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
function store(path: string, filename?: string) {
  const value = new CollaborationLocalStore(path, filename);
  cleanups.push(() => {
    if (value.db.open) value.db.close();
  });
  return value;
}
async function fixture() {
  const identity = { documentId: "local:fixture", baselineId: "baseline", epoch: 0 };
  const { id, contract } = await prepareContentContract("tau.paragraph", {
    type: "paragraph",
    dataVersion: 1,
    kind: "block",
  });
  const doc = await createNodeDocument(
    identity,
    {
      title: "",
      bannerBg: "",
      bannerPosition: "center",
      content: [
        { type: "paragraph", collabId: "p", tauContract: id, children: [{ text: "原文" }] },
      ],
    },
    { [id]: contract }
  );
  cleanups.push(() => doc.destroy());
  const info = {
    id: identity.documentId,
    mode: "local",
    status: "active",
    source: {
      databaseName: "library",
      contentId: 1,
      contentCreatedAt: 1,
      contentDocumentId: "stable",
    },
  } as CollaborationSession;
  return { identity, doc, info, contract: id };
}
function change(doc: Y.Doc, text: string) {
  const tree = new NodeTree(doc);
  try {
    tree.insertText("p", 0, text, "test");
  } finally {
    tree.dispose();
  }
}

it("旧库的未投影增量和待确认草稿独立迁移，重复启动不重复输入", async () => {
  const root = directory();
  const legacy = store(join(root, "collaboration"));
  const local = store(join(root, "local-content"), "content.db");
  const { identity, doc, info, contract } = await fixture();
  legacy.create(info, doc);
  const vector = Y.encodeStateVector(doc);
  change(doc, "耐久");
  legacy.append(info.id, Y.encodeStateAsUpdate(doc, vector));
  change(doc, "待确认");
  new ContentLocalState(legacy.db).saveDocumentDraft(
    { workspaceId: "library", ...identity },
    "view",
    {
      state: Y.encodeStateAsUpdate(doc),
      sequence: 1,
    }
  );
  importLegacyContent(root, local);
  importLegacyContent(root, local);
  legacy.db.close();
  writeFileSync(join(root, "collaboration", "collaboration.db"), "独立故障样本");
  const state = new ContentLocalState(local.db);
  const restored = local.load(info.id).doc;
  cleanups.push(() => restored.destroy());
  await recoverContentDrafts(local, state, info, restored, () => true);
  await recoverContentDrafts(local, state, info, restored, () => true);
  expect(readNodeDocument(restored).content[0]).toMatchObject({
    collabId: "p",
    tauContract: contract,
    children: [{ text: "待确认耐久原文" }],
  });
  expect(state.hasPendingDrafts(info.id)).toBe(false);
  const reopened = local.load(info.id).doc;
  cleanups.push(() => reopened.destroy());
  expect(readNodeDocument(reopened)).toEqual(readNodeDocument(restored));
});

it("恢复写盘失败、换库和失效基线均保留草稿，不覆盖当前正文", async () => {
  const local = store(directory(), "content.db");
  const { identity, doc, info } = await fixture();
  local.create(info, doc);
  const state = new ContentLocalState(local.db);
  change(doc, "未确认");
  state.saveDocumentDraft({ workspaceId: "library", ...identity }, "view", {
    state: Y.encodeStateAsUpdate(doc),
    sequence: 1,
  });
  state.saveDocumentDraft({ workspaceId: "library", ...identity, epoch: 1 }, "other-view", {
    state: Y.encodeStateAsUpdate(doc),
    sequence: 1,
  });
  const reopened = local.load(info.id).doc;
  cleanups.push(() => reopened.destroy());
  const failure = vi.spyOn(local, "append").mockImplementationOnce(() => {
    throw Object.assign(new Error("磁盘写入失败"), { code: "SQLITE_FULL" });
  });
  await expect(recoverContentDrafts(local, state, info, reopened, () => true)).rejects.toThrow(
    "磁盘写入失败"
  );
  expect(state.documentDrafts("library")).toHaveLength(2);
  await recoverContentDrafts(local, state, info, reopened, () => false);
  expect(readNodeDocument(reopened).content[0].children?.[0].text).toBe("原文");
  await recoverContentDrafts(local, state, info, reopened, () => true);
  expect(failure).toHaveBeenCalledTimes(2);
  expect(readNodeDocument(reopened).content[0].children?.[0].text).toBe("未确认原文");
  expect(state.documentDrafts("library").map(draft => draft.viewId)).toEqual(["other-view"]);
});

it("整个旧协作库损坏时保留原文件并能写入独立正文库", async () => {
  const root = directory();
  mkdirSync(join(root, "collaboration"));
  writeFileSync(join(root, "collaboration", "collaboration.db"), "corrupt fixture");
  const local = store(join(root, "local-content"), "content.db");
  const { doc, info } = await fixture();
  expect(() => importLegacyContent(root, local)).not.toThrow();
  local.create(info, doc);
  const loaded = local.load(info.id).doc;
  cleanups.push(() => loaded.destroy());
  expect(readNodeDocument(loaded)).toEqual(readNodeDocument(doc));
});

it("源码草稿只在原字段内容一致时恢复，并保留冲突输入", async () => {
  const local = store(directory(), "content.db");
  const identity = { documentId: "local:source", baselineId: "source", epoch: 0 };
  const { id, contract } = await prepareContentContract("example", {
    type: "example.source",
    dataVersion: 1,
    kind: "block",
    isVoid: true,
    collaboration: { textFields: ["code"] },
  });
  const doc = await createNodeDocument(
    identity,
    {
      title: "",
      bannerBg: "",
      bannerPosition: "center",
      content: [
        {
          type: "example.source",
          collabId: "p",
          tauContract: id,
          code: "原始源码",
          children: [{ text: "" }],
        },
      ],
    },
    { [id]: contract }
  );
  cleanups.push(() => doc.destroy());
  const info = {
    id: identity.documentId,
    mode: "local",
    source: { databaseName: "library", contentId: 1, contentCreatedAt: 1 },
  } as CollaborationSession;
  local.create(info, doc);
  const state = new ContentLocalState(local.db);
  const { saveSourceInput } = await import("./recovery");
  const scope = { workspaceId: "library", ...identity };
  saveSourceInput(local, state, scope, "a", {
    nodeId: "p",
    field: "code",
    value: "完成的输入",
    baseValue: "原始源码",
    revision: "r1",
    sequence: 1,
  });
  saveSourceInput(local, state, scope, "b", {
    nodeId: "p",
    field: "code",
    value: "另一个旧草稿",
    baseValue: "更早版本",
    revision: "r0",
    sequence: 1,
  });
  await recoverContentDrafts(local, state, info, doc, () => true);
  const reopened = local.load(info.id).doc;
  cleanups.push(() => reopened.destroy());
  expect(readNodeDocument(reopened).content[0]).toMatchObject({
    code: "完成的输入",
    tauContract: id,
  });
  expect(state.inputDrafts("library").map(draft => draft.value)).toEqual(["另一个旧草稿"]);
});

it("旧协作库恢复后迁入审阅和权限，保留故障期间已写入的本机记录", () => {
  const root = directory();
  const collaboration = join(root, "collaboration");
  const path = join(collaboration, "collaboration.db");
  mkdirSync(collaboration);
  writeFileSync(path, "独立故障样本");
  const local = store(join(root, "local-content"), "content.db");
  prepareContentAgentStore(root, local);
  expect(local.get("legacy-content-agent-imported", false)).toBe(false);
  local.db.prepare("INSERT INTO content_agent_permissions VALUES ('a',1,'助手','suggest',2)").run();

  const backup = store(join(root, "backup"));
  backup.db.exec(agentSchema);
  backup.db.exec(`
    INSERT INTO content_agent_permissions VALUES ('a',1,'助手','direct',1);
    INSERT INTO content_agent_permissions VALUES ('a',1,'校对','readonly',1);
    INSERT INTO content_suggestions
      (id,workspace_id,content_id,document_id,baseline_id,epoch,proposal_id,conversation_key,
       sequence,edit,before_text,after_text,status,inverse,created_at,updated_at)
    VALUES ('p.0','library',1,'local:fixture','baseline',0,'p','chat',0,'{}','旧文','新文','accepted','{}',1,1);
  `);
  backup.db.close();
  writeFileSync(path, readFileSync(join(root, "backup", "collaboration.db")));
  prepareContentAgentStore(root, local);
  prepareContentAgentStore(root, local);
  expect(
    local.db.prepare("SELECT agent,level FROM content_agent_permissions ORDER BY agent").all()
  ).toEqual([
    { agent: "助手", level: "suggest" },
    { agent: "校对", level: "readonly" },
  ]);
  expect(local.db.prepare("SELECT id,status,inverse FROM content_suggestions").all()).toEqual([
    { id: "p.0", status: "accepted", inverse: "{}" },
  ]);
});
