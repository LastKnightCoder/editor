import Database from "better-sqlite3";
import { writeSync } from "node:fs";
import { join } from "node:path";
import { WhiteboardDocumentSessions } from "../../sessions";
import { WhiteboardJournal } from "../../journal";

async function run() {
  const [dir, contentId, point] = process.argv.slice(2);
  const db = new Database(join(dir, "main.db"));
  const journal = new WhiteboardJournal(join(dir, "journal.db"));
  const sessions = new WhiteboardDocumentSessions(journal, () => db);
  const view = await sessions.open("test", Number(contentId), 1, "close");
  const kill = () => {
    writeSync(1, point);
    process.kill(process.pid, "SIGKILL");
  };
  if (point === "prepared") {
    const prepare = journal.prepareReclaim.bind(journal);
    journal.prepareReclaim = (...args) => {
      const ready = prepare(...args);
      if (ready) kill();
      return ready;
    };
  } else if (point === "main-transaction") {
    db.function("kill_reclaim", kill);
    db.exec(
      "CREATE TEMP TRIGGER crash AFTER UPDATE OF epoch ON whiteboard_documents BEGIN SELECT kill_reclaim(); END"
    );
  } else if (point === "main-committed") {
    journal.finishReclaim = kill;
  } else {
    journal.db.function("kill_reclaim", kill);
    journal.db.exec(
      "CREATE TEMP TRIGGER crash AFTER UPDATE OF document_id ON documents BEGIN SELECT kill_reclaim(); END"
    );
  }
  await sessions.release(view.leaseId, 1, true);
}
void run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
