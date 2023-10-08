import { Editor, Transforms } from "slate";
import { TableCellElement, TableElement, TableRowElement } from "../types";
import { insertParagraphAndFocus, replaceNode } from "./editor";
import { ReactEditor } from "slate-react";

export const getCurrentRow = (editor: Editor) => {
  const [match] = Editor.nodes(editor, {
    match: n => n.type === 'table-row',
  });
  if (!match) {
    throw new Error('当前不在表格中');
  }
  return match[1][match[1].length - 1];
}

export const getCurrentCol = (editor: Editor) => {
  const [match] = Editor.nodes(editor, {
    match: n => n.type === 'table-cell',
  });
  if (!match) {
    throw new Error('当前不在表格中');
  }
  return match[1][match[1].length - 1];
}

export const getRows = (editor: Editor) => {
  const [table] = Editor.nodes(editor, {
    match: n => n.type === 'table',
  });
  if (!table) {
    throw new Error('当前不在表格中');
  }
  const tableElement = table[0] as TableElement;
  return tableElement.children.length;
}

export const getColumns = (editor: Editor) => {
  const [row] = Editor.nodes(editor, {
    match: n => n.type === 'table-row',
  });
  if (!row) {
    throw new Error('当前不在表格中');
  }
  const rowElement = row[0] as TableRowElement;
  return rowElement.children.length;
}

export const isLastRow = (editor: Editor) => {
  const [row] = Editor.nodes(editor, {
    match: n => n.type === 'table-row',
  });
  if (!row) {
    throw new Error('当前不在表格中');
  }
  const [table] = Editor.nodes(editor, {
    match: n => n.type === 'table',
  });
  if (!table) {
    throw new Error('当前不在表格中');
  }
  const tableElement = table[0] as TableElement;
  return row[1][row[1].length - 1] === tableElement.children.length - 1;
}

export const isLastCol = (editor: Editor) => {
  const [cell] = Editor.nodes(editor, {
    match: n => n.type === 'table-cell',
  });
  if (!cell) {
    throw new Error('当前不在表格中');
  }
  const [row] = Editor.nodes(editor, {
    match: n => n.type === 'table-row',
  });
  if (!row) {
    throw new Error('当前不在表格中');
  }
  const rowElement = row[0] as TableRowElement;
  return cell[1][cell[1].length - 1] === rowElement.children.length - 1;
}

export const isFirstRow = (editor: Editor) => {
  const [row] = Editor.nodes(editor, {
    match: n => n.type === 'table-row',
  });
  if (!row) {
    throw new Error('当前不在表格中');
  }
  return row[1][row[1].length - 1] === 0;
}

export const isFirstCol = (editor: Editor) => {
  const [cell] = Editor.nodes(editor, {
    match: n => n.type === 'table-cell',
  });
  if (!cell) {
    throw new Error('当前不在表格中');
  }
  return cell[1][cell[1].length - 1] === 0;
}

const insertRow = (editor: Editor, after: boolean) => {
  const [table] = Editor.nodes(editor, {
    match: n => n.type === 'table',
  });

  if (!table) {
    throw new Error('当前不在表格中');
  }

  // 第一行是标题行，不允许向上插入
  const firstRow = isFirstRow(editor);
  if (firstRow && !after) {
    return;
  }

  const tableElement = table[0] as TableElement;
  const currentRow = getCurrentRow(editor);
  const currentCol = getCurrentCol(editor);
  const columns = getColumns(editor);

  const newRow: TableRowElement = {
    type: 'table-row',
    children: Array.from({length: columns}, () => ({
      type: 'table-cell',
      children: [{ type: 'formatted', text: ''}],
    })),
  };

  const index = after ? currentRow + 1 : currentRow;
  const newTable: TableElement = {
    type: 'table',
    children: [
      ...tableElement.children.slice(0, index),
      newRow,
      ...tableElement.children.slice(index),
    ],
  };
  replaceNode(editor, newTable, n => n.type === 'table');
  // 聚焦到新行的第一个单元格
  Transforms.select(editor, [
    ...table[1],
    index,
    currentCol,
    0,
  ]);
}

export const insertRowAfter = (editor: Editor) => {
  insertRow(editor, true);
}

export const insertRowBefore = (editor: Editor) => {
  insertRow(editor, false);
}

const insertCol = (editor: Editor, right: boolean) => {
  const curCol = getCurrentCol(editor);
  const curRow = getCurrentRow(editor);
  const [table] = Editor.nodes(editor, {
    match: n => n.type === 'table',
  });
  if (!table) {
    throw new Error('当前不在表格中');
  }
  const tableElement = table[0] as TableElement;
  const index = right ? curCol + 1 : curCol;
  const newTable: TableElement = {
    type: 'table',
    children: tableElement.children.map(row => {
      const rowElement = row as TableRowElement;
      return {
        type: 'table-row',
        children: [
          ...rowElement.children.slice(0, index),
          {
            type: 'table-cell',
            children: [{ type: 'formatted', text: ''}],
          },
          ...rowElement.children.slice(index),
        ],
      };
    }),
  }
  replaceNode(editor, newTable, n => n.type === 'table');
  // 聚焦到新列的第一个单元格
  Transforms.select(editor, [
    ...table[1],
    curRow,
    index,
    0,
  ]);
}

