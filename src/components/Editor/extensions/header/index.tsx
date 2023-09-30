import Header from '@/components/Editor/components/Header';
import { HeaderElement } from "@/components/Editor/types";

import { RenderElementProps } from "slate-react";

import Base from '../base.ts';
import IExtension from "../types.ts";

import { withHeader } from "./plugins";
import headerHotKeys from "./hotkeys";

class HeaderExtension extends Base implements IExtension {
  type = 'header';
  override getPlugins() {
    return [withHeader];
  }
  render(props: RenderElementProps) {
    const { element, attributes, children } = props;
    return <Header element={element as HeaderElement} attributes={attributes}>{children}</Header>;
  }
  override getHotkeyConfigs() {
    return headerHotKeys;
  }
}

export default HeaderExtension;