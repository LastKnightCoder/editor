import {
  useState,
  useEffect,
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  memo,
  createContext,
} from "react";
import classnames from "classnames";
import { createEditor, Descendant, Editor, Transforms } from "slate";
import {
  Slate,
  Editable,
  withReact,
  ReactEditor,
  RenderElementProps,
  RenderLeafProps,
} from "slate-react";
import { withHistory } from "slate-history";
import { useCreation, useMemoizedFn } from "ahooks";

import { DEFAULT_CARD_CONTENT } from "@/constants";
import useTheme from "@/hooks/useTheme";

import {
  applyPlugin,
  registerHotKey,
  Plugin,
  updateNodeRecursively,
} from "./utils";
import {
  withSlashCommands,
  withNormalize,
  withUploadResource,
} from "@/components/Editor/plugins";
import IExtension from "@/components/Editor/extensions/types.ts";
import { pluginOptimizer } from "./utils/PluginOptimizer";

import hotkeys from "./hotkeys";
import ImagesOverview from "./components/ImagesOverview";
import HoveringToolbar from "./components/HoveringToolbar";
import BlockPanel from "./components/BlockPanel";
import FormattedText from "@/components/Editor/components/FormattedText";
import { startExtensions } from "@/components/Editor/extensions";

import "codemirror/mode/stex/stex.js";
import "codemirror/mode/javascript/javascript.js";
import "codemirror/mode/jsx/jsx.js";
import "codemirror/mode/rust/rust.js";
import "codemirror/mode/go/go.js";
import "codemirror/mode/css/css.js";
import "codemirror/mode/htmlmixed/htmlmixed.js";
import "codemirror/mode/clike/clike.js";
import "codemirror/mode/shell/shell.js";
import "codemirror/mode/python/python.js";
import "codemirror/mode/sql/sql.js";
import "codemirror/mode/markdown/markdown.js";
import "codemirror/mode/yaml/yaml.js";
import "codemirror/mode/vue/vue.js";

import "codemirror/addon/edit/closebrackets.js";

import "codemirror/lib/codemirror.css";
import "codemirror/theme/blackboard.css";
import { IConfigItem } from "@/components/Editor/types";

import "./extensions/drag-common.less";
import "./extensions/drop-common.less";
import styles from "./index.module.less";

interface IEditorContext {
  uploadResource?: (file: File) => Promise<string | null>;
  theme?: "light" | "dark";
}

export const EditorContext = createContext<IEditorContext>({
  theme: "light",
  uploadResource: undefined,
});

export type EditorRef = {
  focus: () => void;
  setEditorValue: (value: Descendant[]) => void;
  getEditor: () => Editor;
  scrollHeaderIntoView: (index: number) => void;
  isFocus: () => boolean;
  deselect: () => void;
};

interface IEditorProps {
  initValue?: Descendant[];
  onChange?: (value: Descendant[], editor: Editor) => void;
  readonly?: boolean;
  extensions?: IExtension[];
  hoveringBarConfigs?: IConfigItem[];
  uploadResource?: (file: File) => Promise<string | null>;
  onInit?: (editor: Editor, content: Descendant[]) => void;
  className?: string;
  style?: React.CSSProperties;
  onFocus?: () => void;
  onBlur?: () => void;
  placeHolder?: string;
  theme?: "light" | "dark";
  disableStartExtensions?: boolean;
}

const defaultPlugins: Plugin[] = [
  withReact,
  withHistory,
  withNormalize,
  withSlashCommands,
];

