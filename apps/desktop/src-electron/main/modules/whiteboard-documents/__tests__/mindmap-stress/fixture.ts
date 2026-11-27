import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import Database from "better-sqlite3";
import * as Y from "yjs";
import {
  WhiteboardModel,
  type ContentNode,
  type WhiteboardElementSnapshot,
  type WhiteboardModelCommand,
  type WhiteboardPageSnapshot,
} from "@tau/collaboration";
import { ContentIdentityTable } from "../../../tables/content-identity";
import { WhiteboardDocumentSessions } from "../../sessions";
import { WhiteboardJournal } from "../../journal";
import { agentContracts } from "../../agent";
import { mindmapAgentTools } from "@/services/whiteboard-documents/mindmap-tools";
import {
  mindError,
  type MindPrecondition,
  type MindErrorDetails,
} from "../../../../../../shared/whiteboard-mindmap";
import type { WhiteboardDocumentOpen, WhiteboardDocumentEvent } from "@/types/whiteboard-document";
import type { ToolDefinition } from "@/types/tool";

export type PreparedCall = {
  target: string;
  requestId: string;
  preconditions: MindPrecondition[];
  operations: Record<string, unknown>[];
};
export interface ToolReply {
  ok: boolean;
  ids?: Record<string, string>;
  operationRevision?: number;
  revision?: number;
  projectedRevision?: number;
  nodes?: { id: string; childIds: string[] }[];
  preconditions?: MindPrecondition[];
  next?: Record<string, unknown> | null;
  error?: MindErrorDetails;
}
export interface Actor {
  owner: number;
  active: boolean;
  target: string;
  lease: WhiteboardDocumentOpen;
  doc: Y.Doc;
  model: WhiteboardModel;
  revision: number;
  tools: ToolDefinition[];
}

export const digest = (value: Uint8Array | string) =>
  createHash("sha256").update(value).digest("hex");
export const bodyText = (body: WhiteboardElementSnapshot["body"]): string => {
  const text = (node: ContentNode): string =>
    typeof node.text === "string" ? node.text : (node.children ?? []).map(text).join("");
  return typeof body === "string" ? body : (body ?? []).map(text).join("\n");
};
export const stats = (samples: readonly number[]) => {
  const sorted = [...samples].sort((a, b) => a - b);
  const percentile = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] ?? 0;
  return {
    count: samples.length,
    p50ms: percentile(0.5),
    p95ms: percentile(0.95),
    p99ms: percentile(0.99),
    maxMs: sorted.at(-1) ?? 0,
  };
};

export function inspect(page: WhiteboardPageSnapshot) {
  assert.equal(page.recovery.length, 0, "本轮顺序/在线操作不应产生恢复区元素");
  const nodes = new Map<string, WhiteboardElementSnapshot>();
  const parents = new Map<string, string | null>();
  const roots = new Map<string, WhiteboardElementSnapshot>();
  const sides = new Map<string, string>();
  const visit = (
    node: WhiteboardElementSnapshot,
    parent: WhiteboardElementSnapshot | undefined,
    root: WhiteboardElementSnapshot | undefined,
    side: string,
    depth: number
  ) => {
    assert(!nodes.has(node.id), `节点重复或成环：${node.id}`);
    assert(depth <= 64, `层级越界：${node.id}`);
    nodes.set(node.id, node);
    parents.set(node.id, parent?.id ?? null);
    if (node.type === "mind-node") {
      const ownRoot = parent?.type === "mind-node" && root ? root : node;
      const direction =
        parent?.type !== "mind-node" || parent === ownRoot
          ? String(node.data.direction ?? "right")
          : side;
      roots.set(node.id, ownRoot);
      sides.set(node.id, direction);
      for (const child of node.children) {
        assert.equal(child.type, "mind-node", "测试生成的导图子树应保持原生类型");
        visit(child, node, ownRoot, direction, depth + 1);
      }
    } else for (const child of node.children) visit(child, node, undefined, "right", depth + 1);
  };
  page.children.forEach(node => visit(node, undefined, undefined, "right", 1));
  const boundaries = new Set<string>();
  const range = (value: unknown, parent: WhiteboardElementSnapshot) => {
    assert(
      value && typeof value === "object" && "startId" in value && "endId" in value,
      "区间必须包含两个端点"
    );
    assert.equal(typeof value.startId, "string");
    assert.equal(typeof value.endId, "string");
    const first = nodes.get(String(value.startId)),
      last = nodes.get(String(value.endId));
    assert(first && last, "区间端点不能悬空");
    assert.equal(parents.get(first.id), parent.id);
    assert.equal(parents.get(last.id), parent.id);
    assert(!first.data.summaryRange && !last.data.summaryRange, "区间端点不能是概要");
    const root = roots.get(parent.id);
    if (!root?.data.layout || root.data.layout === "mind")
      assert.equal(sides.get(first.id), sides.get(last.id), "双向布局区间不能跨侧");
    assert(
      parent.children.findIndex(node => node.id === first.id) <=
        parent.children.findIndex(node => node.id === last.id),
      "端点顺序必须随原生顺序归一化"
    );
  };
  for (const node of nodes.values()) {
    if (node.data.summaryRange) {
      const parent = nodes.get(parents.get(node.id) ?? "");
      assert(parent, "概要不能成为独立根");
      range(node.data.summaryRange, parent);
    }
    if (Array.isArray(node.data.boundaries))
      for (const value of node.data.boundaries) {
        assert(value && typeof value === "object" && "id" in value && typeof value.id === "string");
        assert(!boundaries.has(value.id), "复制的外框必须重分配身份");
        boundaries.add(value.id);
        range(value, node);
      }
    if (node.type === "arrow") {
      const source = node.data.source,
        target = node.data.target;
      assert(
        source &&
          typeof source === "object" &&
          "bindId" in source &&
          typeof source.bindId === "string"
      );
      assert(
        target &&
          typeof target === "object" &&
          "bindId" in target &&
          typeof target.bindId === "string"
      );
      assert(nodes.has(source.bindId) && nodes.has(target.bindId), "联系线端点不能悬空");
    }
  }
  return { nodes, parents, roots, sides };
}

