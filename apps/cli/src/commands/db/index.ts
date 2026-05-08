import type { Command } from "commander";
import { runDbStatus } from "./status.js";
import { registerSyncCommands } from "./sync/index.js";

export function registerDbCommands(program: Command) {
  const db = program.command("db").description("Database operations");

  db.command("status")
    .description("Show database status")
    .action(async () => {
      await runDbStatus();
    });

  registerSyncCommands(db);
}
