import { createHash } from "node:crypto";
import { canonical, inspectSchema, Replica } from "./replica.mjs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const domains = {
  content:
    "articles cards compose_boards content_ai_insights content_ai_meta content_documents content_entity_relations content_links content_pending_releases contents daily_notes data_table_pending_releases data_table_views data_tables database_item entity_identities entity_lineage podcasts transcriptions",
  calendar:
    "calendar calendar_event calendar_group pomodoro_calendar_mapping pomodoro_presets pomodoro_sessions todo_calendar_mapping",
  chat: "chat_group chat_session",
  diary: "diary_entries diary_segments diary_tag_settings",
  excerpt: "excerpt excerpt_provider web_clip web_link web_note web_page web_view_preference",
  learning:
    "flashcard_decks flashcard_references flashcard_reviews flashcards knowledge_ai_insights vibe_learning_project vibe_learning_resources vl_note vl_quiz_item vl_quiz_record vl_quiz_set walk_daily_decks walk_visits",
  project: "project project_item",
  pdf: "pdf_annotations pdf_bookmarks pdfs video_note_item video_notes",
  plugin:
    "plugin_element_resources plugin_entities plugin_entity_kinds plugin_kv plugin_links plugin_operations plugin_records",
  task: "doc_task_calendar_link doc_task_group_names doc_task_settings task_assistant_content_pin task_assistant_operation todo_group todo_item todo_note_link todo_occurrence_override todo_recurrence todo_recurrence_completion todo_recurrence_history todo_schedule_occurrence",
  whiteboard:
    "white_board_content_pending_releases white_board_contents white_boards whiteboard_document_pages whiteboard_documents whiteboard_entity_relations",
  reader: "weread_config weread_notebook",
  device:
    "collaboration_bindings home_panel_layout library_identity migration_meta operation operation_daily_counts plugin_ref_grants publish_history publish_selections resource_sync_blacklist schema_meta statistic",
};
const implemented = {
  contents: "content-storage",
  content_documents: "content-storage",
  cards: "content-storage",
  plugin_kv: "opaque-record",
  plugin_records: "opaque-record",
  plugin_entities: "entity-unique",
  plugin_links: "entity-unique",
  todo_group: "task-parent",
  todo_item: "task-parent",
  whiteboard_documents: "binary-storage",
  entity_identities: "identity-storage",
  content_links: "content-storage",
};
const local = new Set(
  "collaboration_bindings home_panel_layout migration_meta plugin_ref_grants publish_history publish_selections resource_sync_blacklist schema_meta weread_config".split(
    " "
  )
);
const rebuild = new Set(
  "content_pending_releases data_table_pending_releases operation operation_daily_counts statistic white_board_content_pending_releases".split(
    " "
  )
);

export function auditContracts(db) {
  const declared = new Map();
  for (const [domain, names] of Object.entries(domains))
    for (const name of names.split(" ")) {
      if (declared.has(name)) throw new Error(`重复表契约：${name}`);
      declared.set(name, domain);
    }
  const tables = inspectSchema(db);
  if (tables.length !== declared.size || tables.some(table => !declared.has(table.name)))
    throw new Error("表契约清单与 Schema 漂移");
  return tables.map(table => ({
    table: table.name,
    domain: declared.get(table.name),
    scope: local.has(table.name)
      ? "local"
      : rebuild.has(table.name)
        ? "rebuild"
        : table.name === "library_identity"
          ? "group-control"
          : "replicated",
    adapter: implemented[table.name] ?? null,
    readiness: implemented[table.name] ? "storage-spike" : "blocked",
    key: table.key,
    columns: table.columns,
    unique: db
      .prepare(`PRAGMA index_list("${table.name}")`)
      .all()
      .filter(index => index.unique)
      .map(index => ({
        name: index.name,
        partial: Boolean(index.partial),
        columns: db
          .prepare(`PRAGMA index_info("${index.name}")`)
          .all()
          .map(column => column.name),
      })),
    foreignKeys: db.prepare(`PRAGMA foreign_key_list("${table.name}")`).all(),
    deletion: implemented[table.name] ? "generation-and-aggregate" : "domain-review-required",
    restore: implemented[table.name] ? "explicit-observed-deletion" : "domain-review-required",
    implicitRelations: ["todo_item", "plugin_links", "plugin_entities"].includes(table.name)
      ? "implemented-subset"
      : "domain-review-required",
  }));
}

export function contractHash(contracts) {
  return createHash("sha256").update(canonical(contracts)).digest("hex");
}

export function requireAdapters(contracts, names) {
  const byName = new Map(contracts.map(contract => [contract.table, contract]));
  for (const name of names) {
    const contract = byName.get(name);
    if (!contract || contract.scope !== "replicated" || !contract.adapter)
      throw new Error(`UNSUPPORTED_RULE: ${name}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const replica = new Replica(":memory:", { device: "audit", slot: 1 });
  try {
    const contracts = auditContracts(replica.db);
    console.log(
      JSON.stringify(
        { rulesHash: contractHash(contracts), productionReady: false, contracts },
        null,
        2
      )
    );
  } finally {
    replica.close();
  }
}
