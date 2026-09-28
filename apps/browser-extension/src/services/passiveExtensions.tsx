/**
 * 插件里无法真正渲染的业务元素——只读占位（docs/editor-refactor ER-017、P10）。
 *
 * 为什么插件也需要：笔记不是只上传。冲突时 `applyRemoteContentToNote`
 * （`entrypoints/sidepanel/components/tabs/NotesTab.tsx`）会把 desktop 那边的内容写回
 * 插件编辑器，所以 desktop 上插入的内容链接 / 附件 / 白板 / 数据库块都会流到这里。
 * 不注册就渲染成字面的「无法识别的类型 X」。
 *
 * 附件只显示文件名：`url` / `filePath` 是 desktop 的本地路径，在插件里点不开。
 */
import {
  Base,
  createBlockElementPlugin,
  createInlineElementPlugin,
  createVoidElementPlugin,
} from "@tau/editor";
import type { IExtension } from "@tau/editor";
import { privateBlockPlaceholderText, type ContentElementType } from "@tau/shared";
import type { ReactElement } from "react";
import type { RenderElementProps } from "slate-react";

const BOX =
  "my-2 rounded-lg border border-dashed border-gray-300 px-3 py-3 text-center text-xs text-gray-500 dark:border-gray-600 dark:text-gray-400";

class ExtensionPrivateBlock extends Base implements IExtension {
  constructor(public readonly type: ContentElementType) {
    super();
  }

  override getPlugins() {
    return [createBlockElementPlugin(this.type), createVoidElementPlugin(this.type)];
  }

  render(props: RenderElementProps): ReactElement {
    const { attributes, children } = props;
    return (
      <div {...attributes} contentEditable={false} className={BOX}>
        {privateBlockPlaceholderText(this.type)}
        {children}
      </div>
    );
  }
}

export class ExtensionWhiteboardExtension extends ExtensionPrivateBlock {
  constructor() {
    super("whiteboard");
  }
}

export class ExtensionDatabaseExtension extends ExtensionPrivateBlock {
  constructor() {
    super("database");
  }
}

type FileAttachmentElement = { fileName?: string; name?: string };

export class ExtensionFileAttachmentExtension extends Base implements IExtension {
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
      <div {...attributes} contentEditable={false} className={BOX}>
        {name ? `附件：${name}` : "附件"}
        {children}
      </div>
    );
  }
}

type ContentLinkElement = { contentTitle?: string };

/** 内容链接：插件里没有目标内容可跳转，只渲染标题文本 */
export class ExtensionContentLinkExtension extends Base implements IExtension {
  type = "content-link";

  override getPlugins() {
    return [createInlineElementPlugin("content-link")];
  }

  render(props: RenderElementProps): ReactElement {
    const { attributes, children, element } = props;
    const title = ((element as unknown as ContentLinkElement).contentTitle || "").trim();
    return (
      <span {...attributes} className="text-blue-500 underline dark:text-blue-400">
        {title || "内容链接"}
        {children}
      </span>
    );
  }
}
