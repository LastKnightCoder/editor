import React from "react";

export interface IConfigItem {
  id: string;
  element: React.FC;
  order: number;
  /** 紧凑工具条的展示分组；未声明时保持独立条目。 */
  compactGroup?: "text-style" | "more";
}
