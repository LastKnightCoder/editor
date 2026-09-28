import {
  useCallback,
  useState,
  useEffect,
  useSyncExternalStore,
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

import { EditorKitScope, useKitWithExtensions } from "./kit/context";
import type { EditorKit } from "./kit/EditorKit";
import type { EditorDocument, EditorDocumentBinding } from "./document/EditorDocument";
import { useResolvedKit } from "./kit/context";
import type { ServiceIdentifier } from "./services/tokens";

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
  withNormalizedCopy,
} from "./plugins";
import IExtension from "./extensions/types";
import type { EditorRef } from "./types/editor";

import hotkeys from "./hotkeys";
import ImagesOverview from "./components/ImagesOverview";
import HoveringToolbar from "./components/HoveringToolbar";
import BlockPanel from "./components/BlockPanel";
import MediaUrlInputModal from "./components/MediaUrlInputModal";
import FormattedText from "./components/FormattedText";
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
import "./theme/editor.css";
import { EditorThemeScope } from "./theme/context";
import { IThemeService } from "./services/tokens";

interface IEditorProps {
  initValue?: Descendant[];
  onChange?: (value: Descendant[], editor: Editor) => void;
  onSelectionChange?: () => void;
  readonly?: boolean;
  /** 本编辑器的组成（扩展 + 服务 + 主题）。不传则继承外层编辑器的 kit */
  kit?: EditorKit;
  /**
   * 文档源：内容的事实来源（01 §7.2）。给定时取代 `initValue` / `onChange`，
   * 并可覆盖服务、要求只读。协作用的 Yjs 文档源见 `@tau/editor-collab`。
   */
  document?: EditorDocument;
  /** 只作用于本实例的扩展；按 type 覆盖 kit 里的同名实现 */
  extensions?: IExtension[];
  hotkeyConfigs?: IHotKeyConfig[];
  hoveringBarConfigs?: IConfigItem[];
  onInit?: (editor: Editor, content: Descendant[]) => void;
  className?: string;
  style?: React.CSSProperties;
  onFocus?: () => void;
  onBlur?: () => void;
  placeHolder?: string;
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
  withSlashCommands,
];

const EMPTY_EDITOR_CONTENT: Descendant[] = [
  { type: "paragraph", children: [{ type: "formatted", text: "" }] },
];

