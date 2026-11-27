import { LayoutList } from "lucide-react";
import { IBlockPanelListItem } from "@tau/editor";
import { insertProjectCardList } from "../utils.ts";

import { projectCardListTranslator } from "../i18n";

const createBlockPanelItems = (projectId?: number): IBlockPanelListItem[] => {
  return [
    {
      id: "host.project-card-list.insert",
      icon: LayoutList,
      get title() {
        return projectCardListTranslator.t("title");
      },
      keywords: ["项目列表", "project-card-list", "xiangmu"],
      get description() {
        return projectCardListTranslator.t("title");
      },
      onClick: editor => {
        insertProjectCardList(editor, projectId);
      },
    },
  ];
};

export default createBlockPanelItems;