export class StressDocument {
  readonly directory = mkdtempSync(join(tmpdir(), "tau-mindmap-stress-"));
  readonly databaseName = "stress";
  readonly documentId = "mindmap-stress";
  readonly roots = ["root-a", "root-b"];
  readonly expectedLabels = new Map<string, string>();
  readonly expectedParents = new Map<string, string | null>();
  readonly samples = { read: [] as number[], write: [] as number[], replay: [] as number[] };
  readonly actors = new Map<number, Actor>();
  readonly events: { count: number; bytes: number } = { count: 0, bytes: 0 };
  db!: Database.Database;
  journal!: WhiteboardJournal;
  sessions!: WhiteboardDocumentSessions;
  pageId = "page-a";
  contentId = 0;
  noteId = 0;
  private sequence = 0;

  private constructor(private readonly repositoryRoot: string) {}

  static async create(
    repositoryRoot: string,
    options: { elements?: number; mindNodes?: number; relations?: number; fillerText?: number } = {}
  ) {
    const f = new StressDocument(repositoryRoot);
    try {
      f.openDatabase(true);
      f.noteId = Number(
        f.db.prepare("INSERT INTO contents(content,create_time,update_time) VALUES('[]',1,1)").run()
          .lastInsertRowid
      );
      const { builtins, paragraph } = await agentContracts();
      const doc = new Y.Doc({ gc: false });
      const model = new WhiteboardModel(doc);
      try {
        model.submit([{ type: "create_page", id: f.pageId, title: "压力画布" }], null);
        const total = options.elements ?? 42;
        const mindNodes = options.mindNodes ?? Math.min(Math.floor(total * 0.75), 716);
        const relations =
          options.relations ?? Math.min(Math.floor(total * 0.1), Math.max(0, 992 - mindNodes));
        assert(mindNodes >= 2 && total >= mindNodes + relations);
        const commands: WhiteboardModelCommand[] = [];
        for (let i = 0; i < mindNodes; i++) {
          const id = i < 2 ? f.roots[i] : `node-${i}`;
          const parent = i < 2 ? null : f.roots[i % 2];
          const label = `正文-${i}`;
          commands.push({
            type: "create",
            id,
            contractId: builtins.types["mind-node"].contractId,
            parent: parent ? { kind: "element", id: parent } : { kind: "page", id: f.pageId },
            geometry: { x: i < 2 ? i * 800 : 0, y: 200, width: 90, height: 52, rotation: 0 },
            data: {
              direction: i < 2 ? "right" : i % 4 < 2 ? "left" : "right",
              isLeftFold: false,
              isRightFold: false,
            },
            body: [{ type: "paragraph", tauContract: paragraph.id, children: [{ text: label }] }],
          });
          f.expectedLabels.set(id, label);
          f.expectedParents.set(id, parent);
        }
        for (let i = 0; i < relations; i++) {
          const id = `relation-${i}`;
          commands.push({
            type: "create",
            id,
            contractId: builtins.types.arrow.contractId,
            parent: { kind: "page", id: f.pageId },
            geometry: { x: 0, y: 0, width: 200, height: 40, rotation: 0 },
            data: {
              lineType: "curve",
              lineWidth: 1.6,
              dashed: true,
              source: {
                bindId: `node-${2 + (i % (mindNodes - 2))}`,
                connectId: "center",
                marker: "none",
              },
              target: { bindId: f.roots[1], connectId: "center", marker: "open-arrow" },
              points: [
                { x: 0, y: 0 },
                { x: 200, y: 40 },
              ],
            },
            body: [
              { type: "paragraph", tauContract: paragraph.id, children: [{ text: `关系-${i}` }] },
            ],
          });
          f.expectedLabels.set(id, `关系-${i}`);
          f.expectedParents.set(id, null);
        }
        for (let i = mindNodes + relations; i < total; i++) {
          const id = `frame-${i}`;
          commands.push({
            type: "create",
            id,
            contractId: builtins.types.frame.contractId,
            parent: { kind: "page", id: f.pageId },
            geometry: { x: i * 220, y: 1200, width: 200, height: 100, rotation: 0 },
            data: { title: options.fillerText ? "x".repeat(options.fillerText) : "" },
          });
          f.expectedParents.set(id, null);
        }
        model.submitChunks(commands, null, [...builtins.prepared, paragraph]);
        const created = await f.sessions.create(
          f.databaseName,
          f.documentId,
          Y.encodeStateAsUpdate(doc),
          "board"
        );
        f.contentId = created.contentIds[0];
      } finally {
        model.dispose();
        doc.destroy();
      }
      await f.openActors();
      f.checkLedger();
      return f;
    } catch (error) {
      f.dispose();
      throw error;
    }
  }

