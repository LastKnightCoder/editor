import {useState, useEffect, forwardRef, useImperativeHandle} from "react";

import { createEditor, Descendant, Editor, Transforms } from 'slate';
import {Slate, Editable, withReact, ReactEditor} from 'slate-react';
import { withHistory } from 'slate-history';

import { applyPlugin, registerHotKey } from "./utils";
import {
  withMarkdownShortcuts,
  withOverrideSettings,
  withInsertBreak,
  withDeleteBackward,
  withPasteImage,
  withSlashCommands
} from "./plugins";
import hotKeyConfigs from "./hotkeys";
import { renderElement, renderLeaf } from "./renderMethods";
import { useGithubStore, usePressedKeyStore } from "./stores";

import ImagesOverview from "./components/ImagesOverview";
import { MathJaxContext } from "better-react-mathjax";
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

import { mathjaxConfig } from "./configs";

export type EditorRef = {
  focus: () => void;
  setEditorValue: (value: Descendant[]) => void;
  getEditor: () => Editor;
}

interface IEditorProps {
  initValue: Descendant[];
  onChange?: (value: Descendant[]) => void;
  readonly?: boolean;
}

const plugins = [
  withReact,
  withHistory,
  withOverrideSettings,
  withMarkdownShortcuts,
  withInsertBreak,
  withDeleteBackward,
  withPasteImage,
  withSlashCommands
];

const Index = forwardRef<EditorRef, IEditorProps>((props, ref) => {
  const { initValue, onChange, readonly = true } = props;
  const [editor] = useState(() => applyPlugin(createEditor(), plugins));
  const [isNormalized, setIsNormalized] = useState(false);

  useEffect(() => {
    if (!isNormalized) {
      Editor.normalize(editor, { force: true });
      setIsNormalized(true);
    }
  });

  useEffect(() => {
    const {
      setBranches,
      setRepo,
      setToken,
      setUserInfo,
      setBranch,
      setRepos,
    } = useGithubStore.getState();
    const token = localStorage.getItem('github_token') || '';
    const user = JSON.parse(localStorage.getItem('github_user') || '{}') || null;
    const repo = localStorage.getItem('github_repo') || '';
    const branches = JSON.parse(localStorage.getItem('github_branches') || '[]');
    const repos = JSON.parse(localStorage.getItem('github_repos') || '[]');
    const branch = localStorage.getItem('github_branch') || '';
    setToken(token);
    setUserInfo(user);
    setRepo(repo);
    setBranches(branches);
    setRepos(repos);
    setBranch(branch);
  }, []);

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
    <MathJaxContext config={mathjaxConfig}>
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
    </MathJaxContext>
  )
});

export default Index;
