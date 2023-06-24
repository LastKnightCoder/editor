import React from "react";
import { Editor } from "slate";

export type HotKeyConfig = {
  hotKey: string | string[];
  action: (editor: Editor, event: React.KeyboardEvent<HTMLDivElement>) => void;
}

export type Mark = 'bold' | 'italic' | 'underline' | 'highlight' | 'code' | 'strikethrough';