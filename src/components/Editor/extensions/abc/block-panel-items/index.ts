import { IBlockPanelListItem } from "@/components/Editor/types";
import { insertAbc } from "@/components/Editor/utils";

const items: IBlockPanelListItem[] = [
  {
    icon: "music",
    title: "音乐标注",
    keywords: ["abc", "music", "音乐", "乐谱"],
    description: "ABC 记谱法",
    onClick: (editor) => {
      insertAbc(editor);
    },
  },
];

export default items;
