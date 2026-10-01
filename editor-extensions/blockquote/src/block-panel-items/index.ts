import { Quote } from "lucide-react";

import { IBlockPanelListItem } from "../types";
import { insertBlockquote } from "../operations";

const items: IBlockPanelListItem[] = [
  {
    icon: Quote,
    title: "引用块",
    keywords: ["blockquote", "引用块", "yinyongkuai", "quote"],
    description: "引用块",
    onClick: editor => {
      insertBlockquote(editor);
    },
  },
];

export default items;
