import React, { useMemo, useCallback, useState, useEffect } from "react";
import { RenderElementProps, useSlate, ReactEditor, useReadOnly } from "slate-react";
import { Editor, Transforms } from "slate";
import { Popover, cn } from "@tau/ui";
import { EllipsisVertical, Trash2 } from "lucide-react";
import { BiChevronDown, BiChevronUp, BiChevronLeft, BiChevronRight, BiTable } from "react-icons/bi";
import {
  insertRowBefore,
  insertRowAfter,
  insertColLeft,
  insertColRight,
  deleteNextRow,
  deletePrevRow,
  deleteNextCol,
  deletePrevCol,
  safeExecuteTableOperation,
} from "../../utils";

import type { TableElement } from "../../types";
import {
  AddParagraph,
  getCommandElementPath,
  OverlayBackDismiss,
  createParagraph,
} from "@tau/editor/api";
import { useIsLastElement } from "@tau/editor/api";

import ActionItem from "./ActionItem";
import Actions from "./Actions";

interface ITableProps {
  attributes: RenderElementProps["attributes"];
  element: TableElement;
}

const Table: React.FC<React.PropsWithChildren<ITableProps>> = props => {
  const { attributes, element, children } = props;

  const editor = useSlate();
  const readOnly = useReadOnly();
  const { selection } = editor;
  const [menuOpen, setMenuOpen] = useState(false);
  const isLast = useIsLastElement(element);

  const isActive = useMemo(() => {
    // 是否在 table
    const [table] = Editor.nodes(editor, {
      match: n => n.type === "table",
    });
    return table?.[0] === element;
  }, [editor, selection, element]);
  useEffect(() => {
    if (!isActive || readOnly) setMenuOpen(false);
  }, [isActive, readOnly]);

  const runTableOperation = useCallback(
    (operation: () => void, name: string) => {
      if (!isActive || !getCommandElementPath(editor, { element })) return;
      safeExecuteTableOperation(editor, operation, name);
    },
    [editor, element, isActive]
  );

  const deleteTable = useCallback(() => {
    try {
      // 将 table 转为 paragraph
      const path = getCommandElementPath(editor, { element });
      if (!path) return;
      Editor.withoutNormalizing(editor, () => {
        Transforms.removeNodes(editor, { at: path });
        Transforms.insertNodes(editor, createParagraph(), { at: path, select: true });
      });
    } catch (error) {
      console.error("删除表格时发生错误:", error);
      // 如果删除失败，尝试简单的聚焦恢复
      try {
        ReactEditor.focus(editor);
      } catch (focusError) {
        console.error("删除表格后聚焦失败:", focusError);
      }
    }
  }, [editor, element]);

  const items = useMemo(() => {
    return [
      {
        isTitle: true,
        content: "插入",
      },
      {
        content: <ActionItem icon={<BiChevronDown />} text={"向下插入行"} />,
        onClick: () => {
          runTableOperation(() => {
            insertRowAfter(editor);
            ReactEditor.focus(editor);
          }, "向下插入行");
        },
      },
      {
        content: <ActionItem icon={<BiChevronUp />} text={"向上插入行"} />,
        onClick: () => {
          runTableOperation(() => {
            insertRowBefore(editor);
            ReactEditor.focus(editor);
          }, "向上插入行");
        },
      },
      {
        content: <ActionItem icon={<BiChevronLeft />} text={"向左插入列"} />,
        onClick: () => {
          runTableOperation(() => {
            insertColLeft(editor);
            ReactEditor.focus(editor);
          }, "向左插入列");
        },
      },
      {
        content: <ActionItem icon={<BiChevronRight />} text={"向右插入列"} />,
        onClick: () => {
          runTableOperation(() => {
            insertColRight(editor);
            ReactEditor.focus(editor);
          }, "向右插入列");
        },
      },
      {
        isTitle: true,
        content: "删除",
      },
      {
        content: <ActionItem icon={<BiChevronDown />} text={"删除下一行"} />,
        onClick: () => {
          runTableOperation(() => {
            deleteNextRow(editor);
            ReactEditor.focus(editor);
          }, "删除下一行");
        },
      },
      {
        content: <ActionItem icon={<BiChevronUp />} text={"删除上一行"} />,
        onClick: () => {
          runTableOperation(() => {
            deletePrevRow(editor);
            ReactEditor.focus(editor);
          }, "删除上一行");
        },
      },
      {
        content: <ActionItem icon={<BiChevronLeft />} text={"删除左一列"} />,
        onClick: () => {
          runTableOperation(() => {
            deletePrevCol(editor);
            ReactEditor.focus(editor);
          }, "删除左一列");
        },
      },
      {
        content: <ActionItem icon={<BiChevronRight />} text={"删除右一列"} />,
        onClick: () => {
          runTableOperation(() => {
            deleteNextCol(editor);
            ReactEditor.focus(editor);
          }, "删除右一列");
        },
      },
      {
        isTitle: true,
        content: "表格",
      },
      {
        content: <ActionItem icon={<BiTable />} text={"删除表格"} />,
        onClick: () => {
          runTableOperation(() => {
            deleteTable();
            ReactEditor.focus(editor);
          }, "删除表格");
        },
      },
    ];
  }, [editor, deleteTable, runTableOperation]);

  return (
    <div className="relative overflow-x-auto">
      <div
        contentEditable={false}
        className={cn(
          "flex h-[2.5em] select-none items-center justify-between transition-[height] duration-300 ease-in-out",
          (!isActive || readOnly) && "h-0 overflow-hidden"
        )}
      >
        <div></div>
        <div
          className={cn(
            "flex gap-[0.5em] transition-opacity delay-100 duration-200 ease-in-out",
            (!isActive || readOnly) && "opacity-0"
          )}
        >
          <Popover
            open={menuOpen && isActive && !readOnly}
            onOpenChange={setMenuOpen}
            placement="bottom-start"
            arrow={false}
            className="p-1"
            trigger={
              <div className="flex h-[1.875em] w-[1.875em] cursor-pointer items-center justify-center rounded-full hover:bg-[var(--ed-bg-hover)]">
                <EllipsisVertical size="1em" />
              </div>
            }
          >
            <OverlayBackDismiss
              open={menuOpen && isActive && !readOnly}
              onDismiss={() => setMenuOpen(false)}
            />
            <Actions items={items} />
          </Popover>
          <div
            className="flex h-[1.875em] w-[1.875em] cursor-pointer items-center justify-center rounded-full hover:bg-[var(--ed-bg-hover)]"
            onClick={() => {
              runTableOperation(() => {
                deleteTable();
                ReactEditor.focus(editor);
              }, "删除表格");
            }}
          >
            <Trash2 size="1em" />
          </div>
        </div>
      </div>
      <table
        {...attributes}
        className="w-full border-collapse [&_td]:overflow-hidden [&_td]:text-ellipsis [&_td]:border [&_td]:border-solid [&_td]:border-[var(--ed-border)] [&_td]:px-[1em] [&_td]:py-[0.75em] [&_td]:text-left [&_td]:[word-break:break-word] [&_th]:overflow-hidden [&_th]:text-ellipsis [&_th]:border [&_th]:border-solid [&_th]:border-[var(--ed-border)] [&_th]:px-[1em] [&_th]:py-[0.75em] [&_th]:text-left [&_th]:[word-break:break-word] [&_tr:first-child]:font-bold [&_tr:nth-child(odd)]:bg-[var(--ed-bg-hover)]"
      >
        <tbody>{children}</tbody>
      </table>
      {!(readOnly && isLast) && <AddParagraph element={element} />}
    </div>
  );
};

export default Table;
