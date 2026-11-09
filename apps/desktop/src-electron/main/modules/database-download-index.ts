import Database from "better-sqlite3";

const BATCH_SIZE = 256;

const contentSources = {
  card: "cards",
  article: "articles",
  "project-item": "project_item",
  "diary-moment": "diary_segments",
  "plugin-entity": "plugin_entities",
} as const;

type Source = {
  tables: string[];
  fields: string[];
  select: (schema: string) => string;
};

const documentSource = (table: string): Source => ({
  tables: [table, "content_snapshots", "content_documents"],
  fields: ["body", "title", "contracts", "format_version"],
  select: schema => `
    SELECT b.key, MAX(e.update_time, c.update_time) AS revision,
           c.content AS body, ${table === "cards" || table === "diary_segments" ? "''" : "e.title"} AS title,
           d.contracts, d.format_version
    FROM batch b
    JOIN ${schema}.${table} e ON e.id = b.id
    JOIN ${schema}.content_snapshots c ON c.id = e.content_id
    LEFT JOIN ${schema}.content_documents d ON d.content_id = c.id
    WHERE c.content IS NOT NULL ${table === "articles" ? "AND e.is_delete = 0" : ""}
  `,
});

const sources = new Map<string, Source>([
  ...Object.entries(contentSources).map(([type, table]): [string, Source] => [
    type,
    documentSource(table),
  ]),
  [
    "excerpt",
    {
      tables: ["excerpt"],
      fields: ["source_key", "source_title", "quote", "note", "location", "url"],
      select: schema => `
        SELECT b.key, e.update_time AS revision, e.source_key, e.source_title,
               e.quote, e.note, e.location, e.url
        FROM batch b JOIN ${schema}.excerpt e ON e.id = b.id
        WHERE e.is_deleted = 0
      `,
    },
  ],
  [
    "pdf-annotation",
    {
      tables: ["pdf_annotations", "pdfs"],
      fields: ["page_num", "annotation_payload", "notes", "file_name"],
      select: schema => `
        SELECT b.key, COALESCE(a.update_time, 0) AS revision, a.page_num, a.annotation_payload,
               a.notes, p.file_name
        FROM batch b JOIN ${schema}.pdf_annotations a ON a.id = b.id
        JOIN ${schema}.pdfs p ON p.id = a.pdf_id
      `,
    },
  ],
  [
    "web-clip",
    {
      tables: ["web_clip", "content_snapshots", "entity_lineage", "project_item"],
      fields: ["title", "url", "body"],
      select: schema => `
        SELECT b.key, MAX(c.update_time, COALESCE(ct.update_time, 0)) AS revision,
               c.title, c.url, ct.content AS body
        FROM batch b JOIN ${schema}.web_clip c ON c.id = b.id
        LEFT JOIN ${schema}.content_snapshots ct ON ct.id = c.content_id
        WHERE EXISTS (
          SELECT 1 FROM ${schema}.entity_lineage l
          JOIN ${schema}.project_item i ON i.id = CAST(l.src_id AS INTEGER)
          WHERE l.dst_kind = 'web-clip' AND l.dst_id = CAST(c.id AS TEXT)
            AND l.relation = 'clipped_from' AND l.src_kind = 'project-item'
        )
      `,
    },
  ],
  [
    "chat-prompt",
    {
      tables: ["chat_session"],
      fields: ["session_file", "update_time"],
      select: schema => `
        SELECT b.key, b.revision, s.session_file, s.update_time
        FROM batch b JOIN ${schema}.chat_session s ON s.id = b.id
        WHERE s.scope = 'main-chat' AND
          (@keepSessionDir = 1 OR s.session_file IN (SELECT value FROM json_each(@reusedFiles)))
      `,
    },
  ],
]);

type IndexedEntry = { key: string; type: string; revision: number | null };
type IndexDifference = { key: string; revision: number | null; oldRevision: number | null };

