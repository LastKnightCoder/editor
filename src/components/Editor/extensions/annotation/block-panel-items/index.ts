import { MessageCircle } from "lucide-react";
import { IBlockPanelListItem } from "@/components/Editor/types";
import { insertAnnotation } from "@/components/Editor/utils";

const items: IBlockPanelListItem[] = [
  {
    icon: MessageCircle,
    title: "注解",
    keywords: ["annotation", "注解", "zhujie", "note", "注释"],
    description: "添加带注符号的注解",
    onClick: (editor) => {
      insertAnnotation(editor, "注解内容");
    },
  },
];

export default items;
