import { useEffect, useState, type ComponentType } from "react";
import { Type, Image, Video, AudioLines } from "lucide-react";
import type Board from "../Board";
import type { IBoardPlugin, ContextMenuModalPayload } from "../types";
import { ECreateBoardElementType } from "../types";
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
import { withInternalPlugins } from "./internal";
import { TextExtensionContext, embeddedTextOptions, type TextExtensionOptions } from "./text";
import { MediaExtensionContext, browserMediaOptions, type MediaExtensionOptions } from "./media";
import { ElementContentContext } from "./elementContent";
import { useBoard, useCreateElementType } from "../hooks";
import { ChromeButton } from "../chrome";
import {
  ArrowPlugin,
  GeometryPlugin,
  HandwritePlugin,
  DocumentPlugin,
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
  HistoryPlugin,
  SelectPlugin,
  ViewPortPlugin,
  CopyPastePlugin,
  ExportImagePlugin,
  PresentationPlugin,
} from "../plugins";
import GeometryTool from "../components/Toolbar/Geometry";
import ArrowTool from "../components/Toolbar/Arrow";
import HandwriteTool from "../components/Toolbar/Handwrite";
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

type BuiltinContributions = Omit<WhiteboardContributions, "tools"> & {
  tools?: readonly (WhiteboardToolContribution & { execute: WhiteboardCommand["execute"] })[];
};
function builtin(
  id: string,
  plugins: (board: Board) => IBoardPlugin[],
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
            ...(value.tools ?? []).map(item => ({
              id: item.command,
              execute: item.execute,
              enabled: (api: WhiteboardAPI) => !api.readonly,
            })),
          ],
          tools: value.tools?.map(({ execute: _execute, ...item }) => item),
        };
      },
    }),
    plugins
  );
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
        return (
          <Body
            {...props}
            element={read(element)}
            board={board.extensions!.api}
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
  component: ComponentType<WhiteboardToolProps>,
  execute: WhiteboardCommand["execute"]
) => ({ id, command: id, order, group, component, execute });
const activate =
  (type: ECreateBoardElementType): WhiteboardCommand["execute"] =>
  api => {
    api.currentCreateType = api.currentCreateType === type ? ECreateBoardElementType.None : type;
  };
const open =
  (type: ContextMenuModalPayload["type"]): WhiteboardCommand["execute"] =>
  (api, action) => {
    api.emit("context-menu:open-modal", {
      type,
      action: typeof action === "string" ? action : undefined,
    });
  };
const chooseGeometry: WhiteboardCommand["execute"] = (api, options) => {
  const board = resolveBoardAccess(api);
  if (!options) {
    board.currentCreateType = ECreateBoardElementType.None;
    return;
  }
  board.createOptions = options;
  board.currentCreateType = ECreateBoardElementType.Geometry;
};

function TextTool({ run }: WhiteboardToolProps) {
  const active = useCreateElementType() === ECreateBoardElementType.Text;
  return (
    <ChromeButton label="文本" active={active} onClick={() => run()}>
      <Type strokeWidth={1.75} />
    </ChromeButton>
  );
}

