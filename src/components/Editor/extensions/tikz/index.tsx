import loadable from "@loadable/component";
import { TikzElement } from "@/components/Editor/types";

import { RenderElementProps } from "slate-react";

import Base from '../base.ts';
import IExtension from "../types.ts";

const Tikz = loadable(() => import("@/components/Editor/components/Tikz"));

class TikzExtension extends Base implements IExtension {
  type = 'tikz';

  render(props: RenderElementProps) {
    const { element, attributes, children } = props;
    return <Tikz element={element as TikzElement} attributes={attributes}>{children}</Tikz>;
  }
}

export default TikzExtension;
