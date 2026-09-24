import { Command } from "commander";
import { registerDbCommands } from "./commands/db/index.js";
import { registerTuiCommand } from "./commands/tui/index.js";
import { registerCardCommands } from "./commands/card/index.js";
import { registerArticleCommands } from "./commands/article/index.js";
import { registerProjectCommands } from "./commands/project/index.js";
import { registerSearchCommand } from "./commands/search/index.js";
import { registerTodoCommands } from "./commands/todo/index.js";
import { registerQuestionCommands } from "./commands/question/index.js";
import { initHighlighter } from "./ui/slate-renderer/highlight.js";

const program = new Command();

program.name("tau").version("0.1.0").description("Tau CLI - terminal companion for the Tau app");

registerDbCommands(program);
registerCardCommands(program);
registerArticleCommands(program);
registerProjectCommands(program);
registerSearchCommand(program);
registerTodoCommands(program);
registerQuestionCommands(program);
registerTuiCommand(program);

await initHighlighter();
await program.parseAsync(process.argv);

if (process.stdout.writable && !process.stdout.writableEnded) {
  await new Promise<void>((resolve, reject) => {
    process.stdout.write("", error => (error ? reject(error) : resolve()));
  });
}