export function createGeometryExtension(text = embeddedTextOptions) {
  return builtin("tau.geometry", () => [withText(new GeometryPlugin(), text)], {
    tools: [tool("tau.geometry.create", 10, "drawing", GeometryTool, chooseGeometry)],
    inspectors: { geometry: GeometrySetter },
  });
}
export function createArrowExtension(text = embeddedTextOptions) {
  return builtin("tau.arrow", () => [withText(new ArrowPlugin(), text)], {
    tools: [
      tool(
        "tau.arrow.create",
        20,
        "drawing",
        ArrowTool,
        activate(ECreateBoardElementType.StraightArrow)
      ),
    ],
    inspectors: { arrow: ArrowSetter },
  });
}
export function createHandwriteExtension() {
  return builtin("tau.handwrite", () => [new HandwritePlugin()], {
    tools: [
      tool(
        "tau.handwrite.create",
        30,
        "drawing",
        HandwriteTool,
        activate(ECreateBoardElementType.Handwrite)
      ),
    ],
    inspectors: { handwrite: HandwriteSetter },
  });
}
export function createRichTextExtension(
  text = embeddedTextOptions,
  layers: WhiteboardContributions["layers"] = []
) {
  return builtin("tau.richtext", () => [withText(new RichTextPlugin(text), text)], {
    layers,
    tools: [
      tool("tau.richtext.create", 40, "drawing", TextTool, activate(ECreateBoardElementType.Text)),
    ],
    inspectors: { richtext: textInspector(RichTextSetter, text) },
    commands: [
      {
        id: "tau.richtext.create-content",
        async execute(api, value) {
          if (!text.create) return undefined;
          const content = value as Descendant[];
          const valid = api.captureSubmission();
          if (!valid()) return undefined;
          const id = await text.create(content, getContentLength(content));
          if (id && !valid()) {
            await text.release?.(id);
            return undefined;
          }
          return id ?? undefined;
        },
      },
      {
        id: "tau.richtext.release-content",
        execute: (_api, id) => (typeof id === "number" ? text.release?.(id) : undefined),
      },
    ],
  });
}
export function createMindExtension(text = embeddedTextOptions) {
  return builtin("tau.mind", () => [withText(new MindPlugin(text), text)], {
    tools: [
      tool("tau.mind.create", 50, "drawing", MindTool, activate(ECreateBoardElementType.MindMap)),
    ],
    inspectors: { "mind-node": textInspector(MindSetter, text) },
  });
}
export function createFrameExtension() {
  return builtin("tau.frame", () => [new FramePlugin()], {
    tools: [
      tool(
        "tau.frame.create",
        120,
        "container",
        FrameTool,
        activate(ECreateBoardElementType.Frame)
      ),
    ],
    inspectors: { frame: FrameSetter },
  });
}
export function createColumnExtension() {
  return builtin("tau.column", () => [new ColumnPlugin()], {
    tools: [
      tool(
        "tau.column.create",
        130,
        "container",
        ColumnTool,
        activate(ECreateBoardElementType.Column)
      ),
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
      tools: options.Tool
        ? [tool("tau.document.create", 100, "reference", options.Tool, open("document"))]
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
      ? [tool("tau.webview.create", 90, "media", options.Tool, open("webview"))]
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

export function createImageExtension(
  media = browserMediaOptions,
  Tool = urlTool("image"),
  layers: WhiteboardContributions["layers"] = []
) {
  return builtin(
    "tau.image",
    () => {
      const plugin = new ImagePlugin(media);
      const render = plugin.render.bind(plugin);
      plugin.render = (board, props) => (
        <MediaExtensionContext value={media}>{render(board, props)}</MediaExtensionContext>
      );
      return [plugin];
    },
    {
      layers,
      tools: [tool("tau.image.create", 60, "media", Tool, open("image"))],
      inspectors: { image: ImageSetter },
    }
  );
}
export function createVideoExtension(
  media = browserMediaOptions,
  options: ReferencedElementOptions = {}
) {
  return builtin("tau.video", () => [withBody(new VideoPlugin(media), options.Body)], {
    tools: [tool("tau.video.create", 70, "media", options.Tool ?? urlTool("video"), open("video"))],
    inspectors: { video: MediaSetter },
    layers: options.layers,
  });
}
export function createAudioExtension(
  media = browserMediaOptions,
  Tool = urlTool("audio"),
  layers: WhiteboardContributions["layers"] = []
) {
  return builtin("tau.audio", () => [new AudioPlugin(media)], {
    layers,
    tools: [tool("tau.audio.create", 80, "media", Tool, open("audio"))],
    inspectors: { audio: MediaSetter },
  });
}
export function createFileImportExtension(media: MediaExtensionOptions) {
  return builtin(
    "tau.file-import",
    () => [],
    api => {
      const drop = new FileDragDropPlugin(media);
      const images = new ImagePlugin(media),
        videos = new VideoPlugin(media),
        audio = new AudioPlugin(media);
      return {
        ingest: [
          {
            id: "tau.file-import.drop",
            source: "drop",
            accepts: event =>
              !!media.upload &&
              Array.from((event as DragEvent).dataTransfer?.types ?? []).includes("Files"),
            run: (_api, event) => drop.onDrop(event as DragEvent, resolveBoardAccess(api)),
          },
          {
            id: "tau.file-import.paste",
            source: "paste",
            accepts: event =>
              !!media.upload &&
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
    () => [new HistoryPlugin(), new SelectPlugin(), new ViewPortPlugin()],
    {
      inspectors: { multiselect: MultiSelectSetter },
    }
  );
}
export function createClipboardExtension(text = embeddedTextOptions) {
  return builtin(
    "tau.clipboard",
    () => [new CopyPastePlugin(text)],
    api => {
      const clipboard = new CopyPastePlugin(text);
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
      board.on("context-menu:open-modal", open);
      return () => board.off("context-menu:open-modal", open);
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
export function createImagePreviewExtension(media = browserMediaOptions) {
  function PreviewLayer() {
    const board = useBoard();
    const [preview, setPreview] = useState<{ src: string; alt?: string } | null>(null);
    useEffect(() => {
      board.on("image:preview:open", setPreview);
      return () => board.off("image:preview:open", setPreview);
    }, [board]);
    return (
      <MediaExtensionContext value={media}>
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
      board.on("context-menu:open-modal", open);
      return () => board.off("context-menu:open-modal", open);
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
