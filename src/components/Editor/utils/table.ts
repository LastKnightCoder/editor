import { Editor, Transforms } from "slate";
import { TableCellElement, TableElement, TableRowElement } from "../types";
import { insertParagraphAndFocus, replaceNode } from "./editor";
import { ReactEditor } from "slate-react";

/**
 * 安全执行表格操作，包含统一的焦点管理和错误处理
 * @param editor 编辑器实例
 * @param operation 要执行的操作函数
 * @param operationName 操作名称，用于错误日志
 */
export const safeExecuteTableOperation = (
  editor: Editor,
  operation: () => void,
  operationName: string,
) => {
  try {
    operation();
  } catch (error) {
    console.error(`表格操作 ${operationName} 失败:`, error);
    // 尝试恢复焦点到编辑器
    try {
      ReactEditor.focus(editor);
    } catch (focusError) {
      console.error(`表格操作 ${operationName} 后焦点恢复失败:`, focusError);
    }
  }
};

export const getCurrentRow = (editor: Editor) => {
  const [match] = Editor.nodes(editor, {
    match: (n) => n.type === "table-row",
  });
  if (!match) {
    throw new Error("当前不在表格中");
  }
  return match[1][match[1].length - 1];
};

export const getCurrentCol = (editor: Editor) => {
  const [match] = Editor.nodes(editor, {
    match: (n) => n.type === "table-cell",
  });
  if (!match) {
    throw new Error("当前不在表格中");
  }
  return match[1][match[1].length - 1];
};

export const getRows = (editor: Editor) => {
  const [table] = Editor.nodes(editor, {
    match: (n) => n.type === "table",
  });
  if (!table) {
    throw new Error("当前不在表格中");
  }
  const tableElement = table[0] as TableElement;
  return tableElement.children.length;
};

export const getColumns = (editor: Editor) => {
  const [row] = Editor.nodes(editor, {
    match: (n) => n.type === "table-row",
  });
  if (!row) {
    throw new Error("当前不在表格中");
  }
  const rowElement = row[0] as TableRowElement;
  return rowElement.children.length;
};

export const isLastRow = (editor: Editor) => {
  const [row] = Editor.nodes(editor, {
    match: (n) => n.type === "table-row",
  });
  if (!row) {
    throw new Error("当前不在表格中");
  }
  const [table] = Editor.nodes(editor, {
    match: (n) => n.type === "table",
  });
  if (!table) {
    throw new Error("当前不在表格中");
  }
  const tableElement = table[0] as TableElement;
  return row[1][row[1].length - 1] === tableElement.children.length - 1;
};

export const isLastCol = (editor: Editor) => {
  const [cell] = Editor.nodes(editor, {
    match: (n) => n.type === "table-cell",
  });
  if (!cell) {
    throw new Error("当前不在表格中");
  }
  const [row] = Editor.nodes(editor, {
    match: (n) => n.type === "table-row",
  });
  if (!row) {
    throw new Error("当前不在表格中");
  }
  const rowElement = row[0] as TableRowElement;
  return cell[1][cell[1].length - 1] === rowElement.children.length - 1;
};

export const isFirstRow = (editor: Editor) => {
  const [row] = Editor.nodes(editor, {
    match: (n) => n.type === "table-row",
  });
  if (!row) {
    throw new Error("当前不在表格中");
  }
  return row[1][row[1].length - 1] === 0;
};

export const isFirstCol = (editor: Editor) => {
  const [cell] = Editor.nodes(editor, {
    match: (n) => n.type === "table-cell",
  });
  if (!cell) {
    throw new Error("当前不在表格中");
  }
  return cell[1][cell[1].length - 1] === 0;
};

