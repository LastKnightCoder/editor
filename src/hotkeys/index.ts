import { formattedText, quitFormattedMarks } from "./formattedText";
import { headerConfig } from "./header";
import { codeBlockConfig } from "./codeBlock";
import { commonConfig } from "./common";
import { listConfig } from "./list";

const hotKeyConfigs = [...formattedText, ...quitFormattedMarks, ...headerConfig, ...codeBlockConfig, ...commonConfig, ...listConfig];
export default hotKeyConfigs;