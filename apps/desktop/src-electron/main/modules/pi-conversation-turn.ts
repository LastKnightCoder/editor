import { readFileSync, statSync, type BigIntStats } from "node:fs";
import { parseSessionEntries, SessionManager } from "@earendil-works/pi-coding-agent";
import { documentEntriesFromSdk, getSessionTranscript, type SessionEntry } from "@tau/ai/session";
import type { ChatSessionMessage } from "@/types";
import type { ChatConversationTurn } from "@/types/pi-session";
import { piEntriesToDesktopMessages } from "./pi-session-transcript";

const MAX_BRANCHES = 4;

const messageText = (message: ChatSessionMessage): string =>
  typeof message.content === "string"
    ? message.content
    : message.content
        .map(item => (item.type === "text" ? item.text : ""))
        .filter(Boolean)
        .join("\n");

const sameFile = (left: BigIntStats, right: BigIntStats | undefined) =>
  right &&
  left.dev === right.dev &&
  left.ino === right.ino &&
  left.size === right.size &&
  left.mtimeNs === right.mtimeNs &&
  left.ctimeNs === right.ctimeNs;

type ProjectedTurn = Omit<ChatConversationTurn, "onPath" | "turns">;

interface TurnProjection {
  turns: number;
  byId: Map<string, ProjectedTurn>;
}

class ConversationTurnIndex {
  private readonly activePath: Set<string>;
  private readonly entries: Map<string, SessionEntry>;
  private readonly latestDescendant = new Map<string, string>();
  private readonly branches = new Map<string, TurnProjection>();
  private active: TurnProjection | undefined;

  constructor(private readonly manager: SessionManager) {
    this.activePath = new Set(manager.getBranch().map(entry => entry.id));
    const entries = documentEntriesFromSdk(manager.getEntries());
    this.entries = new Map(entries.map(entry => [entry.id, entry]));
    // 文件顺序与切版本一致，倒序把最近写入的后代传给祖先。
    for (let index = entries.length - 1; index >= 0; index--) {
      const entry = entries[index];
      let cursor: SessionEntry | undefined = entry;
      while (cursor && !this.latestDescendant.has(cursor.id)) {
        this.latestDescendant.set(cursor.id, entry.id);
        cursor = cursor.parentId ? this.entries.get(cursor.parentId) : undefined;
      }
    }
  }

  get(entryId: string): ChatConversationTurn | null {
    const entry = this.entries.get(entryId);
    if (entry?.type !== "message" || entry.message?.role !== "user") return null;
    const onPath = this.activePath.has(entryId);
    const projection = onPath
      ? (this.active ??= this.project())
      : this.getBranch(this.latestDescendant.get(entryId) ?? entryId);
    const turn = projection.byId.get(entryId);
    return turn ? { ...turn, onPath, turns: projection.turns } : null;
  }

  private getBranch(leaf: string): TurnProjection {
    const result = this.branches.get(leaf) ?? this.project(leaf);
    this.branches.delete(leaf);
    this.branches.set(leaf, result);
    if (this.branches.size > MAX_BRANCHES) {
      const oldest = this.branches.keys().next();
      if (!oldest.done) this.branches.delete(oldest.value);
    }
    return result;
  }

  private project(leaf?: string): TurnProjection {
    const branch = documentEntriesFromSdk(this.manager.getBranch(leaf));
    const messages = piEntriesToDesktopMessages(getSessionTranscript({ entries: branch }));
    const byId = new Map<string, ProjectedTurn>();
    let turns = 0;
    for (let index = 0; index < messages.length; index++) {
      const ask = messages[index];
      if (ask.role !== "user") continue;
      turns++;
      const entryId = ask.piEntryIds?.[0];
      const entry = entryId ? this.entries.get(entryId) : undefined;
      if (!entryId || !entry) continue;
      const next = messages[index + 1];
      const answer = next?.role === "assistant" ? next : undefined;
      const usage = answer && "usage" in answer ? answer.usage : undefined;
      const model = usage?.modelName || usage?.modelId;
      byId.set(entryId, {
        entryId,
        turn: turns,
        ask: messageText(ask),
        answer: answer ? messageText(answer) : "",
        ...(model ? { model } : {}),
        time: Date.parse(entry.timestamp) || 0,
      });
    }
    return { turns, byId };
  }
}

/** 预览线程保留最近读取的一个文件以及有限的分支投影。文件变化后按新快照重建。 */
export class ConversationTurnReader {
  private cached?: { file: string; stat: BigIntStats; index: ConversationTurnIndex };

  read(file: string, entryId: string): ChatConversationTurn | null {
    const stat = statSync(file, { bigint: true, throwIfNoEntry: false });
    if (!stat) {
      if (this.cached?.file === file) this.cached = undefined;
      return null;
    }
    if (this.cached?.file === file && sameFile(this.cached.stat, stat)) {
      return this.cached.index.get(entryId);
    }
    this.cached = undefined;
    const entries = parseSessionEntries(readFileSync(file, "utf8"));
    if (!entries.length) return null;
    if (entries[0].type !== "session") throw new Error("无效的对话文件头");
    const index = new ConversationTurnIndex(SessionManager.inMemory(undefined, undefined, entries));
    if (sameFile(stat, statSync(file, { bigint: true, throwIfNoEntry: false }))) {
      this.cached = { file, stat, index };
    }
    return index.get(entryId);
  }
}
