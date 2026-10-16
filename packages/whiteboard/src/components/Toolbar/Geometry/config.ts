export interface GeometryItemConfig {
  name: string;
  geometryType: string;
  /** 单位方格（0~1，四边贴满）内的轮廓；创建时原样写进元素，改这里不影响已有元素 */
  paths: string[];
  defaultExtraInfo?: Record<string, any>;
}

export const geometryItems: GeometryItemConfig[] = [
  {
    name: "矩形",
    geometryType: "rectangle",
    paths: ["M 0 0 L 1 0 L 1 1 L 0 1 Z"],
    defaultExtraInfo: {
      cornerRadius: 0,
    },
  },
  {
    name: "圆形",
    geometryType: "circle",
    paths: ["M 1,0.5 A 0.5,0.5 0 1,0 0,0.5 A 0.5,0.5 0 1,0 1,0.5"],
  },
  {
    name: "三角形",
    geometryType: "triangle",
    paths: ["M 0.5 0 L 1 1 L 0 1 Z"],
  },
  {
    name: "菱形",
    geometryType: "diamond",
    paths: ["M 0.5 0 L 1 0.5 L 0.5 1 L 0 0.5 Z"],
  },
  {
    // 按实际尺寸渲染（见 Geometry/sizedShapes），这里只用于图标与缩略图
    name: "胶囊",
    geometryType: "capsule",
    paths: ["M 0.25 0 L 0.75 0 A 0.25 0.5 0 0 1 0.75 1 L 0.25 1 A 0.25 0.5 0 0 1 0.25 0 Z"],
  },
  {
    name: "平行四边形",
    geometryType: "parallelogram",
    paths: ["M 0.2 0 L 1 0 L 0.8 1 L 0 1 Z"],
  },
  {
    name: "梯形",
    geometryType: "trapezoid",
    paths: ["M 0.2 0 L 0.8 0 L 1 1 L 0 1 Z"],
  },
  {
    name: "六边形",
    geometryType: "hexagon",
    paths: ["M 0.25 0 L 0.75 0 L 1 0.5 L 0.75 1 L 0.25 1 L 0 0.5 Z"],
  },
  {
    // 同胶囊，按实际尺寸渲染
    name: "圆柱",
    geometryType: "cylinder",
    paths: [
      "M 0 0.12 A 0.5 0.12 0 0 1 1 0.12 L 1 0.88 A 0.5 0.12 0 0 1 0 0.88 Z",
      "M 0 0.12 A 0.5 0.12 0 0 0 1 0.12",
    ],
  },
  {
    name: "文档",
    geometryType: "document",
    paths: ["M 0 0 L 1 0 L 1 0.938 C 0.7 0.717 0.3 1.159 0 0.938 Z"],
  },
  {
    name: "对话气泡",
    geometryType: "speech-bubble",
    paths: [
      "M 0.1 0 L 0.9 0 Q 1 0 1 0.1 L 1 0.7 Q 1 0.8 0.9 0.8 L 0.42 0.8 L 0.2 1 L 0.26 0.8 L 0.1 0.8 Q 0 0.8 0 0.7 L 0 0.1 Q 0 0 0.1 0 Z",
    ],
  },
  {
    name: "云朵",
    geometryType: "cloud",
    paths: [
      "M 0.142 1 A 0.188 0.257 0 0 1 0.104 0.521 A 0.226 0.308 0 0 1 0.355 0.111 A 0.276 0.376 0 0 1 0.77 0.145 A 0.201 0.274 0 0 1 0.933 0.572 A 0.176 0.239 0 0 1 0.807 1 Z",
    ],
  },
  {
    name: "箭头",
    geometryType: "block-arrow",
    paths: ["M 0 0.28 L 0.6 0.28 L 0.6 0 L 1 0.5 L 0.6 1 L 0.6 0.72 L 0 0.72 Z"],
  },
  {
    name: "五角星",
    geometryType: "star",
    paths: [
      "M 0.5 0 L 0.618 0.382 L 1 0.382 L 0.691 0.618 L 0.809 1 L 0.5 0.764 L 0.191 1 L 0.309 0.618 L 0 0.382 L 0.382 0.382 Z",
    ],
  },
  {
    name: "心形",
    geometryType: "heart",
    paths: [
      "M 0.5 0.25 C 0.5 0.11 0.61 0 0.75 0 C 0.89 0 1 0.11 1 0.25 C 1 0.48 0.7 0.76 0.5 1 C 0.3 0.76 0 0.48 0 0.25 C 0 0.11 0.11 0 0.25 0 C 0.39 0 0.5 0.11 0.5 0.25 Z",
    ],
  },
];
