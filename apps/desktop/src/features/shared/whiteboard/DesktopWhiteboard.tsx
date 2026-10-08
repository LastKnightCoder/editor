import { forwardRef, useEffect, useMemo, useState } from "react";
import WhiteBoard from "@tau/whiteboard";
import {
  type WhiteBoardProps,
  type WhiteBoardRef,
  type WhiteboardSlots,
  type WhiteboardEditorProps,
} from "@tau/whiteboard";
import type { Descendant } from "slate";
import ContentEditor from "@/components/ContentEditor";
import ContentSelector from "@/components/ContentSelectorModal";
import LocalImage from "@/components/LocalImage";
import useContentDocument from "@/hooks/useContentDocument";
import { getContentKit, getDescriptionKit, getArrowLabelKit } from "@/services/editorKit";
import { collaborationKit } from "@/hooks/useCollaborationKit";
import { getContentBinding } from "@/services/contentBindings";
import { bindDatabaseCommands } from "@/services/command-context";
import * as contentCommands from "@/commands/content";
import { getImageInfo, getVideoInfo } from "@/utils";
import { importFromMarkdown } from "@/utils/markdown";
import { uploadResource } from "@/hooks/useUploadResource";
import { downloadFile } from "@/utils/download";
import { captureBlobWithSnapdom } from "@/utils/snapdom-export";
import useSettingStore from "@/stores/useSettingStore";
import { DesktopWhiteboardLayers } from "./DesktopWhiteboardLayers";
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

function DesktopEditor({ editingContext, ...props }: WhiteboardEditorProps) {
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

const desktopSlots: WhiteboardSlots = {
  Editor: DesktopEditor,
  ContentSnapshotObserver,
  ContentSelector,
  Image: LocalImage,
  Layers: DesktopWhiteboardLayers,
  CanvasLayer: DocumentReaderLayer,
  tools: {
    image: ImageTool,
    video: VideoTool,
    audio: AudioTool,
    document: DocumentTool,
    webview: WebviewTool,
    whiteboard: WhiteboardTool,
  },
  elements: {
    document: DocumentCard,
    whiteboard: WhiteboardCard,
    video: VideoElement,
    webview: WebviewElement,
  },
};

export type DesktopWhiteboardProps = WhiteBoardProps & { onDockWidthChange?(width: number): void };
export const DesktopWhiteboard = forwardRef<WhiteBoardRef, DesktopWhiteboardProps>((props, ref) => {
  const [databaseName] = useState(() => useSettingStore.getState().setting.database.active);
  const preferences = useWhiteboardOutlineStore();
  const services = useMemo(() => {
    const commands = bindDatabaseCommands(contentCommands, { databaseName });
    const current = () => useSettingStore.getState().setting.database.active === databaseName;
    return {
      getContentKit: (contentId?: number) =>
        collaborationKit(getContentBinding(contentId), getContentKit()),
      getDescriptionKit,
      getArrowLabelKit,
      createContent: async (...args: Parameters<typeof commands.createContent>) =>
        current() ? commands.createContent(...args) : null,
      updateContent: async (...args: Parameters<typeof commands.updateContent>) => {
        if (current()) return commands.updateContent(...args);
      },
      deleteContent: async (id: number) => {
        if (current()) return commands.deleteContent(id);
      },
      incrementContentRefCount: async (id: number) => {
        if (current()) return commands.incrementContentRefCount(id);
      },
      decrementContentRefCount: async (id: number) => {
        if (current()) return commands.decrementContentRefCount(id);
      },
      uploadResource,
      downloadFile,
      getImageInfo,
      getVideoInfo,
      importFromMarkdown,
      captureBlob: captureBlobWithSnapdom,
    };
  }, [databaseName]);
  return (
    <WhiteBoard
      {...props}
      ref={ref}
      services={{ ...services, ...props.services }}
      slots={{ ...desktopSlots, ...props.slots }}
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
