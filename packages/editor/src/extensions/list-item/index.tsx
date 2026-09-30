import { defineElement, defineExtension } from "../../api";

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
      render: ListItem,
      behaviors: listItemBehaviors,
    }),
  ],
  commands: listItemCommands,
  hotkeys: listItemHotkeys,
});

export default listItemExtension;
