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
  type WhiteboardTextEditorProps,
  type TextExtensionOptions,
} from "@tau/whiteboard/extensions";
import { desktopMedia } from "./media";
import { forwardRef, useEffect, useMemo, useState } from "react";
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
export type DesktopWhiteboardProps = Omit<WhiteBoardProps, "extensions"> & {
  extensions?: readonly WhiteboardExtension[];
  onDockWidthChange?(width: number): void;
};
export const DesktopWhiteboard = forwardRef<WhiteBoardRef, DesktopWhiteboardProps>((props, ref) => {
  const [databaseName] = useState(() => useSettingStore.getState().setting.database.active);
  const preferences = useWhiteboardOutlineStore();
  const additionalExtensions = props.extensions ?? NO_EXTENSIONS;
  const extensions = useMemo(() => {
    const commands = bindDatabaseCommands(contentCommands, { databaseName });
    const current = () => useSettingStore.getState().setting.database.active === databaseName;
    const text: TextExtensionOptions = {
      Editor: DesktopEditor,
      Observer: ContentSnapshotObserver,
      Selector: ContentSelector,
      kit: (contentId?: number) => collaborationKit(getContentBinding(contentId), getContentKit()),
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
      importMarkdown: importFromMarkdown,
    };
    return [
      createArrowExtension({ kit: getArrowLabelKit }),
      createGeometryExtension({ kit: getDescriptionKit }),
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
      createRichTextExtension(text, [
        { id: "tau.richtext.actions", position: "outside", component: RichTextActionsLayer },
      ]),
      createImageExtension(desktopMedia, ImageTool, [selectorLayer("image", ImageSelectorModal)]),
      createVideoExtension(desktopMedia, {
        Body: VideoElement,
        Tool: VideoTool,
        layers: [selectorLayer("video", VideoSelectorModal)],
      }),
      createAudioExtension(desktopMedia, AudioTool, [selectorLayer("audio", AudioSelectorModal)]),
      createMindExtension(text),
      createWebviewExtension({
        Body: WebviewElement,
        Tool: WebviewTool,
        layers: [selectorLayer("webview", WebviewSelectorModal)],
      }),
      createFrameExtension(),
      createColumnExtension(),
      createFileImportExtension(desktopMedia),
      createInteractionExtension(),
      createClipboardExtension(text),
      createExportExtension(captureBlobWithSnapdom),
      createPresentationExtension(),
      createImagePreviewExtension(desktopMedia),
      defineWhiteboardExtension({
        id: "tau.desktop-notes",
        create: () => ({
          layers: [{ id: "tau.desktop-notes.panels", position: "outside", component: NoteLayers }],
        }),
      }),
      ...additionalExtensions,
    ];
  }, [databaseName, additionalExtensions]);
  return (
    <WhiteBoard
      {...props}
      ref={ref}
      extensions={extensions}
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