const insertRow = (editor: Editor, after: boolean) => {
  const [table] = Editor.nodes(editor, {
    match: (n) => n.type === "table",
  });

  if (!table) {
    throw new Error("当前不在表格中");
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
    type: "table-row",
    children: Array.from({ length: columns }, () => ({
      type: "table-cell",
      children: [{ type: "formatted", text: "" }],
    })),
  };

  const index = after ? currentRow + 1 : currentRow;
  const newTable: TableElement = {
    type: "table",
    children: [
      ...tableElement.children.slice(0, index),
      newRow,
      ...tableElement.children.slice(index),
    ],
  };

  // 使用replaceNode返回的路径来访问新表格
  const newTablePath = replaceNode(editor, newTable, (n) => n.type === "table");

  if (!newTablePath) {
    console.warn("insertRow: replaceNode没有返回路径");
    return;
  }

  // 聚焦到新行的当前列位置
  try {
    // 直接通过路径访问新表格元素
    const newTableElement = Editor.node(
      editor,
      newTablePath,
    )[0] as TableElement;
    const newRowElement = newTableElement.children[index] as TableRowElement;
    const safeCol = Math.min(currentCol, columns - 1);
    const targetCellElement = newRowElement.children[
      safeCol
    ] as TableCellElement;

    console.log(`insertRow: 目标单元格在第${index}行第${safeCol}列`);
    console.log(`insertRow: 目标单元格内容:`, targetCellElement);

    // 构造绝对路径：[tablePath, rowIndex, colIndex, cellChildIndex]
    const targetChildPath = [...newTablePath, index, safeCol, 0]; // 第一个子节点

    // 聚焦到新插入行的单元格开头（因为是新的空单元格）
    Transforms.select(editor, {
      anchor: Editor.point(editor, targetChildPath, { edge: "start" }),
      focus: Editor.point(editor, targetChildPath, { edge: "start" }),
    });
  } catch (error) {
    console.warn("插入行后聚焦失败，尝试聚焦到新行第一个单元格", error);
    try {
      if (newTablePath) {
        console.log(`insertRow fallback: 尝试聚焦到新行第一个单元格`);

        // 构造新行第一个单元格的路径
        const firstCellPath = [...newTablePath, index, 0, 0];
        Transforms.select(editor, {
          anchor: Editor.point(editor, firstCellPath, { edge: "start" }),
          focus: Editor.point(editor, firstCellPath, { edge: "start" }),
        });
      }
    } catch (fallbackError) {
      console.error("插入行后聚焦完全失败", fallbackError);
    }
  }
};

export const insertRowAfter = (editor: Editor) => {
  insertRow(editor, true);
};

export const insertRowBefore = (editor: Editor) => {
  insertRow(editor, false);
};

const insertCol = (editor: Editor, right: boolean) => {
  const curCol = getCurrentCol(editor);
  const curRow = getCurrentRow(editor);
  const [table] = Editor.nodes(editor, {
    match: (n) => n.type === "table",
  });
  if (!table) {
    throw new Error("当前不在表格中");
  }
  const tableElement = table[0] as TableElement;
  const index = right ? curCol + 1 : curCol;
  const totalRows = getRows(editor);

  const newTable: TableElement = {
    type: "table",
    children: tableElement.children.map((row) => {
      const rowElement = row as TableRowElement;
      return {
        type: "table-row",
        children: [
          ...rowElement.children.slice(0, index),
          {
            type: "table-cell",
            children: [{ type: "formatted", text: "" }],
          },
          ...rowElement.children.slice(index),
        ],
      };
    }),
  };

  // 使用replaceNode返回的路径来访问新表格
  const newTablePath = replaceNode(editor, newTable, (n) => n.type === "table");

  if (!newTablePath) {
    console.warn("insertCol: replaceNode没有返回路径");
    return;
  }

  // 聚焦到新列的当前行位置
  try {
    // 直接通过路径访问新表格元素
    const safeRow = Math.min(curRow, totalRows - 1);

    // 构造绝对路径：[tablePath, rowIndex, colIndex, cellChildIndex]
    const targetCellPath = [...newTablePath, safeRow, index];
    const targetChildPath = [...targetCellPath, 0]; // 第一个子节点

    // 聚焦到新插入列的单元格开头（因为是新的空单元格）
    Transforms.select(editor, {
      anchor: Editor.point(editor, targetChildPath, { edge: "start" }),
      focus: Editor.point(editor, targetChildPath, { edge: "start" }),
    });
  } catch (error) {
    console.warn("插入列后聚焦失败，尝试聚焦到新列第一行", error);
    try {
      if (newTablePath) {
        // 构造第一行的路径
        const firstRowPath = [...newTablePath, 0, index, 0];

        Transforms.select(editor, {
          anchor: Editor.point(editor, firstRowPath, { edge: "start" }),
          focus: Editor.point(editor, firstRowPath, { edge: "start" }),
        });
      }
    } catch (fallbackError) {
      console.error("插入列后聚焦完全失败", fallbackError);
    }
  }
};

