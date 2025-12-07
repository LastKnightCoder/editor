import { Music } from "lucide-react";
import { IBlockPanelListItem } from "../../../types";
import { insertAbc } from "../../../utils";

const items: IBlockPanelListItem[] = [
  {
    icon: Music,
    title: "音乐标注",
    keywords: ["abc", "music", "音乐", "乐谱"],
    description: "ABC 记谱法",
    onClick: (editor) => {
      insertAbc(editor);
    },
  },
];

export default items;
