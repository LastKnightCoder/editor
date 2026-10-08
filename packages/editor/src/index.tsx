import {
  useCallback,
  useState,
  useEffect,
  useLayoutEffect,
  useSyncExternalStore,
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  memo,
  CSSProperties,
} from "react";
import { cn } from "@tau/ui";
import type { Node, NodeEntry, Path } from "slate";
import { createEditor, Descendant, Editor, Transforms, Range, Element } from "slate";
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
  applyGuardedPlugins,
  createCircuitBreaker,
  withElementBehaviors,
  guardHotkeys,
  withUnknownElements,
} from "./kit/extensionGuard";
import { ElementErrorBoundary, UnknownElement } from "./components/ElementGuard";
import { BlockDragHost } from "./components/BlockDrag/BlockDragHost";
import { consoleErrorReporter } from "./services/errorReporter";
import { applyPlugin, normalizeEditorContent, registerHotKey, Plugin } from "./utils";
import {
  withSlashCommands,
  withNormalize,
  withBlockNavigation,
  withNormalizedCopy,
} from "./plugins";
import { withIngest, resolveFileDropPoint } from "./plugins/withIngest";
import type { AnyExtension } from "./api/legacy";
import type { EditorRef } from "./types/editor";

import { builtinCommands, builtinHotkeys } from "./hotkeys";
import { CommandRegistry, createCommandDispatcher } from "./api/command";
import type { ResolvedHotkey } from "./utils/hotkey";
import ExtensionLayers from "./components/ExtensionLayers";
import HoveringToolbar from "./components/HoveringToolbar";
import BlockPanel from "./components/BlockPanel";
import ConfirmHost from "./components/ConfirmHost";
import LeafRenderer from "./components/LeafRenderer";
import type { MarkRenderProps } from "./api/marks";
import type { ComponentType } from "react";
import PromptHost from "./components/PromptHost";
import {
  initializeSubmissionScope,
  beginSubmissionScope,
  endSubmissionScope,
  notifySubmissionServices,
} from "./kit/submissionScope";
import { IConfigItem, IHotKeyConfig } from "./types";

import "./theme/editor.css";
import { EditorThemeScope } from "./theme/context";
import { FocusAttributes, FocusModeContext } from "./components/FocusPath";
import { FOCUS_MODE_CLASS } from "./components/FocusPath/focusPath";
import { IExtensionErrorReporter, IThemeService } from "./services/tokens";

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
  /** 只作用于本实例的扩展；按元素类型覆盖 kit 里的同名实现 */
  extensions?: readonly AnyExtension[];
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
  /** 包装已经应用标记的内容，不接管 Slate attributes。 */
  leafWrapper?: ComponentType<MarkRenderProps>;
  /**
   * 聚焦模式：沿光标所在的文档路径，同级兄弟元素退后（其余顶层块、列表的其他项、表格的其他单元格…）。
   * 退后程度由宿主在容器上设置 `--ed-focus-dim`（缺省 0.26）。
   */
  focusMode?: boolean;
}

const defaultPlugins: Plugin[] = [withReact, withHistory, withNormalize, withSlashCommands];

/**
 * 可编辑区根样式。正文色继承容器（容器没设时一路继承到宿主 body 的主题文字色；
 * 容器自带配色时如白板思维导图深底节点，由容器说话）。
 * Slate chunk 容器（性能分块）不影响块间距。
 */
const EDITABLE_CLASS = [
  "text-inherit caret-current",
  "selection:bg-[var(--ed-selection)] selection:text-current selection:[-webkit-text-fill-color:currentColor]",
  "[&_[data-slate-chunk]>*+*]:mt-0",
].join(" ");

const EMPTY_EDITOR_CONTENT: Descendant[] = [
  { type: "paragraph", children: [{ type: "formatted", text: "" }] },
];