const Index = memo(
  forwardRef<EditorRef, IEditorProps>((props, ref) => {
    const {
      initValue = DEFAULT_CARD_CONTENT,
      onChange,
      readonly = true,
      extensions,
      hoveringBarConfigs,
      uploadResource,
      onInit,
      onFocus,
      onBlur,
      placeHolder,
      theme,
      disableStartExtensions = false,
    } = props;

    const { theme: systemTheme } = useTheme();
    const currentValue = useRef<Descendant[]>(initValue);

    const finalExtensions: IExtension[] = useMemo(() => {
      if (!extensions) return disableStartExtensions ? [] : startExtensions;
      return disableStartExtensions
        ? extensions
        : [...startExtensions, ...extensions];
    }, [extensions, disableStartExtensions]);

    const optimizedExtensionData = useMemo(() => {
      return pluginOptimizer.optimizeExtensions(finalExtensions);
    }, [finalExtensions]);

    const editor = useCreation(() => {
      let processedEditor = applyPlugin(createEditor(), defaultPlugins);

      processedEditor = withUploadResource(uploadResource)(processedEditor);

      return applyPlugin(processedEditor, optimizedExtensionData.plugins);
    }, [optimizedExtensionData.plugins, uploadResource]);

    const hotKeyConfigs = useMemo(() => {
      return [...optimizedExtensionData.hotkeyConfigs, ...hotkeys];
    }, [optimizedExtensionData.hotkeyConfigs]);

    const finalHoveringBarConfigs = useMemo(() => {
      const configs = [...optimizedExtensionData.hoveringBarElements];
      if (hoveringBarConfigs) {
        return configs.concat(hoveringBarConfigs);
      }
      return configs;
    }, [optimizedExtensionData.hoveringBarElements, hoveringBarConfigs]);

    const renderElement = useMemoizedFn((props: RenderElementProps) => {
      const { type } = props.element;
      const extension = pluginOptimizer.getExtension(type);
      if (extension) {
        return extension.render(props);
      }
      return (
        <span contentEditable={false} {...props}>
          无法识别的类型 {type} {props.children}
        </span>
      );
    });

    const renderLeaf = useMemoizedFn((props: RenderLeafProps) => {
      {
        const { attributes, children, leaf } = props;
        return (
          <FormattedText leaf={leaf} attributes={attributes}>
            {children}
          </FormattedText>
        );
      }
    });

    const [isNormalized, setIsNormalized] = useState(false);
    const [isInit, setIsInit] = useState(false);

    useEffect(() => {
      if (!isNormalized) {
        Editor.normalize(editor, { force: true });
        setIsNormalized(true);
      }
    }, [isNormalized, editor]);

    useImperativeHandle(
      ref,
      () => ({
        focus: () => {
          ReactEditor.focus(editor);
          Transforms.select(editor, Editor.end(editor, []));
        },
        deselect: () => {
          ReactEditor.deselect(editor);
        },
        setEditorValue: (nodes: Descendant[]) => {
          editor.isResetValue = true;
          Editor.withoutNormalizing(editor, () => {
            updateNodeRecursively(
              editor,
              editor,
              // @ts-ignore
              {
                // @ts-ignore
                children: nodes,
              },
              [],
            );
          });
          editor.isResetValue = false;
        },
        getEditor: () => editor,
        scrollHeaderIntoView: (index: number) => {
          const headers = editor.children.filter(
            (node: any) => node.type === "header",
          );
          const header = headers[index];
          if (!header) return;
          const dom = ReactEditor.toDOMNode(editor, header);
          dom.scrollIntoView({
            behavior: "smooth",
          });
        },
        isFocus: () => {
          return ReactEditor.isFocused(editor);
        },
      }),
      [editor],
    );

    const handleOnChange = (value: Descendant[]) => {
      if (JSON.stringify(currentValue.current) === JSON.stringify(value))
        return;
      currentValue.current = value;
      onChange && onChange(value, editor);
    };

    useEffect(() => {
      if (isInit || !editor) return;
      onInit && onInit(editor, initValue);
      setIsInit(true);
    }, [editor, initValue, isInit, onInit]);

    return (
      <EditorContext.Provider
        value={{
          uploadResource,
          theme: theme || systemTheme,
        }}
      >
        <Slate
          editor={editor}
          initialValue={initValue}
          onChange={handleOnChange}
          key={finalExtensions
            .map((extension: IExtension) => extension.type)
            .join("-")}
        >
          <Editable
            className={classnames(
              styles.editor,
              { [styles.dark]: (theme || systemTheme) === "dark" },
              props.className,
            )}
            style={props.style}
            readOnly={readonly}
            renderElement={renderElement}
            renderLeaf={renderLeaf}
            placeholder={placeHolder}
            onKeyDown={(event) => {
              registerHotKey(editor, event, hotKeyConfigs);
            }}
            onDrag={(e) => {
              e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
            }}
            onSelect={() => {
              if (!(window as any).chrome) return;
              if (editor.selection == null) return;
              try {
                const domPoint = ReactEditor.toDOMPoint(
                  editor,
                  editor.selection.focus,
                );
                const node = domPoint[0];
                if (node == null) return;
                const element = node.parentElement;
                if (element == null) return;
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
          {!readonly && <HoveringToolbar configs={finalHoveringBarConfigs} />}
          <BlockPanel extensions={finalExtensions} />
        </Slate>
      </EditorContext.Provider>
    );
  }),
);

export default Index;

export type { IExtension };
