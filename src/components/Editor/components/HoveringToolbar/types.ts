import React from "react";

export type Mark = 'bold' | 'italic' | 'code' | 'underline' | 'highlight' | 'strikethrough' | 'color';
export interface IConfigItem {
  text: React.ReactNode;
  active: boolean;
  style?: React.CSSProperties;
  onClick: (event: React.MouseEvent) => void;
}