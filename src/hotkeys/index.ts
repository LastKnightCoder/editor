import { formattedText, quitFormattedMarks } from "./formattedText";
import { headerConfig } from "./header";
import { codeBlockConfig } from "./codeBlock";
import { commonConfig } from "./common";

const hotKeyConfigs = [...formattedText, ...quitFormattedMarks, ...headerConfig, ...codeBlockConfig, ...commonConfig];
export default hotKeyConfigs;