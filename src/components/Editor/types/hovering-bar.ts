import React from "react";

export type Mark =
  | "bold"
  | "italic"
  | "code"
  | "underline"
  | "highlight"
  | "strikethrough"
  | "color";

export interface IConfigItem {
  id: string;
  element: React.FC;
  order: number;
}