export const insertColRight = (editor: Editor) => {
  insertCol(editor, true);
};

export const insertColLeft = (editor: Editor) => {
  insertCol(editor, false);
};

export const deleteRowByIndex = (editor: Editor, index: number) => {
  const [table] = Editor.nodes(editor, {
    match: (n) => n.type === "table",
  });
  if (!table) {
    throw new Error("当前不在表格中");
  }

  const tableElement = table[0] as TableElement;
  // 判断 index 处的 row 是否存在且不为标题行
  if (index < 0 || index >= tableElement.children.length || index === 0) {
    return;
  }

  // 记录当前位置和选择状态，用于删除后重新聚焦
  const currentRow = getCurrentRow(editor);
  const currentCol = getCurrentCol(editor);
  const totalRows = getRows(editor);

  const newTable: TableElement = {
    type: "table",
    children: [
      ...tableElement.children.slice(0, index),
      ...tableElement.children.slice(index + 1),
    ],
  };

  if (newTable.children.length === 0) {
    replaceNode(
      editor,
      { type: "paragraph", children: [{ type: "formatted", text: "" }] },
      (n) => n.type === "table",
    );
    return;
  }

  // 使用replaceNode返回的路径来访问新表格
  const newTablePath = replaceNode(editor, newTable, (n) => n.type === "table");

  if (!newTablePath) {
    console.warn("deleteRowByIndex: replaceNode没有返回路径");
    return;
  }

  // 智能聚焦逻辑：
  try {
    let targetRow = currentRow;

    if (index === currentRow) {
      // 删除的是当前行，需要调整目标行
      if (index > 1) {
        // 确保不聚焦到标题行（索引0）
        // 聚焦到前一行
        targetRow = index - 1;
      } else {
        // 删除的是第一个数据行（索引1），聚焦到新的第一个数据行
        targetRow = 1;
      }
    } else if (index < currentRow) {
      // 删除的是当前行之前的行，当前行索引需要减1
      targetRow = currentRow - 1;
    }
    // 如果删除的是当前行之后的行，targetRow保持不变

    // 确保目标行索引有效（不能是标题行，索引从1开始）
    const newTotalRows = totalRows - 1;
    if (targetRow >= newTotalRows) {
      targetRow = newTotalRows - 1;
    }
    if (targetRow < 1) {
      targetRow = 1; // 最小为第一个数据行
    }

    // 直接通过路径访问新表格元素
    const newTableElement = Editor.node(
      editor,
      newTablePath,
    )[0] as TableElement;
    const targetRowElement = newTableElement.children[
      targetRow
    ] as TableRowElement;
    const targetCellElement = targetRowElement.children[
      currentCol
    ] as TableCellElement;

    // 构造绝对路径到单元格的最后一个子节点
    const lastChildIndex = targetCellElement.children.length - 1;
    const targetChildPath = [
      ...newTablePath,
      targetRow,
      currentCol,
      lastChildIndex,
    ];

    // 聚焦到目标单元格的末尾
    Transforms.select(editor, {
      anchor: Editor.point(editor, targetChildPath, { edge: "end" }),
      focus: Editor.point(editor, targetChildPath, { edge: "end" }),
    });
  } catch (error) {
    // 如果聚焦失败，尝试聚焦到表格的第一个数据行的第一个单元格
    console.warn("表格删除行后聚焦失败，尝试聚焦到第一个数据行", error);
    try {
      if (newTablePath) {
        // 构造第一个数据行第一个单元格的路径 [tablePath, 1, 0, 0] (跳过标题行)
        const firstDataCellPath = [...newTablePath, 1, 0, 0];

        // 验证fallback路径
        try {
          Transforms.select(editor, {
            anchor: Editor.point(editor, firstDataCellPath, { edge: "start" }),
            focus: Editor.point(editor, firstDataCellPath, { edge: "start" }),
          });
        } catch (fallbackPathError) {
          console.error(
            `deleteRowByIndex fallback: 路径验证失败:`,
            fallbackPathError,
          );
          throw fallbackPathError;
        }
      }
    } catch (fallbackError) {
      console.error("表格删除行后聚焦完全失败", fallbackError);
    }
  }
};

