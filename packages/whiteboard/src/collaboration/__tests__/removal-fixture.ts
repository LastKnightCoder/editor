import * as Y from "yjs";
import { WhiteboardModel } from "@tau/collaboration";
import Board from "../../Board";
import { createStandardWhiteboardExtensions } from "../../extensions/builtins";
import { getDefaultHandwriteStyle } from "../../utils/HandwriteUtil";
import { createWhiteboardBinding } from "../binding";
import { prepareBuiltinWhiteboardTypes } from "../builtins";
import type { BoardElement } from "../../types";

export async function createRemovalFixture(state?: Uint8Array) {
  const doc = new Y.Doc({ gc: false });
  if (state) Y.applyUpdate(doc, state);
  const model = new WhiteboardModel(doc);
  if (!model.pages.size) model.submit([{ type: "create_page", id: "page", title: "画布" }], null);
  const schema = await prepareBuiltinWhiteboardTypes();
  const board = new Board(
    [],
    { minX: 0, minY: 0, width: 1000, height: 700, zoom: 1 },
    { selectedElements: [], selectArea: null }
  );
  board.installExtensions(createStandardWhiteboardExtensions());
  const binding = createWhiteboardBinding(model, {
    pageId: "page",
    types: schema.types,
    preparedContracts: schema.prepared,
  });
  board.attachDocument(binding);
  const dispose = () => {
    board.destroy();
    model.dispose();
    doc.destroy();
  };
  const stroke = (id: string, segments = 2) => {
    for (let index = 0; index < segments; index++)
      binding.appendStroke(
        id,
        [
          { x: 100 + index * 40, y: 100, pressure: 0.5 },
          { x: 130 + index * 40, y: 150, pressure: 0.5 },
        ],
        getDefaultHandwriteStyle()
      );
  };
  const insert = (node: BoardElement) =>
    board.apply({ type: "insert_node", path: [board.children.length], node });
  return { doc, model, board, binding, schema, stroke, insert, dispose };
}
