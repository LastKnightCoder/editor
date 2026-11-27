import { Editor } from "slate";
import { setOrInsertNode } from "@tau/editor";
import { toast } from "@tau/ui";
import type { ProjectCardListElement } from "./types";
import { getProjectItemReference } from "@/commands/project";

import { projectCardListTranslator } from "./i18n";

export const insertProjectCardList = async (editor: Editor, projectId?: number) => {
  if (!projectId) {
    toast.warning(projectCardListTranslator.t("insert.noProject"));
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
