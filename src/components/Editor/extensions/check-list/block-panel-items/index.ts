import { ListChecks } from "lucide-react";
import { IBlockPanelListItem } from "@/components/Editor/types";
import { insertCheckList } from "@/components/Editor/utils";

const items: IBlockPanelListItem[] = [
  {
    icon: ListChecks,
    title: "任务列表",
    keywords: ["check-list", "列表", "todo"],
    description: "任务列表",
    onClick: (editor) => {
      insertCheckList(editor);
    },
  },
];

export default items;
