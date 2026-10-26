import { BUILTIN_CONTENT_RESOURCES } from "@tau/db-schema/content-resources";
import { defineElement, defineExtension, type ElementRenderProps } from "@tau/editor";

/** 只读展示外部实体引用，不改变正文的保存或同步行为。 */
const referencePlaceholder = (type: "whiteboard" | "database", label: string) =>
  defineExtension({
    id: `host.${type}`,
    elements: [
      defineElement({
        type,
        dataVersion: 1,
        kind: "block",
        isVoid: true,
        render: ({ attributes, children }: ElementRenderProps) => (
          <div
            {...attributes}
            contentEditable={false}
            className="border-line-1 bg-surface text-ink-3 my-2 rounded-xl border border-dashed px-3 py-4 text-center text-xs"
          >
            {label}
            {children}
          </div>
        ),
      }),
    ],
  });

export const mobileWhiteboardExtension = referencePlaceholder(
  "whiteboard",
  "白板内容请在桌面端查看"
);
export const mobileDatabaseExtension = referencePlaceholder("database", "数据库内容请在桌面端查看");

type FileAttachmentElement = {
  type: "file-attachment";
  name?: string;
  fileName?: string;
  fileType?: string;
  url?: string;
  size?: number;
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

export const mobileFileAttachmentExtension = defineExtension({
  id: "host.file-attachment",
  elements: [
    defineElement({
      type: "file-attachment",
      dataVersion: 1,
      resources: BUILTIN_CONTENT_RESOURCES["file-attachment"],
      kind: "block",
      isVoid: true,
      render: ({ attributes, children, element }: ElementRenderProps) => {
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
            className="border-line-1 bg-surface text-ink-2 my-2 rounded-xl border px-3 py-2 text-xs"
          >
            <p className="text-ink-1 font-bold">{name}</p>
            <p className="text-ink-3 mt-1 text-[11px]">{`类型: ${fileType} · 大小: ${sizeText}`}</p>
            <p className="text-ink-3 mt-1 text-[11px] break-all">{urlText}</p>
            {children}
          </div>
        );
      },
    }),
  ],
});
