// @vitest-environment node
import Database from "better-sqlite3";
import { expect, it } from "vitest";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WhiteboardJournal } from "../journal";

it("日志升级到版本 2 保留已有记录，更高版本备份后新建", () => {
  const directory = mkdtempSync(join(tmpdir(), "whiteboard-journal-version-"));
  const path = join(directory, "journal.db");
  try {
    const original = new Database(path);
    original.exec(
      "CREATE TABLE marker(value TEXT); INSERT INTO marker VALUES('preserved'); PRAGMA user_version=1;"
    );
    original.close();
    const journal = new WhiteboardJournal(path);
    expect(journal.db.pragma("user_version", { simple: true })).toBe(2);
    expect(journal.db.prepare("SELECT value FROM marker").get()).toEqual({ value: "preserved" });
    journal.db.pragma("user_version=3");
    journal.close();
    const rebuilt = new WhiteboardJournal(path);
    expect(rebuilt.db.pragma("user_version", { simple: true })).toBe(2);
    expect(
      rebuilt.db.prepare("SELECT 1 FROM sqlite_master WHERE name='marker'").get()
    ).toBeUndefined();
    rebuilt.close();
    expect(
      readdirSync(join(directory, "discarded")).some(name => name.endsWith("version-3-journal.db"))
    ).toBe(true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
