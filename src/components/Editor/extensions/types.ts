import { Element } from 'slate';
import { RenderElementProps } from "slate-react";
import { Plugin } from "../utils";
import { IBlockPanelListItem, IHotKeyConfig, IConfigItem } from "@/components/Editor/types";
import React from "react";

export default interface IExtension {
  type: string;
  getPlugins: () => Plugin[];
  render: (props: RenderElementProps) => JSX.Element;
  getHotkeyConfigs: () => IHotKeyConfig[];
  getBlockPanelItems: () => IBlockPanelListItem[];
  getHoveringBarElements: () => IConfigItem[];
  toMarkdown: (element: Element, children: string, parentElement: Element) => string;
}

export interface IExtensionBaseProps<T> {
  attributes: RenderElementProps['attributes'];
  element: T;
  children: React.ReactNode;
}
