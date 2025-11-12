import { Editor } from "slate";
import { setOrInsertNode } from "@/components/Editor/utils";
import { message } from "antd";

export const insertProjectCardList = (editor: Editor, projectId?: number) => {
  if (!projectId) {
    message.warning("无法获取到当前项目 ID");
    return;
  }

  return setOrInsertNode(editor, {
    // @ts-ignore
    type: "project-card-list",
    projectItemId: projectId,
    children: [
      {
        type: "formatted",
        text: "",
      },
    ],
  });
};