export const deletePrevRow = (editor: Editor) => {
  const currentRow = getCurrentRow(editor);
  const targetRow = currentRow - 1;

  // 检查是否可以删除前一行（不能删除标题行，索引0）
  if (targetRow <= 0) {
    return; // 没有可删除的前一行
  }

  deleteRowByIndex(editor, targetRow);
};

export const deleteNextRow = (editor: Editor) => {
  const currentRow = getCurrentRow(editor);
  const totalRows = getRows(editor);
  const targetRow = currentRow + 1;

  // 检查是否可以删除下一行
  if (targetRow >= totalRows) {
    return; // 没有下一行可删除
  }

  deleteRowByIndex(editor, targetRow);
};

export const deleteCurrentRow = (editor: Editor) => {
  const currentRow = getCurrentRow(editor);
  deleteRowByIndex(editor, currentRow);
};

export const deleteColByIndex = (editor: Editor, index: number) => {
  const [table] = Editor.nodes(editor, {
    match: (n) => n.type === "table",
  });
  if (!table) {
    throw new Error("当前不在表格中");
  }

  const tableElement = table[0] as TableElement;
  // 判断 index 处的 col 是否存在
  if (index < 0 || index >= tableElement.children[0].children.length) {
    return;
  }

  // 记录当前行和列位置，用于删除后重新聚焦
  const currentRow = getCurrentRow(editor);
  const currentCol = getCurrentCol(editor);
  const totalCols = getColumns(editor);

  const newTable: TableElement = {
    type: "table",
    children: tableElement.children.map((row) => {
      const rowElement = row as TableRowElement;
      return {
        type: "table-row",
        children: [
          ...rowElement.children.slice(0, index),
          ...rowElement.children.slice(index + 1),
        ],
      };
    }),
  };

  if (newTable.children[0].children.length === 0) {
    replaceNode(
      editor,
      { type: "paragraph", children: [{ type: "formatted", text: "" }] },
      (n) => n.type === "table",
    );
    return;
  }

  // 使用replaceNode返回的路径来访问新表格
  const newTablePath = replaceNode(editor, newTable, (n) => n.type === "table");

  if (!newTablePath) {
    console.warn("deleteColByIndex: replaceNode没有返回路径");
    return;
  }

  // 智能聚焦逻辑
  try {
    let targetCol = currentCol;

    if (index === currentCol) {
      // 删除的是当前列，需要调整目标列
      if (index > 0) {
        // 聚焦到前一列
        targetCol = index - 1;
      } else {
        // 删除的是第一列，聚焦到新的第一列（原来的第二列）
        targetCol = 0;
      }
    } else if (index < currentCol) {
      // 删除的是当前列之前的列，当前列索引需要减1
      targetCol = currentCol - 1;
    }
    // 如果删除的是当前列之后的列，targetCol保持不变

    // 确保目标列索引有效
    const newTotalCols = totalCols - 1;
    if (targetCol >= newTotalCols) {
      targetCol = newTotalCols - 1;
    }

    // 直接通过路径访问新表格元素
    const newTableElement = Editor.node(
      editor,
      newTablePath,
    )[0] as TableElement;

    // 确保行和列索引都有效
    if (currentRow >= newTableElement.children.length) {
      console.warn(
        `deleteColByIndex: 行索引${currentRow}超出范围，表格只有${newTableElement.children.length}行`,
      );
      return;
    }

    const targetRowElement = newTableElement.children[
      currentRow
    ] as TableRowElement;

    if (targetCol >= targetRowElement.children.length) {
      console.warn(
        `deleteColByIndex: 列索引${targetCol}超出范围，行只有${targetRowElement.children.length}列`,
      );
      return;
    }

    const targetCellElement = targetRowElement.children[
      targetCol
    ] as TableCellElement;

    if (
      !targetCellElement.children ||
      targetCellElement.children.length === 0
    ) {
      console.warn(`deleteColByIndex: 目标单元格没有子节点`);
      return;
    }

    // 构造绝对路径到单元格的最后一个子节点
    const lastChildIndex = targetCellElement.children.length - 1;
    const targetChildPath = [
      ...newTablePath,
      currentRow,
      targetCol,
      lastChildIndex,
    ];

    // 聚焦到单元格末尾
    Transforms.select(editor, {
      anchor: Editor.point(editor, targetChildPath, { edge: "end" }),
      focus: Editor.point(editor, targetChildPath, { edge: "end" }),
    });
  } catch (error) {
    // 如果聚焦失败，尝试聚焦到表格的第一个单元格
    console.warn("表格删除列后聚焦失败，尝试聚焦到第一个单元格", error);
    try {
      if (newTablePath) {
        // 构造第一个单元格的路径 [tablePath, 0, 0, 0]
        const firstCellPath = [...newTablePath, 0, 0, 0];

        Transforms.select(editor, {
          anchor: Editor.point(editor, firstCellPath, { edge: "start" }),
          focus: Editor.point(editor, firstCellPath, { edge: "start" }),
        });
      }
    } catch (fallbackError) {
      console.error("表格删除列后聚焦完全失败", fallbackError);
    }
  }
};

