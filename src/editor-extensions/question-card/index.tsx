import { RenderElementProps } from "slate-react";
import Base from "@/components/Editor/extensions/base.ts";
import IExtension from "@/components/Editor/extensions/types.ts";
import { Descendant } from "slate";

import { withQuestion } from "./plugins";
import blockPanelItems from "./block-panel-items";
import QuestionCard from "./components/QuestionCard";

export interface QuestionElement {
  type: "question";
  questionId: number;
  title: string;
  children: Descendant[];
}

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
