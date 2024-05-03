import { Element } from 'slate';
import { RenderElementProps } from "slate-react";
import { Editor as CodeMirrorEditor } from "codemirror";

import loadable from "@loadable/component";


import { CodeBlockElement } from "@/components/Editor/types";

import Base from '../base.ts';
import IExtension from "../types.ts";

import { deleteBackward, markdownSyntax } from './plugins';
import hotkeys from './hotkeys';
import blockPanelItems from './block-panel-items';

const CodeBlock = loadable(() => import("./components/CodeBlock"));

export const codeBlockMap = new Map<string, CodeMirrorEditor>();

class CodeBlockExtension extends Base implements IExtension {
  override type = 'code-block';

  override getPlugins() {
    return [deleteBackward, markdownSyntax];
  }

  override getHotkeyConfigs() {
    return hotkeys;
  }

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  override toMarkdown(element: Element): string {
    const codeBlockEle = element as unknown as CodeBlockElement;
    const { language, code } = codeBlockEle;
    return `\`\`\`${language}\n${code}\n\`\`\`\n`;
  }

  render(props: RenderElementProps) {
    const { element, attributes, children } = props;
    const onDidMount = (codeMirrorEditor: CodeMirrorEditor) => {
      codeBlockMap.set((element as CodeBlockElement).uuid, codeMirrorEditor)
    }
    const onWillUnmount = () => {
      codeBlockMap.delete((element as CodeBlockElement).uuid);
    }

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