export const deletePrevCol = (editor: Editor) => {
  const curCol = getCurrentCol(editor);
  const targetCol = curCol - 1;

  // 检查是否可以删除前一列
  if (targetCol < 0) {
    return; // 没有前一列可删除
  }

  deleteColByIndex(editor, targetCol);
};

export const deleteNextCol = (editor: Editor) => {
  const curCol = getCurrentCol(editor);
  const totalCols = getColumns(editor);
  const targetCol = curCol + 1;

  // 检查是否可以删除下一列
  if (targetCol >= totalCols) {
    return; // 没有下一列可删除
  }

  deleteColByIndex(editor, targetCol);
};

export const deleteCurrentCol = (editor: Editor) => {
  const curCol = getCurrentCol(editor);
  deleteColByIndex(editor, curCol);
};

export const moveNextRow = (editor: Editor) => {
  const [table] = Editor.nodes(editor, {
    match: (n) => n.type === "table",
  });
  if (!table) {
    throw new Error("当前不在表格中");
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
  const cellPath = ReactEditor.findPath(
    editor,
    nextCell.children[nextCell.children.length - 1],
  );
  Transforms.select(editor, {
    anchor: Editor.point(editor, cellPath, {
      edge: "end",
    }),
    focus: Editor.point(editor, cellPath, {
      edge: "end",
    }),
  });
};

export const movePrevRow = (editor: Editor) => {
  const [table] = Editor.nodes(editor, {
    match: (n) => n.type === "table",
  });
  if (!table) {
    throw new Error("当前不在表格中");
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
  const cellPath = ReactEditor.findPath(
    editor,
    prevCell.children[prevCell.children.length - 1],
  );
  Transforms.select(editor, {
    anchor: Editor.point(editor, cellPath, {
      edge: "end",
    }),
    focus: Editor.point(editor, cellPath, {
      edge: "end",
    }),
  });
};

export const moveNextCol = (editor: Editor) => {
  const lastCol = isLastCol(editor);
  const lastRow = isLastRow(editor);
  if (lastCol && lastRow) {
    // 最后一行最后一列, 跳出表格
    Transforms.move(editor, { distance: 1, unit: "line" });
    return;
  }
  if (lastCol) {
    // 最后一列, 跳到下一行第一列
    const currentRow = getCurrentRow(editor);
    const [table] = Editor.nodes(editor, {
      match: (n) => n.type === "table",
    });
    const tableElement = table[0] as TableElement;
    const nextRowElement = tableElement.children[
      currentRow + 1
    ] as TableRowElement;
    const nextCell = nextRowElement.children[0] as TableCellElement;
    const cellPath = ReactEditor.findPath(
      editor,
      nextCell.children[nextCell.children.length - 1],
    );
    Transforms.select(editor, {
      anchor: Editor.point(editor, cellPath, {
        edge: "end",
      }),
      focus: Editor.point(editor, cellPath, {
        edge: "end",
      }),
    });
    return;
  }
  // 来到下一列
  const currentCol = getCurrentCol(editor);
  const nextCol = currentCol + 1;
  const [table] = Editor.nodes(editor, {
    match: (n) => n.type === "table",
  });
  const tableElement = table[0] as TableElement;
  const currentRow = getCurrentRow(editor);
  const currentRowElement = tableElement.children[
    currentRow
  ] as TableRowElement;
  const nextCell = currentRowElement.children[nextCol] as TableCellElement;
  const cellPath = ReactEditor.findPath(
    editor,
    nextCell.children[nextCell.children.length - 1],
  );
  Transforms.select(editor, {
    anchor: Editor.point(editor, cellPath, {
      edge: "end",
    }),
    focus: Editor.point(editor, cellPath, {
      edge: "end",
    }),
  });
};

export const movePrevCol = (editor: Editor) => {
  const firstCol = isFirstCol(editor);
  const firstRow = isFirstRow(editor);
  if (firstCol && firstRow) {
    // 第一行，第一列, 跳出表格
    Transforms.move(editor, { distance: -1, unit: "line" });
    return;
  }
  if (firstCol) {
    // 第一列, 跳到上一行最后一列
    const currentRow = getCurrentRow(editor);
    const [table] = Editor.nodes(editor, {
      match: (n) => n.type === "table",
    });
    const tableElement = table[0] as TableElement;
    const prevRowElement = tableElement.children[
      currentRow - 1
    ] as TableRowElement;
    const prevCell = prevRowElement.children[
      prevRowElement.children.length - 1
    ] as TableCellElement;
    const cellPath = ReactEditor.findPath(
      editor,
      prevCell.children[prevCell.children.length - 1],
    );
    Transforms.select(editor, {
      anchor: Editor.point(editor, cellPath, {
        edge: "end",
      }),
      focus: Editor.point(editor, cellPath, {
        edge: "end",
      }),
    });
    return;
  }
  // 来到上一列
  const currentCol = getCurrentCol(editor);
  const prevCol = currentCol - 1;
  const [table] = Editor.nodes(editor, {
    match: (n) => n.type === "table",
  });
  const tableElement = table[0] as TableElement;
  const currentRow = getCurrentRow(editor);
  const currentRowElement = tableElement.children[
    currentRow
  ] as TableRowElement;
  const prevCell = currentRowElement.children[prevCol] as TableCellElement;
  const cellPath = ReactEditor.findPath(
    editor,
    prevCell.children[prevCell.children.length - 1],
  );
  Transforms.select(editor, {
    anchor: Editor.point(editor, cellPath, {
      edge: "end",
    }),
    focus: Editor.point(editor, cellPath, {
      edge: "end",
    }),
  });
};
