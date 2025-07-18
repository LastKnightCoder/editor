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
      "M0.67 0.13 c-0.06 0.00 -0.10 0.02 -0.17 0.07 C0.43 0.14 0.40 0.13 0.33 0.13 c-0.13 0.00 -0.25 0.10 -0.25 0.25 c0.00 0.25 0.33 0.50 0.42 0.50 s0.42 -0.25 0.42 -0.50 c0.00 -0.15 -0.13 -0.25 -0.25 -0.25 z",
    ],
  },
  {
    name: "三角形",
    geometryType: "triangle",
    paths: ["M 0 0 L 1 0 L 0.5 1 Z"],
  },
];
