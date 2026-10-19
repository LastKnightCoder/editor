import type { EditorCommand, EditorHotkey } from "@tau/editor/api";

import { indent } from "./indent";
import { unindent } from "./unindent";
import { moveUp, moveDown } from "./move";

export const listItemCommands: EditorCommand[] = [indent, unindent, moveUp, moveDown];

export const listItemHotkeys: EditorHotkey[] = [
  { key: "Tab", command: "tau.list-item.indent" },
  { key: "shift+Tab", command: "tau.list-item.outdent" },
  { key: "mod+ArrowUp", command: "tau.list-item.move-up" },
  { key: "mod+ArrowDown", command: "tau.list-item.move-down" },
];
