import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { Element, Node, type Descendant } from "slate";
import type { RowDetailBodyHandle, RowDetailBodyProps } from "@tau/database";
import Editor from "@/components/ContentEditor";
import * as contentCommands from "@/commands/content";
import { bindDatabaseCommands } from "@/services/command-context";
import useSettingStore from "@/stores/useSettingStore";

const DEFAULT_CONTENT: Descendant[] = [
  { type: "paragraph", children: [{ type: "formatted", text: "" }] },
];

export function isBlankDocument(value: readonly Descendant[]): boolean {
  return value.every(
    node =>
      Element.isElement(node) &&
      (node as { type?: string }).type === "paragraph" &&
      Node.string(node) === ""
  );
}

export const RowDetailBody = forwardRef<RowDetailBodyHandle, RowDetailBodyProps>(
  ({ row, readonly, onRowChange, isRowPresent }, ref) => {
    const [databaseName] = useState(() => useSettingStore.getState().setting.database.active);
    const commands = useMemo(
      () => bindDatabaseCommands(contentCommands, { databaseName }),
      [databaseName]
    );
    const draft = useRef<Descendant[] | null>(null);
    const pending = useRef<Promise<void> | null>(null);
    const isCurrent = () =>
      isRowPresent() && useSettingStore.getState().setting.database.active === databaseName;

    const flush = useMemoizedFn((): Promise<void> => {
      if (pending.current) return pending.current;
      const value = draft.current;
      if (readonly || row.detailContentId || !value || isBlankDocument(value) || !isCurrent()) {
        return Promise.resolve();
      }
      const task = (async () => {
        try {
          const contentId = await commands.createPendingContent(value, 0);
          if (!contentId) return;
          draft.current = null;
          // 补丁被拒不硬删：待回收正文无人引用时由开库回收清理
          if (isCurrent()) await onRowChange({ detailContentId: contentId });
        } catch (error) {
          console.error("保存行详情正文失败:", error);
        } finally {
          pending.current = null;
        }
      })();
      pending.current = task;
      return task;
    });

    useImperativeHandle(ref, () => ({ flush }), [flush]);
    useEffect(
      () => () => {
        void flush();
      },
      [flush]
    );

    return (
      <Editor
        contentId={row.detailContentId || undefined}
        initValue={DEFAULT_CONTENT}
        onChange={value => {
          draft.current = value;
        }}
        readonly={readonly}
        placeHolder="添加详细描述…"
        className="min-h-[200px] break-words [overflow-wrap:anywhere]"
      />
    );
  }
);

RowDetailBody.displayName = "RowDetailBody";
