/**
 * 私有块的只读占位（docs/editor-refactor ER-017、P10）。
 *
 * 白板与数据库的数据在 desktop 本机库里，不随 content 同步，mobile 拿不到。
 * 但必须注册这两个类型——否则含这类块的卡片在 mobile 上渲染成字面的
 * 「无法识别的类型 whiteboard」（`packages/editor/src/index.tsx` 的兜底分支）。
 */
import { Base, createBlockElementPlugin, createVoidElementPlugin } from "@tau/editor/src";
import type { IExtension } from "@tau/editor/src";
import { privateBlockPlaceholderText, type ContentElementType } from "@tau/shared";
import type { ReactElement } from "react";
import type { RenderElementProps } from "slate-react";

class PrivateBlockPlaceholder extends Base implements IExtension {
  constructor(public readonly type: ContentElementType) {
    super();
  }

  override getPlugins() {
    return [createBlockElementPlugin(this.type), createVoidElementPlugin(this.type)];
  }

  render(props: RenderElementProps): ReactElement {
    const { attributes, children } = props;
    return (
      <div
        {...attributes}
        contentEditable={false}
        className="border-line bg-surface text-ink-3 my-2 rounded-xl border border-dashed px-3 py-4 text-center text-xs"
      >
        {privateBlockPlaceholderText(this.type)}
        {children}
      </div>
    );
  }
}

export class MobileWhiteboardExtension extends PrivateBlockPlaceholder {
  constructor() {
    super("whiteboard");
  }
}

export class MobileDatabaseExtension extends PrivateBlockPlaceholder {
  constructor() {
    super("database");
  }
}
