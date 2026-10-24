import { useEffect, useState, type ComponentType } from "react";
import {
  Type,
  Image,
  Video,
  AudioLines,
  MousePointer2,
  Shapes,
  ArrowUpRight,
  PenLine,
  Network,
  Frame as FrameIcon,
  Columns3,
  FileText,
  Globe,
  Presentation,
} from "lucide-react";
import type Board from "../Board";
import type { IBoardPlugin, ContextMenuModalPayload } from "../types";
import {
  defineWhiteboardExtension,
  type WhiteboardAPI,
  type WhiteboardContributions,
  type WhiteboardExtension,
  type WhiteboardCommand,
  type WhiteboardToolContribution,
  type WhiteboardToolProps,
} from "./api";
import { resolveBoardAccess } from "./access";
import { createSnapshotReader } from "./snapshot";
import { withInternalPlugins, type InternalContributions } from "./internal";
import { geometryCreateSpec } from "./creators/geometry";
import { arrowCreateSpec } from "./creators/arrow";
import { handwriteCreateSpec } from "./creators/handwrite";
import { frameCreateSpec } from "./creators/frame";
import { columnCreateSpec } from "./creators/column";
import { textCreateSpec } from "./creators/text";
import { mindCreateSpec } from "./creators/mind";
import {
  IWhiteboardRichText,
  TextExtensionContext,
  createEmbeddedRichTextService,
  embeddedTextOptions,
  textOptionsFromService,
  type TextExtensionOptions,
} from "./text";
import {
  MediaExtensionContext,
  mediaCapabilitiesFromServices,
  type MediaCapabilities,
  type MediaExtensionOptions,
} from "./media";
import { ElementContentContext } from "./elementContent";
import { useBoard, useActiveTool } from "../hooks";
import { useWhiteboardAPI } from "./context";
import { ChromeButton } from "../chrome";
import {
  SELECT_TOOL_ID,
  GEOMETRY_TOOL_ID,
  ARROW_TOOL_ID,
  HANDWRITE_TOOL_ID,
  RICHTEXT_TOOL_ID,
  MIND_TOOL_ID,
  FRAME_TOOL_ID,
  COLUMN_TOOL_ID,
} from "../constants/tools";
import {
  ArrowPlugin,
  GeometryPlugin,
  HandwritePlugin,
  DocumentPlugin,
  isDocumentElement,
  WhiteBoardPlugin,
  RichTextPlugin,
  ImagePlugin,
  VideoPlugin,
  AudioPlugin,
  MindPlugin,
  WebviewPlugin,
  FramePlugin,
  ColumnPlugin,
  FileDragDropPlugin,
  ViewPortPlugin,
  CopyPastePlugin,
  ExportImagePlugin,
  PresentationPlugin,
} from "../plugins";
import { createInteractionContributions } from "./interactionCommands";
import GeometryTool from "../components/Toolbar/Geometry";
import ArrowTool from "../components/Toolbar/Arrow";
import HandwriteTool from "../components/Toolbar/Handwrite";
import ArrowSourceSnapPreview from "../components/ArrowSourceSnapPreview";
import MindTool from "../components/Toolbar/MindMap";
import FrameTool from "../components/Toolbar/Frame";
import ColumnTool from "../components/Toolbar/Column";
import RichTextSetter from "../components/AttributeSetter/RichTextSetter";
import GeometrySetter from "../components/AttributeSetter/GeometrySetter";
import ArrowSetter from "../components/AttributeSetter/ArrowSetter";
import HandwriteSetter from "../components/AttributeSetter/HandwriteSetter";
import MindSetter from "../components/AttributeSetter/MindMapSetter";
import ImageSetter from "../components/AttributeSetter/ImageSetter";
import MediaSetter from "../components/AttributeSetter/MediaSetter";
import DocumentSetter from "../components/AttributeSetter/DocumentSetter";
import FrameSetter from "../components/AttributeSetter/FrameSetter";
import ColumnSetter from "../components/AttributeSetter/ColumnSetter";
import MultiSelectSetter from "../components/AttributeSetter/MultiSelectSetter";
import ExportImageModal from "../components/ExportImageModal";
import ImagePreviewModal from "../components/ImagePreviewModal";
import MediaUrlDialog from "../components/MediaUrlDialog";
import type { CaptureBlob } from "../hooks/useBoardCapture";
import { getContentLength } from "../utils/text";
import type { Descendant } from "slate";

