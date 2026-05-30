#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const schemaDir = path.join(rootDir, "packages/db-schema/schema");

const schemas = [
  { name: "main.sql", file: path.join(schemaDir, "main.sql") },
  { name: "index.sql", file: path.join(schemaDir, "index.sql") },
];

let hasError = false;

function isMissingFts5ModuleError(error) {
  return error instanceof Error && /no such module:\s*fts5/i.test(error.message);
}

function stripFts5VirtualTableStatements(sql) {
  return sql.replace(
    /CREATE\s+VIRTUAL\s+TABLE[\s\S]*?\s+USING\s+fts5\([\s\S]*?\)\s*;/gi,
    "",
  );
}

for (const { name, file } of schemas) {
  const sql = fs.readFileSync(file, "utf8");
  try {
    const db = new DatabaseSync(":memory:");
    db.exec(sql);
    db.close();
    console.log(`[schema-validate] OK ${name}`);
  } catch (err) {
    if (!isMissingFts5ModuleError(err)) {
      console.error(`[schema-validate] FAIL ${name}: ${err.message}`);
      hasError = true;
      continue;
    }

    try {
      const compatibleSql = stripFts5VirtualTableStatements(sql);
      const db = new DatabaseSync(":memory:");
      db.exec(compatibleSql);
      db.close();
      console.log(
        `[schema-validate] OK ${name} (fts5 unavailable, skipped fts5 virtual table validation)`,
      );
    } catch (fallbackErr) {
      console.error(
        `[schema-validate] FAIL ${name}: ${fallbackErr.message} (fallback after missing fts5)`,
      );
      hasError = true;
    }
  }
}

if (hasError) {
  process.exitCode = 1;
}
