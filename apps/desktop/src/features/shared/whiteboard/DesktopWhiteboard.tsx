import { getWhiteboardBodyKit } from "./editorKit";
import { IEditorSlots } from "@tau/editor/extensions/media/services";
import { createAssetMedia } from "@/components/CollaborationUI/AssetMedia";
import type { EditorKit } from "@tau/editor";
import type { ResourceService } from "@tau/shared/host-services";
import { useBoard } from "@tau/whiteboard";
import { getWhiteboardDocument } from "@tau/whiteboard/collaboration";
import { toLocalMediaPreviewUrl } from "@/utils/localMediaPath";
import { desktopContentMetrics } from "../../../../shared/content-metrics";
import {
  createArrowExtension,
  createGeometryExtension,
  createHandwriteExtension,
  createRichTextExtension,
  createMindExtension,
  createDocumentExtension,
  createWhiteboardReferenceExtension,
  createWebviewExtension,
  createImageExtension,
  createVideoExtension,
  createAudioExtension,
  createFrameExtension,
  createColumnExtension,
  createFileImportExtension,
  createInteractionExtension,
  createClipboardExtension,
  createExportExtension,
  createPresentationExtension,
  createImagePreviewExtension,
  createServiceRegistry,
  IWhiteboardRichText,
  type WhiteboardTextEditorProps,
} from "@tau/whiteboard/extensions";
import { IResourceService } from "@tau/shared/host-services";
import { IDownloadService, IMediaInfoService } from "@tau/shared/media-services";
import { desktopMedia, desktopMediaActions, desktopMediaImage, desktopVideoSources } from "./media";
import { uploadResource } from "@/hooks/useUploadResource";
import { downloadFile } from "@/utils/download";
import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { useDesktopPlugins } from "@/app/plugins/context";
import { createWhiteboardPluginServices } from "@/app/plugins/whiteboard-services";
import WhiteBoard from "@tau/whiteboard";
import {
  type WhiteBoardProps,
  type WhiteBoardRef,
  type WhiteboardExtension,
  defineWhiteboardExtension,
} from "@tau/whiteboard";
import type { Descendant } from "slate";
import ContentEditor from "@/components/ContentEditor";
import ContentSelector from "@/components/ContentSelectorModal";
import useContentDocument from "@/hooks/useContentDocument";
import { getContentKit, getDescriptionKit, getArrowLabelKit } from "@/services/editorKit";
import { collaborationKit } from "@/hooks/useCollaborationKit";
import { getContentBinding } from "@/services/contentBindings";
import { bindDatabaseCommands } from "@/services/command-context";
import * as contentCommands from "@/commands/content";
import { importFromMarkdown } from "@/utils/markdown";
import { captureBlobWithSnapdom } from "@/utils/snapdom-export";
import useSettingStore from "@/stores/useSettingStore";
import { NoteLayers } from "./NoteLayers";
import { RichTextActionsLayer } from "./RichTextActionsLayer";
import { selectorLayer } from "./selectorLayer";
import { DocumentSelectorModal } from "./components/Document/DocumentSelectorModal";
import ImageSelectorModal from "./components/ImageSelectorModal";
import VideoSelectorModal from "./components/VideoSelectorModal";
import AudioSelectorModal from "./components/AudioSelectorModal";
import WebviewSelectorModal from "./components/WebviewSelectorModal";
import WhiteBoardSelectorModal from "./components/WhiteBoardSelectorModal";
import { useWhiteboardOutlineStore } from "./outlineStore";
import { DocumentCard } from "./components/Document/DocumentCard";
import { DocumentReaderLayer } from "./components/Document/DocumentReader";
import WhiteboardCard from "./components/WhiteBoardCard";
import VideoElement from "./components/VideoElement";
import WebviewElement from "./components/WebviewElement";
import ImageTool from "./components/Toolbar/Image";
import VideoTool from "./components/Toolbar/Video";
import AudioTool from "./components/Toolbar/Audio";
import DocumentTool from "./components/Toolbar/Document";
import WebviewTool from "./components/Toolbar/Webview";
import WhiteboardTool from "./components/Toolbar/WhiteBoard";

