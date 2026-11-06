import { statSync } from "node:fs";
import type Database from "better-sqlite3";
import { contentBlockLines } from "@/entity/text-digest";
import type { MemoryEvidence, MemorySource, MemorySourceKind } from "@/types/assistant-memory";
import { loadSessionTranscript } from "../pi-session-host-core";
import { chatSessionDirOfDb, resolveSessionFile } from "../pi-session-paths";
import ContentTable from "../tables/content";
import EntitySearchTable from "../tables/entity-search";
import { searchResultDetails } from "../search-details";
import type { IndexType } from "@/types";
import { safeMemoryText, searchTerms, type MemoryPart } from "./extraction";

export { MEMORY_SOURCE_KINDS as SOURCE_KINDS } from "@/types/assistant-memory";
const CHUNK = 3600;
const MIN_TIME = 0;
const SOURCE_QUERIES: Record<MemorySourceKind, string> = {
  content: "SELECT id,create_time,update_time FROM content_snapshots WHERE ref_count>0",
  chat: "SELECT id,create_time,update_time,title,session_file FROM chat_session WHERE scope='main-chat'",
  todo: `SELECT t.id,t.create_time,t.update_time,t.title,t.due_at,t.is_completed,t.is_archived
    FROM todo_item t JOIN todo_group g ON g.id=t.group_id WHERE g.is_system=0`,
  calendar: `SELECT e.id,e.create_time,e.update_time,e.title,e.start_date,e.start_time,e.end_date,e.end_time,e.all_day
    FROM calendar_event e JOIN calendar c ON c.id=e.calendar_id LEFT JOIN calendar_group g ON g.id=c.group_id
    WHERE IFNULL(g.is_system,0)=0 AND e.todo_item_id IS NULL`,
};

interface SourceRow {
  id: string | number;
  create_time: number;
  update_time: number;
  title?: string;
  session_file?: string;
  due_at?: number | null;
  is_completed?: number;
  is_archived?: number;
  start_date?: number;
  start_time?: number | null;
  end_date?: number | null;
  end_time?: number | null;
  all_day?: number;
}

export interface MemoryHead extends MemorySource {
  modifiedAt: number;
  row: SourceRow;
  file?: string;
}

export interface MemorySnapshot {
  parts: MemoryPart[];
  validate(evidence: MemoryEvidence): MemoryEvidence | null;
}

export interface MemorySourcesPort {
  list(
    kind: MemorySourceKind,
    after: string,
    limit: number
  ): Array<MemorySource & { modifiedAt: number }>;
  recent(kind: MemorySourceKind, limit: number): Array<MemorySource & { modifiedAt: number }>;
  head(source: MemorySource): MemoryHead | null;
  read(head: MemoryHead): MemorySnapshot;
  invalidate(source?: MemorySource): void;
  fallback(
    query: string,
    limit: number,
    allow: (source: MemorySource) => boolean
  ): MemoryEvidence[];
}

const idKey = (source: MemorySource) => source.kind + "\0" + source.id;
const timestamp = (value: number | undefined, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) && value > MIN_TIME ? value : fallback;
const displayDate = (time: number) =>
  new Date(time).toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" });

function calendarTime(
  day: number | null | undefined,
  minute: number | null | undefined,
  afterDay = false
) {
  if (!day) return undefined;
  const result = new Date(day);
  if (afterDay) result.setDate(result.getDate() + 1);
  else if (minute != null) result.setMinutes(minute);
  return result.getTime();
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map(part => (part && part.type === "text" && typeof part.text === "string" ? part.text : ""))
    .join("\n");
}

function textParts(
  base: Omit<MemoryPart, "quote" | "next" | "text" | "anchor">,
  anchor: string,
  text: string
): MemoryPart[] {
  const trimmed = text.trim();
  const parts: MemoryPart[] = [];
  for (let start = 0; start < trimmed.length; start += CHUNK) {
    const key = anchor + ":" + start;
    parts.push({
      ...base,
      anchor: key,
      next: key,
      quote: "",
      text: trimmed.slice(start, start + CHUNK),
    });
  }
  return parts;
}

export class LibraryMemorySources implements MemorySourcesPort {
  private cache = new Map<
    string,
    { modifiedAt: number; createdAt: number; snapshot: MemorySnapshot }
  >();

  constructor(
    private readonly db: Database.Database,
    private readonly index: () => Database.Database | undefined = () => undefined
  ) {}

  invalidate(source?: MemorySource) {
    if (source) this.cache.delete(idKey(source));
    else this.cache.clear();
  }

  list(kind: MemorySourceKind, after: string, limit: number) {
    const rows = this.db
      .prepare(`SELECT * FROM (${SOURCE_QUERIES[kind]}) WHERE id>? ORDER BY id LIMIT ?`)
      .all(kind === "chat" ? after : Number(after), limit) as SourceRow[];
    return rows.map(row => ({ kind, id: String(row.id), modifiedAt: this.modifiedAt(kind, row) }));
  }

