/**
 * 插件里无法真正渲染的业务元素——只读占位（docs/editor-refactor ER-017、P10）。
 *
 * 为什么插件也需要：笔记不是只上传。冲突时 `applyRemoteContentToNote`
 * （`entrypoints/sidepanel/components/tabs/NotesTab.tsx`）会把 desktop 那边的内容写回
 * 插件编辑器，所以 desktop 上插入的内容链接 / 附件 / 白板 / 数据库块都会流到这里。
 * 不注册就只剩内核的通用未知节点占位（ER-006）。
 *
 * 附件只显示文件名：`url` / `filePath` 是 desktop 的本地路径，在插件里点不开。
 */
import { defineElement, defineExtension, type ElementRenderProps } from "@tau/editor";
import { privateBlockPlaceholderText, type ContentElementType } from "@tau/shared";

const BOX =
  "my-2 rounded-lg border border-dashed border-gray-300 px-3 py-3 text-center text-xs text-gray-500 dark:border-gray-600 dark:text-gray-400";

const createPrivateBlockExtension = (type: ContentElementType) =>
  defineExtension({
    id: `host.private-block.${type}`,
    elements: [
      defineElement({
        type,
        kind: "block",
        isVoid: true,
        render: ({ attributes, children }: ElementRenderProps) => (
          <div {...attributes} contentEditable={false} className={BOX}>
            {privateBlockPlaceholderText(type)}
            {children}
          </div>
        ),
      }),
    ],
  });

export const extensionWhiteboardExtension = createPrivateBlockExtension("whiteboard");
export const extensionDatabaseExtension = createPrivateBlockExtension("database");

type FileAttachmentElement = { fileName?: string; name?: string };

export const extensionFileAttachmentExtension = defineExtension({
  id: "host.file-attachment",
  elements: [
    defineElement({
      type: "file-attachment",
      kind: "block",
      isVoid: true,
      render: ({ attributes, children, element }: ElementRenderProps) => {
        const current = element as unknown as FileAttachmentElement;
        const name = (current.fileName || current.name || "").trim();
        return (
          <div {...attributes} contentEditable={false} className={BOX}>
            {name ? `附件：${name}` : "附件"}
            {children}
          </div>
        );
      },
    }),
  ],
});

type ContentLinkElement = { contentTitle?: string };

/** 内容链接：插件里没有目标内容可跳转，只渲染标题文本 */
export const extensionContentLinkExtension = defineExtension({
  id: "host.content-link",
  elements: [
    defineElement({
      type: "content-link",
      kind: "inline",
      render: ({ attributes, children, element }: ElementRenderProps) => {
        const title = ((element as unknown as ContentLinkElement).contentTitle || "").trim();
        return (
          <span {...attributes} className="text-blue-500 underline dark:text-blue-400">
            {title || "内容链接"}
            {children}
          </span>
        );
      },
    }),
  ],
});
