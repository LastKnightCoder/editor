import { createContext, useContext, type ComponentType, type ComponentPropsWithRef } from "react";
import { Editor, createEditorKit, type EditorKit } from "@tau/editor";
import { textFormattingExtension } from "@tau/editor-text-formatting";
import link from "@tau/editor-link";
import type { Descendant } from "slate";
import type { BoardElement, Selection, ViewPort, PresentationSequence, PageSketch } from "./types";

export interface WhiteboardSnapshot {
  children: BoardElement[];
  viewPort: ViewPort;
  selection: Selection;
  presentationSequences?: PresentationSequence[];
  sketch?: PageSketch;
}

export type WhiteboardEditorProps = ComponentPropsWithRef<typeof Editor> & {
  contentId?: number;
  editingContext?: { entityType: string; entityId: string };
};

export interface WhiteboardServices {
  getContentKit(contentId?: number): EditorKit;
  getDescriptionKit(): EditorKit;
  getArrowLabelKit(): EditorKit;
  createContent?(content: Descendant[], length: number, refCount?: number): Promise<number | null>;
  updateContent?(id: number, content: Descendant[]): Promise<unknown>;
  deleteContent?(id: number): Promise<unknown>;
  incrementContentRefCount?(id: number): Promise<unknown>;
  decrementContentRefCount?(id: number): Promise<unknown>;
  uploadResource?(file: File): Promise<string | null>;
  downloadFile?(url: string): Promise<unknown>;
  getImageInfo(file: File): Promise<{ width: number; height: number } | null>;
  getVideoInfo(file: File): Promise<{ width: number; height: number } | null>;
  importFromMarkdown?(text: string): Descendant[];
  captureBlob(element: Element, options: Record<string, unknown>): Promise<Blob>;
}

export type WhiteboardTool = "image" | "video" | "audio" | "card" | "webview" | "whiteboard";
export interface WhiteboardSlots {
  Editor?: ComponentType<WhiteboardEditorProps>;
  ContentSnapshotObserver?: ComponentType<{
    contentId: number;
    onChange(value: Descendant[]): void;
  }>;
  Layers?: ComponentType;
  ContentSelector?: ComponentType<any>;
  tools?: Partial<Record<WhiteboardTool, ComponentType>>;
  elements?: Partial<Record<string, ComponentType<any>>>;
  Image?: ComponentType<{
    url: string;
    alt?: string;
    className?: string;
    style?: React.CSSProperties;
    onLoad?: React.ReactEventHandler<HTMLImageElement>;
    onError?: React.ReactEventHandler<HTMLImageElement>;
  }>;
}

export interface WhiteboardOutline {
  open: boolean;
  width: number;
  onWidthChange(width: number): void;
  onDockWidthChange?(width: number): void;
}

export interface WhiteboardHost {
  services: WhiteboardServices;
  slots: WhiteboardSlots;
  outline?: WhiteboardOutline;
}

const basicKit = createEditorKit({ extensions: [textFormattingExtension, link] });
const mediaInfo = (file: File, video: boolean) =>
  new Promise<{ width: number; height: number } | null>(resolve => {
    const url = URL.createObjectURL(file);
    const element = video ? document.createElement("video") : new Image();
    const finish = (info: { width: number; height: number } | null) => {
      URL.revokeObjectURL(url);
      resolve(info);
    };
    element.onerror = () => finish(null);
    if (element instanceof HTMLVideoElement)
      element.onloadedmetadata = () =>
        finish({ width: element.videoWidth, height: element.videoHeight });
    else
      element.onload = () => finish({ width: element.naturalWidth, height: element.naturalHeight });
    element.src = url;
  });

export const defaultWhiteboardServices: WhiteboardServices = {
  getContentKit: () => basicKit,
  getDescriptionKit: () => basicKit,
  getArrowLabelKit: () => basicKit,
  getImageInfo: file => mediaInfo(file, false),
  getVideoInfo: file => mediaInfo(file, true),
  captureBlob: async (element, options) => {
    const { snapdom } = await import("@zumer/snapdom");
    return snapdom.toBlob(element, { ...options, embedFonts: true });
  },
};

export const WhiteboardHostContext = createContext<WhiteboardHost>({
  services: defaultWhiteboardServices,
  slots: {},
});
export const useWhiteboardHost = () => useContext(WhiteboardHostContext);
