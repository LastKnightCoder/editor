import { defineElement, defineExtension } from "@tau/editor/api";

import type { ListItemElement } from "../../types";
import ListItem from "./components/ListItem";
import { listItemBehaviors } from "./behaviors";
import { listItemCommands, listItemHotkeys } from "./commands";

const listItemExtension = defineExtension({
  id: "tau.list-item",
  elements: [
    defineElement<ListItemElement>({
      type: "list-item",
      kind: "block",
      isEmpty: (element, context) => element.children.every(context.isEmpty),
      render: ListItem,
      behaviors: listItemBehaviors,
      copy: ({ element, fullySelected, ancestorTypes }) =>
        fullySelected &&
        (ancestorTypes.includes("list-item") ||
          element.children.some(child => "children" in child && child.type !== "paragraph"))
          ? "keep"
          : "unwrap",
    }),
  ],
  commands: listItemCommands,
  hotkeys: listItemHotkeys,
});

export default listItemExtension;
