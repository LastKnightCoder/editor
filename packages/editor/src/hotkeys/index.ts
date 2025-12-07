import { formattedText, quitFormattedMarks, modMove } from "./formattedText";
import { inline } from "./inline";
import { slashCommandConfig } from "./slashCommand";
import { blockNavigationHotkeys } from "./blockNavigation";

const hotKeyConfigs = [
  ...formattedText,
  ...quitFormattedMarks,
  ...modMove,
  ...inline,
  ...slashCommandConfig,
  ...blockNavigationHotkeys,
];

export default hotKeyConfigs;
