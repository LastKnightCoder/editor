import { Editor } from "slate";
import { insertHeader } from "@/components/Editor/utils";

const headers = ([1, 2, 3, 4, 5, 6] as const).map((level) => {
  return {
    icon: "h" + level,
    title: "标题" + level,
    keywords: ["h" + level, "标题" + level, "biaoti"],
    description: "标题" + level,
    onClick: (editor: Editor) => {
      insertHeader(editor, level);
    },
  };
});

export default headers;
