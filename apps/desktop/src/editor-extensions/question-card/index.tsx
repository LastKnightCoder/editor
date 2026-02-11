import { RenderElementProps } from "slate-react";
import { Base } from "@tau/editor/src";
import { IExtension } from "@tau/editor/src";

import { withQuestion } from "./plugins";
import blockPanelItems from "./block-panel-items";
import QuestionCard from "./components/QuestionCard";
export type { QuestionElement } from "./types";

class QuestionCardExtension extends Base implements IExtension {
  type = "question";

  override getPlugins() {
    return [withQuestion];
  }

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  render(props: RenderElementProps) {
    const { element, attributes, children } = props;

    return (
      <QuestionCard attributes={attributes} element={element as any}>
        {children}
      </QuestionCard>
    );
  }
}

export default QuestionCardExtension;
