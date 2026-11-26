import { Editor } from "slate";
import React from "react";

export interface IBlockPanelListItem {
  /** 本轮顶层条目的稳定身份，建议使用带命名空间的值。 */
  id?: string;
  /** 并入指定 id 的条目；目标不存在或关系成环时保持顶层。 */
  group?: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  keywords: string[];
  description: string;
  onClick?: (editor: Editor) => void;
  children?: IBlockPanelListItem[];
}
