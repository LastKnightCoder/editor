import type { Command } from "commander";
import { runCardList } from "./list.js";
import { runCardShow } from "./show.js";
import { runCardEdit } from "./edit.js";

export function registerCardCommands(program: Command) {
  const card = program.command("card").description("Card operations");

  card
    .command("list")
    .alias("ls")
    .description("List cards")
    .option(
      "-c, --category <category>",
      "Filter by category (temporary, permanent, theme, literature)",
    )
    .option("-t, --tag <tag>", "Filter by tag")
    .option("-l, --limit <number>", "Limit results", "20")
    .action(async (options) => {
      await runCardList(options);
    });

  card
    .command("show <id>")
    .description("Show card detail")
    .action(async (id) => {
      await runCardShow(Number(id));
    });

  card
    .command("edit <id>")
    .description("Open card in editor window")
    .action(async (id) => {
      await runCardEdit(Number(id));
    });
}
