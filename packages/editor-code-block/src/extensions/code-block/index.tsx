import loadable from "@loadable/component";
import React from "react";

import { defineElement, defineExtension, type ElementRenderProps } from "@tau/editor/api";

import type { CodeBlockElement } from "../../types";

import blockPanelItems from "./block-panel-items";
import { codeBlockCommands, codeBlockMenuItems } from "./utils/menu";
import { codeBlockHotkeyCommands, codeBlockHotkeys } from "./commands";
import { codeBlockForParagraph } from "./behaviors";
import { codeBlockMap } from "./utils/controllerMaps";
import type { CodeBlockController } from "./types";

// loadable 组件走 Suspense，加载期间内核渲染保留结构的空壳
const CodeBlock = loadable(() => import("./components/CodeBlock"));

const codeBlockExtension = defineExtension({
  id: "tau.code-block",
  elements: [
    defineElement<CodeBlockElement>({
      type: "code-block",
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
  commands: [...codeBlockCommands, ...codeBlockHotkeyCommands],
  menu: codeBlockMenuItems,
  hotkeys: codeBlockHotkeys,
  behaviorsFor: {
    paragraph: codeBlockForParagraph,
  },
});

export default codeBlockExtension;
