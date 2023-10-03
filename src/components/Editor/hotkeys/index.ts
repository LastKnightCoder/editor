import { formattedText, quitFormattedMarks } from "./formattedText";
import { inline } from "./inline";
import { tableConfig } from "./table";
import { slashCommandConfig } from "./slashCommand.ts";

const hotKeyConfigs = [
  ...formattedText,
  ...quitFormattedMarks,
  ...inline,
  ...tableConfig,
  ...slashCommandConfig,
];

export default hotKeyConfigs;
