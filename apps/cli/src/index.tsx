import { Command } from "commander";
import { registerDbCommands } from "./commands/db/index.js";
import { registerTuiCommand } from "./commands/tui/index.js";
import { registerCardCommands } from "./commands/card/index.js";
import { registerArticleCommands } from "./commands/article/index.js";
import { registerProjectCommands } from "./commands/project/index.js";
import { registerDocumentCommands } from "./commands/document/index.js";
import { registerSearchCommand } from "./commands/search/index.js";

const program = new Command();

program
  .name("tau")
  .version("0.1.0")
  .description("Tau CLI - terminal companion for the Tau app");

registerDbCommands(program);
registerCardCommands(program);
registerArticleCommands(program);
registerProjectCommands(program);
registerDocumentCommands(program);
registerSearchCommand(program);
registerTuiCommand(program);

program.parseAsync(process.argv);
