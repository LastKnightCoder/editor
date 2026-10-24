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

function DesktopEditor({ editingContext, ...props }: WhiteboardTextEditorProps) {
  return (
    <ContentEditor
      {...props}
      kit={getContentKit()}
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
};
export const DesktopWhiteboard = forwardRef<WhiteBoardRef, DesktopWhiteboardProps>((props, ref) => {
  const [databaseName] = useState(() => useSettingStore.getState().setting.database.active);
  const pluginRuntime = useDesktopPlugins();
  const pluginRuntimeRef = useRef(pluginRuntime);
  pluginRuntimeRef.current = pluginRuntime;
  const preferences = useWhiteboardOutlineStore();
  const additionalExtensions = props.extensions ?? NO_EXTENSIONS;
  // 宿主服务注册表：与 extensions 同随 databaseName 重建（切库后正文命令必须指向新库）
  const services = useMemo(() => {
    const commands = bindDatabaseCommands(contentCommands, { databaseName });
    const current = () => useSettingStore.getState().setting.database.active === databaseName;
    return createServiceRegistry(
      register =>
        register(IWhiteboardRichText, {
          countWords: desktopContentMetrics.count,
          Editor: DesktopEditor,
          Observer: ContentSnapshotObserver,
          kit: (contentId?: number) =>
            collaborationKit(getContentBinding(contentId), getContentKit()),
          content: {
            create: async (...args: Parameters<typeof commands.createContent>) =>
              current() ? commands.createContent(...args) : null,
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
          upload: async file => (await uploadResource(file)) ?? "",
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
      createArrowExtension(getArrowLabelKit),
      createGeometryExtension(getDescriptionKit),
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
