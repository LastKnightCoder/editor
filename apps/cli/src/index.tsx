import { Command } from "commander";
import { registerDbCommands } from "./commands/db/index.js";
import { registerTuiCommand } from "./commands/tui/index.js";
import { registerCardCommands } from "./commands/card/index.js";

const program = new Command();

program
  .name("tau")
  .version("0.1.0")
  .description("Tau CLI - terminal companion for the Tau app");

registerDbCommands(program);
registerCardCommands(program);
registerTuiCommand(program);

program.parseAsync(process.argv);
