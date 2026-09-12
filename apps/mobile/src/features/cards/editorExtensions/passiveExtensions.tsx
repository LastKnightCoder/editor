import { Base, createBlockElementPlugin, createVoidElementPlugin } from "@tau/editor/src";
import type { IExtension } from "@tau/editor/src";
import type { ReactElement } from "react";

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

export class MobileFileAttachmentExtension extends Base implements IExtension {
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
        className="border-line bg-surface text-ink-2 my-2 rounded-xl border px-3 py-2 text-xs"
      >
        <p className="text-ink font-bold">{name}</p>
        <p className="text-ink-3 mt-1 text-[11px]">{`类型: ${fileType} · 大小: ${sizeText}`}</p>
        <p className="text-ink-3 mt-1 break-all text-[11px]">{urlText}</p>
        {children}
      </div>
    );
  }
}

export class MobileQuestionExtension extends Base implements IExtension {
  type = "question";

  override getPlugins() {
    return [createBlockElementPlugin("question"), createVoidElementPlugin("question")];
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
        className="bg-butter-soft/70 text-butter my-2 rounded-xl px-3 py-2 text-sm"
      >
        <p className="text-butter text-xs font-bold">{`问题 #${questionId}`}</p>
        <p className="mt-1">{title}</p>
        {children}
      </div>
    );
  }
}

export class MobileChatReferenceExtension extends Base implements IExtension {
  type = "chat-reference";

  override getPlugins() {
    return [createBlockElementPlugin("chat-reference"), createVoidElementPlugin("chat-reference")];
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
        className="bg-sky-soft/70 text-sky my-2 rounded-xl px-3 py-2 text-sm"
      >
        <p className="text-sky text-xs font-bold">{`Chat #${chatId}`}</p>
        <p className="mt-1">{title}</p>
        {children}
      </div>
    );
  }
}
