import { Editor } from "slate";
import { setOrInsertNode } from "@tau/editor";
import { toast } from "@tau/ui";
import type { ProjectCardListElement } from "./types";

export const insertProjectCardList = (editor: Editor, projectId?: number) => {
  if (!projectId) {
    toast.warning("无法获取到当前项目 ID");
    return;
  }

  const projectCardListNode: ProjectCardListElement = {
    type: "project-card-list",
    projectItemId: projectId,
    children: [
      {
        type: "formatted",
        text: "",
      },
    ],
  };

  return setOrInsertNode(editor, projectCardListNode);
};
