/** 项目模块的身份色与图标（驾驶舱 visual 配置 + 项目列表条目共用） */

import { FolderTree } from "lucide-react";
import type { CockpitVisual } from "@/features/shared/cockpit/types";

/* 模块色沿用原 projectTypeMeta 的文档树青蓝（设计定稿的数据色，不进主题词表） */
export const PROJECT_VISUAL: CockpitVisual = {
  icon: FolderTree,
  softClass: "bg-[rgba(63,133,124,0.13)]",
  textClass: "text-[#3f857c]",
  barClass: "bg-gradient-to-r from-[#3f857c] to-transparent",
};
