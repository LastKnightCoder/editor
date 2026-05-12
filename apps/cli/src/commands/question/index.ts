import type { Command } from "commander";
import { runQuestionList } from "./list.js";
import { runQuestionShow } from "./show.js";

export function registerQuestionCommands(program: Command) {
  const question = program
    .command("question")
    .alias("q")
    .description("Question management");

  question
    .command("list")
    .alias("ls")
    .description("List questions")
    .option("-g, --group <id>", "Filter by group ID")
    .option(
      "-s, --status <status>",
      "Filter by status (not_started, in_progress, resolved)",
    )
    .option("-l, --limit <number>", "Limit results", "20")
    .action(async (options) => {
      await runQuestionList(options);
    });

  question
    .command("show <id>")
    .description("Show question detail with answers")
    .action(async (id) => {
      await runQuestionShow(Number(id));
    });
}