type BuiltinContributions = Omit<InternalContributions, "tools"> & {
  // 命令型工具收窄 command/execute 为必填；创建型工具（element）经内部 creators 通道登记规格
  tools?: readonly (
    | (Omit<WhiteboardToolContribution, "command" | "element"> & {
        command: string;
        execute: WhiteboardCommand["execute"];
      })
    | (Omit<WhiteboardToolContribution, "command"> & { element: string })
  )[];
};
function builtin(
  id: string,
  plugins: (board: Board, api: WhiteboardAPI) => IBoardPlugin[],
  contributions: BuiltinContributions | ((api: WhiteboardAPI) => BuiltinContributions) = {}
) {
  return withInternalPlugins(
    defineWhiteboardExtension({
      id,
      create: api => {
        const value = typeof contributions === "function" ? contributions(api) : contributions;
        return {
          ...value,
          commands: [
            ...(value.commands ?? []),
            ...(value.tools ?? []).flatMap(item => {
              if (!("command" in item)) return [];
              return [
                {
                  id: item.command,
                  execute: item.execute,
                  enabled: (api: WhiteboardAPI) => !api.readonly,
                },
              ];
            }),
          ],
          tools: value.tools?.map(item => {
            if (!("command" in item)) return item;
            const { execute: _execute, ...rest } = item;
            return rest;
          }),
        };
      },
    }),
    plugins
  );
}

/** richtext/mind/clipboard 共用：优先宿主注册的富文本服务，缺失时退回嵌入式实现（每扩展解析一次） */
function lazyTextOptions(Selector?: TextExtensionOptions["Selector"]) {
  let resolved: TextExtensionOptions | undefined;
  return (api: WhiteboardAPI): TextExtensionOptions =>
    (resolved ??= textOptionsFromService(
      api.tryGetService(IWhiteboardRichText) ?? createEmbeddedRichTextService(),
      Selector
    ));
}

/** 媒体扩展共用：从 optional 服务构造插件运行时能力（每扩展解析一次） */
function lazyMediaCapabilities(actions?: readonly string[]) {
  let resolved: MediaCapabilities | undefined;
  return (api: WhiteboardAPI): MediaCapabilities =>
    (resolved ??= mediaCapabilitiesFromServices(api, actions));
}

function withText(plugin: IBoardPlugin, text: TextExtensionOptions) {
  const render = plugin.render?.bind(plugin);
  if (render)
    plugin.render = (board, props) => (
      <TextExtensionContext value={text}>{render(board, props)}</TextExtensionContext>
    );
  return plugin;
}

function textInspector(Component: ComponentType<any>, text: TextExtensionOptions) {
  return function TextInspector(props: any) {
    return (
      <TextExtensionContext value={text}>
        <Component {...props} />
      </TextExtensionContext>
    );
  };
}

function withBody(plugin: IBoardPlugin, Body?: ComponentType<any>) {
  const read = createSnapshotReader();
  const Content = Body
    ? function ElementContent({ board: _board, element, onResize, onResizeEnd, ...props }: any) {
        const board = useBoard();
        // Body 收到当前扩展的作用域 API（插件 render 外层的 APIContext），发事件受命名空间校验
        const api = useWhiteboardAPI();
        return (
          <Body
            {...props}
            element={read(element)}
            board={api}
            onResize={(...args: unknown[]) => onResize?.(board, ...args)}
            onResizeEnd={(...args: unknown[]) => onResizeEnd?.(board, ...args)}
          />
        );
      }
    : undefined;
  const render = plugin.render?.bind(plugin);
  if (render)
    plugin.render = (board, props) => (
      <ElementContentContext value={Content}>{render(board, props)}</ElementContentContext>
    );
  return plugin;
}

