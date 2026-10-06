#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const schemaDir = path.join(rootDir, "packages/db-schema/schema");

const mainSchemaPath = path.join(schemaDir, "main.sql");
const indexSchemaPath = path.join(schemaDir, "index.sql");
const vecTemplatePath = path.join(schemaDir, "index/20_vec_template.sql");

const MAIN_TABLE_COUNT = 68;
const MAIN_INDEX_COUNT = 112;
const INDEX_CORE_TABLES = [
  "content_fts",
  "vec_index_meta",
  "index_meta",
  "knowledge_map_nodes",
  "knowledge_map_topics",
  "entity_refs",
  "entity_ref_sources",
  "whiteboard_refs",
  "whiteboard_ref_sources",
  "whiteboard_embeds",
  "content_sections",
];
// 与运行时门禁（packages/db-schema/src/legacy-table-guard.ts）共用同一份黑名单
const REMOVED_TABLES = JSON.parse(
  fs.readFileSync(path.join(rootDir, "packages/db-schema/src/legacy-tables.json"), "utf8")
);

function readText(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`文件不存在: ${filePath}`);
  }
  return fs.readFileSync(filePath, "utf8");
}

function unique(values) {
  return Array.from(new Set(values));
}

function extractCreateTableNames(sql) {
  const names = [];
  const regex =
    /CREATE\s+(?:VIRTUAL\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"[]?([a-zA-Z0-9_]+)[`"\]]?/gi;
  for (const match of sql.matchAll(regex)) {
    names.push(match[1]);
  }
  return unique(names);
}

function extractCreateIndexNames(sql) {
  const names = [];
  const regex =
    /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"[]?([a-zA-Z0-9_]+)[`"\]]?/gi;
  for (const match of sql.matchAll(regex)) {
    names.push(match[1]);
  }
  return unique(names);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function asSorted(values) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function main() {
  const mainSql = readText(mainSchemaPath);
  const indexSql = readText(indexSchemaPath);
  const vecTemplateSql = readText(vecTemplatePath);

  const mainTables = extractCreateTableNames(mainSql);
  const mainIndexes = extractCreateIndexNames(mainSql);
  const indexTables = extractCreateTableNames(indexSql);

  assert(
    mainTables.length === MAIN_TABLE_COUNT,
    `[schema-parity] 主库表数量异常: expected=${MAIN_TABLE_COUNT}, actual=${mainTables.length}`
  );
  assert(
    mainIndexes.length === MAIN_INDEX_COUNT,
    `[schema-parity] 主库索引数量异常: expected=${MAIN_INDEX_COUNT}, actual=${mainIndexes.length}`
  );

  const removedInMain = REMOVED_TABLES.filter(tableName => mainTables.includes(tableName));
  assert(
    removedInMain.length === 0,
    `[schema-parity] 主库仍包含已删除表: ${removedInMain.join(", ")}`
  );

  const sortedIndexTables = asSorted(indexTables);
  const sortedExpectedIndexTables = asSorted(INDEX_CORE_TABLES);
  assert(
    JSON.stringify(sortedIndexTables) === JSON.stringify(sortedExpectedIndexTables),
    `[schema-parity] 索引库核心表不匹配: expected=${sortedExpectedIndexTables.join(",")}, actual=${sortedIndexTables.join(",")}`
  );

  const normalizedIndexSql = indexSql.toLowerCase();
  assert(
    !/create\s+virtual\s+table\s+(?:if\s+not\s+exists\s+)?vec_documents/i.test(normalizedIndexSql),
    "[schema-parity] index.sql 不应包含 vec_documents（必须运行时动态创建）"
  );

  assert(
    /create\s+virtual\s+table\s+(?:if\s+not\s+exists\s+)?vec_documents/i.test(vecTemplateSql),
    "[schema-parity] vec 模板缺少 vec_documents 建表语句"
  );
  assert(
    vecTemplateSql.includes("__VEC_DIMENSION__"),
    "[schema-parity] vec 模板缺少 __VEC_DIMENSION__ 占位符"
  );

  console.log(
    `[schema-parity] OK mainTables=${mainTables.length} mainIndexes=${mainIndexes.length} indexTables=${indexTables.length}`
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
