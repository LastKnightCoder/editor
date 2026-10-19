import { defineElement, defineExtension, type ElementRenderProps } from "@tau/editor/api";
import "./augmentations";

import { type AnnotationElement } from "./types.ts";

import blockPanelItems from "./block-panel-items/index.ts";
import Annotation from "./components/Annotation/index.tsx";
import { annotationCommands, annotationHotkeys } from "./commands.ts";

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
export type { AnnotationElement } from "./types";
export { insertAnnotation, isAnnotationActive } from "./operations";
