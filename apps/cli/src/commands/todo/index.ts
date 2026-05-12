import type { Command } from "commander";
import { runTodoList } from "./list.js";
import { runTodoAdd } from "./add.js";
import { runTodoDone } from "./done.js";
import { runTodoGroups } from "./groups.js";

export function registerTodoCommands(program: Command) {
  const todo = program.command("todo").description("Task/Todo operations");

  todo
    .command("list")
    .alias("ls")
    .description("List tasks")
    .option("-g, --group <id>", "Filter by group ID")
    .option(
      "-s, --status <status>",
      "Filter by status (pending, completed, overdue)",
    )
    .option(
      "-t, --type <type>",
      "Filter by type (normal, deadline, planned, recurring)",
    )
    .option("-l, --limit <number>", "Limit results", "20")
    .action(async (options) => {
      await runTodoList(options);
    });

  todo
    .command("add <title>")
    .description("Create a new task")
    .option("-g, --group <id>", "Group ID")
    .option(
      "-t, --type <type>",
      "Task type (normal, deadline, planned, recurring)",
      "normal",
    )
    .option("-d, --due <date>", "Due date (YYYY-MM-DD)")
    .option("-p, --parent <id>", "Parent task ID")
    .action(async (title, options) => {
      await runTodoAdd(title, options);
    });

  todo
    .command("done <id>")
    .description("Mark a task as completed")
    .action(async (id) => {
      await runTodoDone(Number(id));
    });

  todo
    .command("groups")
    .description("List task groups with stats")
    .action(async () => {
      await runTodoGroups();
    });
}
