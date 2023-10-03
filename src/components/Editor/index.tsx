import {useState, useEffect, forwardRef, useImperativeHandle} from "react";
import { createEditor, Descendant, Editor, Transforms } from 'slate';
import {Slate, Editable, withReact, ReactEditor} from 'slate-react';
import { withHistory } from 'slate-history';
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'

import { DEFAULT_CARD_CONTENT } from "@/constants";

import { applyPlugin, registerHotKey } from "./utils";
import {
  withOverrideSettings,
  withSlashCommands
} from "./plugins";
import hotKeyConfigs from "./hotkeys";
import { renderElement, renderLeaf } from "./renderMethods";
import { usePressedKeyStore } from "./stores";

import ImagesOverview from "./components/ImagesOverview";
import Command from "./components/Command";
import HoveringToolbar from "./components/HoveringToolbar";
import BlockPanel from "./components/BlockPanel";

import 'codemirror/mode/stex/stex.js';
import 'codemirror/mode/javascript/javascript.js';
import 'codemirror/mode/jsx/jsx.js';
import 'codemirror/mode/rust/rust.js';
import 'codemirror/mode/go/go.js';
import 'codemirror/mode/css/css.js';
import 'codemirror/mode/htmlmixed/htmlmixed.js';
import 'codemirror/mode/clike/clike.js';
import 'codemirror/mode/shell/shell.js';
import 'codemirror/mode/python/python.js';
import 'codemirror/mode/sql/sql.js';
import 'codemirror/mode/markdown/markdown.js';
import 'codemirror/mode/yaml/yaml.js';
import 'codemirror/mode/vue/vue.js';

import 'codemirror/addon/edit/closebrackets.js';

import 'codemirror/lib/codemirror.css';
import 'codemirror/theme/blackboard.css';

import Editor2 from './editor.tsx';
import {startExtensions} from "@/components/Editor/extensions";

export type EditorRef = {
  focus: () => void;
  setEditorValue: (value: Descendant[]) => void;
  getEditor: () => Editor;
  scrollHeaderIntoView: (index: number) => void;
}

interface IEditorProps {
  initValue?: Descendant[];
  onChange?: (value: Descendant[]) => void;
  readonly?: boolean;
  uploadImage?: (file: File) => Promise<{
    content: {
      download_url: string;
    }
  }>;
}

const plugins = [
  withReact,
  withHistory,
  withOverrideSettings,
  withSlashCommands
];

const Index = forwardRef<EditorRef, IEditorProps>((props, ref) => {
  const { initValue = DEFAULT_CARD_CONTENT, onChange, readonly = true } = props;
  const [editor] = useState(() => applyPlugin(createEditor(), plugins));
  const [isNormalized, setIsNormalized] = useState(false);

  useEffect(() => {
    if (!isNormalized) {
      Editor.normalize(editor, { force: true });
      setIsNormalized(true);
    }
  });

  useImperativeHandle(ref, () => ({
    focus: () => {
      ReactEditor.focus(editor);
      // 移动到末尾
      Transforms.select(editor, Editor.end(editor, []));
    },
    setEditorValue: (nodes: Descendant[]) => {
      const children = [...editor.children]
      children.forEach((node) => editor.apply({ type: 'remove_node', path: [0], node }))
      nodes.forEach((node, i) => editor.apply({ type: 'insert_node', path: [i], node: node }))
      const point = Editor.end(editor, [])
      Transforms.select(editor, point)
    },
    getEditor: () => editor,
    scrollHeaderIntoView: (index: number) => {
      const headers = editor.children.filter(node => node.type === 'header');
      const header = headers[index];
      if (!header) return;
      const dom = ReactEditor.toDOMNode(editor, header);
      dom.scrollIntoView({
        behavior: 'smooth',
      });
    }
  }));

  const { listenKeyPressed, resetPressedKey, isReset } = usePressedKeyStore(state => ({
    listenKeyPressed: state.listenKeyPressed,
    resetPressedKey: state.resetPressedKey,
    isReset: state.isReset
  }));

  const handleOnChange = (value: Descendant[]) => {
    onChange && onChange(value);
  }

  return (
    <DndProvider backend={HTML5Backend}>
      <Slate editor={editor} initialValue={initValue} onChange={handleOnChange} >
        <Editable
          readOnly={readonly}
          renderElement={renderElement(editor)}
          renderLeaf={renderLeaf()}
          placeholder={'写下你的想法...'}
          onKeyDown={(event) => {
            registerHotKey(editor, event, hotKeyConfigs);
            listenKeyPressed(event);
          }}
          onKeyUp={() => {
            // 防止重复触发，频繁更新组件，编辑体验不好
            if (!isReset) {
              resetPressedKey();
            }
          }}
        />
        <ImagesOverview />
        { !readonly && <Command /> }
        { !readonly && <HoveringToolbar /> }
        <BlockPanel />
      </Slate>
    </DndProvider>
  )
});
const Index2 = forwardRef<EditorRef, IEditorProps>((props, ref) => {
  return (
    <Editor2 extensions={startExtensions} {...props} ref={ref} />
  )
});

// export default Index;
export default Index2;