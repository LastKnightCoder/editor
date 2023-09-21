import React from "react";

export type Mark = 'bold' | 'italic' | 'code' | 'underline' | 'highlight' | 'strikethrough';
export interface IConfigItem {
  text: string;
  active: boolean;
  onClick: (event: React.MouseEvent) => void;
}