import {
  useState,
  useEffect,
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  memo,
  CSSProperties,
} from "react";
import type { Node, Path } from "slate";
import classnames from "classnames";
import { createEditor, Descendant, Editor, Transforms, Range } from "slate";
import {
  Slate,
  Editable,
  withReact,
  ReactEditor,
  RenderElementProps,
  RenderLeafProps,
  RenderChunkProps,
} from "slate-react";
import { withHistory } from "slate-history";
import { useCreation, useMemoizedFn } from "ahooks";

import { DEFAULT_CARD_CONTENT } from "./constants";
import useSystemTheme from "./hooks/useSystemTheme";
import { useEditorServices } from "./contexts/EditorServicesContext";
import {
  EditorContext,
  type EditorContextValue,
  type EditorFeatures,
} from "./contexts/EditorContext";

import {
  applyPlugin,
  normalizeEditorContent,
  registerHotKey,
  Plugin,
  updateNodeRecursively,
} from "./utils";
import {
  withSlashCommands,
  withNormalize,
  withBlockNavigation,
  withFileDrop,
  withMarkdownPasteImport,
  withNormalizedCopy,
} from "./plugins";
import IExtension from "./extensions/types";
import { pluginOptimizer } from "./utils/PluginOptimizer";
import type { EditorRef } from "./types/editor";

import hotkeys from "./hotkeys";
import ImagesOverview from "./components/ImagesOverview";
import HoveringToolbar from "./components/HoveringToolbar";
import BlockPanel from "./components/BlockPanel";
import FormattedText from "./components/FormattedText";
import { startExtensions } from "./extensions";
import { IConfigItem, IHotKeyConfig } from "./types";

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

import "./extensions/drag-common.less";
import "./extensions/drop-common.less";
import styles from "./index.module.less";

interface IEditorProps {
  initValue?: Descendant[];
  onChange?: (value: Descendant[], editor: Editor) => void;
  onSelectionChange?: () => void;
  readonly?: boolean;
  extensions?: IExtension[];
  hotkeyConfigs?: IHotKeyConfig[];
  hoveringBarConfigs?: IConfigItem[];
  onInit?: (editor: Editor, content: Descendant[]) => void;
  className?: string;
  style?: React.CSSProperties;
  onFocus?: () => void;
  onBlur?: () => void;
  placeHolder?: string;
  theme?: "light" | "dark";
  disableStartExtensions?: boolean;
  /** 功能开关配置 */
  features?: EditorFeatures;
  /** 自定义 decorate 函数（用于添加装饰，如 diff 高亮） */
  decorate?: (entry: [Node, Path]) => Range[];
  /** 自定义 renderLeaf 函数（用于自定义叶子节点渲染） */
  customRenderLeaf?: (props: RenderLeafProps) => React.ReactElement;
}

const defaultPlugins: Plugin[] = [
  withReact,
  withHistory,
  withNormalize,
  withFileDrop,
  withNormalizedCopy,
  withMarkdownPasteImport,
  withSlashCommands,
];

