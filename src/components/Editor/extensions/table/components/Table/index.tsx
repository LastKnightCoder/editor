import React, { useMemo, useCallback } from "react";
import {
  RenderElementProps,
  useSlate,
  ReactEditor,
  useReadOnly,
} from "slate-react";
import { Editor, Transforms } from "slate";
import classnames from "classnames";
import { Popover } from "antd";

import { DeleteOutlined, MoreOutlined } from "@ant-design/icons";
import {
  BiChevronDown,
  BiChevronUp,
  BiChevronLeft,
  BiChevronRight,
  BiTable,
} from "react-icons/bi";
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
} from "@/components/Editor/utils";

import { TableElement } from "@/components/Editor/types";
import AddParagraph from "@/components/Editor/components/AddParagraph";

import ActionItem from "./ActionItem";
import Actions from "./Actions";
import styles from "./index.module.less";
import useDragAndDrop from "@/components/Editor/hooks/useDragAndDrop.ts";
import { MdDragIndicator } from "react-icons/md";

interface ITableProps {
  attributes: RenderElementProps["attributes"];
  element: TableElement;
}

const Table: React.FC<React.PropsWithChildren<ITableProps>> = (props) => {
  const { attributes, element, children } = props;

  const editor = useSlate();
  const readOnly = useReadOnly();
  const { selection } = editor;

  const { drag, drop, isDragging, canDrag, canDrop, isBefore, isOverCurrent } =
    useDragAndDrop({
      element,
    });

  const isActive = useMemo(() => {
    // 是否在 table
    const [table] = Editor.nodes(editor, {
      match: (n) => n.type === "table-cell",
    });
    return !!table;
  }, [editor, selection]);

  const deleteTable = useCallback(() => {
    try {
      // 将 table 转为 paragraph
      const path = ReactEditor.findPath(editor, element);
      Transforms.delete(editor, { at: path });
      Transforms.insertNodes(
        editor,
        {
          type: "paragraph",
          children: [
            {
              type: "formatted",
              text: "",
            },
          ],
        },
        {
          at: path,
          select: true,
        },
      );
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
          safeExecuteTableOperation(
            editor,
            () => {
              insertRowAfter(editor);
              ReactEditor.focus(editor);
            },
            "向下插入行",
          );
        },
      },
      {
        content: <ActionItem icon={<BiChevronUp />} text={"向上插入行"} />,
        onClick: () => {
          safeExecuteTableOperation(
            editor,
            () => {
              insertRowBefore(editor);
              ReactEditor.focus(editor);
            },
            "向上插入行",
          );
        },
      },
      {
        content: <ActionItem icon={<BiChevronLeft />} text={"向左插入列"} />,
        onClick: () => {
          safeExecuteTableOperation(
            editor,
            () => {
              insertColLeft(editor);
              ReactEditor.focus(editor);
            },
            "向左插入列",
          );
        },
      },
      {
        content: <ActionItem icon={<BiChevronRight />} text={"向右插入列"} />,
        onClick: () => {
          safeExecuteTableOperation(
            editor,
            () => {
              insertColRight(editor);
              ReactEditor.focus(editor);
            },
            "向右插入列",
          );
        },
      },
      {
        isTitle: true,
        content: "删除",
      },
      {
        content: <ActionItem icon={<BiChevronDown />} text={"删除下一行"} />,
        onClick: () => {
          safeExecuteTableOperation(
            editor,
            () => {
              deleteNextRow(editor);
              ReactEditor.focus(editor);
            },
            "删除下一行",
          );
        },
      },
      {
        content: <ActionItem icon={<BiChevronUp />} text={"删除上一行"} />,
        onClick: () => {
          safeExecuteTableOperation(
            editor,
            () => {
              deletePrevRow(editor);
              ReactEditor.focus(editor);
            },
            "删除上一行",
          );
        },
      },
      {
        content: <ActionItem icon={<BiChevronLeft />} text={"删除左一列"} />,
        onClick: () => {
          safeExecuteTableOperation(
            editor,
            () => {
              deletePrevCol(editor);
              ReactEditor.focus(editor);
            },
            "删除左一列",
          );
        },
      },
      {
        content: <ActionItem icon={<BiChevronRight />} text={"删除右一列"} />,
        onClick: () => {
          safeExecuteTableOperation(
            editor,
            () => {
              deleteNextCol(editor);
              ReactEditor.focus(editor);
            },
            "删除右一列",
          );
        },
      },
      {
        isTitle: true,
        content: "表格",
      },
      {
        content: <ActionItem icon={<BiTable />} text={"删除表格"} />,
        onClick: () => {
          safeExecuteTableOperation(
            editor,
            () => {
              deleteTable();
              ReactEditor.focus(editor);
            },
            "删除表格",
          );
        },
      },
    ];
  }, [editor, deleteTable]);

  return (
    <div
      ref={drop}
      className={classnames(styles.dropContainer, {
        [styles.dragging]: isDragging,
        [styles.drop]: isOverCurrent && canDrop,
        [styles.before]: isBefore,
        [styles.after]: !isBefore,
      })}
    >
      <div
        contentEditable={false}
        className={classnames(styles.operate, {
          [styles.hide]: !isActive || readOnly,
        })}
      >
        <div className={styles.left}></div>
        <div className={styles.right}>
          <Popover
            trigger={"click"}
            placement={"bottomLeft"}
            content={<Actions items={items} />}
            styles={{
              body: {
                padding: 4,
              },
            }}
            arrow={false}
          >
            <div className={classnames(styles.more, styles.item)}>
              <MoreOutlined />
            </div>
          </Popover>
          <div
            className={classnames(styles.delete, styles.item)}
            onClick={() => {
              safeExecuteTableOperation(
                editor,
                () => {
                  deleteTable();
                  ReactEditor.focus(editor);
                },
                "删除表格",
              );
            }}
          >
            <DeleteOutlined />
          </div>
        </div>
      </div>
      <table {...attributes} className={styles.table}>
        <tbody>{children}</tbody>
      </table>
      <AddParagraph element={element} />
      <div
        contentEditable={false}
        ref={drag}
        className={classnames(styles.dragHandler, {
          [styles.canDrag]: canDrag,
        })}
      >
        <MdDragIndicator className={styles.icon} />
      </div>
    </div>
  );
};

export default Table;