const tool = (
  id: string,
  order: number,
  group: string,
  label: string,
  icon: ComponentType<{ className?: string }>,
  component: ComponentType<WhiteboardToolProps>,
  execute: WhiteboardCommand["execute"]
) => ({ id, command: id, order, group, label, icon, component, execute });
const open =
  (type: ContextMenuModalPayload["type"]): WhiteboardCommand["execute"] =>
  (api, action) => {
    api.emit("tau.modal.open", {
      type,
      action: typeof action === "string" ? action : undefined,
    });
  };

function TextTool({ run }: WhiteboardToolProps) {
  const active = useActiveTool() === RICHTEXT_TOOL_ID;
  return (
    <ChromeButton label="文本" active={active} onClick={() => run()}>
      <Type strokeWidth={1.75} />
    </ChromeButton>
  );
}

function SelectTool({ run }: WhiteboardToolProps) {
  const active = useActiveTool() === SELECT_TOOL_ID;
  return (
    <ChromeButton label="选择" active={active} onClick={() => run()}>
      <MousePointer2 strokeWidth={1.75} />
    </ChromeButton>
  );
}

export function createGeometryExtension(
  kit: TextExtensionOptions["kit"] = embeddedTextOptions.kit
) {
  return builtin("tau.geometry", () => [withText(new GeometryPlugin(), { kit })], {
    creators: { geometry: geometryCreateSpec },
    tools: [
      {
        id: GEOMETRY_TOOL_ID,
        element: "geometry",
        order: 10,
        group: "drawing",
        label: "形状",
        icon: Shapes,
        component: GeometryTool,
      },
    ],
    inspectors: { geometry: GeometrySetter },
  });
}
export function createArrowExtension(kit: TextExtensionOptions["kit"] = embeddedTextOptions.kit) {
  return builtin("tau.arrow", () => [withText(new ArrowPlugin(), { kit })], {
    creators: { arrow: arrowCreateSpec },
    tools: [
      {
        id: ARROW_TOOL_ID,
        element: "arrow",
        order: 20,
        group: "drawing",
        label: "箭头",
        icon: ArrowUpRight,
        component: ArrowTool,
      },
    ],
    layers: [
      {
        id: "tau.arrow.source-snap-preview",
        position: "canvas",
        component: ArrowSourceSnapPreview,
      },
    ],
    inspectors: { arrow: ArrowSetter },
  });
}
export function createHandwriteExtension() {
  return builtin("tau.handwrite", () => [new HandwritePlugin()], {
    creators: { handwrite: handwriteCreateSpec },
    tools: [
      {
        id: HANDWRITE_TOOL_ID,
        element: "handwrite",
        order: 30,
        group: "drawing",
        label: "手写",
        icon: PenLine,
        component: HandwriteTool,
      },
    ],
    inspectors: { handwrite: HandwriteSetter },
  });
}
export interface RichTextFactoryOptions {
  /** @ 选内容弹窗（桌面业务弹窗），不进服务 */
  Selector?: TextExtensionOptions["Selector"];
  layers?: WhiteboardContributions["layers"];
}

