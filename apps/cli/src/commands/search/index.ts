import type { Command } from "commander";
import { runSearch } from "./search.js";

export function registerSearchCommand(program: Command) {
  program
    .command("search <query>")
    .description("Search content across all types (hybrid: FTS + Vec)")
    .option("-t, --type <types>", "Filter by type (comma-separated: card,article,project-item)")
    .option("-l, --limit <number>", "Limit results", "10")
    .action(async (query, options) => {
      await runSearch(query, options);
    });
}
