import { Editor } from "slate";
import React from "react";

export interface IBlockPanelListItem {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  keywords: string[];
  description: string;
  onClick?: (editor: Editor) => void;
  children?: IBlockPanelListItem[];
}