  private openDatabase(create: boolean) {
    this.db = new Database(join(this.directory, "main.db"));
    if (create) {
      this.db.exec(
        readFileSync(join(this.repositoryRoot, "packages/db-schema/schema/main.sql"), "utf8")
      );
      ContentIdentityTable.establishBaseline(this.db);
    }
    this.journal = new WhiteboardJournal(join(this.directory, "journal.db"));
    this.sessions = new WhiteboardDocumentSessions(
      this.journal,
      () => this.db,
      (owner, event) => this.receive(owner, event)
    );
  }

  private receive(owner: number, event: WhiteboardDocumentEvent) {
    const actor = this.actors.get(owner);
    if (!actor?.active) return;
    if (event.update) {
      Y.applyUpdate(actor.doc, event.update, "main");
      this.events.bytes += event.update.byteLength;
    }
    actor.revision = event.revision;
    this.events.count++;
  }

  private async openActors() {
    for (let owner = 1; owner <= 3; owner++) {
      const lease = await this.sessions.open(
        this.databaseName,
        this.contentId,
        owner,
        `stress-view-${owner}`
      );
      const doc = new Y.Doc({ gc: false });
      Y.applyUpdate(doc, lease.state);
      const actor: Actor = {
        owner,
        active: true,
        target: crypto.randomUUID(),
        lease,
        doc,
        model: new WhiteboardModel(doc),
        revision: lease.revision,
        tools: [],
      };
      this.actors.set(owner, actor);
      actor.tools = mindmapAgentTools({
        check: () => {
          if (!actor.active)
            mindError("TARGET_EXPIRED", "压力夹具的原视图已释放", {
              retry: "refresh_context",
              suggestion: "重新获取本轮工具和目标。",
            });
        },
        target: args => {
          if (args.target !== actor.target)
            mindError("TARGET_EXPIRED", "目标句柄不属于该视图", {
              retry: "refresh_context",
              suggestion: "重新获取当前目标句柄。",
            });
        },
        page: () => actor.model.read().pages[0],
        model: actor.model,
        selected: () => [],
        revision: () => actor.revision,
        flush: async () => undefined,
        show: () => undefined,
        write: async args => {
          const receipt = await this.sessions.applyAgent(actor.lease.leaseId, owner, {
            domain: "mindmap",
            owner: `stress-agent-${owner}`,
            pageId: this.pageId,
            requestId: String(args.requestId),
            operations: args.operations as Record<string, unknown>[],
            preconditions: args.preconditions as MindPrecondition[],
          });
          if (receipt.error || receipt.projectedRevision < receipt.operationRevision)
            mindError("PROJECTION_PENDING", "已保存，但本机投影待恢复", {
              commitStatus: "saved",
              retry: "same_request",
              actual: receipt,
              suggestion: "保持原请求不变重试。",
            });
          return {
            content: JSON.stringify({
              ...receipt,
              revision: receipt.operationRevision,
              localSaved: true,
            }),
          };
        },
      });
    }
  }

  actor(owner = 1) {
    const actor = this.actors.get(owner);
    assert(actor, "缺少活动视图");
    return actor;
  }
  page(owner = 1) {
    return this.actor(owner).model.read().pages[0];
  }
  stateHash() {
    return digest(this.sessions.snapshot(this.actor().lease.leaseId, 1).state);
  }
  bytes() {
    return this.sessions.snapshot(this.actor().lease.leaseId, 1).state.byteLength;
  }

