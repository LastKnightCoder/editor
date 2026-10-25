import { Editor } from "slate";
import { setOrInsertNode } from "@tau/editor";
import { toast } from "@tau/ui";
import type { ProjectCardListElement } from "./types";
import { getProjectItemReference } from "@/commands/project";

export const insertProjectCardList = async (editor: Editor, projectId?: number) => {
  if (!projectId) {
    toast.warning("无法获取到当前项目 ID");
    return;
  }

  const projectCardListNode: ProjectCardListElement = {
    type: "project-card-list",
    ...("nodeTree" in editor
      ? { entityRef: await getProjectItemReference(projectId) }
      : { projectItemId: projectId }),
    children: [
      {
        type: "formatted",
        text: "",
      },
    ],
  };

  return setOrInsertNode(editor, projectCardListNode);
};