  recent(kind: MemorySourceKind, limit: number) {
    const rows = this.db
      .prepare(`SELECT * FROM (${SOURCE_QUERIES[kind]}) ORDER BY update_time DESC,id DESC LIMIT ?`)
      .all(limit) as SourceRow[];
    return rows.map(row => ({ kind, id: String(row.id), modifiedAt: this.modifiedAt(kind, row) }));
  }

  private modifiedAt(kind: MemorySourceKind, row: SourceRow): number {
    if (kind !== "chat" || !row.session_file) return row.update_time;
    const dir = chatSessionDirOfDb(this.db);
    try {
      return dir
        ? (statSync(resolveSessionFile(dir, row.session_file), { throwIfNoEntry: false })
            ?.mtimeMs ?? row.update_time)
        : row.update_time;
    } catch {
      return row.update_time;
    }
  }

  head(source: MemorySource): MemoryHead | null {
    const row = this.db
      .prepare(`SELECT * FROM (${SOURCE_QUERIES[source.kind]}) WHERE id=?`)
      .get(source.kind === "chat" ? source.id : Number(source.id)) as SourceRow | undefined;
    if (!row) return null;
    const modifiedAt = row.update_time;
    if (source.kind === "chat") {
      const dir = chatSessionDirOfDb(this.db);
      if (!dir || !row.session_file) return null;
      const file = resolveSessionFile(dir, row.session_file);
      const stat = statSync(file, { throwIfNoEntry: false });
      // 同步中的目录行可能早于会话文件到达；等待下一次对账。
      if (!stat?.isFile()) throw new Error("会话文件尚未就绪");
      return { ...source, row, modifiedAt: stat.mtimeMs, file };
    }
    return { ...source, row, modifiedAt };
  }

  read(head: MemoryHead): MemorySnapshot {
    const key = idKey(head);
    const cached = this.cache.get(key);
    if (
      cached &&
      cached.modifiedAt === head.modifiedAt &&
      cached.createdAt === head.row.create_time
    )
      return cached.snapshot;
    const { parts, lines } = this.parts(head);
    const byAnchor = new Map(parts.map(part => [part.anchor, part]));
    const snapshot: MemorySnapshot = {
      parts,
      validate(evidence) {
        let part = byAnchor.get(evidence.anchor);
        if (!part?.text.includes(evidence.quote)) {
          // 正文插入新段落会移动块下标；只在同一正文身份中按原话重新定位。
          part =
            head.kind === "content" && evidence.anchor.startsWith(head.row.create_time + ":")
              ? parts.find(item => item.text.includes(evidence.quote))
              : undefined;
        }
        if (!part) return null;
        const { title, target, block, messageId, current, observedAt } = part;
        const hit =
          block !== undefined && lines
            ? lines.findIndex((line, index) => index >= block && line.includes(evidence.quote))
            : -1;
        return {
          ...evidence,
          title,
          target,
          block: hit >= 0 ? hit : block,
          messageId,
          current,
          observedAt,
        };
      },
    };
    this.cache.delete(key);
    const oldest = this.cache.keys().next().value;
    if (this.cache.size >= 3 && oldest !== undefined) this.cache.delete(oldest);
    this.cache.set(key, { modifiedAt: head.modifiedAt, createdAt: head.row.create_time, snapshot });
    return snapshot;
  }

