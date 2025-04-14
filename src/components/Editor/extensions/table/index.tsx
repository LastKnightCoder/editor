import { Element } from "slate";
import { RenderElementProps } from "slate-react";
import { trim } from "lodash";
import { markdownTable } from "markdown-table";

import {
  TableElement,
  TableRowElement,
  TableCellElement,
} from "@/components/Editor/types";

import Table from "./components/Table";
import TableRow from "./components/TableRow";
import TableCell from "./components/TableCell";
import { insertBreak, deleteBackward } from "./plugins";
import hotkeys from "./hotkeys";
import blockPanelItems from "./block-panel-items";
import { createBlockElementPlugin } from "../../utils";

import Base from "../base";
import IExtension from "../types.ts";

export class TableExtension extends Base implements IExtension {
  type = "table";

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  override getPlugins() {
    return [createBlockElementPlugin(this.type)];
  }

  override toMarkdown(_element: Element, children: string): string {
    const rows = children.split("\n");
    const data = rows.filter(trim).map((row) => row.split("|").filter(trim));
    return markdownTable(data);
  }

  render(props: RenderElementProps) {
    const { attributes, children, element } = props;
    return (
      <Table element={element as TableElement} attributes={attributes}>
        {children}
      </Table>
    );
  }
}

export class TableRowExtension extends Base implements IExtension {
  type = "table-row";

  override toMarkdown(_element: Element, children: string): string {
    return `| ${children.split("\n").join("")}`.trim();
  }

  override getPlugins() {
    return [createBlockElementPlugin(this.type)];
  }

  render(props: RenderElementProps) {
    const { attributes, children, element } = props;
    return (
      <TableRow element={element as TableRowElement} attributes={attributes}>
        {children}
      </TableRow>
    );
  }
}

export class TableCellExtension extends Base implements IExtension {
  type = "table-cell";

  override getPlugins() {
    return [insertBreak, deleteBackward, createBlockElementPlugin(this.type)];
  }

  override getHotkeyConfigs() {
    return hotkeys;
  }

  override toMarkdown(_element: Element, children: string): string {
    return `${children} | `;
  }

  render(props: RenderElementProps) {
    const { attributes, children, element } = props;
    return (
      <TableCell element={element as TableCellElement} attributes={attributes}>
        {children}
      </TableCell>
    );
  }
}
