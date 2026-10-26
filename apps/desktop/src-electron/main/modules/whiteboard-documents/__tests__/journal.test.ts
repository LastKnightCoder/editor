// @vitest-environment node
import Database from "better-sqlite3";
import { expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WhiteboardJournal } from "../journal";

it("日志升级到版本 2 保留已有记录，更高版本拒绝打开", () => {
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
    expect(() => new WhiteboardJournal(path)).toThrow("版本较新");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
