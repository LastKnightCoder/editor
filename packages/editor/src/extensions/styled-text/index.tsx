import { defineElement, defineExtension, type ElementRenderProps } from "../../api";

import type { StyledTextElement } from "../../types";
import StyledText from "./components/StyledText";
import hoveringBarConfigs from "./hovering-bar-configs";

const styledTextExtension = defineExtension({
  id: "tau.styled-text",
  elements: [
    defineElement<StyledTextElement>({
      type: "styled-text",
      kind: "inline",
      render: ({ attributes, element, children }: ElementRenderProps<StyledTextElement>) => (
        <StyledText attributes={attributes} element={element}>
          {children}
        </StyledText>
      ),
    }),
  ],
  toolbar: hoveringBarConfigs,
});

export default styledTextExtension;
