import { Editor } from "slate";
import { setOrInsertNode } from "@/components/Editor/utils";
import useProjectsStore from "@/stores/useProjectsStore.ts";
import { message } from "antd";

export const insertProjectCardList = (editor: Editor) => {
  const activeProjectItemId = useProjectsStore.getState().activeProjectItemId;
  if (!activeProjectItemId) {
    message.warning("无法获取到当前文档或者当前文档无子项");
    return;
  }

  return setOrInsertNode(editor, {
    // @ts-ignore
    type: "project-card-list",
    projectItemId: activeProjectItemId,
    children: [
      {
        type: "formatted",
        text: "",
      },
    ],
  });
};
