import { RenderElementProps } from "slate-react";
import { Editor as CodeMirrorEditor } from "codemirror";

import loadable from "@loadable/component";

import { CodeBlockElement } from "@/components/Editor/types";

import Base from "../base.ts";
import IExtension from "../types.ts";
import { createBlockElementPlugin, createVoidElementPlugin } from "../../utils";

import { deleteBackward, markdownSyntax } from "./plugins";
import hotkeys from "./hotkeys";
import blockPanelItems from "./block-panel-items";

const CodeBlock = loadable(() => import("./components/CodeBlock"));

export const codeBlockMap = new Map<string, CodeMirrorEditor>();

class CodeBlockExtension extends Base implements IExtension {
  override type = "code-block";

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
    const onDidMount = (codeMirrorEditor: CodeMirrorEditor) => {
      codeBlockMap.set((element as CodeBlockElement).uuid, codeMirrorEditor);
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