  private parts(head: MemoryHead): { parts: MemoryPart[]; lines?: string[] } {
    const { kind, id, row } = head;
    const observedAt = timestamp(row.update_time, row.create_time);
    if (kind === "content") {
      const target = EntitySearchTable.locateAll(this.db, [Number(id)]).get(Number(id))?.[0];
      if (!target) return { parts: [] };
      const snapshot = this.db
        .prepare("SELECT * FROM content_snapshots WHERE id=?")
        .get(Number(id));
      if (!snapshot) return { parts: [] };
      const { content } = ContentTable.parseContent(snapshot);
      const lines = Array.isArray(content)
        ? content.map(block => contentBlockLines([block])[0] ?? "")
        : [];
      const title =
        lines
          .find(line => line.trim())
          ?.trim()
          .slice(0, 90) ?? "正文";
      const parts: MemoryPart[] = [];
      let buffered = "";
      let firstBlock = 0;
      const flush = () => {
        parts.push(
          ...textParts(
            { kind, id, target, title, block: firstBlock, role: "document", observedAt },
            row.create_time + ":" + firstBlock,
            buffered
          )
        );
        buffered = "";
      };
      for (const [block, text] of lines.entries()) {
        if (!text.trim()) continue;
        if (buffered && buffered.length + text.length + 1 > CHUNK) flush();
        if (!buffered) firstBlock = block;
        buffered += (buffered ? "\n" : "") + text;
      }
      if (buffered) flush();
      return { parts, lines };
    }
    if (kind === "chat") {
      if (!head.file) throw new Error("会话文件尚未就绪");
      return {
        parts: loadSessionTranscript(head.file, chatSessionDirOfDb(this.db)).flatMap(entry => {
          const role = entry.message.role;
          if (role !== "user" && role !== "assistant") return [];
          return textParts(
            {
              kind,
              id,
              messageId: entry.id,
              title: row.title || "对话",
              role,
              observedAt: timestamp(entry.message.timestamp, row.create_time),
            },
            entry.id,
            messageText(entry.message.content)
          );
        }),
      };
    }
    const time = kind === "todo" ? row.due_at : calendarTime(row.start_date, row.start_time);
    const expiresAt =
      kind === "calendar"
        ? calendarTime(
            row.end_date ?? row.start_date,
            row.end_time ?? row.start_time,
            Boolean(row.all_day)
          )
        : undefined;
    const current =
      kind === "todo"
        ? row.is_completed
          ? "已完成"
          : row.is_archived
            ? "已归档"
            : "待办"
        : "日程";
    const label =
      kind === "calendar" && row.all_day && time
        ? new Date(time).toLocaleDateString("zh-CN")
        : time
          ? displayDate(time)
          : "";
    const text = current + "：" + row.title + (label ? " · " + label : "");
    const anchor = String(row.create_time);
    return {
      parts: [
        {
          kind,
          id,
          title: row.title,
          current,
          anchor,
          quote: "",
          text,
          next: anchor,
          role: "record",
          observedAt,
          expiresAt,
        },
      ],
    };
  }

  fallback(
    query: string,
    limit: number,
    allow: (source: MemorySource) => boolean
  ): MemoryEvidence[] {
    const terms = searchTerms(query).slice(0, 4);
    if (!terms.length) return [];
    const candidates = new Map<string, MemorySource>();
    for (const term of terms) {
      for (const entry of EntitySearchTable.search(this.db, {
        kind: ["chat-session", "todo", "calendar-event"],
        keyword: term,
        limit: 8,
      })) {
        const source: MemorySource | undefined =
          entry.kind === "chat-session" && entry.sessionId
            ? { kind: "chat", id: entry.sessionId }
            : entry.kind === "todo" || entry.kind === "calendar-event"
              ? { kind: entry.kind === "todo" ? "todo" : "calendar", id: String(entry.id) }
              : entry.contentId
                ? { kind: "content", id: String(entry.contentId) }
                : undefined;
        if (source) candidates.set(idKey(source), source);
      }
    }
    try {
      const index = this.index();
      const match = terms.map(term => '"' + term.replace(/"/g, '""') + '"').join(" OR ");
      const indexed = index?.open
        ? (index
            .prepare(`SELECT prefixed_id FROM content_fts
        WHERE content_fts MATCH ? AND type IN ('card','article','project-item','diary-moment','plugin-entity')
        ORDER BY rank LIMIT 12`)
            .pluck()
            .all(match) as string[])
        : [];
      for (const key of new Set(indexed)) {
        const [type, id] = key.split(":");
        const detail = searchResultDetails(this.db, type as IndexType, Number(id));
        if (detail?.contentId) {
          const source = { kind: "content", id: String(detail.contentId) } as const;
          candidates.set(idKey(source), source);
        }
      }
    } catch {
      // 索引未重建完成时，仍可查最近的原文。
    }
    for (const source of this.recent("content", 8)) candidates.set(idKey(source), source);
    for (const source of this.recent("chat", 8)) candidates.set(idKey(source), source);
    const output: MemoryEvidence[] = [];
    for (const source of candidates.values()) {
      if (!allow(source)) continue;
      try {
        const head = this.head(source);
        if (!head) continue;
        const matches = this.read(head).parts.filter(
          part =>
            safeMemoryText(part.text, 6000) &&
            terms.some(term => part.text.toLowerCase().includes(term))
        );
        for (const part of matches.slice(-2).reverse()) {
          const lower = part.text.toLowerCase();
          const first = Math.min(...terms.map(term => lower.indexOf(term)).filter(at => at >= 0));
          const quote = safeMemoryText(
            part.text.slice(Math.max(0, first - 50), Math.max(0, first - 50) + 180),
            180
          );
          if (!quote) continue;
          const { kind, id, anchor, title, target, block, messageId, current, observedAt } = part;
          output.push({
            kind,
            id,
            anchor,
            title,
            target,
            block,
            messageId,
            current,
            observedAt,
            quote,
          });
          if (output.length >= limit) return output;
        }
      } catch {
        // 单个来源未就绪不影响其它命中。
      }
    }
    return output;
  }
}
