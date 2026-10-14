/** 内置"选择"工具 id（非创建模式的哨兵值） */
export const SELECT_TOOL_ID = "tau.select";

/** 内置创建工具 id（工具按钮、右键菜单与扩展装配共用同一常量） */
export const GEOMETRY_TOOL_ID = "tau.geometry.create";
export const STICKMAN_TOOL_ID = "tau.stickman.create";
export const ARROW_TOOL_ID = "tau.arrow.create";
export const HANDWRITE_TOOL_ID = "tau.handwrite.create";
export const RICHTEXT_TOOL_ID = "tau.richtext.create";
export const MIND_TOOL_ID = "tau.mind.create";
export const FRAME_TOOL_ID = "tau.frame.create";
export const COLUMN_TOOL_ID = "tau.column.create";

export const builtinCreateToolIds = new Set([
  GEOMETRY_TOOL_ID,
  STICKMAN_TOOL_ID,
  ARROW_TOOL_ID,
  HANDWRITE_TOOL_ID,
  RICHTEXT_TOOL_ID,
  MIND_TOOL_ID,
  FRAME_TOOL_ID,
  COLUMN_TOOL_ID,
]);
