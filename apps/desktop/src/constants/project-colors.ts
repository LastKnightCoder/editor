import type { DirectoryColor } from "@tau/shared/task-assistant";

export type ProjectColorName = DirectoryColor;

export interface ProjectColor {
  name: ProjectColorName;
  light: string;
  dark: string;
}

export const PROJECT_COLORS: ProjectColor[] = [
  {
    name: "berry-red",
    light: "#B8255F",
    dark: "#D946EF", // 调整为更适合深色模式的浆果红
  },
  {
    name: "red",
    light: "#CF473A",
    dark: "#EF4444",
  },
  {
    name: "orange",
    light: "#C77100",
    dark: "#F97316",
  },
  {
    name: "yellow",
    light: "#B29104",
    dark: "#EAB308",
  },
  {
    name: "olive-green",
    light: "#949C31",
    dark: "#84CC16",
  },
  {
    name: "green",
    light: "#369307",
    dark: "#22C55E",
  },
  {
    name: "mint-green",
    light: "#42A393",
    dark: "#14B8A6",
  },
  {
    name: "teal",
    light: "#148FAD",
    dark: "#0891B2",
  },
  {
    name: "sky-blue",
    light: "#319DC0",
    dark: "#0EA5E9",
  },
  {
    name: "light-blue",
    light: "#6988A4",
    dark: "#3B82F6",
  },
  {
    name: "blue",
    light: "#2A67E2",
    dark: "#2563EB",
  },
  {
    name: "grape-purple",
    light: "#692EC2",
    dark: "#7C3AED",
  },
  {
    name: "violet",
    light: "#AC30CC",
    dark: "#A855F7",
  },
  {
    name: "light-orange",
    light: "#B2635C",
    dark: "#FB7185",
  },
  {
    name: "charcoal",
    light: "#808080",
    dark: "#6B7280",
  },
  {
    name: "gray",
    light: "#999999",
    dark: "#9CA3AF",
  },
  {
    name: "gray-brown",
    light: "#8F7A69",
    dark: "#A3A3A3",
  },
];

export const getProjectColorValue = (
  colorName: ProjectColorName,
  theme: "light" | "dark" = "light"
): string => {
  const color = PROJECT_COLORS.find(c => c.name === colorName);
  return color ? color[theme] : PROJECT_COLORS[0][theme];
};
