/**
 * blog 上无法真正渲染的业务元素——只读占位（docs/editor-refactor ER-017、P10）。
 *
 * 必须注册这些类型，否则含它们的已发布内容会渲染成字面的「无法识别的类型 X」
 * （`packages/editor/src/index.tsx` 的兜底分支）。
 *
 * - 附件：发布流程不上传附件文件（`publish-site-generator.ts` 只处理静态资源与搜索索引），
 *   所以 blog 上没有可下载的文件。**只显示文件名**，不显示 url / filePath——
 *   那些是 desktop 的本地路径，blog 是公开站点，输出会泄露用户的目录结构。
 * - 白板 / 数据库：数据在 desktop 本机库里，不随内容发布。
 */
import { Base, createBlockElementPlugin, createVoidElementPlugin } from "@tau/editor";
import type { IExtension } from "@tau/editor";
import { privateBlockPlaceholderText, type ContentElementType } from "@tau/shared";
import type { ReactElement } from "react";
import type { RenderElementProps } from "slate-react";

class BlogPrivateBlock extends Base implements IExtension {
  constructor(public readonly type: ContentElementType) {
    super();
  }

  override getPlugins() {
    return [createBlockElementPlugin(this.type), createVoidElementPlugin(this.type)];
  }

  render(props: RenderElementProps): ReactElement {
    const { attributes, children } = props;
    return (
      <div {...attributes} contentEditable={false} className="blog-private-block">
        {privateBlockPlaceholderText(this.type)}
        {children}
      </div>
    );
  }
}

export class BlogWhiteboardExtension extends BlogPrivateBlock {
  constructor() {
    super("whiteboard");
  }
}

export class BlogDatabaseExtension extends BlogPrivateBlock {
  constructor() {
    super("database");
  }
}

type FileAttachmentElement = { fileName?: string; name?: string };

export class BlogFileAttachmentExtension extends Base implements IExtension {
  type = "file-attachment";

  override getPlugins() {
    return [
      createBlockElementPlugin("file-attachment"),
      createVoidElementPlugin("file-attachment"),
    ];
  }

  render(props: RenderElementProps): ReactElement {
    const { attributes, children, element } = props;
    const current = element as unknown as FileAttachmentElement;
    const name = (current.fileName || current.name || "").trim();
    return (
      <div {...attributes} contentEditable={false} className="blog-file-attachment">
        {name ? `附件：${name}` : "附件"}
        {children}
      </div>
    );
  }
}
