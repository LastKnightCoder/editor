import { formattedText, quitFormattedMarks } from "./formattedText";
import { inline } from "./inline";
import { tableConfig } from "./table";
import { slashCommandConfig } from "./slashCommand.ts";
import { linkConfig } from "./link.ts";

const hotKeyConfigs = [
  ...formattedText,
  ...quitFormattedMarks,
  ...inline,
  ...tableConfig,
  ...slashCommandConfig,
  ...linkConfig
];

export default hotKeyConfigs;
