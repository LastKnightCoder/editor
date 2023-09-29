import {Editor} from "slate";
import { applyPlugin } from "@/components/Editor/utils";
import { commonSetting } from "./common.ts";

export const withParagraph = (editor: Editor) => {
  return applyPlugin(editor, [commonSetting]);
}