// @vitest-environment node
/** 逐条建议的状态迁移：两个视图并发处理时先到先得，一条过期不拖累其他条，撤销按倒序。 */
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import schema from "@tau/db-schema/schema/content-agent.sql?raw";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  captureScopedTextEdit,
  NodeTree,
  type ScopedContentEdit,
  type ScopedContentSubmission,
} from "@tau/collaboration";
import { createTestDocument } from "@tau/collaboration/src/testing/node-document";
import type { ContentSuggestionBatch } from "@/types/content-suggestion";

vi.mock("../../database-notifications", () => ({ broadcastDatabaseChange: vi.fn() }));
const { ContentSuggestionStore } = await import("../../content-runtime/agent/content-suggestions");
const { ContentSuggestionService } = await import("../../content-runtime/agent/suggestion-service");

const edit = (id: string): ScopedContentEdit => ({
  kind: "text",
  id,
  blockId: "b1",
  start: "{}",
  end: "{}",
  expected: [{ text: id, marks: {} }],
  text: `${id}!`,
});
const batch = (proposalId: string, ids: string[]): ContentSuggestionBatch => ({
  proposalId,
  conversationKey: "chat",
  agentLabel: "校对",
  baseline: { documentId: "doc", baselineId: "base", epoch: 1 },
  items: ids.map(id => ({ edit: edit(id), beforeText: id, afterText: `${id}!` })),
});

let db: Database.Database;
let main: Database.Database;
let directory: string;
let calls: ScopedContentSubmission[];
let apply: (request: ScopedContentSubmission) => Promise<unknown>;
let service: InstanceType<typeof ContentSuggestionService>;

beforeEach(() => {
  db = new Database(":memory:");
  db.exec(schema);
  // 服务按主库文件名区分资料库
  directory = mkdtempSync(join(tmpdir(), "tau-suggestions-"));
  main = new Database(join(directory, "library.db"));
  calls = [];
  apply = async request => ({
    status: "committed",
    inverse: { edits: [{ ...request.scope.edits[0], id: `${request.scope.edits[0].id}-inv` }] },
  });
  service = new ContentSuggestionService(
    new ContentSuggestionStore(db),
    async (_db, _id, request) => {
      calls.push(request);
      return apply(request) as never;
    }
  );
});

afterEach(() => {
  main.close();
  db.close();
  rmSync(directory, { recursive: true, force: true });
});

it("按条接受：一条原文已变只让这一条过期", async () => {
  const [a, b] = service.create(main, 7, batch("p1", ["a", "b"]));
  apply = async request =>
    request.scope.edits[0].id === "b"
      ? { status: "conflict", conflicts: [{ opId: "b" }] }
      : { status: "committed", inverse: { edits: [edit("a-inv")] } };
  const outcomes = await service.accept(main, 7, [a.id, b.id]);
  expect(outcomes.map(o => o.status)).toEqual(["accepted", "expired"]);
  const listed = service.list(main, { proposalId: "p1" });
  expect(listed.map(item => item.status)).toEqual(["accepted", "expired"]);
  expect(listed[0].applied?.id).toBe("a-inv");
  // 每条用自己的操作身份提交，重送时复用原回执
  expect(calls.map(call => call.operationId)).toEqual([a.id, b.id]);
});

it("两个视图同时处理：先退回的生效，后到的接受不再提交", async () => {
  const [a] = service.create(main, 7, batch("p1", ["a"]));
  expect(service.reject(main, 7, [a.id], "保留原句")).toEqual([a.id]);
  expect(await service.accept(main, 7, [a.id])).toEqual([]);
  expect(calls).toHaveLength(0);
  expect(service.list(main, { proposalId: "p1" })[0]).toMatchObject({
    status: "rejected",
    feedback: "保留原句",
  });
});

it("提交结果未确认时保持 applying，可按原身份重送", async () => {
  const [a] = service.create(main, 7, batch("p1", ["a"]));
  apply = async () => ({ status: "pending" });
  expect((await service.accept(main, 7, [a.id]))[0].status).toBe("applying");
  expect(service.reject(main, 7, [a.id])).toEqual([]);
  apply = async request => ({ status: "committed", inverse: { edits: [request.scope.edits[0]] } });
  expect((await service.accept(main, 7, [a.id]))[0].status).toBe("accepted");
  expect(calls.map(call => call.operationId)).toEqual([a.id, a.id]);
});

