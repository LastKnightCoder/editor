import loadable from "@loadable/component";
import { CustomBlockElement } from "@/components/Editor/types";

import { RenderElementProps } from "slate-react";

import Base from '../base.ts';
import IExtension from "../types.ts";

const CustomBlock = loadable(() => import("@/components/Editor/components/CustomBlock"));

class CustomBlockExtension extends Base implements IExtension {
  type = 'custom-block';

  render(props: RenderElementProps) {
    const { element, attributes, children } = props;
    return <CustomBlock element={element as CustomBlockElement} attributes={attributes}>{children}</CustomBlock>;
  }
}

export default CustomBlockExtension;