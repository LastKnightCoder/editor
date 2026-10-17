/** 纯色，或由 CSS linear-gradient 解析出的渐变（文本卡片常用渐变底） */
export type SchematicFill =
  string | { angle: number; stops: Array<{ color: string; offset: number }> };

export type SchematicShape =
  | {
      kind: "rect";
      x: number;
      y: number;
      w: number;
      h: number;
      r: number;
      fill: SchematicFill;
      fillOpacity?: number;
      stroke?: string;
      /** 输出像素 */
      strokeWidth?: number;
    }
  | {
      kind: "path";
      d: string;
      fill?: string;
      fillOpacity?: number;
      stroke?: string;
      strokeOpacity?: number;
      /** 输出像素 */
      strokeWidth?: number;
      /** 归一化路径（0~1）放进元素框：translate(x y) scale(w h) */
      box?: { x: number; y: number; w: number; h: number };
    }
  | {
      /** 箭头端点的三角：尺寸按输出像素，组件按缩放换算 */
      kind: "arrowhead";
      x: number;
      y: number;
      angle: number;
      color: string;
    };
