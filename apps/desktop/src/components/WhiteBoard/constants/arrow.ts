export const ARROW_SIZE = 6;
// 全不透明：淡弱由消费端 fillOpacity 控制（ArrowConnectPoint 默认 0.8），避免双重透明叠加过淡
export const ARROW_CONNECT_POINT_FILL = "var(--tau-accent)";
export const ARROW_CONNECT_POINT_RADIUS = 4;
export const ARROW_CONNECT_PROXIMITY_RADIUS = 28;
export const ARROW_CONNECT_PROXIMITY_HIDE_DELAY = 80;

export const DEFAULT_ARROW_LINE_COLOR = "currentColor";
export const DEFAULT_ARROW_LINE_WIDTH = 2;

// 连接点标识。前 5 个为固定连接点（上下左右中），custom 为自定义连接点，
// 其坐标由 ArrowBound.customOffset（相对图形 bbox 的 uv 比例）确定。
export const ARROW_CONNECT_ID = {
  TOP: "top",
  BOTTOM: "bottom",
  LEFT: "left",
  RIGHT: "right",
  CENTER: "center",
  CUSTOM: "custom",
} as const;

// 自定义连接点吸附阈值（屏幕像素），除以 zoom 换算到世界坐标；
// 同时保证不低于 useDropArrow 的外扩框(10 世界单位)，避免外扩命中却被阈值拒绝。
export const ARROW_CUSTOM_CONNECT_PROXIMITY = 14;
export const ARROW_CUSTOM_CONNECT_MIN_WORLD = 12;

// 自定义连接点常驻标记半径
export const ARROW_CUSTOM_BIND_MARKER_RADIUS = 3.5;
