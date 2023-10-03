import { RenderElementProps } from "slate-react";
import loadable from "@loadable/component";

const CodeBlock = loadable(() => import("@/components/Editor/components/CodeBlock"));
import { CodeBlockElement } from "@/components/Editor/types";

import Base from '../base.ts';
import IExtension from "../types.ts";
import { deleteBackward, markdownSyntax } from './plugins';
import hotkeys from './hotkeys';
import {Editor as CodeMirrorEditor} from "codemirror";

export const codeBlockMap = new Map<string, CodeMirrorEditor>();

class CodeBlockExtension extends Base implements IExtension {
  override type = 'code-block';
  override getPlugins() {
    return [deleteBackward, markdownSyntax];
  }
  override getHotkeyConfigs() {
    return hotkeys;
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
