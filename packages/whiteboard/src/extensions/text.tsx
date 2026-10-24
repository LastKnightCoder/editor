import { createContext, useContext, type ComponentType, type ComponentPropsWithRef } from "react";
import { Editor, createEditorKit, type EditorKit } from "@tau/editor";
import { textFormattingExtension } from "@tau/editor/extensions/text-formatting";
import link from "@tau/editor/extensions/link";
import { createServiceId } from "@tau/shared/service-contract";
import type { Descendant } from "slate";

export type WhiteboardTextEditorProps = ComponentPropsWithRef<typeof Editor> & {
  contentId?: number;
  editingContext?: { entityType: string; entityId: string };
};

/** 宿主提供的白板富文本能力：编辑器组件、测量 kit 与正文持久化。 */
export interface WhiteboardRichTextService {
  /** 与宿主正文保存使用同一套扩展统计规则。 */
  countWords?(content: readonly Descendant[]): number;
  /** 必有：宿主提供的正文编辑器，或兜底实现 */
  Editor: ComponentType<WhiteboardTextEditorProps>;
  /** 测量与只读渲染共用 */
  kit(contentId?: number): EditorKit;
  /** 正文持久化：有它才能创建独立正文 */
  content?: {
    create(content: Descendant[], length: number, refCount?: number): Promise<number | null>;
    update(id: number, content: Descendant[]): Promise<unknown>;
    release(id: number): Promise<unknown>;
    retain(id: number): Promise<unknown>;
    unretain(id: number): Promise<unknown>;
  };
  Observer?: ComponentType<{ contentId: number; onChange(value: Descendant[]): void }>;
  importMarkdown?(text: string): Descendant[];
}

export const IWhiteboardRichText =
  createServiceId<WhiteboardRichTextService>("tau.whiteboard.richText");

/** 正文扩展私有的绑定，画布内核不读取正文身份或 Kit。 */
export interface TextExtensionOptions {
  countWords?(content: readonly Descendant[]): number;
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

/** 无宿主时的兜底编辑器：与 @tau/editor 的 Editor + basicKit 等价 */
function EmbeddedTextEditor({ contentId: _contentId, ...props }: WhiteboardTextEditorProps) {
  return <Editor {...props} kit={basicKit} />;
}

/** 无宿主时的嵌入式富文本服务：basicKit + 兜底编辑器，无正文持久化 */
export function createEmbeddedRichTextService(): WhiteboardRichTextService {
  return {
    Editor: EmbeddedTextEditor,
    kit: () => basicKit,
  };
}

export const embeddedTextOptions: TextExtensionOptions = {
  kit: () => basicKit,
  Editor: EmbeddedTextEditor,
};
export const TextExtensionContext = createContext<TextExtensionOptions>(embeddedTextOptions);
export const useTextExtension = () => useContext(TextExtensionContext);

/** 服务 → 正文扩展绑定：宿主未提供正文持久化时各回调保持缺失 */
export function textOptionsFromService(
  service: WhiteboardRichTextService,
  Selector?: TextExtensionOptions["Selector"]
): TextExtensionOptions {
  return {
    countWords: service.countWords,
    kit: contentId => service.kit(contentId),
    Editor: service.Editor,
    Observer: service.Observer,
    Selector,
    create: service.content?.create,
    update: service.content?.update,
    release: service.content?.release,
    retain: service.content?.retain,
    unretain: service.content?.unretain,
    importMarkdown: service.importMarkdown,
  };
}

export function TextEditor({ contentId, editingContext, ...props }: WhiteboardTextEditorProps) {
  const options = useTextExtension();
  const Component = options.Editor;
  return Component ? (
    <Component contentId={contentId} editingContext={editingContext} {...props} />
  ) : (
    <Editor {...props} kit={options.kit(contentId)} />
  );
}
