/**
 * Agent 在正文上的在场中枢：每个 Agent（按职责名）在每篇正文上有一个独立的 awareness 客户端，
 * 写入身份、光标与当前动作，只转发给本机打开这篇正文的视图（不进共享服务器：服务器会把它改写成
 * 本机设备身份）。不落库；Agent 一轮结束、会话释放或长时间没有更新时清除。
 */

import * as Y from "yjs";
import { Awareness, encodeAwarenessUpdate } from "y-protocols/awareness";
import { NodeTree } from "@tau/collaboration";
import { agentIdentity, type AgentIdentity } from "@/services/agent-identity";
import type {
  AgentAwarenessState,
  AgentPresence,
  AgentPresenceUpdate,
} from "@/types/agent-presence";
import { onAgentRunEnded } from "../agent-run-events";

/** 兜底：异常退出的 Agent 不会发结束通知，久无更新就清掉 */
const PRESENCE_TTL_MS = 10 * 60 * 1000;
const ACTION_LIMIT = 80;

interface Entry {
  identity: AgentIdentity;
  owner: string;
  awareness: Awareness;
  presence: AgentPresence;
  timer?: ReturnType<typeof setTimeout>;
}

export interface AgentPresenceDeps {
  /** 这篇正文当前的主进程文档（打开着才有）；光标锚点要在它上面换算 */
  doc(workspaceId: string, contentId: number): { documentId: string; doc: Y.Doc } | undefined;
  broadcastAwareness(documentId: string, update: Uint8Array): void;
  changed(workspaceId: string, contentId: number): void;
}

const keyOf = (workspaceId: string, contentId: number) => `${workspaceId}:${contentId}`;

/** 范围编辑锚点（JSON 相对位置）→ 光标层使用的节点树选区（base64 相对位置）；解析不到返回 null */
function caretSelection(doc: Y.Doc, owner: string, position: string) {
  const tree = new NodeTree(doc);
  try {
    const relative = Y.createRelativePositionFromJSON(JSON.parse(position));
    if (!tree.resolvePosition(relative)) return null;
    const encoded = Buffer.from(Y.encodeRelativePosition(relative)).toString("base64");
    return { owner, range: { rootId: tree.rootId, anchor: encoded, focus: encoded } };
  } catch {
    return null;
  } finally {
    tree.dispose();
  }
}

export class AgentPresenceHub {
  private readonly entries = new Map<string, Map<string, Entry>>();
  private readonly stopListening: () => void;

  constructor(private readonly deps: AgentPresenceDeps) {
    this.stopListening = onAgentRunEnded(scope => this.clearScope(scope));
  }

  set(workspaceId: string, contentId: number, update: AgentPresenceUpdate) {
    const key = keyOf(workspaceId, contentId);
    const identity = agentIdentity(update.agent);
    const entries = this.entries.get(key) ?? new Map<string, Entry>();
    this.entries.set(key, entries);
    let entry = entries.get(identity.id);
    if (!entry) {
      // 独立的 Y.Doc 只为取得一个客户端 ID；本地状态由 Awareness 每 15 秒自动续期
      const awareness = new Awareness(new Y.Doc());
      awareness.on("update", () => {
        const current = this.deps.doc(workspaceId, contentId);
        if (current)
          this.deps.broadcastAwareness(
            current.documentId,
            encodeAwarenessUpdate(awareness, [awareness.clientID])
          );
      });
      entry = {
        identity,
        owner: update.owner,
        awareness,
        presence: { agent: identity.name, status: update.status, action: "", updatedAt: 0 },
      };
      entries.set(identity.id, entry);
    }
    clearTimeout(entry.timer);
    entry.timer = setTimeout(
      () => this.clear(workspaceId, contentId, identity.name),
      PRESENCE_TTL_MS
    );
    entry.timer.unref?.();
    entry.owner = update.owner;
    entry.presence = {
      agent: identity.name,
      status: update.status,
      action: update.action.slice(0, ACTION_LIMIT),
      updatedAt: Date.now(),
    };
    const current = this.deps.doc(workspaceId, contentId);
    const agent: AgentAwarenessState = {
      status: update.status,
      action: entry.presence.action,
      ...(update.block ? { block: update.block } : {}),
      ...(update.editing ? { editing: true } : {}),
    };
    entry.awareness.setLocalState({
      user: { id: identity.id, name: identity.name, color: identity.color, agent: true },
      activity: "viewing",
      nodeTreeSelection:
        update.caret && current
          ? caretSelection(current.doc, identity.id, update.caret.position)
          : null,
      agent,
    });
    this.deps.changed(workspaceId, contentId);
  }

  clear(workspaceId: string, contentId: number, agent: string) {
    const key = keyOf(workspaceId, contentId);
    const entries = this.entries.get(key);
    const entry = entries?.get(agentIdentity(agent).id);
    if (!entries || !entry) return;
    this.remove(entries, entry);
    if (!entries.size) this.entries.delete(key);
    this.deps.changed(workspaceId, contentId);
  }

  list(workspaceId: string, contentId: number): AgentPresence[] {
    return [...(this.entries.get(keyOf(workspaceId, contentId))?.values() ?? [])].map(
      entry => entry.presence
    );
  }

  /** 视图订阅时附上这篇正文全部 Agent 的当前状态 */
  updates(workspaceId: string, contentId: number): Uint8Array[] {
    return [...(this.entries.get(keyOf(workspaceId, contentId))?.values() ?? [])].map(entry =>
      encodeAwarenessUpdate(entry.awareness, [entry.awareness.clientID])
    );
  }

  /**
   * 一轮运行结束：主对话的作用域就是它的会话键；子 Agent 的宿主作用域是 `subagent:<id>`，
   * 对应会话键 `<父会话键>:subagent:<id>`。
   */
  clearScope(scope: string) {
    const matches = (owner: string) =>
      scope.startsWith("subagent:") ? owner.endsWith(`:${scope}`) : owner === scope;
    for (const [key, entries] of this.entries) {
      const ended = [...entries.values()].filter(entry => matches(entry.owner));
      if (!ended.length) continue;
      for (const entry of ended) this.remove(entries, entry);
      if (!entries.size) this.entries.delete(key);
      const split = key.lastIndexOf(":");
      this.deps.changed(key.slice(0, split), Number(key.slice(split + 1)));
    }
  }

  private remove(entries: Map<string, Entry>, entry: Entry) {
    clearTimeout(entry.timer);
    // 先置空再销毁：置空会广播「离开」，各视图随即撤下光标与状态
    entry.awareness.setLocalState(null);
    entry.awareness.destroy();
    entry.awareness.doc.destroy();
    entries.delete(entry.identity.id);
  }

  dispose() {
    this.stopListening();
    for (const entries of this.entries.values())
      for (const entry of [...entries.values()]) this.remove(entries, entry);
    this.entries.clear();
  }
}
