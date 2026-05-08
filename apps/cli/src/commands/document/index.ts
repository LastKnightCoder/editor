import type { Command } from "commander";
import { runDocumentList } from "./list.js";
import { runDocumentShow } from "./show.js";
import { runDocumentEdit } from "./edit.js";

export function registerDocumentCommands(program: Command) {
  const document = program
    .command("document")
    .alias("doc")
    .description("Document operations");

  document
    .command("list")
    .alias("ls")
    .description("List documents")
    .option("-s, --search <term>", "Search by title")
    .option("-l, --limit <number>", "Limit results", "20")
    .option("--top", "Show only pinned documents")
    .action(async (options) => {
      await runDocumentList(options);
    });

  document
    .command("show <id>")
    .description("Show document detail with item tree")
    .action(async (id) => {
      await runDocumentShow(Number(id));
    });

  document
    .command("edit <id>")
    .description("Open document in editor")
    .action(async (id) => {
      await runDocumentEdit(Number(id));
    });
}
