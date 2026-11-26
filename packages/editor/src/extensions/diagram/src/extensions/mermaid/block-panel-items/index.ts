import { editorT, editorAliases } from "../../../../../../i18n-runtime";
import type { Editor as LocaleEditor } from "slate";
import { GitBranch } from "lucide-react";
import type { IBlockPanelListItem } from "@tau/editor/api";
import { insertMermaid } from "../../../insert";

const getItems = (editor: LocaleEditor): IBlockPanelListItem[] => {
  const items: IBlockPanelListItem[] = [
    {
      icon: GitBranch,
      get title() {
        return editorT(editor, "block.mermaid");
      },
      keywords: [...["mermaid", "流程图"], ...editorAliases("block.mermaid")],
      get description() {
        return editorT(editor, "block.mermaid");
      },
      onClick: editor => {
        insertMermaid(editor);
      },
    },
  ];

  return items;
};
export default getItems;
