import { Superscript } from "lucide-react";
import { IBlockPanelListItem } from "@tau/editor/api";
import { insertAnnotation } from "../operations.ts";

const items: IBlockPanelListItem[] = [
  {
    icon: Superscript,
    title: "注解",
    keywords: ["annotation", "注解", "zhujie", "note", "注释"],
    description: "在光标处插入带序号的注解",
    onClick: editor => {
      insertAnnotation(editor);
    },
  },
];

export default items;
