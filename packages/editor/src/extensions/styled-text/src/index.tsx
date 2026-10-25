import { defineElement, defineExtension, type ElementRenderProps } from "@tau/editor/api";

import { type StyledTextElement } from "./types.ts";
import StyledText from "./components/StyledText/index.tsx";
import hoveringBarConfigs from "./hovering-bar-configs/index.ts";

const styledTextExtension = defineExtension({
  id: "tau.styled-text",
  elements: [
    defineElement<StyledTextElement>({
      type: "styled-text",
      dataVersion: 1,
      kind: "inline",
      isEmpty: element => element.children.length === 1 && element.children[0].text === "",
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
export type { StyledTextElement } from "./types";
export { wrapStyledText, unwrapStyledText } from "./selection";
import "./augmentations";
