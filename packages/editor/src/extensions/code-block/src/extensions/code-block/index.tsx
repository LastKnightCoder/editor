import loadable from "@loadable/component";
import React from "react";

import { defineElement, defineExtension, type ElementRenderProps } from "@tau/editor/api";

import type { CodeBlockElement, CodeBlockV2Element, CodeStepElement } from "../../types";

import blockPanelItems from "./block-panel-items";
import { codeBlockCommands, codeBlockMenuItems } from "./utils/menu";
import { codeBlockHotkeyCommands, codeBlockHotkeys } from "./commands";
import { codeBlockForParagraph } from "./behaviors";
import { codeBlockMap } from "./utils/controllerMaps";
import type { CodeBlockController } from "./types";
import { codeBlockHighlightCommands } from "./highlightCommands";

// loadable 组件走 Suspense，加载期间内核渲染保留结构的空壳
const CodeBlock = loadable(() => import("./components/CodeBlock"));

const codeBlockExtension = defineExtension({
  id: "tau.code-block",
  elements: [
    defineElement<CodeBlockElement>({
      type: "code-block",
      dataVersion: 1,
      collaboration: { textFields: ["code"] },
      kind: "block",
      isVoid: true,
      isEmpty: element => element.code === "",
      render: ({ attributes, element, children }: ElementRenderProps<CodeBlockElement>) => (
        <React.Fragment>
          <CodeBlock
            element={element}
            attributes={attributes}
            onDidMount={(controller: CodeBlockController) => {
              codeBlockMap.set(element.uuid, controller);
            }}
            onWillUnmount={() => {
              codeBlockMap.delete(element.uuid);
            }}
          >
            {children}
          </CodeBlock>
        </React.Fragment>
      ),
      drag: true,
    }),
  ],
  blockPanel: blockPanelItems,
  commands: [...codeBlockCommands, ...codeBlockHotkeyCommands, ...codeBlockHighlightCommands],
  menu: codeBlockMenuItems,
  hotkeys: codeBlockHotkeys,
  behaviorsFor: {
    paragraph: codeBlockForParagraph,
  },
});

export const codeStepElement = defineElement<CodeStepElement>({
  type: "code-step",
  dataVersion: 1,
  kind: "block",
  collaboration: { textFields: ["code"] },
  isEmpty: element => element.code === "",
  render: ({ attributes, element, children }) => (
    <div {...attributes} contentEditable={false}>
      <pre>{element.code}</pre>
      {children}
    </div>
  ),
});

export const codeBlockV2Extension = defineExtension({
  ...codeBlockExtension,
  elements: [
    defineElement<CodeBlockV2Element>({
      type: "code-block",
      dataVersion: 2,
      kind: "block",
      isVoid: true,
      previousVersions: [{ element: codeBlockExtension.elements![0], access: "read" }],
      isEmpty: element => element.children.every(step => step.code === ""),
      render: ({ attributes, element, children }) => (
        <CodeBlock
          element={element}
          attributes={attributes}
          onDidMount={controller => codeBlockMap.set(element.uuid, controller)}
          onWillUnmount={() => codeBlockMap.delete(element.uuid)}
        >
          {children}
        </CodeBlock>
      ),
      drag: true,
    }),
    codeStepElement,
  ],
});

export default codeBlockExtension;
