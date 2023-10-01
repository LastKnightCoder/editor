import { formattedText, quitFormattedMarks } from "./formattedText";
import { inline } from "./inline";
import { tableConfig } from "./table";
import { mathConfig } from "./math";
import { slashCommandConfig } from "./slashCommand.ts";
import { linkConfig } from "./link.ts";

const hotKeyConfigs = [
  ...formattedText,
  ...quitFormattedMarks,
  ...inline,
  ...tableConfig,
  ...mathConfig,
  ...slashCommandConfig,
  ...linkConfig
];

export default hotKeyConfigs;