export const insertColRight = (editor: Editor) => {
  insertCol(editor, true);
}

export const insertColLeft = (editor: Editor) => {
  insertCol(editor, false);
}

export const deleteRowByIndex = (editor: Editor, index: number) => {
  const [table] = Editor.nodes(editor, {
    match: n => n.type === 'table',
  });
  if (!table) {
    throw new Error('当前不在表格中');
  }
  const tableElement = table[0] as TableElement;
  // 判断 index 处的 row 是否存在且不为标题行
  if (index < 0 || index >= tableElement.children.length || index === 0) {
    return;
  }
  const newTable: TableElement = {
    type: 'table',
    children: [
      ...tableElement.children.slice(0, index),
      ...tableElement.children.slice(index + 1),
    ],
  }
  if (newTable.children.length === 0) {
    replaceNode(editor, { type: 'paragraph', children: [{ type: 'formatted', text: ''}] }, n => n.type === 'table');
    return;
  }
  replaceNode(editor, newTable, n => n.type === 'table');
}

export const deletePrevRow = (editor: Editor) => {
  const currentRow = getCurrentRow(editor);
  const { selection } = editor;
  deleteRowByIndex(editor, currentRow - 1);
  if (selection) {
    Transforms.select(editor, selection);
  }
}

export const deleteNextRow = (editor: Editor) => {
  const currentRow = getCurrentRow(editor);
  const { selection } = editor;
  deleteRowByIndex(editor, currentRow + 1);
  if (selection) {
    Transforms.select(editor, selection);
  }
}

export const deleteCurrentRow = (editor: Editor) => {
  const currentRow = getCurrentRow(editor);
  deleteRowByIndex(editor, currentRow);
}

export const deleteColByIndex = (editor: Editor, index: number) => {
  const [table] = Editor.nodes(editor, {
    match: n => n.type === 'table',
  });
  if (!table) {
    throw new Error('当前不在表格中');
  }
  const tableElement = table[0] as TableElement;
  // 判断 index 处的 col 是否存在
  if (index < 0 || index >= tableElement.children[0].children.length) {
    return;
  }
  const newTable: TableElement = {
    type: 'table',
    children: tableElement.children.map(row => {
      const rowElement = row as TableRowElement;
      return {
        type: 'table-row',
        children: [
          ...rowElement.children.slice(0, index),
          ...rowElement.children.slice(index + 1),
        ],
      };
    }),
  }
  if (newTable.children[0].children.length === 0) {
    replaceNode(editor, { type: 'paragraph', children: [{ type: 'formatted', text: ''}] }, n => n.type === 'table');
    return;
  }
  replaceNode(editor, newTable, n => n.type === 'table');
}

export const deletePrevCol = (editor: Editor) => {
  const { selection } = editor;
  const curCol = getCurrentCol(editor);
  deleteColByIndex(editor, curCol - 1);
  if (selection) {
    Transforms.select(editor, selection);
  }
}

export const deleteNextCol = (editor: Editor) => {
  const { selection } = editor;
  const curCol = getCurrentCol(editor);
  deleteColByIndex(editor, curCol + 1);
  if (selection) {
    Transforms.select(editor, selection);
  }
}

export const deleteCurrentCol = (editor: Editor) => {
  const curCol = getCurrentCol(editor);
  deleteColByIndex(editor, curCol);
}

export const moveNextRow = (editor: Editor) => {
  const [table] = Editor.nodes(editor, {
    match: n => n.type === 'table',
  });
  if (!table) {
    throw new Error('当前不在表格中');
  }
  const tableElement = table[0] as TableElement;
  const currentRow = getCurrentRow(editor);
  const nextRow = currentRow + 1;
  if (nextRow >= tableElement.children.length) {
    // 最后一行, 跳出表格
    // 找到下一个元素，移到其开头
    const tablePath = ReactEditor.findPath(editor, tableElement);
    const nextElement = Editor.next(editor, { at: tablePath });
    if (!nextElement) {
      // 在表格后面插入一个段落，并聚焦
      insertParagraphAndFocus(editor, tableElement);
      return;
    }
    // 直接聚焦到下一个元素的开头
    Transforms.select(editor, Editor.start(editor, nextElement[1]));
    return;
  }
  const nextRowElement = tableElement.children[nextRow] as TableRowElement;
  const currentCol = getCurrentCol(editor);
  const nextCell = nextRowElement.children[currentCol] as TableCellElement;
  const cellPath = ReactEditor.findPath(editor, nextCell.children[nextCell.children.length - 1]);
  Transforms.select(editor, {
    anchor: Editor.point(editor, cellPath, {
      edge: 'end'
    }),
    focus: Editor.point(editor, cellPath, {
      edge: 'end'
    }),
  });
}

