import React, { useMemo, useCallback } from "react";
import { RenderElementProps, useSlate, ReactEditor, useReadOnly } from "slate-react";
import { Editor, Transforms } from "slate";
import classnames from "classnames";
import { Popover } from "antd";

import {
  DeleteOutlined,
  MoreOutlined,
} from '@ant-design/icons';
import {
  BiChevronDown,
  BiChevronUp,
  BiChevronLeft,
  BiChevronRight,
  BiTable,
} from 'react-icons/bi';
import {
  insertRowBefore,
  insertRowAfter,
  insertColLeft,
  insertColRight,
  deleteNextRow,
  deletePrevRow,
  deleteNextCol,
  deletePrevCol,
} from "@/components/Editor/utils";

import { TableElement } from "@/components/Editor/types";
import AddParagraph from "@/components/Editor/components/AddParagraph";

import ActionItem from "./ActionItem";
import Actions from './Actions';
import styles from './index.module.less';


interface ITableProps {
  attributes: RenderElementProps['attributes'];
  element: TableElement;
}

const Table: React.FC<React.PropsWithChildren<ITableProps>> = (props) => {
  const { attributes, element, children } = props;

  const editor = useSlate();
  const readOnly = useReadOnly();
  const { selection } = editor;

  const isActive = useMemo(() => {
    // 是否在 table
    const [table] = Editor.nodes(editor, {
      match: n => n.type === 'table-cell',
    });
    return !!table;
  }, [editor, selection]);

  const deleteTable = useCallback(() => {
    // 将 table 转为 paragraph
    const path = ReactEditor.findPath(editor, element);
    Transforms.delete(editor, { at: path });
    Transforms.insertNodes(editor, {
      type: 'paragraph',
      children: [{
          type: 'formatted',
          text: ''
      }]
    }, {
      at: path,
      select: true
    });
  }, [editor, element]);

  const items = useMemo(() => {
    return [{
      isTitle: true,
      content: '插入',
    }, {
      content: <ActionItem icon={<BiChevronDown />} text={'向下插入行'} />,
      onClick: () => {
        insertRowAfter(editor);
      }
    }, {
      content: <ActionItem icon={<BiChevronUp />} text={'向上插入行'} />,
      onClick: () => {
        insertRowBefore(editor);
      }
    }, {
      content: <ActionItem icon={<BiChevronLeft />} text={'向左插入列'} />,
      onClick: () => {
        insertColLeft(editor);
      }
    }, {
      content: <ActionItem icon={<BiChevronRight />} text={'向右插入列'} />,
      onClick: () => {
        insertColRight(editor);
      }
    }, {
      isTitle: true,
      content: '删除',
    }, {
      content: <ActionItem icon={<BiChevronDown />} text={'删除下一行'} />,
      onClick: () => {
        deleteNextRow(editor);
      }
    }, {
      content: <ActionItem icon={<BiChevronUp />} text={'删除上一行'} />,
      onClick: () => {
        deletePrevRow(editor);
      }
    }, {
      content: <ActionItem icon={<BiChevronLeft />} text={'删除左一列'} />,
      onClick: () => {
        deletePrevCol(editor);
      }
    }, {
      content: <ActionItem icon={<BiChevronRight />} text={'删除右一列'} />,
      onClick: () => {
        deleteNextCol(editor);
      }
    }, {
      isTitle: true,
      content: '表格',
    }, {
      content: <ActionItem icon={<BiTable />} text={'删除表格'} />,
      onClick: deleteTable,
    }]
  }, [editor, deleteTable]);

  return (
    <div>
      <div
        contentEditable={false}
        className={classnames(styles.operate, { [styles.hide]: !isActive || readOnly })}
      >
        <div className={styles.left}></div>
        <div className={styles.right}>
          <Popover
            trigger={'click'}
            placement={'bottomLeft'}
            content={<Actions items={items} />}
            overlayInnerStyle={{
              padding: 0,
            }}
            arrow={false}
          >
            <div className={classnames(styles.more, styles.item)}>
              <MoreOutlined />
            </div>
          </Popover>
          <div
            className={classnames(styles.delete, styles.item)}
            onClick={deleteTable}
          >
            <DeleteOutlined />
          </div>
        </div>
      </div>
      <table {...attributes} className={styles.table}>
        <tbody>
          {children}
        </tbody>
      </table>
      <AddParagraph element={element} />
    </div>
  )
}

export default Table;