const resourceKits = new WeakMap<ResourceService, Map<EditorKit, EditorKit>>();
function withBoardResources(resource: ResourceService, base: EditorKit): EditorKit {
  let cache = resourceKits.get(resource);
  if (!cache) {
    cache = new Map();
    resourceKits.set(resource, cache);
  }
  const previous = cache.get(base);
  if (previous) return previous;
  const kit = base.extend({
    services: [
      register => {
        register(IResourceService, resource);
        const slots = base.registry.tryGet(IEditorSlots);
        if (slots && resource.remoteResourceToLocal) {
          const binding = { resolveResource: resource.remoteResourceToLocal };
          register(IEditorSlots, {
            ...slots,
            Video: createAssetMedia(slots.Video, binding, "视频"),
            Audio: createAssetMedia(slots.Audio, binding, "音频"),
          });
        }
      },
    ],
  });
  cache.set(base, kit);
  return kit;
}
function DesktopEditor({ editingContext, ...props }: WhiteboardTextEditorProps) {
  const board = useBoard();
  const kit =
    !props.contentId && getWhiteboardDocument(board)
      ? withBoardResources(board.getService(IResourceService), getWhiteboardBodyKit())
      : getContentKit();
  return (
    <ContentEditor
      {...props}
      kit={kit}
      editingContext={editingContext ? { ...editingContext, entityType: "whiteboard" } : undefined}
    />
  );
}

function ContentSnapshotObserver({
  contentId,
  onChange,
}: {
  contentId: number;
  onChange(value: Descendant[]): void;
}) {
  const { article } = useContentDocument(contentId);
  useEffect(() => {
    if (article) onChange(article.content as Descendant[]);
  }, [article, onChange]);
  return null;
}

