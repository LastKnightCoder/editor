import { Editor } from "slate";

export interface IBlockPanelListItem {
  icon: string;
  title: string;
  keywords: string[];
  description: string;
  onClick: (editor: Editor) => void;
}
