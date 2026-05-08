import type { Command } from "commander";
import { runArticleList } from "./list.js";
import { runArticleShow } from "./show.js";
import { runArticleEdit } from "./edit.js";

export function registerArticleCommands(program: Command) {
  const article = program.command("article").description("Article operations");

  article
    .command("list")
    .alias("ls")
    .description("List articles")
    .option("-t, --tag <tag>", "Filter by tag")
    .option("-s, --search <term>", "Search by title")
    .option("-l, --limit <number>", "Limit results", "20")
    .option("--deleted", "Include deleted articles")
    .action(async (options) => {
      await runArticleList(options);
    });

  article
    .command("show <id>")
    .description("Show article detail")
    .action(async (id) => {
      await runArticleShow(Number(id));
    });

  article
    .command("edit <id>")
    .description("Open article in editor window")
    .action(async (id) => {
      await runArticleEdit(Number(id));
    });
}
