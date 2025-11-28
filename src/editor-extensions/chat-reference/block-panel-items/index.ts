import { MessageSquare } from "lucide-react";
import { IBlockPanelListItem } from "@/components/Editor/types";
import { openChatSelectorModal } from "../utils";

const blockPanelItems: IBlockPanelListItem[] = [
  {
    icon: MessageSquare,
    keywords: ["对话", "chat", "duihua"],
    title: "对话引用",
    description: "引用一个对话",
    onClick: (editor) => {
      openChatSelectorModal(editor);
    },
  },
];

export default blockPanelItems;
