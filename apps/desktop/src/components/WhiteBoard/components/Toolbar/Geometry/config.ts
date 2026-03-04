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
    name: "心形",
    geometryType: "heart",
    paths: [
      "M 0.50 0.12 C 0.54 0.07 0.61 0.03 0.70 0.03 C 0.84 0.03 0.97 0.14 0.97 0.30 C 0.97 0.50 0.84 0.73 0.62 0.88 C 0.57 0.92 0.53 0.95 0.50 0.95 C 0.47 0.95 0.43 0.92 0.38 0.88 C 0.16 0.73 0.03 0.50 0.03 0.30 C 0.03 0.14 0.16 0.03 0.30 0.03 C 0.39 0.03 0.46 0.07 0.50 0.12 Z",
    ],
  },
  {
    name: "三角形",
    geometryType: "triangle",
    paths: ["M 0 0 L 1 0 L 0.5 1 Z"],
  },
];
