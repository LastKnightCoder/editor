import Header from '@/components/Editor/components/Header';
import { HeaderElement } from "@/components/Editor/types";
import IExtension from "../types.ts";
import { RenderElementProps } from "slate-react";
import { withHeader } from "./plugins";

export class HeaderExtension implements IExtension {
  type = 'header';
  getPlugins = () => {
    return [withHeader];
  }
  render = (props: RenderElementProps) => {
    const { element, attributes, children } = props;
    return <Header element={element as HeaderElement} attributes={attributes}>{children}</Header>;
  }
  getHotkeyConfig = () => [];
}