import { useState, useEffect, forwardRef, useImperativeHandle, useCallback, useMemo, memo, createContext } from "react";
import { createEditor, Descendant, Editor, Transforms, Element } from 'slate';
import { Slate, Editable, withReact, ReactEditor, RenderElementProps, RenderLeafProps } from 'slate-react';
import { withHistory } from 'slate-history';
import { useMemoizedFn } from "ahooks";

import { DEFAULT_CARD_CONTENT } from "@/constants";

import { applyPlugin, registerHotKey, Plugin, elementToMarkdown } from "./utils";
import { withOverrideSettings, withSlashCommands } from "@/components/Editor/plugins";
import IExtension from "@/components/Editor/extensions/types.ts";

import hotkeys from './hotkeys';
import ImagesOverview from "./components/ImagesOverview";
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
import { IConfigItem } from "@/components/Editor/types";

interface IEditorContext {
  uploadImage?: (file: File) => Promise<string | null>;
}

export const EditorContext = createContext<IEditorContext | null>(null);

export type EditorRef = {
  focus: () => void;
  setEditorValue: (value: Descendant[]) => void;
  getEditor: () => Editor;
  scrollHeaderIntoView: (index: number) => void;
  isFocus: () => boolean;
  toMarkdown: () => string;
  deselect: () => void;
}

interface IEditorProps {
  initValue?: Descendant[];
  onChange?: (value: Descendant[], editor: Editor) => void;
  readonly?: boolean;
  extensions?: IExtension[];
  hoveringBarConfigs?: IConfigItem[];
  uploadImage?: (file: File) => Promise<string | null>;
  onInit?: (editor: Editor, content: Descendant[]) => void;
  className?: string;
  style?: React.CSSProperties;
  onFocus?: () => void;
  onBlur?: () => void;
  placeHolder?: string;
}

const defaultPlugins: Plugin[] = [
  withReact,
  withHistory,
  withOverrideSettings,
  withSlashCommands,
];

const Index = memo(forwardRef<EditorRef, IEditorProps>((props, ref) => {
  const {
    initValue = DEFAULT_CARD_CONTENT,
    onChange,
    readonly = true,
    extensions,
    hoveringBarConfigs,
    uploadImage,
    onInit,
    onFocus,
    onBlur,
    placeHolder,
  } = props;

  const finalExtensions = useMemo(() => {
    if (!extensions) return startExtensions;
    return [...startExtensions, ...extensions];
  }, [extensions]);

  const [editor] = useState(() => {
    const extensionPlugins = finalExtensions.map(extension => extension.getPlugins()).flat();
    return applyPlugin(createEditor(), defaultPlugins.concat(extensionPlugins))
  });

  const hotKeyConfigs = useMemo(() => {
    return finalExtensions.map(extension => extension.getHotkeyConfigs()).flat().concat(hotkeys);
  }, [finalExtensions]);

  const finalHoveringBarConfigs = useMemo(() => {
    const configs =  finalExtensions.map(extension => extension.getHoveringBarElements()).flat();
    if (hoveringBarConfigs) {
      return configs.concat(hoveringBarConfigs);
    }
    return configs;
  }, [finalExtensions, hoveringBarConfigs]);

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
  const [isInit, setIsInit] = useState(false);
  
  const toMarkdown = useMemoizedFn((content: Descendant[]) => {
    return (
      content
        .map((element) => {
          const isBlock = editor.isBlock(element as Element);
          const str = elementToMarkdown(editor, element as Element, editor as Element, finalExtensions);
          return isBlock ? `${str}\n\n` : str;
        })
        .join('')
        .trim()
        .concat('\n')
      )
  });

  useEffect(() => {
    if (!isNormalized) {
      Editor.normalize(editor, { force: true });
      setIsNormalized(true);
    }
  });

  // useWhyDidYouUpdate('Editor', {
  //   ...props,
  //   finalExtensions,
  //   finalHoveringBarConfigs
  // })

  useImperativeHandle(ref, () => ({
    focus: () => {
      ReactEditor.focus(editor);
      // 移动到末尾
      Transforms.select(editor, Editor.end(editor, []));
    },
    deselect: () => {
      ReactEditor.deselect(editor);
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
    },
    isFocus: () => {
      return ReactEditor.isFocused(editor);
    },
    toMarkdown: () => {
      return toMarkdown(editor.children);
    }
  }), [editor, toMarkdown]);

  const handleOnChange = (value: Descendant[]) => {
    onChange && onChange(value, editor);
  }

  useEffect(() => {
    if (isInit || !editor) return;
    onInit && onInit(editor, initValue);
    setIsInit(true);
  }, [editor, initValue, isInit, onInit]);

  return (
    <EditorContext.Provider value={{
      uploadImage,
    }}>
      <Slate
        editor={editor}
        initialValue={initValue}
        onChange={handleOnChange}
      >
        <Editable
          className={props.className}
          style={props.style}
          readOnly={readonly}
          renderElement={renderElement}
          renderLeaf={renderLeaf}
          placeholder={placeHolder}
          onKeyDown={(event) => {
            registerHotKey(editor, event, hotKeyConfigs);
          }}
          onDrag={e => {
            e.preventDefault();
          }}
          onDrop={e => {
            e.preventDefault();
          }}
          onSelect={() => {
            /**
             * Chrome doesn't scroll at bottom of the page. This fixes that.
             */
            if (!(window as any).chrome) return
            if (editor.selection == null) return
            try {
              /**
               * Need a try/catch because sometimes you get an error like:
               *
               * Error: Cannot resolve a DOM node from Slate node: {"type":"p","children":[{"text":"","by":-1,"at":-1}]}
               */
              const domPoint = ReactEditor.toDOMPoint(
                editor,
                editor.selection.focus
              )
              const node = domPoint[0]
              if (node == null) return
              const element = node.parentElement
              if (element == null) return
              // @ts-ignore
              element.scrollIntoViewIfNeeded();
            } catch (e) {
              /**
               * Empty catch. Do nothing if there is an error.
               */
            }
          }}
          onFocus={onFocus}
          onBlur={onBlur}
        />
        <ImagesOverview />
        { !readonly && <HoveringToolbar configs={finalHoveringBarConfigs} /> }
        <BlockPanel extensions={finalExtensions} />
      </Slate>
    </EditorContext.Provider>
  )
}));

export default Index;
