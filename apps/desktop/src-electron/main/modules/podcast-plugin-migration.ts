/**
 * 卡片、文章、项目文档上的播客迁入插件 tau.podcast：每个挂着播客的原文写成一期插件实体（key 为
 * 「类型:ID」，与插件「一篇原文一期」一致），由实体指向原文建关联、登记原文引用，原文的 podcast_id 清空。
 * 数据形状与插件 src/data/model.ts 的 episodeMeta 一致。调用方先确认插件已安装并启用，否则迁入的
 * 实体会被当作孤儿回收。Notebook 的播客仍由宿主管理，不迁。
 *
 * - 单事务；失败整体回滚、原文的 podcast_id 原样保留，下次重试。
 * - 动手前在库旁生成 `<数据库路径>.pre-podcast-plugin-migration-v1-<UUID>.bak` 快照，备份失败不迁移。
 * - 同一原文已有插件实体时只清空 podcast_id，不重复写入（旧端同步回来的库再次执行不会重复）。
 * - 迁走后不再被任何地方引用的 podcasts 行删除；音频文件不动，地址原样写进插件实体。
 * 全部设备迁移后随清洁版删除。
 */

import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import type { Descendant } from "slate";
import { asynchronousDatabaseCommand } from "./database-command";
import ContentTable from "./tables/content";
import { getNextTaskEntityId } from "./tables/module-entity-id";
import { NUMERIC_KINDS } from "./tables/plugin-ref-kinds";

export const PODCAST_PLUGIN_ID = "tau.podcast";
const EPISODE_KIND = "episode";
const SOURCE_ROLE = "source";
/** 插件给说话人的默认配色顺序（src/ui/GenerateDialog.tsx 的 blankSpeaker） */
const TONES = [2, 5, 3, 4, 1];
const MINUTES = [3, 5, 10, 15];

/** 挂播客的宿主表 → 插件引用类型 */
const SOURCES = [
  { table: "cards", kind: "card", title: null },
  { table: "articles", kind: "article", title: "title" },
  { table: "project_item", kind: "document", title: "title" },
] as const;

interface PodcastRow {
  id: number;
  create_time: number;
  update_time: number;
  name: string | null;
  audio_url: string;
  script: string | null;
  script_lines: string | null;
  duration: number | null;
  speakers: string;
}

export interface PodcastMigrationResult {
  episodes: number;
  /** 原文已有插件实体、只清空了旧指针的数量 */
  skipped: number;
}

const hasColumn = (db: Database.Database, table: string, column: string) =>
  (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some(
    c => c.name === column
  );
const hasTable = (db: Database.Database, name: string) =>
  Boolean(db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name));

const sourceTables = (db: Database.Database) =>
  hasTable(db, "podcasts") ? SOURCES.filter(s => hasColumn(db, s.table, "podcast_id")) : [];

/** 还有没有挂在卡片、文章、项目文档上的播客 */
export function hasLegacyPodcasts(db: Database.Database): boolean {
  return sourceTables(db).some(({ table }) =>
    Boolean(db.prepare(`SELECT 1 FROM ${table} WHERE podcast_id IS NOT NULL LIMIT 1`).get())
  );
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

const str = (value: unknown) => (typeof value === "string" ? value : "");
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);

/** 旧播客 → 插件 episode 的 meta 与可读脚本正文 */
export function episodeFromPodcast(
  podcast: PodcastRow,
  source: { kind: string; id: string },
  sourceTitle: string
) {
  const speakers = parseJson<unknown[]>(podcast.speakers, [])
    .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
    .map((s, i) => ({
      name: str(s.name) || `说话人 ${i + 1}`,
      voiceId: str(s.voiceId),
      voiceName: str(s.voiceName),
      tone: TONES[i % TONES.length],
    }));
  if (!speakers.length)
    speakers.push({ name: "主持人", voiceId: "", voiceName: "", tone: TONES[0] });
  const lines = parseJson<unknown[]>(podcast.script_lines, [])
    .filter((l): l is Record<string, unknown> => typeof l === "object" && l !== null)
    .flatMap(l => {
      const text = str(l.text).trim();
      if (!text) return [];
      const byName = speakers.findIndex(s => s.name === str(l.speaker));
      const byVoice = speakers.findIndex(s => s.voiceId && s.voiceId === str(l.voiceId));
      return [
        {
          speaker: byName >= 0 ? byName : byVoice >= 0 ? byVoice : 0,
          text,
          start: num(l.startTime),
          duration: num(l.duration),
        },
      ];
    });
  const duration = num(podcast.duration) || lines.reduce((sum, l) => sum + l.duration, 0);
  const minutes = MINUTES.reduce((best, m) =>
    Math.abs(m - duration / 60) < Math.abs(best - duration / 60) ? m : best
  );
  const meta = {
    source,
    sourceKind: source.kind,
    sourceTitle,
    status: "ready",
    error: null,
    progress: null,
    options: {
      format: speakers.length >= 3 ? "panel" : speakers.length === 1 ? "solo" : "duo",
      speakers,
      minutes,
      focus: "",
      review: false,
    },
    audio: { url: podcast.audio_url, duration, speakers, lines },
    draft: null,
  };
  const paragraphs = lines.length
    ? lines.map(l => [{ text: `${speakers[l.speaker].name}`, bold: true }, { text: `：${l.text}` }])
    : (podcast.script ?? "")
        .split(/\n+/)
        .map(text => text.trim())
        .filter(Boolean)
        .map(text => [{ text }]);
  const content = (paragraphs.length ? paragraphs : [[{ text: "" }]]).map(children => ({
    type: "paragraph",
    children,
  })) as unknown as Descendant[];
  return { title: podcast.name?.trim() || sourceTitle || "未命名播客", meta, content };
}

