import * as Y from "yjs";
import { prepareWhiteboardContract } from "@tau/db-schema/content-contracts";
import { WhiteboardModel } from "./whiteboard-model";
import type {
  WhiteboardElementSnapshot,
  WhiteboardModelCommand,
  WhiteboardParent,
  WhiteboardSnapshot,
} from "./whiteboard-types";

export const shapeGeometry = { x: 0, y: 0, width: 100, height: 60, rotation: 0 };
export const documents: Y.Doc[] = [];
export function model(update?: Uint8Array) {
  const doc = new Y.Doc();
  documents.push(doc);
  if (update) Y.applyUpdate(doc, update);
  return new WhiteboardModel(doc);
}
export async function fixture() {
  const board = model();
  const declarations = await Promise.all([
    prepareWhiteboardContract("example", {
      type: "example.shape",
      dataVersion: 1,
      collaboration: { textFields: ["source"] },
      structure: { text: "plain" },
    }),
    prepareWhiteboardContract("example", {
      type: "example.container",
      dataVersion: 1,
      structure: { container: "free" },
    }),
    prepareWhiteboardContract("example", {
      type: "example.rich",
      dataVersion: 1,
      structure: { text: "richtext" },
    }),
    prepareWhiteboardContract("example", {
      type: "example.layout",
      dataVersion: 1,
      structure: { container: "layout" },
    }),
    prepareWhiteboardContract("example", {
      type: "example.item",
      dataVersion: 1,
      structure: { joins: ["layout"] },
    }),
    prepareWhiteboardContract("example", {
      type: "example.page-only",
      dataVersion: 1,
      structure: { canBeContained: false },
    }),
  ]);
  await board.installContracts(
    Object.fromEntries(declarations.map(value => [value.id, value.contract]))
  );
  const [page, secondPage] = board.submit(
    [
      { type: "create_page", title: "一" },
      { type: "create_page", title: "二" },
    ],
    "seed"
  ).createdIds;
  return {
    board,
    page,
    secondPage,
    shape: declarations[0].id,
    container: declarations[1].id,
    rich: declarations[2].id,
    layout: declarations[3].id,
    item: declarations[4].id,
    pageOnly: declarations[5].id,
  };
}
export function create(
  board: WhiteboardModel,
  contractId: string,
  parent: WhiteboardParent,
  origin: unknown = "seed",
  body?: string | readonly import("./protocol").ContentNode[]
) {
  return board.submit(
    [
      {
        type: "create",
        contractId,
        parent,
        data: {},
        geometry: shapeGeometry,
        ...(body !== undefined ? { body } : {}),
      },
    ],
    origin
  ).createdIds[0];
}
export const pageParent = (id: string): WhiteboardParent => ({ kind: "page", id });
export const elementParent = (id: string): WhiteboardParent => ({ kind: "element", id });
export function flat(snapshot: WhiteboardSnapshot): WhiteboardElementSnapshot[] {
  const result: WhiteboardElementSnapshot[] = [];
  const visit = (nodes: readonly WhiteboardElementSnapshot[]) =>
    nodes.forEach(node => {
      result.push(node);
      visit(node.children);
    });
  snapshot.pages.forEach(page => {
    visit(page.children);
    visit(page.recovery);
  });
  visit(snapshot.recovery);
  return result;
}
export function changes(
  board: WhiteboardModel,
  commands: readonly WhiteboardModelCommand[],
  origin: unknown
): Uint8Array {
  const updates: Uint8Array[] = [],
    listen = (update: Uint8Array) => updates.push(update);
  board.doc.on("update", listen);
  try {
    board.submit(commands, origin);
  } finally {
    board.doc.off("update", listen);
  }
  return Y.mergeUpdates(updates);
}
export async function converge(boards: readonly WhiteboardModel[]) {
  const updates = boards.map(board => Y.encodeStateAsUpdate(board.doc));
  for (let index = 0; index < boards.length; index++) {
    const order = index % 2 ? [...updates].reverse() : updates;
    for (const update of order) await boards[index].receive(update);
  }
}
