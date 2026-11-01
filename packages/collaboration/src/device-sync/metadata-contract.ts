import type { MetadataReference, MetadataRule } from "./metadata";

const endpoints = (column: string, kind: string): MetadataReference[] => [
  { column, table: "excerpt", when: { column: kind, value: "excerpt" } },
];

/** 只声明数据事实；归并算法不依赖具体业务域。 */
export const metadataRules: Readonly<Record<string, MetadataRule>> = {
  excerpt: {
    columns: [
      "id",
      "source_type",
      "source_key",
      "source_title",
      "external_id",
      "quote",
      "note",
      "anchor",
      "color",
      "source_time",
      "create_time",
      "update_time",
      "is_deleted",
      "location",
      "url",
    ],
    identity: ["source_type", "external_id"],
    generatedKey: true,
    timestamps: ["create_time", "update_time"],
    json: ["anchor"],
  },
  excerpt_provider: {
    columns: ["source_type", "label", "update_time"],
    timestamps: ["update_time"],
  },
  web_page: {
    columns: ["url", "host", "page_title", "custom_title", "create_time", "update_time"],
    timestamps: ["create_time", "update_time"],
  },
  resource_sync_blacklist: {
    columns: ["id", "file_name", "create_time", "update_time"],
    identity: ["file_name"],
    generatedKey: true,
    timestamps: ["create_time", "update_time"],
  },
  entity_lineage: {
    columns: [
      "id",
      "src_kind",
      "src_id",
      "src_anchor",
      "dst_kind",
      "dst_id",
      "relation",
      "create_time",
    ],
    identity: ["src_kind", "src_id", "dst_kind", "dst_id", "relation"],
    generatedKey: true,
    timestamps: ["create_time"],
    references: [...endpoints("src_id", "src_kind"), ...endpoints("dst_id", "dst_kind")],
  },
  plugin_entity_kinds: {
    columns: ["plugin_id", "kind", "label", "icon", "update_time"],
    timestamps: ["update_time"],
  },
  plugin_element_resources: {
    columns: ["plugin_id", "type", "resources", "update_time"],
    timestamps: ["update_time"],
    json: ["resources"],
  },
  plugin_kv: {
    columns: ["plugin_id", "key", "value", "update_time"],
    timestamps: ["update_time"],
    json: ["value"],
    opaque: ["value"],
  },
  plugin_records: {
    columns: [
      "id",
      "plugin_id",
      "collection",
      "data",
      "create_time",
      "update_time",
      "orphaned_time",
    ],
    timestamps: ["create_time", "update_time"],
    json: ["data"],
    opaque: ["data"],
  },
  plugin_links: {
    columns: [
      "id",
      "plugin_id",
      "from_id",
      "to_kind",
      "to_id",
      "to_created_at",
      "role",
      "sort_index",
      "data",
      "create_time",
    ],
    identity: ["from_id", "to_kind", "to_id", "role"],
    timestamps: ["create_time"],
    references: [
      {
        column: "to_id",
        table: "excerpt",
        when: { column: "to_kind", value: "material" },
        prefix: "excerpt:",
        createdAt: "to_created_at",
      },
    ],
    opaque: ["data"],
  },
};
