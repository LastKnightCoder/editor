import { formattedText, quitFormattedMarks } from "./formattedText";
import { inline } from "./inline";
import { slashCommandConfig } from "./slashCommand.ts";

const hotKeyConfigs = [
  ...formattedText,
  ...quitFormattedMarks,
  ...inline,
  ...slashCommandConfig,
];

export default hotKeyConfigs;