const Index = memo(
  forwardRef<EditorRef, IEditorProps>((props, ref) => {
    const {
      initValue = DEFAULT_CARD_CONTENT,
      onChange,
      onSelectionChange,
      readonly = true,
      extensions,
      hotkeyConfigs,
      hoveringBarConfigs,
      onInit,
      onFocus,
      onBlur,
      placeHolder,
      theme,
      disableStartExtensions = false,
      features,
      decorate,
      customRenderLeaf,
    } = props;

    const systemTheme = useSystemTheme();
    const services = useEditorServices();
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
      const processedEditor = applyPlugin(createEditor(), defaultPlugins);

      const finalEditor = applyPlugin(
        processedEditor,
        optimizedExtensionData.plugins,
      );
      const enhancedEditor = withBlockNavigation(finalEditor);

      // 启用 Chunking 优化大文档性能
      // 将 editor 的子节点拆分为大小为 1000 的 chunks，减少 React 处理 JSX 变化的工作量
      enhancedEditor.getChunkSize = (node) =>
        Editor.isEditor(node) ? 1000 : null;

      return enhancedEditor;
    }, [optimizedExtensionData.plugins]);

    // Attach services to editor for non-React plugin code access
    useEffect(() => {
      editor.services = services;
    }, [editor, services]);

    const finalHotKeyConfigs = useMemo(() => {
      return [
        ...optimizedExtensionData.hotkeyConfigs,
        ...hotkeys,
        ...(hotkeyConfigs || []),
      ];
    }, [optimizedExtensionData.hotkeyConfigs, hotkeyConfigs]);

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
        if (customRenderLeaf) {
          return customRenderLeaf(props);
        }
        return (
          <FormattedText leaf={leaf} attributes={attributes}>
            {children}
          </FormattedText>
        );
      }
    });

    const lastSelectionRef = useRef<Range | null>(null);

    const syncSelectionSnapshot = useMemoizedFn(() => {
      const selection = editor.selection;
      if (selection == null) {
        if (lastSelectionRef.current === null) {
          return false;
        }
        lastSelectionRef.current = null;
        return true;
      }
      if (
        lastSelectionRef.current &&
        Range.equals(selection, lastSelectionRef.current)
      ) {
        return false;
      }
      lastSelectionRef.current = selection;
      return true;
    });

    // 渲染 chunk 容器，对最底层 chunk 应用 content-visibility: auto 优化 DOM 绘制
    const renderChunk = useMemoizedFn(
      ({ attributes, children, lowest }: RenderChunkProps) => {
        const style: CSSProperties = {
          contentVisibility: lowest ? "auto" : undefined,
        };
        return (
          <div {...attributes} style={style}>
            {children}
          </div>
        );
      },
    );

    // 在 Slate 同步 DOM selection 后，将选区滚入可视区域
    const scrollSelectionIntoView = useMemoizedFn(
      (slateEditor: ReactEditor, domRange: globalThis.Range) => {
        const isBackward =
          !!slateEditor.selection && Range.isBackward(slateEditor.selection);
        const domFocusPoint = domRange.cloneRange();
        domFocusPoint.collapse(isBackward);
        const leafEl = domFocusPoint.commonAncestorContainer.parentElement;
        if (!leafEl) return;

        // @ts-ignore scrollIntoViewIfNeeded 存在于 Chromium
        if (typeof leafEl.scrollIntoViewIfNeeded === "function") {
          // @ts-ignore
          leafEl.scrollIntoViewIfNeeded();
        } else {
          leafEl.scrollIntoView({
            block: "center",
            inline: "nearest",
            behavior: "smooth",
          });
        }
      },
    );

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
          const normalizedNodes = normalizeEditorContent(nodes);
          ReactEditor.deselect(editor);
          const domSelection = window.getSelection();
          if (domSelection && domSelection.rangeCount > 0) {
            domSelection.removeAllRanges();
          }
          editor.isResetValue = true;
          Editor.withoutNormalizing(editor, () => {
            updateNodeRecursively(
              editor,
              editor,
              // @ts-ignore
              {
                // @ts-ignore
                children: normalizedNodes,
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
      const normalizedValue = normalizeEditorContent(value);
      if (syncSelectionSnapshot()) {
        onSelectionChange?.();
      }
      if (
        JSON.stringify(currentValue.current) === JSON.stringify(normalizedValue)
      )
        return;
      currentValue.current = normalizedValue;
      onChange && onChange(normalizedValue, editor);
    };

    useEffect(() => {
      if (isInit || !editor) return;
      onInit && onInit(editor, initValue);
      setIsInit(true);
    }, [editor, initValue, isInit, onInit]);

    // 使用 useMemo 稳定化 context value，避免不必要的重渲染
    const editorContextValue = useMemo<EditorContextValue>(
      () => ({
        theme: theme || systemTheme,
        features,
      }),
      [theme, systemTheme, features],
    );

    return (
      <EditorContext.Provider value={editorContextValue}>
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
            renderChunk={renderChunk}
            placeholder={placeHolder}
            decorate={decorate}
            onKeyDown={(event) => {
              registerHotKey(editor, event, finalHotKeyConfigs);
            }}
            onDrag={(e) => {
              e.preventDefault();
            }}
            onDrop={async (e) => {
              e.preventDefault();

              const files = e.dataTransfer?.files;
              if (!files || files.length === 0 || readonly) return;

              // 计算拖放位置
              const range = ReactEditor.findEventRange(editor, e);
              if (range && editor.handleDrop) {
                await editor.handleDrop(files, range.anchor);
              }
            }}
            onSelect={() => {
              if (syncSelectionSnapshot()) {
                onSelectionChange?.();
              }
            }}
            scrollSelectionIntoView={scrollSelectionIntoView}
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

// 重导出 CustomBlock 相关工具
export {
  generateExecutableCode,
  compileAndExecuteCustomBlock,
} from "./extensions/custom-block/utils/renderTemplate";
