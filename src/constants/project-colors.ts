export type ProjectColorName =
  | "berry-red"
  | "red"
  | "orange"
  | "yellow"
  | "olive-green"
  | "green"
  | "mint-green"
  | "teal"
  | "sky-blue"
  | "light-blue"
  | "blue"
  | "grape-purple"
  | "violet"
  | "light-orange"
  | "charcoal"
  | "gray"
  | "gray-brown";

export interface ProjectColor {
  name: ProjectColorName;
  label: string;
  light: string;
  dark: string;
}

export const PROJECT_COLORS: ProjectColor[] = [
  {
    name: "berry-red",
    label: "浆果红",
    light: "#B8255F",
    dark: "#D946EF", // 调整为更适合深色模式的浆果红
  },
  {
    name: "red",
    label: "红色",
    light: "#CF473A",
    dark: "#EF4444",
  },
  {
    name: "orange",
    label: "橘黄色",
    light: "#C77100",
    dark: "#F97316",
  },
  {
    name: "yellow",
    label: "黄色",
    light: "#B29104",
    dark: "#EAB308",
  },
  {
    name: "olive-green",
    label: "橄榄绿",
    light: "#949C31",
    dark: "#84CC16",
  },
  {
    name: "green",
    label: "绿色",
    light: "#369307",
    dark: "#22C55E",
  },
  {
    name: "mint-green",
    label: "薄荷绿",
    light: "#42A393",
    dark: "#14B8A6",
  },
  {
    name: "teal",
    label: "水鸭色",
    light: "#148FAD",
    dark: "#0891B2",
  },
  {
    name: "sky-blue",
    label: "天蓝色",
    light: "#319DC0",
    dark: "#0EA5E9",
  },
  {
    name: "light-blue",
    label: "淡蓝色",
    light: "#6988A4",
    dark: "#3B82F6",
  },
  {
    name: "blue",
    label: "蓝色",
    light: "#2A67E2",
    dark: "#2563EB",
  },
  {
    name: "grape-purple",
    label: "葡萄紫",
    light: "#692EC2",
    dark: "#7C3AED",
  },
  {
    name: "violet",
    label: "紫罗兰",
    light: "#AC30CC",
    dark: "#A855F7",
  },
  {
    name: "light-orange",
    label: "浅橙色",
    light: "#B2635C",
    dark: "#FB7185",
  },
  {
    name: "charcoal",
    label: "炭灰色",
    light: "#808080",
    dark: "#6B7280",
  },
  {
    name: "gray",
    label: "灰色",
    light: "#999999",
    dark: "#9CA3AF",
  },
  {
    name: "gray-brown",
    label: "灰褐色",
    light: "#8F7A69",
    dark: "#A3A3A3",
  },
];

export const getProjectColorValue = (
  colorName: ProjectColorName,
  theme: "light" | "dark" = "light",
): string => {
  const color = PROJECT_COLORS.find((c) => c.name === colorName);
  return color ? color[theme] : PROJECT_COLORS[0][theme];
};

export const getProjectColorLabel = (colorName: ProjectColorName): string => {
  const color = PROJECT_COLORS.find((c) => c.name === colorName);
  return color ? color.label : PROJECT_COLORS[0].label;
};
