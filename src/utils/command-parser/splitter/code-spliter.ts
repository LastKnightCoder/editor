import { InsertCodeCommand, InsertInlineCodeCommand } from '../index.ts';
import CommandSplitterBase from "./command-splitter.ts";

class CodeSplitter extends CommandSplitterBase<InsertCodeCommand | InsertInlineCodeCommand>{
  split() {
    const { type, code } = this.command;
    const codes = code.split('');
    const commands: Array<InsertCodeCommand | InsertInlineCodeCommand> = codes.map(char => ({
      type,
      code: char
    }));
    return commands;
  }
}

export default CodeSplitter;
