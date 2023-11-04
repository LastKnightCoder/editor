import { Editor } from "slate";
import React from "react";

export type IHotKeyConfig = {
  hotKey: string | string[];
  action: (editor: Editor, event: React.KeyboardEvent<HTMLDivElement>) => void;
}