/** 订阅文档源自身状态（只读、在线状态等）的变化，触发重渲染 */
function useDocumentRevision(document: EditorDocument | undefined): void {
  const subscribe = useMemo(
    () => (listener: () => void) => document?.subscribe?.(listener) ?? (() => {}),
    [document]
  );
  const getSnapshot = useCallback(() => document?.readonly ?? false, [document]);
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

const Index = memo(
  forwardRef<EditorRef, IEditorProps>((props, ref) => {
    const {
      initValue: initValueProp = EMPTY_EDITOR_CONTENT,
      onChange: onChangeProp,
      onSelectionChange,
      readonly: readonlyProp = true,
      kit: kitProp,
      document: documentProp,
      extensions,
      hotkeyConfigs,
      hoveringBarConfigs,
      onInit,
      onFocus,
      onBlur,
      placeHolder,
      decorate,
      customRenderLeaf,
    } = props;

    // 文档源给定时由它提供内容与只读状态，否则沿用 initValue / onChange
    const initValue = documentProp ? documentProp.initialValue : initValueProp;
    const onChange = documentProp ? documentProp.onChange : onChangeProp;
    const readonly = readonlyProp || Boolean(documentProp?.readonly);
    useDocumentRevision(documentProp);

    const resolvedKit = useResolvedKit(kitProp);
    // 文档源可以覆盖服务（如共享模式的资源上传），作用域限于本编辑器
    const baseKit = useMemo(
      () =>
        documentProp?.services
          ? resolvedKit.extend({ services: [documentProp.services] })
          : resolvedKit,
      [resolvedKit, documentProp?.services]
    );
    const kit = useKitWithExtensions(baseKit, extensions);
    const assembly = kit.assembly;
    const registry = kit.registry;
    const registryRef = useRef(registry);
    registryRef.current = registry;
    const currentValue = useRef<Descendant[]>(initValue);
    const pendingSetEditorValueJson = useRef<string | null>(null);
    const overlayContainerRef = useRef<HTMLDivElement>(null);
    const binding = documentProp?.binding;
    const externalHistory = documentProp?.history === "external";
    const bindingRef = useRef(binding);
    bindingRef.current = binding;
    // 同谱系换源（01 §7.3 第 3 层）：lineage 不变且新文档源支持 rebind 时沿用同一个
    // Slate editor，编辑器与块组件都不重建；否则换 binding 就是换文档，编辑器重建。
    const editorIdentity = binding?.rebind ? "rebindable" : binding;

    const editor = useCreation(() => {
      const processedEditor = applyPlugin(
        createEditor(),
        externalHistory ? defaultPlugins.filter(plugin => plugin !== withHistory) : defaultPlugins
      );

      const finalEditor = applyPlugin(processedEditor, [...assembly.plugins]);
      const enhancedEditor = withBlockNavigation(finalEditor);

      // 启用 Chunking 优化大文档性能
      // 将 editor 的子节点拆分为大小为 1000 的 chunks，减少 React 处理 JSX 变化的工作量
      enhancedEditor.getChunkSize = node => (Editor.isEditor(node) ? 1000 : null);

      // 服务方法必须在创建时挂载：render 阶段的组件（如 ListItem）会调用 editor.getService，
      // 若延迟到 useEffect 挂载，首次渲染时方法尚不存在
      const initialBinding = bindingRef.current;
      const slateEditor = initialBinding ? initialBinding.install(enhancedEditor) : enhancedEditor;
      slateEditor.getService = <T,>(id: ServiceIdentifier<T>): T => registryRef.current.get(id);
      slateEditor.tryGetService = <T,>(id: ServiceIdentifier<T>): T | undefined =>
        registryRef.current.tryGet(id);
      return slateEditor;
    }, [assembly.plugins, documentProp?.lineage, editorIdentity, externalHistory]);

    useEffect(() => documentProp?.attach?.(editor), [documentProp, editor]);

    // 已经挂在这个 editor 上的文档源：区分「首次连接」与「换源」
    const attachedRef = useRef<{ editor: Editor; binding: EditorDocumentBinding } | null>(null);
    useEffect(() => {
      if (!binding) return;
      const attached = attachedRef.current;
      const swapped = attached?.editor === editor && attached.binding !== binding;
      // 换源时旧源已在上一轮 effect 的清理里 disconnect，这里只需迁移到新源
      if (!swapped || !binding.rebind?.(editor)) binding.connect(editor);
      attachedRef.current = { editor, binding };
      return () => binding.disconnect(editor);
    }, [binding, editor]);

    const finalHotKeyConfigs = useMemo(() => {
      return [...assembly.hotkeyConfigs, ...hotkeys, ...(hotkeyConfigs || [])];
    }, [assembly.hotkeyConfigs, hotkeyConfigs]);

    const finalHoveringBarConfigs = useMemo(() => {
      const configs = [...assembly.hoveringBarElements];
      if (hoveringBarConfigs) {
        return configs.concat(hoveringBarConfigs);
      }
      return configs;
    }, [assembly.hoveringBarElements, hoveringBarConfigs]);

    const renderByType = useMemoizedFn((props: RenderElementProps) =>
      assembly.getExtension(props.element.type)?.render(props)
    );

    const renderElement = useMemoizedFn((props: RenderElementProps) => {
      const intercepted = binding?.renderElement?.(props, renderByType);
      if (intercepted) return intercepted;
      const rendered = renderByType(props);
      if (rendered) return rendered;
      const { type } = props.element;
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
      if (lastSelectionRef.current && Range.equals(selection, lastSelectionRef.current)) {
        return false;
      }
      lastSelectionRef.current = selection;
      return true;
    });

    // 渲染 chunk 容器，对最底层 chunk 应用 content-visibility: auto 优化 DOM 绘制
    const renderChunk = useMemoizedFn(({ attributes, children, lowest }: RenderChunkProps) => {
      const style: CSSProperties = {
        contentVisibility: lowest ? "auto" : undefined,
      };
      return (
        <div {...attributes} style={style}>
          {children}
        </div>
      );
    });

    // 在 Slate 同步 DOM selection 后，将选区滚入可视区域
    const scrollSelectionIntoView = useMemoizedFn(
      (slateEditor: ReactEditor, domRange: globalThis.Range) => {
        const isBackward = !!slateEditor.selection && Range.isBackward(slateEditor.selection);
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
      }
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
          // 内容归文档源管（协作）时不接受整体覆盖
          if (binding) return;
          const normalizedNodes = normalizeEditorContent(nodes);
          const domSelection = window.getSelection();
          let shouldClearDomSelection = false;
          if (domSelection && domSelection.rangeCount > 0) {
            try {
              const editorElement = ReactEditor.toDOMNode(editor, editor);
              shouldClearDomSelection =
                (!!domSelection.anchorNode && editorElement.contains(domSelection.anchorNode)) ||
                (!!domSelection.focusNode && editorElement.contains(domSelection.focusNode));
            } catch {
              shouldClearDomSelection = false;
            }
          }
          if (domSelection && shouldClearDomSelection) {
            domSelection.removeAllRanges();
          }
          Transforms.deselect(editor);
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
              []
            );
          });
          pendingSetEditorValueJson.current = JSON.stringify(
            normalizeEditorContent(editor.children)
          );
          editor.isResetValue = false;
        },
        getEditor: () => editor,
        scrollHeaderIntoView: (index: number) => {
          const headers = editor.children.filter((node: any) => node.type === "header");
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
      [editor, binding]
    );

    const handleOnChange = (value: Descendant[]) => {
      const normalizedValue = normalizeEditorContent(value);
      const nextValueJson = JSON.stringify(normalizedValue);
      if (syncSelectionSnapshot()) {
        onSelectionChange?.();
      }
      const valueChanged = JSON.stringify(currentValue.current) !== nextValueJson;
      if (editor.isResetValue) {
        if (valueChanged) {
          currentValue.current = normalizedValue;
        }
        return;
      }
      const isSetEditorValueChange = pendingSetEditorValueJson.current === nextValueJson;
      if (isSetEditorValueChange) {
        if (valueChanged) {
          currentValue.current = normalizedValue;
        }
        pendingSetEditorValueJson.current = null;
        return;
      }
      if (!valueChanged) return;
      pendingSetEditorValueJson.current = null;
      currentValue.current = normalizedValue;
      onChange && onChange(normalizedValue, editor);
    };

    useEffect(() => {
      if (isInit || !editor) return;
      onInit && onInit(editor, initValue);
      setIsInit(true);
    }, [editor, initValue, isInit, onInit]);

    const content = (
      <EditorThemeScope service={registry?.tryGet(IThemeService)}>
        {scope => (
          <Slate
            editor={editor}
            initialValue={initValue}
            onChange={handleOnChange}
            key={kit.assembly.extensions.map(extension => extension.type).join("-")}
          >
            <div
              ref={overlayContainerRef}
              className="tau-editor"
              data-theme={scope.overridden ? scope.themeKey || undefined : undefined}
              data-mode={scope.overridden ? scope.mode : undefined}
              style={binding?.renderOverlay ? { position: "relative" } : { display: "contents" }}
            >
              <Editable
                className={classnames(styles.editor, props.className)}
                style={props.style}
                readOnly={readonly}
                renderElement={renderElement}
                renderLeaf={renderLeaf}
                renderChunk={renderChunk}
                placeholder={placeHolder}
                decorate={decorate}
                onKeyDown={event => {
                  registerHotKey(editor, event, finalHotKeyConfigs);
                }}
                onDrag={e => {
                  e.preventDefault();
                }}
                onDrop={async e => {
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
              {binding?.renderOverlay?.(overlayContainerRef)}
            </div>
            <ImagesOverview />
            {!readonly && <MediaUrlInputModal />}
            {!readonly && <HoveringToolbar configs={finalHoveringBarConfigs} />}
            {!readonly && <BlockPanel extensions={[...kit.assembly.extensions]} />}
          </Slate>
        )}
      </EditorThemeScope>
    );

    return (
      <EditorKitScope kit={kit}>{binding?.wrap ? binding.wrap(content) : content}</EditorKitScope>
    );
  })
);

export default Index;

export type { IExtension };

// 重导出 CustomBlock 相关工具
export {
  generateExecutableCode,
  compileAndExecuteCustomBlock,
} from "./extensions/custom-block/utils/renderTemplate";
