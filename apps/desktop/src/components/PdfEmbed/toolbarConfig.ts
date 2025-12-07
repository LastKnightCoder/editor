export type ToolbarSectionKey = "nav" | "view" | "annotate";

export const TOOLBAR_SECTIONS: ToolbarSectionKey[] = [
  "nav",
  "view",
  "annotate",
];

export interface ToolbarLayoutConfig {
  maxWidth: number;
  rows: ToolbarSectionKey[][];
}

export const TOOLBAR_LAYOUTS: ToolbarLayoutConfig[] = [
  {
    maxWidth: 720,
    rows: [["nav", "view"], ["annotate"]],
  },
  {
    maxWidth: 1100,
    rows: [["nav", "view", "annotate"]],
  },
  {
    maxWidth: Infinity,
    rows: [["nav", "view", "annotate"]],
  },
];