  async call(name: string, args: Record<string, unknown>, owner = 1): Promise<ToolReply> {
    const actor = this.actor(owner),
      tool = actor.tools.find(tool => tool.name === name);
    assert(tool);
    const result = await tool.executor({ target: actor.target, ...args });
    assert(result && typeof result !== "string");
    const value: ToolReply = JSON.parse(result.content);
    if (value.ok === false) {
      assert.equal(result.isParameterError, true, "错误标记不能丢失");
      assert(
        value.error?.code &&
          value.error.suggestion &&
          value.error.retry &&
          value.error.commitStatus,
        "错误必须可用于模型修正或安全重试"
      );
    }
    return value;
  }

  async prepare(
    operations: Record<string, unknown>[],
    ids: string[],
    owner = 1,
    requestId?: string
  ): Promise<PreparedCall> {
    const conditions = new Map<string, MindPrecondition>();
    const started = performance.now();
    for (const id of new Set(ids)) {
      const read = await this.call(
        "read_whiteboard_mindmap",
        { nodeId: id, depth: 0, limit: 1 },
        owner
      );
      assert.equal(read.ok, true, JSON.stringify(read.error));
      for (const condition of read.preconditions ?? []) conditions.set(condition.id, condition);
    }
    this.samples.read.push(performance.now() - started);
    return {
      target: this.actor(owner).target,
      requestId: requestId ?? `stress-${owner}-${++this.sequence}`,
      preconditions: [...conditions.values()],
      operations,
    };
  }

  async submit(args: PreparedCall, owner = 1, replay = false) {
    const started = performance.now();
    const result = await this.call("apply_whiteboard_mindmap_operations", args, owner);
    this.samples[replay ? "replay" : "write"].push(performance.now() - started);
    return result;
  }

  async write(operations: Record<string, unknown>[], ids = this.roots, owner = 1) {
    const args = await this.prepare(operations, ids, owner);
    const result = await this.submit(args, owner);
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert(result.ids);
    return { args, result, ids: result.ids };
  }

  async humanTitle(text: string) {
    const actor = this.actor(3),
      updates: Uint8Array[] = [];
    const listen = (update: Uint8Array) => updates.push(update);
    actor.doc.on("update", listen);
    try {
      actor.model.submit(
        [{ type: "edit_page_title", id: this.pageId, edit: { offset: 0, remove: 0, text } }],
        "human"
      );
    } finally {
      actor.doc.off("update", listen);
    }
    const receipt = await this.sessions.append(
      actor.lease.leaseId,
      3,
      `human-${++this.sequence}`,
      Y.mergeUpdates(updates),
      "renderer"
    );
    assert(!receipt.error, receipt.error);
  }

  checkLedger() {
    for (const actor of this.actors.values()) {
      const actual = inspect(actor.model.read().pages[0]);
      assert.deepEqual(
        new Set(actual.nodes.keys()),
        new Set(this.expectedParents.keys()),
        "节点集合与独立意图账本不符"
      );
      for (const [id, parent] of this.expectedParents)
        assert.equal(actual.parents.get(id), parent, `父子关系改变：${id}`);
      for (const [id, label] of this.expectedLabels)
        assert.equal(bodyText(actual.nodes.get(id)?.body), label, `正文丢失或被覆盖：${id}`);
    }
  }

  checkDisk() {
    const row = this.db
      .prepare("SELECT snapshot FROM whiteboard_documents WHERE document_id=?")
      .get(this.documentId) as { snapshot: string };
    assert(row);
    const page = (JSON.parse(row.snapshot) as { pages: WhiteboardPageSnapshot[] }).pages[0];
    const actual = inspect(page);
    assert.deepEqual(
      new Set(actual.nodes.keys()),
      new Set(this.expectedParents.keys()),
      "磁盘投影不完整"
    );
    for (const [id, label] of this.expectedLabels)
      assert.equal(bodyText(actual.nodes.get(id)?.body), label, `磁盘正文不符：${id}`);
  }

  stopSessions() {
    this.sessions.dispose();
    for (const actor of this.actors.values()) {
      actor.active = false;
      actor.model.dispose();
      actor.doc.destroy();
    }
    this.actors.clear();
  }

  async restart() {
    this.stopSessions();
    this.journal.close();
    this.db.close();
    this.openDatabase(false);
    await this.openActors();
  }

  dispose() {
    if (this.sessions) this.stopSessions();
    if (this.journal?.db.open) this.journal.close();
    if (this.db?.open) this.db.close();
    assert(resolve(this.directory).startsWith(resolve(tmpdir()) + sep), "只清理本轮测试临时目录");
    rmSync(this.directory, { recursive: true, force: true });
  }
}
