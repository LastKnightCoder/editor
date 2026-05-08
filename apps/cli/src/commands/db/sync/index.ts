import type { Command } from "commander";
import { runSyncStatus } from "./status.js";
import { runSyncPush } from "./push.js";
import { runSyncPull } from "./pull.js";

export function registerSyncCommands(db: Command) {
  const sync = db.command("sync").description("Database sync operations");

  sync
    .command("status")
    .description("Show sync status (local vs remote version)")
    .action(async () => {
      await runSyncStatus();
    });

  sync
    .command("push")
    .description("Upload local database to remote")
    .action(async () => {
      try {
        await runSyncPush();
      } catch (e: any) {
        console.error(e.message);
        process.exit(1);
      }
    });

  sync
    .command("pull")
    .description("Download remote database to local")
    .action(async () => {
      try {
        await runSyncPull();
      } catch (e: any) {
        console.error(e.message);
        process.exit(1);
      }
    });
}
