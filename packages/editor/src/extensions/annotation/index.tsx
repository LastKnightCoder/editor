import { defineElement, defineExtension, type ElementRenderProps } from "../../api";

import type { AnnotationElement } from "../../types";

import blockPanelItems from "./block-panel-items/index";
import Annotation from "./components/Annotation/index.tsx";
import { annotationCommands, annotationHotkeys } from "./commands";

const annotationExtension = defineExtension({
  id: "tau.annotation",
  elements: [
    defineElement<AnnotationElement>({
      type: "annotation",
      kind: "inline",
      isVoid: true,
      render: ({ attributes, element, children }: ElementRenderProps<AnnotationElement>) => (
        <Annotation element={element} attributes={attributes}>
          {children}
        </Annotation>
      ),
    }),
  ],
  blockPanel: blockPanelItems,
  commands: annotationCommands,
  hotkeys: annotationHotkeys,
});

export default annotationExtension;
