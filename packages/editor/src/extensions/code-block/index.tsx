import { RenderElementProps } from "slate-react";

import loadable from "@loadable/component";

import type { CodeBlockElement } from "../../types";

import Base from "../base";
import IExtension from "../types";
import { createBlockElementPlugin, createVoidElementPlugin } from "../../utils";

import { deleteBackward, markdownSyntax } from "./plugins";
import hotkeys from "./hotkeys";
import blockPanelItems from "./block-panel-items";
import { codeBlockCommands, codeBlockMenuItems } from "./utils/menu";
import { codeBlockMap } from "./utils/controllerMaps";
import type { CodeBlockController } from "./types";

const CodeBlock = loadable(() => import("./components/CodeBlock"));

class CodeBlockExtension extends Base implements IExtension {
  override type = "code-block";

  override commands = codeBlockCommands;
  override menuItems = codeBlockMenuItems;

  override getPlugins() {
    return [
      deleteBackward,
      markdownSyntax,
      createBlockElementPlugin(this.type),
      createVoidElementPlugin(this.type),
    ];
  }

  override getHotkeyConfigs() {
    return hotkeys;
  }

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  render(props: RenderElementProps) {
    const { element, attributes, children } = props;
    const onDidMount = (controller: CodeBlockController) => {
      codeBlockMap.set((element as CodeBlockElement).uuid, controller);
    };
    const onWillUnmount = () => {
      codeBlockMap.delete((element as CodeBlockElement).uuid);
    };

    return (
      <CodeBlock
        element={element as CodeBlockElement}
        attributes={attributes}
        onDidMount={onDidMount}
        onWillUnmount={onWillUnmount}
      >
        {children}
      </CodeBlock>
    );
  }
}

export default CodeBlockExtension;
