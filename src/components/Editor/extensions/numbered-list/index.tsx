import { RenderElementProps } from "slate-react";
import NumberedList from "@/components/Editor/components/NumberedList";
import { NumberedListElement } from "@/components/Editor/types";

import { markdownSyntax } from './plugins';
import Base from '../base.ts';
import IExtension from "../types.ts";

class NumberedListExtension extends Base implements IExtension {
  type = 'numbered-list';
  override getPlugins() {
    return [markdownSyntax];
  }
  render(props: RenderElementProps) {
    const { element, attributes, children } = props;
    return <NumberedList element={element as NumberedListElement} attributes={attributes}>{children}</NumberedList>;
  }
}

export default NumberedListExtension;