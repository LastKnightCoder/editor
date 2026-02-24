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

for (const { name, file } of schemas) {
  const sql = fs.readFileSync(file, "utf8");
  try {
    const db = new DatabaseSync(":memory:");
    db.exec(sql);
    db.close();
    console.log(`[schema-validate] OK ${name}`);
  } catch (err) {
    console.error(`[schema-validate] FAIL ${name}: ${err.message}`);
    hasError = true;
  }
}

if (hasError) {
  process.exitCode = 1;
}
