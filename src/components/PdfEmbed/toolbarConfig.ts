export type ToolbarSectionKey = "nav" | "view" | "annotate" | "actions";

export const TOOLBAR_SECTIONS: ToolbarSectionKey[] = [
  "nav",
  "view",
  "annotate",
  "actions",
];

export interface ToolbarLayoutConfig {
  maxWidth: number;
  rows: ToolbarSectionKey[][];
}

export const TOOLBAR_LAYOUTS: ToolbarLayoutConfig[] = [
  {
    maxWidth: 720,
    rows: [
      ["nav", "view"],
      ["annotate", "actions"],
    ],
  },
  {
    maxWidth: 1100,
    rows: [["nav", "view", "annotate"], ["actions"]],
  },
  {
    maxWidth: Infinity,
    rows: [
      ["nav", "view", "annotate", "actions"],
      // [],
    ],
  },
];