const discard = ({ key, revision }: IndexedEntry): IndexDifference => ({
  key,
  revision: null,
  oldRevision: revision,
});

function compareSource(
  db: Database.Database,
  source: Source,
  entries: IndexedEntry[],
  reusedFiles: readonly string[] | undefined
): IndexDifference[] {
  for (const schema of ["main", "incoming"]) {
    const hasTable = db.prepare(
      `SELECT 1 FROM ${schema}.sqlite_schema WHERE type IN ('table', 'view') AND name = ?`
    );
    if (source.tables.some(table => !hasTable.get(table))) {
      return entries.map(discard);
    }
  }
  const changed = [
    "o.revision IS NOT b.revision",
    "b.revision IS NULL",
    "n.revision IS NULL",
    ...source.fields.map(field => `o.${field} COLLATE BINARY IS NOT n.${field}`),
  ].join(" OR ");
  const compare = db.prepare<
    { entries: string; keepSessionDir?: number; reusedFiles?: string },
    IndexDifference
  >(`
    WITH batch AS MATERIALIZED (
      SELECT json_extract(value, '$.key') AS key,
             json_extract(value, '$.id') AS id,
             json_extract(value, '$.revision') AS revision
      FROM json_each(@entries)
    ),
    old AS (${source.select("main")}),
    incoming AS (${source.select("incoming")})
    SELECT b.key, b.revision AS oldRevision,
           CASE WHEN ${changed} THEN NULL ELSE n.revision END AS revision
    FROM batch b LEFT JOIN old o USING (key) LEFT JOIN incoming n USING (key)
    WHERE ${changed} OR n.revision IS NOT b.revision
  `);
  const differences: IndexDifference[] = [];
  for (let start = 0; start < entries.length; start += BATCH_SIZE) {
    const batch = entries.slice(start, start + BATCH_SIZE).map(({ key, type, revision }) => {
      const entityKey = key.slice(type.length + 1);
      const id =
        type === "chat-prompt" ? entityKey.slice(0, entityKey.lastIndexOf("#")) : Number(entityKey);
      return { key, id, revision };
    });
    differences.push(
      ...compare.all({
        entries: JSON.stringify(batch),
        ...(source.tables.includes("chat_session")
          ? {
              keepSessionDir: Number(reusedFiles === undefined),
              reusedFiles: JSON.stringify(reusedFiles ?? []),
            }
          : {}),
      })
    );
  }
  return differences;
}

/** 在主库关闭且持有同步锁时比较正式库和候选库，仅返回需要调整的索引项。 */
export function compareDownloadedIndex(
  indexDb: Database.Database,
  databasePath: string,
  downloadPath: string,
  reusedFiles?: readonly string[]
): { indexed: number; differences: IndexDifference[] } {
  const entries = indexDb
    .prepare<[], IndexedEntry>(`
    SELECT prefixed_id AS key, type,
           CASE WHEN MIN(update_time) = MAX(update_time) THEN MAX(update_time) END AS revision
    FROM vec_documents GROUP BY prefixed_id, type
  `)
    .all();
  if (!entries.length) return { indexed: 0, differences: [] };

  const compareDb = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    compareDb.prepare("ATTACH DATABASE ? AS incoming").run(downloadPath);
    const byType = Map.groupBy(entries, entry => entry.type);
    const differences: IndexDifference[] = [];
    for (const [type, indexed] of byType) {
      const source = sources.get(type);
      try {
        const changes = source
          ? compareSource(compareDb, source, indexed, reusedFiles)
          : indexed.map(discard);
        for (const change of changes) differences.push(change);
      } catch (error) {
        if (!(error instanceof Error && /^no such (column|table):/.test(error.message)))
          throw error;
        for (const entry of indexed) differences.push(discard(entry));
      }
    }
    return { indexed: entries.length, differences };
  } finally {
    compareDb.close();
  }
}
