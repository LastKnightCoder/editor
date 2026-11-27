import type { MindmapAgentCandidate } from "./mindmap-agent";
import type { Operation } from "./mindmap-agent-utils";
import type { WhiteboardModelCommand, WhiteboardJson } from "@tau/collaboration";
import type { MindNodeElement } from "@tau/whiteboard/mindmap";
import { normalizeTree } from "@tau/whiteboard/mindmap";
import {
  mindKeys,
  mindError,
  mindIndex,
  mindInteger,
  mindBoolean,
  mindEnum,
  mindIds,
  mindCapabilities,
  mindString,
  mindObject,
  mindStructure,
  isSingleMindLayout,
} from "../../../../shared/whiteboard-mindmap";
import { pageElements } from "../../../../shared/whiteboard-agent";

export function foldMindNodes(ctx: MindmapAgentCandidate, op: Operation) {
  mindKeys(op, ["kind", "id", "folded", "scope", "side", "depth"], "operation");
  const node = ctx.node(op.id),
    root = ctx.root(node),
    index = mindIndex(ctx.page());
  const scope =
    op.scope === undefined ? "node" : mindEnum(op.scope, ["node", "subtree", "depth"], "scope");
  ctx.guard(node.id, "structure", "fold");
  const depth = scope === "depth" ? mindInteger(op.depth, "depth", 1, 64) : undefined;
  const folded = scope === "depth" ? false : mindBoolean(op.folded, "folded");
  const side = op.side === undefined ? undefined : mindEnum(op.side, ["left", "right"], "side");
  if (side && scope !== "node")
    mindError("AMBIGUOUS_FOLD_SCOPE", "side 只能用于 scope=node 的分侧折叠", {
      path: "side",
      suggestion: "整棵子树或按层折叠时省略 side。",
    });
  const single = isSingleMindLayout(root.data.layout);
  if (
    side &&
    (single || ((index.depths.get(node.id) ?? 1) > 1 && side !== index.sides.get(node.id)))
  )
    mindError("SIDE_NOT_SUPPORTED", "该节点或布局不支持独立折叠指定方向", {
      path: "side",
      actual: side,
      expected: single ? "省略 side" : index.sides.get(node.id),
    });
  const entries = scope === "node" ? [node] : pageElements([node]);
  const commands: WhiteboardModelCommand[] = entries.map(entry => {
    const value =
      depth === undefined
        ? folded
        : (index.depths.get(entry.id) ?? 1) - (index.depths.get(node.id) ?? 1) + 1 >= depth;
    return {
      type: "set_data",
      id: entry.id,
      patch:
        !side || scope !== "node"
          ? { isLeftFold: value, isRightFold: value }
          : { [side === "left" ? "isLeftFold" : "isRightFold"]: value },
    };
  });
  ctx.submit(commands);
}

