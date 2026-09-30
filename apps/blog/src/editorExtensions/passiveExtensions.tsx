/**
 * blog 上无法真正渲染的业务元素——只读占位（docs/editor-refactor ER-017、P10）。
 *
 * 注册这些类型以给出针对性的说明；不注册只会落到内核的通用未知节点占位（ER-006）。
 *
 * - 附件：发布流程不上传附件文件（`publish-site-generator.ts` 只处理静态资源与搜索索引），
 *   所以 blog 上没有可下载的文件。**只显示文件名**，不显示 url / filePath——
 *   那些是 desktop 的本地路径，blog 是公开站点，输出会泄露用户的目录结构。
 * - 白板 / 数据库：数据在 desktop 本机库里，不随内容发布。
 */
import { defineElement, defineExtension, type ElementRenderProps } from "@tau/editor";
import { privateBlockPlaceholderText, type ContentElementType } from "@tau/shared";

const createPrivateBlockExtension = (type: ContentElementType) =>
  defineExtension({
    id: `host.private-block.${type}`,
    elements: [
      defineElement({
        type,
        kind: "block",
        isVoid: true,
        render: ({ attributes, children }: ElementRenderProps) => (
          <div {...attributes} contentEditable={false} className="blog-private-block">
            {privateBlockPlaceholderText(type)}
            {children}
          </div>
        ),
      }),
    ],
  });

export const blogWhiteboardExtension = createPrivateBlockExtension("whiteboard");
export const blogDatabaseExtension = createPrivateBlockExtension("database");

type FileAttachmentElement = { fileName?: string; name?: string };

export const blogFileAttachmentExtension = defineExtension({
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
          <div {...attributes} contentEditable={false} className="blog-file-attachment">
            {name ? `附件：${name}` : "附件"}
            {children}
          </div>
        );
      },
    }),
  ],
});
