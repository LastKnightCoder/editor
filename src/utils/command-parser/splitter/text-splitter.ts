import { InsertTextCommand } from "../index.ts";
import CommandSplitterBase from "./command-splitter.ts";

class TextSplitter extends CommandSplitterBase<InsertTextCommand> {
  split() {
    const { text } = this.command;
    const codes = text.split("");
    const commands: InsertTextCommand[] = codes.map((char) => ({
      type: "insert-text",
      text: char,
    }));
    return commands;
  }
}

export default TextSplitter;
