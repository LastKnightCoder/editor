import { RenderElementProps } from "slate-react";

import Base from "../../extensions/base";
import { IConfigItem, StyledTextElement } from "../../types";
import IExtension from "../../extensions/types";

import StyledText from "./components/StyledText";
import hoveringBarConfigs from "./hovering-bar-configs";
import { createInlineElementPlugin } from "../../utils";

class StyledTextExtension extends Base implements IExtension {
  override type = "styled-text";

  override getHoveringBarElements(): IConfigItem[] {
    return hoveringBarConfigs;
  }

  override getPlugins() {
    return [createInlineElementPlugin(this.type)];
  }

  render(props: RenderElementProps) {
    const { attributes, children, element } = props;

    return (
      <StyledText
        attributes={attributes}
        element={element as unknown as StyledTextElement}
      >
        {children}
      </StyledText>
    );
  }
}

export default StyledTextExtension;