export function configureMindmap(ctx: MindmapAgentCandidate, op: Operation) {
  mindKeys(
    op,
    [
      "kind",
      "id",
      "layout",
      "themeId",
      "themeStyle",
      "theme",
      "background",
      "border",
      "textColor",
      "sketch",
      "reset",
      "saveAsDefault",
    ],
    "operation"
  );
  const node = ctx.node(op.id),
    root = ctx.root(node);
  if (op.saveAsDefault !== undefined && mindBoolean(op.saveAsDefault, "saveAsDefault")) {
    if (ctx.request.operations.length !== 1)
      mindError("HOST_ACTION_MUST_BE_STANDALONE", "保存本机默认值必须单独一批执行", {
        path: "saveAsDefault",
        suggestion: "先完成白板编辑，再用单个 configure 操作保存默认值。",
      });
    ctx.guard(root.id, "style");
  }
  const mapFields = ["layout", "themeId", "themeStyle", "theme"];
  const reset = op.reset === undefined ? [] : mindIds(op.reset, "reset", 12);
  const supported = [...mapFields, "background", "border", "textColor", "sketch"];
  if (reset.some(key => !supported.includes(key)))
    mindError("UNKNOWN_FIELD", "reset 包含不可恢复的属性", {
      path: "reset",
      expected: supported,
      actual: reset,
    });
  for (const key of supported)
    if (op[key] !== undefined && reset.includes(key))
      mindError("AMBIGUOUS_EDIT", "不能同时设置和恢复同一属性", { path: key });
  const mapPatch: Record<string, WhiteboardJson> = {},
    nodePatch: Record<string, WhiteboardJson> = {};
  if (op.layout !== undefined) {
    ctx.guard(root.id, "structure");
    mapPatch.layout = mindEnum(op.layout, mindCapabilities.layouts, "layout");
  }
  if (op.themeId !== undefined)
    mapPatch.themeId = mindEnum(
      op.themeId,
      mindCapabilities.palettes.map(p => p.id),
      "themeId"
    );
  if (op.themeStyle !== undefined)
    mapPatch.themeStyle = mindEnum(op.themeStyle, mindCapabilities.themeStyles, "themeStyle");
  if (op.theme !== undefined) mapPatch.theme = mindEnum(op.theme, ["light", "dark"], "theme");
  for (const key of ["background", "border", "textColor"])
    if (op[key] !== undefined) nodePatch[key] = mindString(op[key], key, 128);
  if (Object.keys(mapPatch).length || reset.some(key => mapFields.includes(key))) {
    ctx.guard(root.id, "style");
    if (op.layout !== undefined || reset.includes("layout")) ctx.guard(root.id, "fold");
    ctx.submit([
      {
        type: "set_data",
        id: root.id,
        patch: mapPatch,
        unset: reset.filter(key => mapFields.includes(key)),
      },
    ]);
    if (op.layout !== undefined || reset.includes("layout")) {
      const changed = ctx.node(root.id),
        tree = mindStructure(changed),
        before = mindIndex(ctx.page()).nodes;
      normalizeTree(tree, isSingleMindLayout(changed.data.layout));
      const folds: WhiteboardModelCommand[] = [];
      const walk = (entry: MindNodeElement) => {
        const old = before.get(entry.id);
        if (
          old &&
          (Boolean(old.data.isLeftFold) !== Boolean(entry.isLeftFold) ||
            Boolean(old.data.isRightFold) !== Boolean(entry.isRightFold))
        )
          folds.push({
            type: "set_data",
            id: entry.id,
            patch: {
              isLeftFold: Boolean(entry.isLeftFold),
              isRightFold: Boolean(entry.isRightFold),
            },
          });
        entry.children.forEach(walk);
      };
      walk(tree);
      ctx.submit(folds);
    }
  }
  if (
    Object.keys(nodePatch).length ||
    reset.some(key => ["background", "border", "textColor"].includes(key))
  ) {
    ctx.guard(node.id, "style");
    ctx.submit([
      {
        type: "set_data",
        id: node.id,
        patch: nodePatch,
        unset: reset.filter(key => ["background", "border", "textColor"].includes(key)),
      },
    ]);
  }
  if (op.sketch !== undefined || reset.includes("sketch")) {
    ctx.guard(root.id, "style");
    const value: Record<string, WhiteboardJson> = {};
    if (op.sketch !== undefined) {
      const sketch = mindObject(op.sketch, "sketch");
      mindKeys(sketch, ["mode", "level", "seed"], "sketch");
      if (sketch.mode !== undefined)
        value.mode = mindEnum(sketch.mode, ["normal", "sketch"], "sketch.mode");
      if (sketch.level !== undefined)
        value.level = mindEnum(sketch.level, ["neat", "natural", "loose"], "sketch.level");
      if (sketch.seed !== undefined)
        value.seed = mindInteger(sketch.seed, "sketch.seed", 0, 2147483647);
    }
    ctx.submit([
      {
        type: "set_node",
        id: root.id,
        patch: { style: { sketch: reset.includes("sketch") ? null : value } },
      },
    ]);
  }
  if (!supported.some(key => op[key] !== undefined) && !reset.length && op.saveAsDefault !== true)
    mindError("EMPTY_EDIT", "没有提供布局或样式修改", { expected: supported });
}