export const movePrevRow = (editor: Editor) => {
  const [table] = Editor.nodes(editor, {
    match: n => n.type === 'table',
  });
  if (!table) {
    throw new Error('当前不在表格中');
  }

  const currentRow = getCurrentRow(editor);
  if (currentRow === 0) {
    // 第一行, 跳出表格
    // 找到上一个元素，移到其末尾
    const tablePath = ReactEditor.findPath(editor, table[0]);
    const prevElement = Editor.previous(editor, { at: tablePath });
    if (!prevElement) {
      return;
    }
    // 直接聚焦到上一个元素的末尾
    Transforms.select(editor, Editor.end(editor, prevElement[1]));
    return;
  }

  const tableElement = table[0] as TableElement;
  const prevRow = currentRow - 1;
  const prevRowElement = tableElement.children[prevRow] as TableRowElement;
  const currentCol = getCurrentCol(editor);
  const prevCell = prevRowElement.children[currentCol] as TableCellElement;
  const cellPath = ReactEditor.findPath(editor, prevCell.children[prevCell.children.length - 1]);
  Transforms.select(editor, {
    anchor: Editor.point(editor, cellPath, {
      edge: 'end'
    }),
    focus: Editor.point(editor, cellPath, {
      edge: 'end'
    }),
  });
}

export const moveNextCol = (editor: Editor) => {
  const lastCol = isLastCol(editor);
  const lastRow = isLastRow(editor);
  if (lastCol && lastRow) {
    // 最后一行最后一列, 跳出表格
    Transforms.move(editor, { distance: 1, unit: 'line' });
    return;
  }
  if (lastCol) {
    // 最后一列, 跳到下一行第一列
    const currentRow = getCurrentRow(editor);
    const [table] = Editor.nodes(editor, {
      match: n => n.type === 'table',
    });
    const tableElement = table[0] as TableElement;
    const nextRowElement = tableElement.children[currentRow + 1] as TableRowElement;
    const nextCell = nextRowElement.children[0] as TableCellElement;
    const cellPath = ReactEditor.findPath(editor, nextCell.children[nextCell.children.length - 1]);
    Transforms.select(editor, {
      anchor: Editor.point(editor, cellPath, {
        edge: 'end'
      }),
      focus: Editor.point(editor, cellPath, {
        edge: 'end'
      }),
    });
    return;
  }
  // 来到下一列
  const currentCol = getCurrentCol(editor);
  const nextCol = currentCol + 1;
  const [table] = Editor.nodes(editor, {
    match: n => n.type === 'table',
  });
  const tableElement = table[0] as TableElement;
  const currentRow = getCurrentRow(editor);
  const currentRowElement = tableElement.children[currentRow] as TableRowElement;
  const nextCell = currentRowElement.children[nextCol] as TableCellElement;
  const cellPath = ReactEditor.findPath(editor, nextCell.children[nextCell.children.length - 1]);
  Transforms.select(editor, {
    anchor: Editor.point(editor, cellPath, {
      edge: 'end'
    }),
    focus: Editor.point(editor, cellPath, {
      edge: 'end'
    }),
  });
}

export const movePrevCol = (editor: Editor) => {
  const firstCol = isFirstCol(editor);
  const firstRow = isFirstRow(editor);
  if (firstCol && firstRow) {
    // 第一行，第一列, 跳出表格
    Transforms.move(editor, { distance: -1, unit: 'line' });
    return;
  }
  if (firstCol) {
    // 第一列, 跳到上一行最后一列
    const currentRow = getCurrentRow(editor);
    const [table] = Editor.nodes(editor, {
      match: n => n.type === 'table',
    });
    const tableElement = table[0] as TableElement;
    const prevRowElement = tableElement.children[currentRow - 1] as TableRowElement;
    const prevCell = prevRowElement.children[prevRowElement.children.length - 1] as TableCellElement;
    const cellPath = ReactEditor.findPath(editor, prevCell.children[prevCell.children.length - 1]);
    Transforms.select(editor, {
      anchor: Editor.point(editor, cellPath, {
        edge: 'end'
      }),
      focus: Editor.point(editor, cellPath, {
        edge: 'end'
      }),
    });
    return;
  }
  // 来到上一列
  const currentCol = getCurrentCol(editor);
  const prevCol = currentCol - 1;
  const [table] = Editor.nodes(editor, {
    match: n => n.type === 'table',
  });
  const tableElement = table[0] as TableElement;
  const currentRow = getCurrentRow(editor);
  const currentRowElement = tableElement.children[currentRow] as TableRowElement;
  const prevCell = currentRowElement.children[prevCol] as TableCellElement;
  const cellPath = ReactEditor.findPath(editor, prevCell.children[prevCell.children.length - 1]);
  Transforms.select(editor, {
    anchor: Editor.point(editor, cellPath, {
      edge: 'end'
    }),
    focus: Editor.point(editor, cellPath, {
      edge: 'end'
    }),
  });
}
