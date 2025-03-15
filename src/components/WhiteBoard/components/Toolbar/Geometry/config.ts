export interface GeometryItemConfig {
  name: string;
  geometryType: string;
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
    paths: ["M 0 0 L 1 0 L 0.5 1 Z"],
  },
];
