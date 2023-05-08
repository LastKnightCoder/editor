import { formattedMarks, quitFormattedMarks } from "./formattedMarks";
import { headerConfig } from "./header";
import { codeBlockConfig } from "./codeblock";

const hotKeyConfigs = [...formattedMarks, ...quitFormattedMarks, ...headerConfig, ...codeBlockConfig];
export default hotKeyConfigs;