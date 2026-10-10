import { v4 as uuid } from "uuid";
import type { ElementCreateSpec } from "../api";
import type { MindNodeElement } from "../../types";
import { MindThemeUtil } from "../../utils/MindThemeUtil";
import { resolveBoardAccess } from "../access";
import { clearSelectionOperation } from "./text";

/** 旧 createMindRoot 的根节点宽度（画布单位） */
export const MIND_ROOT_WIDTH = 24;

/**
 * 旧 MindPlugin.createMindRoot 的元素构造（纯函数）：
 * 高度按容器字号推导，defaultFocus 让新节点直接进入文本编辑。
 */
export function buildMindRootElement(x: number, y: number, fontSize: number): MindNodeElement {
  const lineHeight = fontSize * 1.57;
  const totalHeight = lineHeight + 16 * 2;

  return {
    id: uuid(),
    type: "mind-node",
    x,
    y,
    width: MIND_ROOT_WIDTH,
    height: totalHeight,
    actualHeight: totalHeight,
    level: 1,
    leftChildrenHeight: 0,
    rightChildrenHeight: 0,
    childrenHeight: 0,
    direction: "right",
    text: [
      {
        type: "paragraph",
        children: [
          {
            type: "formatted",
            text: "",
            bold: true,
          },
        ],
      },
    ],
    children: [],
    defaultFocus: true,
    isLeftFold: false,
    isRightFold: false,
    themeId: MindThemeUtil.getDefaultThemeId(),
    themeStyle: MindThemeUtil.getDefaultThemeStyle(),
  };
}

/**
 * mind-node 创建规格：click 手势，按下点为根节点左上角（旧 createMindRoot 的锚点规则）；
 * 插入与清空选区同属一个撤销步（旧 onClick 的 [set_selection, insert_node] 单批语义），
 * 不选中新节点（defaultFocus 直接进入编辑）。defaultSize 仅满足 click 手势校验，
 * 实际高度由 build 按容器字号推导。
 */
export const mindCreateSpec: ElementCreateSpec = {
  gesture: "click",
  defaultSize: [MIND_ROOT_WIDTH, 52],
  after: "none",
  cursor: "crosshair",
  hint: () => ["点击放置中心主题"],
  build: ctx => {
    const board = resolveBoardAccess(ctx.api);
    const element = buildMindRootElement(ctx.start.x, ctx.start.y, board.getFontSize());
    return { element, operations: [clearSelectionOperation(ctx.api.selection)] };
  },
};