it("同一对话的新提案替换旧的待处理建议，正文只列出当前的", () => {
  service.create(main, 7, batch("p1", ["a"]));
  service.create(main, 7, batch("p2", ["b"]));
  expect(service.list(main, { proposalId: "p1" })[0].status).toBe("superseded");
  expect(service.list(main, { contentId: 7 }).map(item => item.proposalId)).toEqual(["p2"]);
});

it("按建议 ID 定位历史改动，严格限定原资料库与正文", async () => {
  const [item] = service.create(main, 7, batch("history", ["a"]));
  await service.accept(main, 7, [item.id]);
  db.prepare("UPDATE content_suggestions SET updated_at=? WHERE id=?").run(
    Date.now() - 2 * 24 * 60 * 60 * 1000,
    item.id
  );
  expect(service.list(main, { contentId: 7 })).toEqual([]);
  const query = { contentId: 7, suggestionId: item.id };
  expect(service.list(main, query)).toMatchObject([{ id: item.id, status: "accepted" }]);
  expect(service.list(main, { ...query, contentId: 8 })).toEqual([]);
  expect(new ContentSuggestionStore(db).list("other-library", query)).toEqual([]);
});

it("撤销按倒序提交逆操作，冲突的条目保持已接受", async () => {
  const [a, b] = service.create(main, 7, batch("p1", ["a", "b"]));
  await service.accept(main, 7, [a.id, b.id]);
  calls = [];
  apply = async request =>
    request.operationId === `${a.id}-undo`
      ? { status: "conflict", conflicts: [{ opId: "a" }] }
      : { status: "committed" };
  const outcomes = await service.undo(main, 7, [a.id, b.id]);
  expect(calls.map(call => call.operationId)).toEqual([`${b.id}-undo`, `${a.id}-undo`]);
  expect(outcomes.map(o => o.status)).toEqual(["undone", "accepted"]);
  expect(service.list(main, { proposalId: "p1" }).map(item => item.status)).toEqual([
    "accepted",
    "undone",
  ]);
});

it("按当前正文校验：原文被改的待处理建议过期，其余照常；正文换代后旧建议全部过期", async () => {
  const document = (baselineId: string, epoch: number) =>
    createTestDocument(
      {
        title: "离线优先",
        bannerBg: "",
        bannerPosition: "center",
        content: [
          { type: "paragraph", collabId: "p1", children: [{ text: "任何顺序合并" }] },
          { type: "paragraph", collabId: "p2", children: [{ text: "到 2025 年才支持" }] },
        ],
      },
      { documentId: "doc", baselineId, epoch }
    );
  const current = await document("base", 1);
  const tree = new NodeTree(current);
  try {
    service.create(main, 7, {
      ...batch("p1", []),
      items: [
        {
          edit: captureScopedTextEdit(tree, "keep", "p1", 0, 4, "以任意顺序"),
          beforeText: "任何顺序",
          afterText: "以任意顺序",
        },
        {
          edit: captureScopedTextEdit(tree, "stale", "p2", 0, 6, "在 2025 年 8 月"),
          beforeText: "到 2025",
          afterText: "在 2025 年 8 月",
        },
      ],
    });
    // 用户在第二条建议的原文里加了字，第一条不受影响
    tree.insertText("p2", 1, "中", null);
    service.validate("library", 7, current);
    expect(service.list(main, { proposalId: "p1" }).map(item => item.status)).toEqual([
      "pending",
      "expired",
    ]);
    service.validate("library", 7, await document("next", 2));
    expect(service.list(main, { proposalId: "p1" }).map(item => item.status)).toEqual([
      "expired",
      "expired",
    ]);
  } finally {
    tree.dispose();
  }
});

it("原文发生变化时过期锚定提问，迟到的回答不能接到旧问题", async () => {
  const doc = await createTestDocument(
    {
      title: "",
      bannerBg: "",
      bannerPosition: "center",
      content: [{ type: "paragraph", collabId: "p1", children: [{ text: "原句后文" }] }],
    },
    batch("p", []).baseline
  );
  const tree = new NodeTree(doc);
  try {
    const question = service.createQuestion(main, 7, {
      proposalId: "q",
      conversationKey: "chat",
      baseline: batch("q", []).baseline,
      anchor: captureScopedTextEdit(tree, "q", "p1", 0, 2, "原句"),
      quote: "原句",
      question: "要保留这句话吗？",
      options: [],
    });
    tree.insertText("p1", 1, "新", null);
    service.validate("library", 7, doc);
    expect(service.list(main, { proposalId: "q" })[0].status).toBe("expired");
    expect(service.answer(main, 7, question.id, "保留")).toBe(false);
  } finally {
    tree.dispose();
    doc.destroy();
  }
});
