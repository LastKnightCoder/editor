import { isContentEmpty } from "@tau/db-schema/content-metrics";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { type Descendant } from "slate";
import type { RowDetailBodyHandle, RowDetailBodyProps } from "@tau/database";
import Editor from "@/components/ContentEditor";
import * as contentCommands from "@/commands/content";
import { getDatabaseConnection } from "@/services/command-context";
import { useDatabaseCommands } from "@/hooks/useDatabaseCommands";
import useSettingStore from "@/stores/useSettingStore";

const DEFAULT_CONTENT: Descendant[] = [
  { type: "paragraph", children: [{ type: "formatted", text: "" }] },
];

export const isBlankDocument = isContentEmpty;

export const RowDetailBody = forwardRef<RowDetailBodyHandle, RowDetailBodyProps>(
  ({ row, readonly, onRowChange, isRowPresent }, ref) => {
    const [databaseName] = useState(() => useSettingStore.getState().setting.database.active);
    const { commands, connectionId } = useDatabaseCommands(contentCommands, databaseName);
    const draft = useRef<{ content: Descendant[]; connectionId?: string } | null>(null);
    const pending = useRef<Promise<void> | null>(null);
    const isCurrent = () =>
      isRowPresent() &&
      useSettingStore.getState().setting.database.active === databaseName &&
      getDatabaseConnection(databaseName)?.connectionId === connectionId;

    useEffect(() => {
      if (draft.current?.connectionId !== connectionId) draft.current = null;
    }, [connectionId]);

    const flush = useMemoizedFn((): Promise<void> => {
      if (pending.current) return pending.current.then(() => flush());
      const value = draft.current;
      if (
        readonly ||
        row.detailContentId ||
        !value ||
        value.connectionId !== connectionId ||
        isBlankDocument(value.content) ||
        !isCurrent()
      ) {
        return Promise.resolve();
      }
      const task = (async () => {
        try {
          const contentId = await commands.createPendingContent(value.content, 0);
          if (!contentId) return;
          if (draft.current === value) draft.current = null;
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
        key={connectionId}
        contentId={row.detailContentId || undefined}
        initValue={DEFAULT_CONTENT}
        onChange={value => {
          if (isCurrent()) draft.current = { content: value, connectionId };
        }}
        readonly={readonly}
        placeHolder="添加详细描述…"
        className="min-h-[200px] [overflow-wrap:anywhere] break-words"
      />
    );
  }
);

RowDetailBody.displayName = "RowDetailBody";