export function createRichTextExtension(options: RichTextFactoryOptions = {}) {
  const { Selector, layers = [] } = options;
  const text = lazyTextOptions(Selector);
  return builtin(
    "tau.richtext",
    (_board, api) => [withText(new RichTextPlugin(text(api)), text(api))],
    api => ({
      layers,
      creators: { richtext: textCreateSpec(text(api)) },
      tools: [
        {
          id: RICHTEXT_TOOL_ID,
          element: "richtext",
          order: 40,
          group: "drawing",
          label: "文本",
          icon: Type,
          component: TextTool,
        },
      ],
      inspectors: { richtext: textInspector(RichTextSetter, text(api)) },
      commands: [
        {
          id: "tau.richtext.create-content",
          async execute(api, value) {
            const binding = text(api);
            if (!binding.create) return undefined;
            const content = value as Descendant[];
            const valid = api.captureSubmission();
            if (!valid()) return undefined;
            const id = await binding.create(
              content,
              (binding.countWords ?? getContentLength)(content)
            );
            if (id && !valid()) {
              await binding.release?.(id);
              return undefined;
            }
            return id ?? undefined;
          },
        },
        {
          id: "tau.richtext.release-content",
          execute: (api, id) => {
            const binding = text(api);
            return typeof id === "number" ? binding.release?.(id) : undefined;
          },
        },
      ],
    })
  );
}
export function createMindExtension(Selector?: TextExtensionOptions["Selector"]) {
  const text = lazyTextOptions(Selector);
  return builtin(
    "tau.mind",
    (_board, api) => [withText(new MindPlugin(text(api)), text(api))],
    api => ({
      creators: { "mind-node": mindCreateSpec },
      tools: [
        {
          id: MIND_TOOL_ID,
          element: "mind-node",
          order: 50,
          group: "drawing",
          label: "思维导图",
          icon: Network,
          component: MindTool,
        },
      ],
      inspectors: { "mind-node": textInspector(MindSetter, text(api)) },
    })
  );
}
export function createFrameExtension() {
  return builtin("tau.frame", () => [new FramePlugin()], {
    creators: { frame: frameCreateSpec },
    tools: [
      {
        id: FRAME_TOOL_ID,
        element: "frame",
        order: 120,
        group: "container",
        label: "画框",
        icon: FrameIcon,
        component: FrameTool,
      },
    ],
    inspectors: { frame: FrameSetter },
  });
}
export function createColumnExtension() {
  return builtin("tau.column", () => [new ColumnPlugin()], {
    creators: { column: columnCreateSpec },
    tools: [
      {
        id: COLUMN_TOOL_ID,
        element: "column",
        order: 130,
        group: "container",
        label: "分栏",
        icon: Columns3,
        component: ColumnTool,
      },
    ],
    inspectors: { column: ColumnSetter },
  });
}

export interface ReferencedElementOptions {
  Body?: ComponentType<any>;
  Tool?: ComponentType<WhiteboardToolProps>;
  layers?: WhiteboardContributions["layers"];
}

export function createDocumentExtension(options: ReferencedElementOptions) {
  return builtin(
    "tau.document",
    () => [
      withBody(new DocumentPlugin({ create: !!options.Tool, open: !!options.Body }), options.Body),
    ],
    {
      commands: [
        {
          id: "tau.document.open",
          enabled: api => {
            const selected = api.selection.selectedElements;
            return selected.length === 1 && isDocumentElement(selected[0]);
          },
          execute: api => {
            const element = api.selection.selectedElements[0];
            if (element) api.emit("tau.document.open", element.id);
          },
        },
      ],
      hotkeys: [{ key: "enter", command: "tau.document.open" }],
      tools: options.Tool
        ? [
            tool(
              "tau.document.create",
              100,
              "reference",
              "文档",
              FileText,
              options.Tool,
              open("document")
            ),
          ]
        : [],
      inspectors: { document: DocumentSetter },
      layers: options.layers,
    }
  );
}
export function createWhiteboardReferenceExtension(options: ReferencedElementOptions) {
  return builtin(
    "tau.whiteboard-reference",
    () => [withBody(new WhiteBoardPlugin(!!options.Tool), options.Body)],
    {
      tools: options.Tool
        ? [
            tool(
              "tau.whiteboard-reference.create",
              110,
              "reference",
              "白板",
              Presentation,
              options.Tool,
              open("whiteboard")
            ),
          ]
        : [],
      inspectors: { whiteboard: MediaSetter },
      layers: options.layers,
    }
  );
}
export function createWebviewExtension(options: ReferencedElementOptions) {
  return builtin("tau.webview", () => [withBody(new WebviewPlugin(), options.Body)], {
    tools: options.Tool
      ? [tool("tau.webview.create", 90, "media", "网页", Globe, options.Tool, open("webview"))]
      : [],
    inspectors: { webview: MediaSetter },
    layers: options.layers,
  });
}

function urlTool(kind: "image" | "video" | "audio") {
  return function UrlTool({ run }: WhiteboardToolProps) {
    const Icon = kind === "image" ? Image : kind === "video" ? Video : AudioLines;
    return (
      <ChromeButton
        label={kind === "image" ? "图片" : kind === "video" ? "视频" : "音频"}
        onClick={() => run("url")}
      >
        <Icon strokeWidth={1.75} />
      </ChromeButton>
    );
  };
}