let editorInstanceCounter = 0;

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
      leafWrapper,
      focusMode = false,
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
    const overlayContainerRef = useRef<HTMLDivElement>(null);
    // 文件拖拽的落点指示线：dragover 定位最内层块，drop 用同一落点插入（线在哪、插在哪）
    const fileDropLineRef = useRef<HTMLDivElement>(null);
    const fileDropTargetRef = useRef<{ path: Path; before: boolean } | null>(null);

    const hideFileDropLine = () => {
      fileDropTargetRef.current = null;
      if (fileDropLineRef.current) fileDropLineRef.current.style.display = "none";
    };

    const handleFileDragOver = (e: React.DragEvent) => {
      if (readonly || !e.dataTransfer?.types?.includes("Files")) return;
      // 允许 drop；块拖拽（React DnD 的自定义 type）不经这里
      e.preventDefault();
      try {
        const range = ReactEditor.findEventRange(editor, e);
        const entry = Editor.above(editor, {
          at: range,
          match: n => Element.isElement(n) && !editor.isInline(n as Element),
        }) as [Element, Path] | undefined;
        if (!entry) return;
        const [block, path] = entry;
        const rect = ReactEditor.toDOMNode(editor, block).getBoundingClientRect();
        const before = e.clientY < rect.top + rect.height / 2;
        fileDropTargetRef.current = { path, before };
        const line = fileDropLineRef.current;
        if (line) {
          line.style.display = "block";
          // 指示线在编辑器 DOM 内：祖先有 CSS zoom（沉浸写作）时 fixed 坐标也会被放大，按实际缩放反除
          const zoom = (line as HTMLElement & { currentCSSZoom?: number }).currentCSSZoom || 1;
          line.style.top = `${((before ? rect.top : rect.bottom) - 1) / zoom}px`;
          line.style.left = `${rect.left / zoom}px`;
          line.style.width = `${rect.width / zoom}px`;
        }
      } catch {
        // 找不到事件对应的文档位置（如只读态的只读区域）就不显示
      }
    };

    const handleFileDragLeave = (e: React.DragEvent) => {
      if (!e.dataTransfer?.types?.includes("Files")) return;
      // 拖拽在子元素间移动也会触发 dragleave，离开整个编辑区才隐藏
      if (!e.currentTarget.contains(e.relatedTarget as globalThis.Node | null)) {
        hideFileDropLine();
      }
    };
    const binding = documentProp?.binding;
    const externalHistory = documentProp?.history === "external";
    const bindingRef = useRef(binding);
    bindingRef.current = binding;
    // 同谱系换源（01 §7.3 第 3 层）：lineage 不变且新文档源支持 rebind 时沿用同一个
    // Slate editor，编辑器与块组件都不重建；否则换 binding 就是换文档，编辑器重建。
    const editorIdentity = binding?.rebind ? "rebindable" : binding;
    // 扩展的错误隔离与熔断状态跟随编辑器实例；上报方读当前 kit 的服务
    const [breaker] = useState(() =>
      createCircuitBreaker(
        () => registryRef.current.tryGet(IExtensionErrorReporter) ?? consoleErrorReporter
      )
    );

    // 命令注册表：从 kit 装配拷贝一份再注册内核默认命令（kit 级共享实例不重复注册，
    // 同 kit 多编辑器也不会撞 id）。热键、菜单、宿主程序化调用都经 dispatcher 执行
    const commandRegistry = useMemo(() => {
      const registry = new CommandRegistry();
      for (const registered of assembly.commands.list()) {
        registry.register(registered.owner, [registered.command]);
      }
      registry.register("editor", builtinCommands);
      return registry;
    }, [assembly]);
    const commandDispatcher = useMemo(
      () => createCommandDispatcher(commandRegistry, breaker),
      [commandRegistry, breaker]
    );

    const editor = useCreation(() => {
      const processedEditor = applyPlugin(
        createEditor(),
        externalHistory ? defaultPlugins.filter(plugin => plugin !== withHistory) : defaultPlugins
      );

      const finalEditor = withUnknownElements(
        withIngest(
          withElementBehaviors(
            applyGuardedPlugins(processedEditor, assembly.pluginGroups, breaker),
            assembly.behaviors,
            breaker
          ),
          assembly.ingestSources,
          breaker
        ),
        type => assembly.hasElement(type)
      );

      const enhancedEditor = withBlockNavigation(finalEditor);

      // 启用 Chunking 优化大文档性能
      // 将 editor 的子节点拆分为大小为 1000 的 chunks，减少 React 处理 JSX 变化的工作量
      enhancedEditor.getChunkSize = node => (Editor.isEditor(node) ? 1000 : null);

      // 服务方法必须在创建时挂载：render 阶段的组件（如 ListItem）会调用 editor.getService，
      // 若延迟到 useEffect 挂载，首次渲染时方法尚不存在
      const initialBinding = bindingRef.current;
      const slateEditor = initialBinding ? initialBinding.install(enhancedEditor) : enhancedEditor;
      withNormalizedCopy(slateEditor, assembly.copyPolicies, breaker);
      initializeSubmissionScope(slateEditor);
      slateEditor.getService = <T,>(id: ServiceIdentifier<T>): T => registryRef.current.get(id);
      slateEditor.tryGetService = <T,>(id: ServiceIdentifier<T>): T | undefined =>
        registryRef.current.tryGet(id);
      slateEditor.commands = {
        execute: (id: string, payload?: unknown, element?: Element, path?: Path) =>
          commandDispatcher.execute(slateEditor, id, { payload, element, path }),
      };
      return slateEditor;
    }, [assembly.plugins, documentProp?.lineage, editorIdentity, externalHistory]);

    // 快照与 Slate 挂载键归实例所有；同谱系换绑保留，重建编辑器时一起复位。
    const instance = useCreation(
      () => ({
        key: ++editorInstanceCounter,
        value: initValue,
        selection: null as Range | null,
      }),
      [editor]
    );

    useEffect(() => documentProp?.attach?.(editor), [documentProp, editor]);

    useLayoutEffect(() => {
      if (readonly) {
        endSubmissionScope(editor);
        return;
      }
      return beginSubmissionScope(editor);
    }, [editor, readonly, documentProp, binding]);
    useLayoutEffect(() => notifySubmissionServices(editor), [editor, registry]);

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

    const finalHotkeys = useMemo<ResolvedHotkey[]>(() => {
      // 宿主 prop 传入的场景热键（IHotKeyConfig）走直通；来自扩展的热键全部经命令注册表
      const propEntries = (configs: readonly IHotKeyConfig[]): ResolvedHotkey[] =>
        guardHotkeys(configs, () => undefined, breaker).map(config => ({
          kind: "legacy" as const,
          config,
        }));
      return [
        ...assembly.commandHotkeys.map(({ hotkey }) => ({
          kind: "command" as const,
          keys: hotkey.key,
          command: hotkey.command,
        })),
        ...builtinHotkeys.map(hotkey => ({
          kind: "command" as const,
          keys: hotkey.key,
          command: hotkey.command,
        })),
        ...propEntries(hotkeyConfigs || []),
      ];
    }, [assembly, hotkeyConfigs, breaker]);

    const finalHoveringBarConfigs = useMemo(() => {
      const configs = [...assembly.hoveringBarElements];
      if (hoveringBarConfigs) {
        return configs.concat(hoveringBarConfigs);
      }
      return configs;
    }, [assembly.hoveringBarElements, hoveringBarConfigs]);

    const renderByType = useMemoizedFn((props: RenderElementProps) => assembly.render(props));

    // 文档源可以接管个别元素（协作的私有块占位），其余按 type 分发给扩展；
    // 外面统一包拖拽 chrome（BlockDragHost）：块组件不再自己接手柄/插入线/手柄菜单。
    // JSX 恒为真值，未知类型的兜底占位必须在这里显式给出（ElementGuard 内的 ?? 不再可达）
    const renderElementContent = useMemoizedFn((props: RenderElementProps) => (
      <BlockDragHost element={props.element}>
        {binding?.renderElement?.(props, renderByType) ?? renderByType(props) ?? (
          <UnknownElement {...props} />
        )}
      </BlockDragHost>
    ));
    const reportRenderError = useMemoizedFn((type: string, error: unknown) =>
      breaker.report(assembly.getElementOwner(type)?.id ?? type, "render", error)
    );

    // 每个元素一个错误边界：扩展渲染出错只影响该元素；没有扩展的类型渲染只读占位（ER-006）。
    // 聚焦标记在最外层写进 attributes，由元素组件展开到根节点（focusMode 关闭时原样透传）
    const renderElement = useMemoizedFn((props: RenderElementProps) => (
      <FocusAttributes
        props={props}
        render={focusedProps => (
          <ElementErrorBoundary
            props={focusedProps}
            render={renderElementContent}
            onError={reportRenderError}
          />
        )}
      />
    ));

    const reportExtensionRenderError = useMemoizedFn((owner: string, error: unknown) =>
      breaker.report(owner, "render", error)
    );
    const [decorationRevision, setDecorationRevision] = useState(0);
    useEffect(() => {
      const cleanups: Array<() => void> = [];
      for (const { owner, spec } of assembly.decorations) {
        try {
          const cleanup = spec.subscribe?.(editor, () => setDecorationRevision(value => value + 1));
          if (cleanup) cleanups.push(cleanup);
        } catch (error) {
          breaker.record(owner, "decorate", error);
        }
      }
      return () => cleanups.forEach(cleanup => cleanup());
    }, [assembly, editor, registry, breaker]);
    // 扩展装饰与宿主 decorate 合并；单个扩展出错只丢它自己的装饰并计入熔断
    const mergedDecorate = useMemo(() => {
      const extensionDecorations = assembly.decorations;
      if (!extensionDecorations.length) return decorate;
      return (entry: NodeEntry): Range[] => {
        const ranges = decorate ? [...decorate(entry as [Node, Path])] : [];
        for (const { owner, spec } of extensionDecorations) {
          if (breaker.isDisabled(owner)) continue;
          try {
            ranges.push(...spec.decorate(editor, entry));
          } catch (error) {
            breaker.record(owner, "decorate", error);
          }
        }
        return ranges;
      };
    }, [assembly, decorate, editor, breaker, decorationRevision]);
    const renderLeaf = useMemoizedFn((props: RenderLeafProps) => (
      <LeafRenderer
        {...props}
        marks={assembly.marks}
        wrapper={leafWrapper}
        onError={reportExtensionRenderError}
      />
    ));

    const syncSelectionSnapshot = useMemoizedFn(() => {
      const selection = editor.selection;
      if (selection == null) {
        if (instance.selection === null) {
          return false;
        }
        instance.selection = null;
        return true;
      }
      if (instance.selection && Range.equals(selection, instance.selection)) {
        return false;
      }
      instance.selection = selection;
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

    const initializedEditor = useRef<Editor | null>(null);

    useEffect(() => {
      Editor.normalize(editor, { force: true });
    }, [editor]);

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
        getEditor: () => editor,
        isFocus: () => {
          return ReactEditor.isFocused(editor);
        },
      }),
      [editor]
    );

    const handleOnChange = (value: Descendant[]) => {
      const normalizedValue = normalizeEditorContent(value);
      const nextValueJson = JSON.stringify(normalizedValue);
      if (syncSelectionSnapshot()) {
        onSelectionChange?.();
      }
      const valueChanged = JSON.stringify(instance.value) !== nextValueJson;
      if (!valueChanged) return;
      instance.value = normalizedValue;
      onChange && onChange(normalizedValue, editor);
    };

    useEffect(() => {
      if (initializedEditor.current === editor) return;
      initializedEditor.current = editor;
      onInit && onInit(editor, initValue);
    }, [editor, initValue, onInit]);

    const content = (
      <EditorThemeScope service={registry?.tryGet(IThemeService)}>
        {scope => (
          <Slate
            editor={editor}
            initialValue={initValue}
            onChange={handleOnChange}
            key={instance.key}
          >
            <FocusModeContext.Provider value={focusMode}>
              <div
                ref={overlayContainerRef}
                className="tau-editor"
                data-theme={scope.overridden ? scope.themeKey || undefined : undefined}
                data-mode={scope.overridden ? scope.mode : undefined}
                style={binding?.renderOverlay ? { position: "relative" } : { display: "contents" }}
              >
                <Editable
                  className={cn(EDITABLE_CLASS, focusMode && FOCUS_MODE_CLASS, props.className)}
                  style={props.style}
                  readOnly={readonly}
                  renderElement={renderElement}
                  renderLeaf={renderLeaf}
                  renderChunk={renderChunk}
                  placeholder={placeHolder}
                  decorate={mergedDecorate}
                  onKeyDown={event => {
                    registerHotKey(editor, event, finalHotkeys, commandDispatcher);
                  }}
                  onDrag={e => {
                    e.preventDefault();
                  }}
                  onDragOver={handleFileDragOver}
                  onDragLeave={handleFileDragLeave}
                  onDrop={async e => {
                    e.preventDefault();

                    const data = e.dataTransfer;
                    if (!data?.files?.length || readonly) {
                      hideFileDropLine();
                      return;
                    }

                    // 指示线停在哪就插到哪（dragover 记录的块前后）；没有记录时退回事件光标位置
                    const target = fileDropTargetRef.current;
                    hideFileDropLine();
                    const point = target
                      ? resolveFileDropPoint(editor, target)
                      : ReactEditor.findEventRange(editor, e)?.anchor;
                    if (point) {
                      await editor.handleDrop(data, point);
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
                {/* 文件拖拽的落点指示线（与块拖拽的插入线同款；fixed 定位，位置由 dragover 直接写 style） */}
                <div
                  ref={fileDropLineRef}
                  aria-hidden
                  style={{ display: "none" }}
                  className="pointer-events-none fixed z-[9998] h-[2px] rounded-full bg-[var(--ed-accent-text)]"
                />
              </div>
              <ExtensionLayers
                layers={assembly.layers}
                report={reportExtensionRenderError}
                readOnly={readonly}
              />
              <ConfirmHost />
              <PromptHost />
              {!readonly && <HoveringToolbar configs={finalHoveringBarConfigs} />}
              {!readonly && <BlockPanel assembly={kit.assembly} />}
            </FocusModeContext.Provider>
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
