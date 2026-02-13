#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const schemaDir = path.join(rootDir, "packages/db-schema/schema");

const mainSegments = [
  "main/00_pragmas.sql",
  "main/10_core.sql",
  "main/20_content.sql",
  "main/30_project.sql",
  "main/40_resource.sql",
  "main/50_learning.sql",
  "main/90_indexes.sql",
];

const indexSegments = [
  "index/00_pragmas.sql",
  "index/10_fts.sql",
  "index/30_meta.sql",
];

function readSegment(relativePath) {
  const absolutePath = path.join(schemaDir, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`缺少 SQL 分片文件: ${absolutePath}`);
  }
  const content = fs.readFileSync(absolutePath, "utf8").trim();
  if (!content) {
    throw new Error(`SQL 分片文件为空: ${absolutePath}`);
  }
  return content;
}

function buildBundle(headerComment, segments) {
  const blocks = segments.map(readSegment);
  return `${headerComment}\n\n${blocks.join("\n\n")}\n`;
}

function writeBundle(relativeOutputPath, content) {
  const outputPath = path.join(schemaDir, relativeOutputPath);
  fs.writeFileSync(outputPath, content, "utf8");
}

function main() {
  const mainBundle = buildBundle(
    "-- 统一数据库主库 schema（按域拆分后汇总）\n-- 请优先修改 schema/main/*.sql",
    mainSegments,
  );
  const indexBundle = buildBundle(
    "-- 统一数据库索引库 schema（不包含 vec_documents，运行时动态创建）\n-- 请优先修改 schema/index/*.sql",
    indexSegments,
  );

  writeBundle("main.sql", mainBundle);
  writeBundle("index.sql", indexBundle);

  console.log(
    `[schema-build] OK mainSegments=${mainSegments.length} indexSegments=${indexSegments.length}`,
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
