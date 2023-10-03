import Base from '../base.ts';
import IExtension from '../types.ts';
import { RenderElementProps } from "slate-react";
import DivideLine from "@/components/Editor/components/DivideLine";
import { DivideLineElement } from "@/components/Editor/types";
import { markdownSyntax } from './plugins';

class DivideLineExtension extends Base implements IExtension {
  type = 'divide-line';

  override getPlugins() {
    return [markdownSyntax]
  }

  render(props: RenderElementProps) {
    const { attributes, children, element } = props;
    return (
      <DivideLine attributes={attributes} element={element as DivideLineElement}>
        {children}
      </DivideLine>
    )
  }
}

export default DivideLineExtension;