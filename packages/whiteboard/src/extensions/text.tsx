import { createContext, useContext, type ComponentType, type ComponentPropsWithRef } from "react";
import { Editor, createEditorKit, type EditorKit } from "@tau/editor";
import { textFormattingExtension } from "@tau/editor-text-formatting";
import link from "@tau/editor-link";
import type { Descendant } from "slate";

export type WhiteboardTextEditorProps = ComponentPropsWithRef<typeof Editor> & {
  contentId?: number;
  editingContext?: { entityType: string; entityId: string };
};

/** 正文扩展私有的绑定，画布内核不读取正文身份或 Kit。 */
export interface TextExtensionOptions {
  kit(contentId?: number): EditorKit;
  Editor?: ComponentType<WhiteboardTextEditorProps>;
  Observer?: ComponentType<{ contentId: number; onChange(value: Descendant[]): void }>;
  Selector?: ComponentType<any>;
  create?(content: Descendant[], length: number, refCount?: number): Promise<number | null>;
  update?(id: number, content: Descendant[]): Promise<unknown>;
  release?(id: number): Promise<unknown>;
  retain?(id: number): Promise<unknown>;
  unretain?(id: number): Promise<unknown>;
  importMarkdown?(text: string): Descendant[];
}

const basicKit = createEditorKit({ extensions: [textFormattingExtension, link] });
export const embeddedTextOptions: TextExtensionOptions = { kit: () => basicKit };
export const TextExtensionContext = createContext<TextExtensionOptions>(embeddedTextOptions);
export const useTextExtension = () => useContext(TextExtensionContext);

export function TextEditor({ contentId, editingContext, ...props }: WhiteboardTextEditorProps) {
  const options = useTextExtension();
  const Component = options.Editor;
  return Component ? (
    <Component contentId={contentId} editingContext={editingContext} {...props} />
  ) : (
    <Editor {...props} kit={options.kit(contentId)} />
  );
}
