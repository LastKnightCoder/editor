import {useState, useEffect, forwardRef, useImperativeHandle, useCallback, useMemo} from "react";
import { createEditor, Descendant, Editor, Transforms } from 'slate';
import { Slate, Editable, withReact, ReactEditor, RenderElementProps } from 'slate-react';
import { withHistory } from 'slate-history';

import { DEFAULT_CARD_CONTENT } from "@/constants";

import { applyPlugin, registerHotKey, Plugin } from "./utils";
import { renderLeaf } from "./renderMethods";
import IExtension from "@/components/Editor/extensions/types.ts";


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
];

const Index = forwardRef<EditorRef, IEditorProps>((props, ref) => {
  const { initValue = DEFAULT_CARD_CONTENT, onChange, readonly = true, extensions = [] } = props;
  const [editor] = useState(() => {
    const extensionPlugins = extensions.map(extension => extension.getPlugins()).flat();
    return applyPlugin(createEditor(), defaultPlugins.concat(extensionPlugins))
  });
  const hotKeyConfigs = useMemo(() => {
    return extensions.map(extension => extension.getHotkeyConfigs()).flat();
  }, [extensions]);
  const renderElement = useCallback((props: RenderElementProps) => {
    const { type } = props.element;
    const extension = extensions.find(extension => extension.type === type);
    if (extension) {
      return extension.render(props);
    }
    return <p contentEditable={false} {...props}>无法识别的类型 {type} {props.children}</p>;
  }, [extensions]);

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
      <Slate editor={editor} initialValue={initValue} onChange={handleOnChange} >
        <Editable
          readOnly={readonly}
          renderElement={renderElement}
          renderLeaf={renderLeaf()}
          placeholder={'写下你的想法...'}
          onKeyDown={(event) => {
            registerHotKey(editor, event, hotKeyConfigs);
          }}
        />
      </Slate>
  )
});

export default Index;
