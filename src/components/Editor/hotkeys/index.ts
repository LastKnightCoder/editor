import { formattedText, quitFormattedMarks } from "./formattedText";
import { headerConfig } from "./header";
import { codeBlockConfig } from "./codeBlock";
import { listConfig } from "./list";
import { inline } from "./inline";
import { tableConfig } from "./table";
import { mathConfig } from "./math";
import { slashCommandConfig } from "./slashCommand.ts";

const hotKeyConfigs = [
  ...formattedText,
  ...quitFormattedMarks,
  ...headerConfig,
  ...codeBlockConfig,
  ...listConfig,
  ...inline,
  ...tableConfig,
  ...mathConfig,
  ...slashCommandConfig
];

export default hotKeyConfigs;
