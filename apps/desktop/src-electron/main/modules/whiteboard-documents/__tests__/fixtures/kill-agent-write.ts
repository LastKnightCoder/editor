import Database from "better-sqlite3";
import { writeSync } from "node:fs";
import { join } from "node:path";
import { WhiteboardDocumentSessions } from "../../sessions";
import { WhiteboardJournal } from "../../journal";
import type { AgentBoardRequest } from "../../../../../../shared/whiteboard-agent";

async function main() {
  const [dir, contentId, point, raw] = process.argv.slice(2);
  const request: AgentBoardRequest = JSON.parse(raw);
  const db = new Database(join(dir, "main.db")),
    journal = new WhiteboardJournal(join(dir, "journal.db"));
  const sessions = new WhiteboardDocumentSessions(journal, () => db);
  const lease = await sessions.open("A", Number(contentId), 1, "writer");
  const stop = () => {
    writeSync(1, point);
    process.kill(process.pid, "SIGKILL");
  };
  if (point === "journal-transaction") {
    journal.db.function("crash_here", stop);
    journal.db.exec(
      "CREATE TEMP TRIGGER crash AFTER INSERT ON updates BEGIN SELECT crash_here(); END"
    );
  } else if (point === "journal-committed") {
    const append = journal.append.bind(journal);
    journal.append = (...args) => {
      const row = append(...args);
      stop();
      return row;
    };
  } else if (point === "projection-transaction") {
    db.function("crash_here", stop);
    db.exec(
      "CREATE TEMP TRIGGER crash AFTER UPDATE OF revision ON whiteboard_documents BEGIN SELECT crash_here(); END"
    );
  }
  const receipt = await sessions.applyAgent(lease.leaseId, 1, request);
  if (receipt.error) throw new Error(receipt.error);
  if (point === "before-reply") stop();
  throw new Error("未命中崩溃切点");
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
