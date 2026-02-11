import {
  Base,
  createBlockElementPlugin,
  createInlineElementPlugin,
  createVoidElementPlugin,
} from "@tau/editor/src";
import type { IExtension } from "@tau/editor/src";
import type { ReactElement } from "react";

type ContentLinkElement = {
  type: "content-link";
  contentTitle?: string;
  contentType?: string;
  refId?: number;
  children: unknown[];
};

type FileAttachmentElement = {
  type: "file-attachment";
  name?: string;
  fileName?: string;
  fileType?: string;
  url?: string;
  size?: number;
  children: unknown[];
};

type QuestionElement = {
  type: "question";
  title?: string;
  questionId?: number;
  children: unknown[];
};

type ChatReferenceElement = {
  type: "chat-reference";
  title?: string;
  chatId?: number;
  children: unknown[];
};

function readText(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (typeof value === "number") {
    return String(value);
  }
  return fallback;
}

class MobileContentLinkExtension extends Base implements IExtension {
  type = "content-link";

  override getPlugins() {
    return [createInlineElementPlugin("content-link")];
  }

  render(props: any): ReactElement {
    const { attributes, children, element } = props;
    const current = element as unknown as ContentLinkElement;
    const title = readText(current.contentTitle, "内容引用");
    const type = readText(current.contentType, "card");
    const refText = readText(current.refId, "-");

    return (
      <span
        {...attributes}
        contentEditable={false}
        className="mx-0.5 inline-flex rounded-md border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-xs text-indigo-600"
      >
        {`@${title} (${type}#${refText})`}
        {children}
      </span>
    );
  }
}

class MobileFileAttachmentExtension extends Base implements IExtension {
  type = "file-attachment";

  override getPlugins() {
    return [
      createBlockElementPlugin("file-attachment"),
      createVoidElementPlugin("file-attachment"),
    ];
  }

  render(props: any): ReactElement {
    const { attributes, children, element } = props;
    const current = element as unknown as FileAttachmentElement;
    const name = readText(current.name ?? current.fileName, "附件文件");
    const fileType = readText(current.fileType, "unknown");
    const sizeText =
      typeof current.size === "number" && current.size > 0
        ? `${Math.round(current.size / 1024)} KB`
        : "--";
    const urlText = readText(current.url, "无可用链接");

    return (
      <div
        {...attributes}
        contentEditable={false}
        className="my-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600"
      >
        <p className="font-medium text-slate-700">{name}</p>
        <p className="mt-1 text-[11px] text-slate-400">{`类型: ${fileType} · 大小: ${sizeText}`}</p>
        <p className="mt-1 break-all text-[11px] text-slate-400">{urlText}</p>
        {children}
      </div>
    );
  }
}

class MobileQuestionExtension extends Base implements IExtension {
  type = "question";

  override getPlugins() {
    return [
      createBlockElementPlugin("question"),
      createVoidElementPlugin("question"),
    ];
  }

  render(props: any): ReactElement {
    const { attributes, children, element } = props;
    const current = element as unknown as QuestionElement;
    const title = readText(current.title, "问题卡片");
    const questionId = readText(current.questionId, "-");

    return (
      <div
        {...attributes}
        contentEditable={false}
        className="my-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-sm text-amber-800"
      >
        <p className="text-xs font-medium text-amber-700">{`问题 #${questionId}`}</p>
        <p className="mt-1">{title}</p>
        {children}
      </div>
    );
  }
}

class MobileChatReferenceExtension extends Base implements IExtension {
  type = "chat-reference";

  override getPlugins() {
    return [
      createBlockElementPlugin("chat-reference"),
      createVoidElementPlugin("chat-reference"),
    ];
  }

  render(props: any): ReactElement {
    const { attributes, children, element } = props;
    const current = element as unknown as ChatReferenceElement;
    const title = readText(current.title, "对话引用");
    const chatId = readText(current.chatId, "-");

    return (
      <div
        {...attributes}
        contentEditable={false}
        className="my-2 rounded-xl border border-cyan-200 bg-cyan-50/70 px-3 py-2 text-sm text-cyan-800"
      >
        <p className="text-xs font-medium text-cyan-700">{`Chat #${chatId}`}</p>
        <p className="mt-1">{title}</p>
        {children}
      </div>
    );
  }
}

export const mobileCardPreviewExtensions: IExtension[] = [
  new MobileContentLinkExtension(),
  new MobileFileAttachmentExtension(),
  new MobileQuestionExtension(),
  new MobileChatReferenceExtension(),
];