/**
 * 执行迁移；没有挂在原文上的播客时什么也不做（返回 null）。调用方保证插件已安装并启用。
 * 写入不经插件进程，直接按插件数据层的表结构落库。
 */
export function migratePodcastsToPlugin(
  db: Database.Database,
  now = Date.now()
): PodcastMigrationResult | null {
  if (!hasLegacyPodcasts(db)) return null;
  if (db.name !== ":memory:")
    db.prepare("VACUUM INTO ?").run(
      `${db.name}.pre-podcast-plugin-migration-v1-${randomUUID()}.bak`
    );
  return db.transaction(() => {
    const pluginId = PODCAST_PLUGIN_ID;
    const result: PodcastMigrationResult = { episodes: 0, skipped: 0 };
    const findEntity = db.prepare(
      `SELECT id FROM plugin_entities WHERE plugin_id = ? AND kind = ? AND key = ?`
    );
    const insertEntity = db.prepare(
      `INSERT INTO plugin_entities (id, plugin_id, kind, key, title, content_id, meta, create_time, update_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertLink = db.prepare(
      `INSERT OR IGNORE INTO plugin_links
         (id, plugin_id, from_id, to_kind, to_id, to_created_at, role, sort_index, data, create_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, '{}', ?)`
    );
    const grant = db.prepare(
      `INSERT OR IGNORE INTO plugin_ref_grants (plugin_id, kind, ref_id, target_created_at, create_time)
       VALUES (?, ?, ?, ?, ?)`
    );
    const getPodcast = db.prepare(`SELECT * FROM podcasts WHERE id = ?`);
    const touched = new Set<number>();

    for (const { table, kind, title } of sourceTables(db)) {
      const rows = db
        .prepare(
          `SELECT id, create_time, podcast_id${title ? `, ${title} AS title` : ""}
           FROM ${table} WHERE podcast_id IS NOT NULL`
        )
        .all() as { id: number; create_time: number; podcast_id: number; title?: string }[];
      const clear = db.prepare(`UPDATE ${table} SET podcast_id = NULL WHERE id = ?`);
      for (const row of rows) {
        touched.add(row.podcast_id);
        clear.run(row.id);
        const podcast = getPodcast.get(row.podcast_id) as PodcastRow | undefined;
        if (!podcast?.audio_url) continue;
        const source = { kind, id: String(row.id) };
        const key = `${kind}:${row.id}`;
        if (findEntity.get(pluginId, EPISODE_KIND, key)) {
          result.skipped++;
          continue;
        }
        const located = db.prepare(NUMERIC_KINDS[kind].sql).get(row.id) as
          | { create_time: number }
          | undefined;
        const episode = episodeFromPodcast(podcast, source, row.title ?? "");
        const entityId = getNextTaskEntityId(db, "plugin_entities");
        insertEntity.run(
          entityId,
          pluginId,
          EPISODE_KIND,
          key,
          episode.title,
          ContentTable.createContent(db, { content: episode.content }),
          JSON.stringify(episode.meta),
          podcast.create_time,
          podcast.update_time
        );
        // 已删除（如文章进了回收站）的原文不建关联，插件按「原文已删除」显示
        if (located) {
          insertLink.run(
            `legacy-podcast-${entityId}`,
            pluginId,
            entityId,
            kind,
            source.id,
            located.create_time,
            SOURCE_ROLE,
            now
          );
          grant.run(pluginId, kind, source.id, located.create_time, now);
        }
        result.episodes++;
      }
    }

    // 迁走后没有其他引用（Notebook 笔记仍可能引用）的旧播客删除
    const stillUsed = hasTable(db, "vl_note")
      ? db.prepare(`SELECT 1 FROM vl_note WHERE podcast_id = ? LIMIT 1`)
      : null;
    const remove = db.prepare(`DELETE FROM podcasts WHERE id = ?`);
    for (const id of touched) if (!stillUsed?.get(id)) remove.run(id);
    return result;
  })();
}

const assertDatabase = (db: Database.Database, databaseName: unknown) => {
  if (
    typeof databaseName !== "string" ||
    basename(db.name).replace(/\.db$/, "") !== databaseName.replace(/\.db$/, "")
  )
    throw new Error("数据库已切换，请重新打开");
};

/** 渲染端在装好并启用播客插件后调用：pending 判断要不要迁，run 执行 */
export class PodcastMigrationTable {
  static getListenEvents() {
    return {
      "podcast-migration:pending": this.pending.bind(this),
      // 迁移前要 VACUUM INTO 备份，不能在命令外层的事务里执行；迁移本体自己开事务
      "podcast-migration:run": asynchronousDatabaseCommand(
        async (db: Database.Database, request: { databaseName: string }) => this.run(db, request)
      ),
    };
  }

  static pending(db: Database.Database, request: { databaseName: string }): boolean {
    assertDatabase(db, request?.databaseName);
    return hasLegacyPodcasts(db);
  }

  static run(
    db: Database.Database,
    request: { databaseName: string }
  ): PodcastMigrationResult | null {
    assertDatabase(db, request?.databaseName);
    return migratePodcastsToPlugin(db);
  }
}