export interface MediaFactoryOptions extends MediaExtensionOptions {
  Tool?: ComponentType<WhiteboardToolProps>;
  layers?: WhiteboardContributions["layers"];
}

export function createImageExtension(
  options: MediaFactoryOptions = {},
  Tool: ComponentType<WhiteboardToolProps> = urlTool("image")
) {
  const { actions, Image: ImageComponent, layers = [] } = options;
  const media = lazyMediaCapabilities(actions);
  return builtin(
    "tau.image",
    (_board, api) => {
      const plugin = new ImagePlugin(media(api));
      const render = plugin.render.bind(plugin);
      plugin.render = (board, props) => (
        <MediaExtensionContext value={{ Image: ImageComponent }}>
          {render(board, props)}
        </MediaExtensionContext>
      );
      return [plugin];
    },
    {
      layers,
      tools: [tool("tau.image.create", 60, "media", "图片", Image, Tool, open("image"))],
      inspectors: { image: ImageSetter },
    }
  );
}
export function createVideoExtension(options: MediaFactoryOptions & ReferencedElementOptions = {}) {
  const { actions, Body, videoSources } = options;
  const media = lazyMediaCapabilities(actions);
  return builtin(
    "tau.video",
    (_board, api) => [withBody(new VideoPlugin({ ...media(api), videoSources }), Body)],
    {
      tools: [
        tool(
          "tau.video.create",
          70,
          "media",
          "视频",
          Video,
          options.Tool ?? urlTool("video"),
          open("video")
        ),
      ],
      inspectors: { video: MediaSetter },
      layers: options.layers,
    }
  );
}
export function createAudioExtension(
  options: MediaFactoryOptions = {},
  Tool: ComponentType<WhiteboardToolProps> = urlTool("audio")
) {
  const { actions, layers = [] } = options;
  const media = lazyMediaCapabilities(actions);
  return builtin("tau.audio", (_board, api) => [new AudioPlugin(media(api))], {
    layers,
    tools: [tool("tau.audio.create", 80, "media", "音频", AudioLines, Tool, open("audio"))],
    inspectors: { audio: MediaSetter },
  });
}
export function createFileImportExtension() {
  const media = lazyMediaCapabilities();
  return builtin(
    "tau.file-import",
    () => [],
    api => {
      const capabilities = media(api);
      const drop = new FileDragDropPlugin(capabilities);
      const images = new ImagePlugin(capabilities),
        videos = new VideoPlugin(capabilities),
        audio = new AudioPlugin(capabilities);
      return {
        ingest: [
          {
            id: "tau.file-import.drop",
            source: "drop",
            accepts: event =>
              !!capabilities.upload &&
              Array.from((event as DragEvent).dataTransfer?.types ?? []).includes("Files"),
            run: (_api, event) => drop.onDrop(event as DragEvent, resolveBoardAccess(api)),
          },
          {
            id: "tau.file-import.paste",
            source: "paste",
            accepts: event =>
              !!capabilities.upload &&
              Array.from((event as ClipboardEvent).clipboardData?.items ?? []).some(item =>
                /^(image|video|audio)\//.test(item.type)
              ),
            run: (_api, event) => {
              const board = resolveBoardAccess(api);
              images.onPaste(event as ClipboardEvent, board);
              videos.onPaste(event as ClipboardEvent, board);
              audio.onPaste(event as ClipboardEvent, board);
            },
          },
        ],
      };
    }
  );
}
export function createInteractionExtension() {
  return builtin(
    "tau.interaction",
    () => [new ViewPortPlugin()],
    () => {
      const { commands, hotkeys, hotkeyCodes } = createInteractionContributions();
      return {
        commands,
        hotkeys,
        hotkeyCodes,
        tools: [
          tool("tau.select", 0, "base", "选择", MousePointer2, SelectTool, api => {
            api.setActiveTool(SELECT_TOOL_ID);
          }),
        ],
        inspectors: { multiselect: MultiSelectSetter },
      };
    }
  );
}
export function createClipboardExtension() {
  const text = lazyTextOptions();
  return builtin(
    "tau.clipboard",
    (_board, api) => [new CopyPastePlugin(text(api))],
    api => {
      const clipboard = new CopyPastePlugin(text(api));
      return {
        ingest: [
          {
            id: "tau.clipboard.paste",
            source: "paste",
            accepts: event => {
              const data = (event as ClipboardEvent).clipboardData;
              return (
                !!data &&
                !Array.from(data.items ?? []).some(item =>
                  /^(image|video|audio)\//.test(item.type)
                ) &&
                !!(data.getData("text/plain") || data.getData("application/json"))
              );
            },
            run: (_api, event) => {
              clipboard.onPaste(event as ClipboardEvent, resolveBoardAccess(api));
            },
          },
        ],
      };
    }
  );
}
export function createPresentationExtension() {
  return builtin("tau.presentation", () => [new PresentationPlugin()]);
}

