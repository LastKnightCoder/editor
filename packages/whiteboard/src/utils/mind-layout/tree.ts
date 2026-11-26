import type { MindLayout } from "./types";
import { columnConnector, columnDropDistance, columnFoldHandle, placeColumn } from "./indented";

/** 树状图：整棵树是一列缩进清单，根节点在左上角 */
export const treeLayout: MindLayout = {
  id: "tree",
  sides: ["right"],
  place: root => placeColumn(root, root.x, root.y),
  connector: columnConnector,
  foldHandle: node => columnFoldHandle(node, node.level === 1),
  navigate: (node, key) => {
    if (key === "up") return "prev";
    if (key === "down") return "next";
    if (key === "right") return "child";
    return node.level === 1 ? null : "parent";
  },
  siblingAxis: () => "y",
  dropDistance: columnDropDistance,
};
