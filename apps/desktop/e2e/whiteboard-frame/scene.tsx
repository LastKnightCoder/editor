import { seedGeometryHistory } from "./prototype/seedGeometryHistory";
import { installDragProbe } from "./prototype/drag";
import { createRoot } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import * as Y from "yjs";
import {
  WhiteboardModel,
  type WhiteboardModelCommand,
  type WhiteboardParent,
} from "@tau/collaboration";
import { UiProvider } from "@tau/ui";
import Whiteboard, {
  COLUMN_DEFAULTS,
  FrameUtil,
  defineWhiteboardExtension,
  type BoardElement,
  type ColumnElement,
} from "@tau/whiteboard";
import {
  createStandardWhiteboardExtensions,
  createDocumentExtension,
} from "@tau/whiteboard/extensions";
import {
  createWhiteboardBinding,
  prepareBuiltinWhiteboardTypes,
} from "@tau/whiteboard/collaboration";
import "@tau/ui/styles.css";
import "../../../../examples/whiteboard/src/style.css";

async function mount() {
  const params = new URLSearchParams(location.search);
  const size = Number(params.get("size") ?? 100);
  const mode = params.get("mode") ?? "frame";
  const model = new WhiteboardModel(new Y.Doc({ gc: false }));
  model.submit([{ type: "create_page", id: "p", title: "性能摸底" }], null);
  const schema = await prepareBuiltinWhiteboardTypes();
  const nodes: BoardElement[] = Array.from({ length: size }, (_, i) => ({
    id: `node-${i}`,
    type: "geometry",
    x: 130 + (i % 20) * 110,
    y: 170 + Math.floor(i / 20) * 80,
    width: 80,
    height: 45,
    geometryType: "rectangle",
    paths: ["M 0 0 L 1 0 L 1 1 L 0 1 Z"],
    fill: "#87aab2",
    fillOpacity: 1,
    stroke: "#456",
    strokeWidth: 1,
    strokeOpacity: 1,
    color: "#123",
    extraInfo: {},
    text: {
      align: "center",
      content: params.has("labels")
        ? [{ type: "paragraph", children: [{ type: "formatted", text: `标签 ${i}` }] }]
        : [],
    },
  }));
  if (params.has("dense"))
    nodes.forEach((node, index) => {
      node.x = 130 + (index % 40) * 14;
      node.y = 170 + Math.floor(index / 40) * 12;
      node.width = 10;
      node.height = 8;
    });
  const frame = { ...FrameUtil.createFrame(100, 120, 500, 450, "性能画框"), id: "frame" };
  if (!["entry", "column", "mind"].includes(mode)) {
    frame.width = Math.max(500, 20 * 110 + 30);
    frame.height = Math.max(450, Math.ceil(size / 20) * 80 + 50);
  }
  const elements: BoardElement[] =
    mode === "loose" || mode === "create" ? nodes : [{ ...frame, children: nodes }];
  if (mode === "many") {
    elements.push(
      ...Array.from({ length: 99 }, (_, i) => ({
        ...FrameUtil.createFrame(3000 + (i % 10) * 600, Math.floor(i / 10) * 500, 500, 450),
        id: `other-frame-${i}`,
      }))
    );
  }
  if (mode === "entry")
    elements.splice(0, elements.length, frame, {
      ...nodes[0],
      id: "outside",
      x: 680,
      y: 250,
    });
  if (mode === "column")
    elements.splice(0, elements.length, frame, {
      id: "outside",
      type: "column",
      x: 680,
      y: 250,
      width: COLUMN_DEFAULTS.width,
      height: 100,
      title: "Column",
      children: [],
      padding: COLUMN_DEFAULTS.padding,
      gap: COLUMN_DEFAULTS.gap,
      minWidth: COLUMN_DEFAULTS.minWidth,
      maxWidth: COLUMN_DEFAULTS.maxWidth,
    } satisfies ColumnElement);
  if (mode === "mind")
    elements.splice(0, elements.length, frame, {
      id: "outside",
      type: "mind-node",
      x: 680,
      y: 250,
      width: 100,
      height: 50,
      actualHeight: 50,
      level: 1,
      direction: "right",
      children: [],
      leftChildrenHeight: 0,
      rightChildrenHeight: 0,
      childrenHeight: 0,
      text: [],
    });
  if (mode === "nested") {
    const card = (id: string): BoardElement => ({
      id,
      type: "document",
      x: 830,
      y: 240,
      width: 100,
      height: 50,
      title: id,
    });
    const column = (id: string, x: number, children: BoardElement[]): BoardElement => ({
      id,
      type: "column",
      x,
      y: 200,
      width: 240,
      height: 100,
      title: id,
      children,
      padding: 8,
      gap: 8,
      minWidth: 200,
      maxWidth: 600,
    });
    const columnA = column("column-a", 140, [card("a1"), card("a2")]);
    elements.splice(
      0,
      elements.length,
      {
        ...frame,
        width: 700,
        height: 500,
        children: [
          ...(params.has("legacy") ? [] : [columnA]),
          column("column-b", 450, [card("b1"), card("b2")]),
        ],
      },
      ...(params.has("legacy") ? [columnA] : []),
      card("outside"),
      ...nodes.map(node => ({ ...node, x: node.x + 3000 })),
      {
        id: "link",
        type: "arrow",
        x: 0,
        y: 0,
        width: 100,
        height: 1,
        lineType: "straight",
        lineWidth: 2,
        source: { marker: "none", bindId: "a1", connectId: "right" },
        target: { marker: "arrow", bindId: "b1", connectId: "left" },
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
      }
    );
  }
  const commands: WhiteboardModelCommand[] = [];
  const collect = (list: BoardElement[], parent: WhiteboardParent) => {
    for (const node of list) {
      const codec = schema.types[node.type];
      const data = Object.fromEntries(
        (codec.dataProperties ?? [])
          .filter(key => node[key] !== undefined)
          .map(key => [key, node[key]])
      );
      if (codec.bodyProperty?.includes(".")) {
        const [head, tail] = codec.bodyProperty.split(".");
        data[head] = { ...data[head] };
        delete data[head][tail];
      }
      const body =
        codec.bodyProperty
          ?.split(".")
          .reduce<unknown>(
            (value, key) =>
              value && typeof value === "object" ? Reflect.get(value, key) : undefined,
            node
          ) ?? [];
      const initialBody = typeof body === "string" || Array.isArray(body) ? body : undefined;
      if (codec.bodyProperty && initialBody === undefined)
        throw new Error("夹具正文必须是字符串或节点列表");
      commands.push({
        type: "create",
        id: node.id,
        contractId:
          node.id === "column-a" && params.has("legacy")
            ? (codec.previousContractIds?.[0] ?? codec.contractId)
            : codec.contractId,
        parent,
        geometry: { x: node.x, y: node.y, width: node.width, height: node.height, rotation: 0 },
        data,
        ...(codec.bodyProperty ? { body: initialBody ?? [] } : {}),
      });
      collect(node.children ?? [], { kind: "element", id: node.id });
    }
  };
  collect(elements, { kind: "page", id: "p" });
  const usedContracts = new Set(
    commands.flatMap(command => (command.type === "create" ? [command.contractId] : []))
  );
  await model.installContracts(
    Object.fromEntries(
      schema.prepared.filter(row => usedContracts.has(row.id)).map(row => [row.id, row.contract])
    )
  );
  for (let i = 0; i < commands.length; i += 100) model.submit(commands.slice(i, i + 100), null);
  const binding = createWhiteboardBinding(model, {
    pageId: "p",
    types: schema.types,
    preparedContracts: schema.prepared,
    coalesceLocalGesture: () => true,
  });
  const verify = async () => {
    const doc = new Y.Doc({ gc: false }),
      replica = new WhiteboardModel(doc);
    try {
      await replica.receive(Y.encodeStateAsUpdate(model.doc));
      if (JSON.stringify(model.read()) !== JSON.stringify(replica.read()))
        throw new Error("增量快照与独立完整模型不一致");
    } finally {
      replica.dispose();
      doc.destroy();
    }
  };
  const probe = defineWhiteboardExtension({
    id: "bench.frame",
    create(api) {
      const frameCommand = (id: string): WhiteboardModelCommand => {
        const element: BoardElement = { ...FrameUtil.createFrame(100, 120, 700, 450), id };
        const codec = schema.types.frame;
        return {
          type: "create",
          id,
          parent: { kind: "page", id: "p" },
          contractId: codec.contractId,
          geometry: {
            x: element.x,
            y: element.y,
            width: element.width,
            height: element.height,
            rotation: 0,
          },
          data: Object.fromEntries(
            (codec.dataProperties ?? [])
              .filter(key => element[key] !== undefined)
              .map(key => [key, element[key]])
          ),
        };
      };
      const fixture = {
        api,
        model,
        binding,
        verify,
        stateBytes: () => Y.encodeStateAsUpdate(model.doc).byteLength,
        auditHistory(direction: "undo" | "redo") {
          const state = Y.encodeStateAsUpdate(model.doc),
            snapshot = JSON.stringify(model.read());
          const history = binding.history;
          const stack = () =>
            JSON.stringify(
              [history.undoStack, history.redoStack].map(items =>
                items.map(item => [
                  Array.from(item.insertions.clients),
                  Array.from(item.deletions.clients),
                ])
              )
            );
          const beforeStack = stack(),
            undo = [...history.undoStack],
            redo = [...history.redoStack];
          try {
            binding[direction]();
            return {
              direction,
              accepted: true,
              beforeBytes: state.length,
              afterBytes: Y.encodeStateAsUpdate(model.doc).length,
            };
          } catch (error) {
            const after = Y.encodeStateAsUpdate(model.doc);
            return {
              direction,
              accepted: false,
              error: error instanceof Error ? error.message : String(error),
              beforeBytes: state.length,
              afterBytes: after.length,
              bytesUnchanged:
                state.length === after.length && state.every((b, i) => b === after[i]),
              modelUnchanged: snapshot === JSON.stringify(model.read()),
              stacksUnchanged:
                stack() === beforeStack &&
                history.undoStack.length === undo.length &&
                history.redoStack.length === redo.length &&
                undo.every((item, i) => item === history.undoStack[i]) &&
                redo.every((item, i) => item === history.redoStack[i]),
            };
          }
        },
        seedGeometryBytes(target: number) {
          binding.writing = true;
          try {
            return seedGeometryHistory(model, "frame", target);
          } finally {
            binding.writing = false;
            binding.refreshLayout();
          }
        },
        async remote(commands: readonly WhiteboardModelCommand[]) {
          const doc = new Y.Doc({ gc: false }),
            peer = new WhiteboardModel(doc);
          try {
            await peer.receive(Y.encodeStateAsUpdate(model.doc));
            peer.prepareLocalTranslations();
            peer.tryLocalStructure(commands, {}) ?? peer.submitChunks(commands, {});
            await model.receive(Y.encodeStateAsUpdate(doc, Y.encodeStateVector(model.doc)));
          } finally {
            peer.dispose();
            doc.destroy();
          }
        },
        frameCommand,
        ready: false,
        async startPrototype(startWorker = true, handoff = false, incremental = false) {
          const contracts = schema.prepared.filter(row =>
            [schema.types.frame.contractId, schema.types.column.contractId].includes(row.id)
          );
          await model.installContracts(
            Object.fromEntries(contracts.map(row => [row.id, row.contract]))
          );
          const { createPrototypeScenario } = await import("./prototype/scenario");
          return createPrototypeScenario(fixture, startWorker, handoff, incremental);
        },
      };
      Object.assign(window, { frameBench: fixture });
      setTimeout(() => {
        const variant = params.get("drag-variant") ?? import.meta.env.VITE_FRAME_BENCH_DRAG_VARIANT;
        Object.assign(fixture, { dragVariant: variant ?? "configured" });
        if (variant && variant !== "baseline" && variant !== "configured")
          Object.assign(fixture, { dragProbe: installDragProbe(binding, variant) });
        fixture.ready = true;
      }, 0);
      return {};
    },
  });
  const root = document.getElementById("root");
  if (!root) throw new Error("缺少画布挂载点");
  createRoot(root).render(
    <DndProvider backend={HTML5Backend}>
      <UiProvider className="h-full">
        <Whiteboard
          extensions={[
            ...createStandardWhiteboardExtensions(),
            createDocumentExtension({ Body: ({ element }) => <div>{element.title}</div> }),
            probe,
          ]}
          document={binding}
          initData={[]}
          initViewPort={{ minX: 0, minY: 0, width: 1000, height: 700, zoom: 1 }}
        />
      </UiProvider>
    </DndProvider>
  );
}
void mount();