const NO_EXTENSIONS: readonly WhiteboardExtension[] = [];
export type DesktopWhiteboardProps = Omit<WhiteBoardProps, "extensions" | "services"> & {
  extensions?: readonly WhiteboardExtension[];
  onDockWidthChange?(width: number): void;
  documentResources?: import("@tau/shared/host-services").ResourceService;
};
export const DesktopWhiteboard = forwardRef<WhiteBoardRef, DesktopWhiteboardProps>((props, ref) => {
  const [databaseName] = useState(() => useSettingStore.getState().setting.database.active);
  const pluginRuntime = useDesktopPlugins();
  const pluginRuntimeRef = useRef(pluginRuntime);
  pluginRuntimeRef.current = pluginRuntime;
  const preferences = useWhiteboardOutlineStore();
  const resourceRef = useRef(props.documentResources);
  resourceRef.current = props.documentResources;
  const additionalExtensions = props.extensions ?? NO_EXTENSIONS;
  // 宿主服务注册表：与 extensions 同随 databaseName 重建（切库后正文命令必须指向新库）
  const services: ReturnType<typeof createServiceRegistry> = useMemo(() => {
    const commands = bindDatabaseCommands(contentCommands, { databaseName });
    const current = () => useSettingStore.getState().setting.database.active === databaseName;
    return createServiceRegistry(
      register =>
        register(IWhiteboardRichText, {
          countWords: desktopContentMetrics.count,
          Editor: DesktopEditor,
          Observer: ContentSnapshotObserver,
          kit: (contentId?: number) =>
            !contentId && props.document
              ? withBoardResources(services.get(IResourceService), getWhiteboardBodyKit())
              : collaborationKit(getContentBinding(contentId), getContentKit()),
          content: {
            create: async (content, count) =>
              current() ? commands.createContent(content, count) : null,
            update: async (...args: Parameters<typeof commands.updateContent>) => {
              if (current()) return commands.updateContent(...args);
            },
            release: async (id: number) => {
              return commands.deleteContent(id);
            },
            retain: async (id: number) => {
              if (current()) return commands.incrementContentRefCount(id);
            },
            unretain: async (id: number) => {
              return commands.decrementContentRefCount(id);
            },
          },
          importMarkdown: importFromMarkdown,
        }),
      // uploadResource 失败返回 null，按 shared 契约归一为空串
      register =>
        register(IResourceService, {
          upload: async file =>
            resourceRef.current
              ? resourceRef.current.upload(file)
              : ((await uploadResource(file)) ?? ""),
          remoteResourceToLocal: async reference => {
            if (!resourceRef.current?.remoteResourceToLocal) throw new Error("此白板没有资源会话");
            return resourceRef.current.remoteResourceToLocal(reference);
          },
        }),
      register => register(IMediaInfoService, desktopMedia),
      register => register(IDownloadService, { download: url => downloadFile(url) })
    );
  }, [databaseName]);
  const extensionServices = useMemo(
    () =>
      createWhiteboardPluginServices(services, desktopContentPlugins.list(), pluginId => {
        if (useSettingStore.getState().setting.database.active !== databaseName)
          throw new Error("白板所属工作区已关闭");
        const runtime = pluginRuntimeRef.current;
        if (!runtime) throw new Error("插件尚未就绪，请稍后重试");
        return runtime.host.getStorage(pluginId);
      }),
    [services, databaseName]
  );
  const extensions = useMemo(() => {
    return [
      createArrowExtension(() =>
        props.document
          ? withBoardResources(services.get(IResourceService), getArrowLabelKit())
          : getArrowLabelKit()
      ),
      createGeometryExtension(() =>
        props.document
          ? withBoardResources(services.get(IResourceService), getDescriptionKit())
          : getDescriptionKit()
      ),
      createHandwriteExtension(),
      createDocumentExtension({
        Body: DocumentCard,
        Tool: DocumentTool,
        layers: [
          { id: "tau.document.reader", position: "canvas", component: DocumentReaderLayer },
          selectorLayer("document", DocumentSelectorModal),
        ],
      }),
      createWhiteboardReferenceExtension({
        Body: WhiteboardCard,
        Tool: WhiteboardTool,
        layers: [selectorLayer("whiteboard", WhiteBoardSelectorModal)],
      }),
      createRichTextExtension({
        Selector: ContentSelector,
        layers: [
          { id: "tau.richtext.actions", position: "outside", component: RichTextActionsLayer },
        ],
      }),
      createImageExtension({
        actions: desktopMediaActions,
        Image: desktopMediaImage,
        Tool: ImageTool,
        layers: [selectorLayer("image", ImageSelectorModal)],
      }),
      createVideoExtension({
        actions: desktopMediaActions,
        videoSources: desktopVideoSources,
        Body: VideoElement,
        Tool: VideoTool,
        layers: [selectorLayer("video", VideoSelectorModal)],
      }),
      createAudioExtension({
        resolveUrl: async url => {
          const path = await services.get(IResourceService).remoteResourceToLocal!(url);
          return (await toLocalMediaPreviewUrl(path)).url;
        },
        actions: desktopMediaActions,
        Tool: AudioTool,
        layers: [selectorLayer("audio", AudioSelectorModal)],
      }),
      createMindExtension(ContentSelector),
      createWebviewExtension({
        Body: WebviewElement,
        Tool: WebviewTool,
        layers: [selectorLayer("webview", WebviewSelectorModal)],
      }),
      createFrameExtension(),
      createColumnExtension(),
      createFileImportExtension(),
      createInteractionExtension(),
      createClipboardExtension(),
      createExportExtension(captureBlobWithSnapdom),
      createPresentationExtension(),
      createImagePreviewExtension({ Image: desktopMediaImage }),
      defineWhiteboardExtension({
        id: "tau.desktop-notes",
        create: () => ({
          layers: [{ id: "tau.desktop-notes.panels", position: "outside", component: NoteLayers }],
        }),
      }),
      ...additionalExtensions,
      ...desktopContentPlugins.whiteboardExtensions,
    ];
  }, [additionalExtensions]);
  return (
    <WhiteBoard
      {...props}
      ref={ref}
      extensions={extensions}
      services={services}
      extensionServices={extensionServices}
      outline={
        props.outline ?? {
          open: preferences.open,
          width: preferences.width,
          onWidthChange: preferences.setWidth,
          onDockWidthChange: props.onDockWidthChange,
        }
      }
    />
  );
});
DesktopWhiteboard.displayName = "DesktopWhiteboard";
export default DesktopWhiteboard;
import { desktopContentPlugins } from "../../../../shared/content-plugins";
