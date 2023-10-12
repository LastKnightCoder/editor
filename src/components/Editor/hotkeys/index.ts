import { formattedText, quitFormattedMarks, modMove } from "./formattedText";
import { inline } from "./inline";
import { slashCommandConfig } from "./slashCommand.ts";

const hotKeyConfigs = [
  ...formattedText,
  ...quitFormattedMarks,
  ...modMove,
  ...inline,
  ...slashCommandConfig,
];

export default hotKeyConfigs;
