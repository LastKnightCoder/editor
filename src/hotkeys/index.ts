import { formattedText, quitFormattedMarks } from "./formattedText";
import { headerConfig } from "./header";
import { codeBlockConfig } from "./codeBlock";
import { listConfig } from "./list";
import { inline } from "./inline";

const hotKeyConfigs = [...formattedText, ...quitFormattedMarks, ...headerConfig, ...codeBlockConfig, ...listConfig, ...inline];
export default hotKeyConfigs;
