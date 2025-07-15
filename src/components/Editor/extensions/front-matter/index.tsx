import { RenderElementProps } from "slate-react";
import { FrontMatterElement } from "@/components/Editor/types";

import FrontMatter from "./components/FrontMatter";
import { createBlockElementPlugin, createVoidElementPlugin } from "../../utils";
import IExtension from "../types.ts";
import Base from "../base.ts";

class FrontMatterExtension extends Base implements IExtension {
  type = "front-matter";

  override getPlugins() {
    return [
      createBlockElementPlugin(this.type),
      createVoidElementPlugin(this.type),
    ];
  }

  render(props: RenderElementProps) {
    const { element, attributes, children } = props;
    return (
      <FrontMatter
        element={element as FrontMatterElement}
        attributes={attributes}
      >
        {children}
      </FrontMatter>
    );
  }
}

export default FrontMatterExtension;
