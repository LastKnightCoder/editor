import { readFileSync, writeSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { WhiteboardDocumentSessions } from "../../sessions";
import { WhiteboardJournal } from "../../journal";
import type { AgentBoardRequest } from "../../../../../../shared/whiteboard-agent";

async function main() {
  const [directory, contentId, point, file] = process.argv.slice(2);
  const request: AgentBoardRequest = JSON.parse(readFileSync(file, "utf8"));
  const db = new Database(join(directory, "main.db")),
    journal = new WhiteboardJournal(join(directory, "journal.db"));
  const sessions = new WhiteboardDocumentSessions(journal, () => db);
  const lease = await sessions.open("stress", Number(contentId), 9, "child-writer");
  const stop = () => {
    writeSync(1, `@@CUT:${point}@@\n`);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
    throw new Error("父进程未终止提交进程");
  };
  if (point === "journal-transaction") {
    journal.db.function("stress_cut", stop);
    journal.db.exec(
      "CREATE TEMP TRIGGER stress_cut AFTER INSERT ON updates BEGIN SELECT stress_cut(); END"
    );
  } else if (point === "journal-committed") {
    const append = journal.append.bind(journal);
    journal.append = (...args) => {
      const saved = append(...args);
      stop();
      return saved;
    };
  } else if (point === "projection-transaction") {
    db.function("stress_cut", stop);
    db.exec(
      "CREATE TEMP TRIGGER stress_cut AFTER UPDATE OF revision ON whiteboard_documents BEGIN SELECT stress_cut(); END"
    );
  }
  const receipt = await sessions.applyAgent(lease.leaseId, 9, request);
  if (receipt.error) throw new Error(receipt.error);
  if (point === "before-reply") stop();
  throw new Error("未命中指定提交切点");
}
void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
