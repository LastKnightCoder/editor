/**
 * 私有块的只读占位（docs/editor-refactor ER-017、P10）。
 *
 * 白板与数据库的数据在 desktop 本机库里，不随 content 同步，mobile 拿不到。
 * 仍注册这两个类型，给出针对性的说明；不注册只会落到内核的通用未知节点占位（ER-006）。
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
          <div
            {...attributes}
            contentEditable={false}
            className="border-line bg-surface text-ink-3 my-2 rounded-xl border border-dashed px-3 py-4 text-center text-xs"
          >
            {privateBlockPlaceholderText(type)}
            {children}
          </div>
        ),
      }),
    ],
  });

export const mobileWhiteboardExtension = createPrivateBlockExtension("whiteboard");
export const mobileDatabaseExtension = createPrivateBlockExtension("database");