const browserCapture: CaptureBlob = async (element, options) => {
  const { snapdom } = await import("@zumer/snapdom");
  return snapdom.toBlob(element, { ...options, embedFonts: true });
};
export function createExportExtension(captureBlob: CaptureBlob = browserCapture) {
  function ExportLayer() {
    const board = useBoard();
    const [modal, setModal] = useState<ContextMenuModalPayload | null>(null);
    useEffect(() => {
      const open = (payload: ContextMenuModalPayload) => {
        if (payload.type === "export-image") setModal(payload);
      };
      board.on("tau.modal.open", open);
      return () => board.off("tau.modal.open", open);
    }, [board]);
    return (
      <ExportImageModal
        open={!!modal}
        board={board}
        captureBlob={captureBlob}
        action={modal?.action}
        selectedElementIds={modal?.selectedElementIds}
        onClose={() => setModal(null)}
      />
    );
  }
  return builtin("tau.export", () => [new ExportImagePlugin()], {
    layers: [{ id: "tau.export.dialog", position: "outside", component: ExportLayer }],
  });
}
export function createImagePreviewExtension(options: MediaExtensionOptions = {}) {
  function PreviewLayer() {
    const board = useBoard();
    const [preview, setPreview] = useState<{ src: string; alt?: string } | null>(null);
    useEffect(() => {
      board.on("tau.image.preview-open", setPreview);
      return () => board.off("tau.image.preview-open", setPreview);
    }, [board]);
    return (
      <MediaExtensionContext value={{ Image: options.Image }}>
        <ImagePreviewModal
          open={!!preview}
          src={preview?.src ?? ""}
          alt={preview?.alt}
          onClose={() => setPreview(null)}
        />
      </MediaExtensionContext>
    );
  }
  return builtin("tau.image-preview", () => [], {
    layers: [{ id: "tau.image-preview.dialog", position: "outside", component: PreviewLayer }],
  });
}
export function createMediaUrlExtension() {
  function UrlLayer() {
    const board = useBoard();
    const [modal, setModal] = useState<ContextMenuModalPayload | null>(null);
    useEffect(() => {
      const open = (payload: ContextMenuModalPayload) => {
        if (["image", "video", "audio"].includes(payload.type)) setModal(payload);
      };
      board.on("tau.modal.open", open);
      return () => board.off("tau.modal.open", open);
    }, [board]);
    return modal && <MediaUrlDialog modal={modal} onClose={() => setModal(null)} />;
  }
  return builtin("tau.media-url", () => [], {
    layers: [{ id: "tau.media-url.dialog", position: "outside", component: UrlLayer }],
  });
}

export function createStandardWhiteboardExtensions(): WhiteboardExtension[] {
  return [
    createArrowExtension(),
    createGeometryExtension(),
    createHandwriteExtension(),
    createRichTextExtension(),
    createImageExtension(),
    createVideoExtension(),
    createAudioExtension(),
    createMindExtension(),
    createFrameExtension(),
    createColumnExtension(),
    createInteractionExtension(),
    createClipboardExtension(),
    createExportExtension(),
    createPresentationExtension(),
    createImagePreviewExtension(),
    createMediaUrlExtension(),
  ];
}
