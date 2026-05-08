import type { Command } from "commander";
import { runProjectList } from "./list.js";
import { runProjectShow } from "./show.js";
import { runProjectEdit } from "./edit.js";

export function registerProjectCommands(program: Command) {
  const project = program.command("project").description("Project operations");

  project
    .command("list")
    .alias("ls")
    .description("List projects")
    .option(
      "--type <type>",
      "Filter by type (document-tree, data-table, vibe-learning)",
    )
    .option("--archived", "Show archived projects")
    .option("--pinned", "Show only pinned projects")
    .option("-l, --limit <number>", "Limit results", "20")
    .action(async (options) => {
      await runProjectList(options);
    });

  project
    .command("show <id>")
    .description("Show project detail with item tree")
    .action(async (id) => {
      await runProjectShow(Number(id));
    });

  project
    .command("edit <id>")
    .description("Open project in editor")
    .action(async (id) => {
      await runProjectEdit(Number(id));
    });
}
