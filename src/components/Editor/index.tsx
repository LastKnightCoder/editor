import {useState, useEffect, forwardRef, useImperativeHandle, useCallback, useMemo} from "react";
import { createEditor, Descendant, Editor, Transforms } from 'slate';
import {Slate, Editable, withReact, ReactEditor, RenderElementProps, RenderLeafProps} from 'slate-react';
import { withHistory } from 'slate-history';

import { DEFAULT_CARD_CONTENT } from "@/constants";

import { applyPlugin, registerHotKey, Plugin } from "./utils";
import { withOverrideSettings, withSlashCommands } from "@/components/Editor/plugins";
import IExtension from "@/components/Editor/extensions/types.ts";

import hotkeys from './hotkeys';
import ImagesOverview from "./components/ImagesOverview";
import Command from "./components/Command";
import HoveringToolbar from "./components/HoveringToolbar";
import BlockPanel from "./components/BlockPanel";
import FormattedText from "@/components/Editor/components/FormattedText";
import { startExtensions } from "@/components/Editor/extensions";

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
  extensions?: IExtension[];
  uploadImage?: (file: File) => Promise<{
    content: {
      download_url: string;
    }
  }>;
}

const defaultPlugins: Plugin[] = [
  withReact,
  withHistory,
  withOverrideSettings,
  withSlashCommands,
];

const Index = forwardRef<EditorRef, IEditorProps>((props, ref) => {
  const { initValue = DEFAULT_CARD_CONTENT, onChange, readonly = true, extensions = [] } = props;

  const finalExtensions = useMemo(() => {
    return [...startExtensions, ...extensions];
  }, [extensions]);

  const [editor] = useState(() => {
    const extensionPlugins = finalExtensions.map(extension => extension.getPlugins()).flat();
    return applyPlugin(createEditor(), defaultPlugins.concat(extensionPlugins))
  });

  const hotKeyConfigs = useMemo(() => {
    return finalExtensions.map(extension => extension.getHotkeyConfigs()).flat().concat(hotkeys);
  }, [finalExtensions]);

  const renderElement = useCallback((props: RenderElementProps) => {
    const { type } = props.element;
    const extension = finalExtensions.find(extension => extension.type === type);
    if (extension) {
      return extension.render(props);
    }
    return <p contentEditable={false} {...props}>无法识别的类型 {type} {props.children}</p>;
  }, [finalExtensions]);

  const renderLeaf = useCallback((props: RenderLeafProps) => {{
    const { attributes, children, leaf } = props;
    return <FormattedText leaf={leaf} attributes={attributes} >{children}</FormattedText>
  }}, []);

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

  const handleOnChange = (value: Descendant[]) => {
    onChange && onChange(value);
  }

  return (
      <Slate
        editor={editor}
        initialValue={initValue}
        onChange={handleOnChange}
      >
        <Editable
          readOnly={readonly}
          renderElement={renderElement}
          renderLeaf={renderLeaf}
          placeholder={'写下你的想法...'}
          onKeyDown={(event) => {
            registerHotKey(editor, event, hotKeyConfigs);
          }}
        />
        <ImagesOverview />
        { !readonly && <Command /> }
        { !readonly && <HoveringToolbar /> }
        <BlockPanel extensions={finalExtensions} />
      </Slate>
  )
});

export default Index;
