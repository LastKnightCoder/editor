import { createRoot } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import * as Y from "yjs";
import { WhiteboardModel } from "@tau/collaboration";
import { UiProvider } from "@tau/ui";
import Whiteboard from "@tau/whiteboard";
import {
  createDocumentExtension,
  createStandardWhiteboardExtensions,
} from "@tau/whiteboard/extensions";
import {
  createWhiteboardBinding,
  prepareBuiltinWhiteboardTypes,
} from "@tau/whiteboard/collaboration";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import worker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { addMixedScene } from "../whiteboard-mixed-fixture";
import "@tau/ui/styles.css";
import "../../../../examples/whiteboard/src/style.css";

async function mount() {
  GlobalWorkerOptions.workerSrc = worker;
  const pdf = await getDocument("/sample.pdf").promise;
  const page = await pdf.getPage(1);
  const canvas = document.createElement("canvas");
  const viewport = page.getViewport({ scale: 0.5 });
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
  const image = canvas.toDataURL();
  await pdf.destroy();

  const model = new WhiteboardModel(new Y.Doc({ gc: false }));
  const schema = await prepareBuiltinWhiteboardTypes();
  const contract = schema.prepared.find(entry => entry.id === schema.types.document.contractId)!;
  await model.installContracts({ [contract.id]: contract.contract });
  model.submit(
    [
      { type: "create_page", id: "p", title: "松手测试" },
      ...Array.from({ length: 12 }, (_, i) => ({
        type: "create" as const,
        id: `paper-${i}`,
        contractId: contract.id,
        parent: { kind: "page" as const, id: "p" },
        entity: { kind: "pdf" as const, sourceId: "source", entityId: "sample-pdf" },
        data: { title: "sample" },
        geometry: {
          x: 35 + (i % 4) * 170,
          y: 40 + Math.floor(i / 4) * 168,
          width: 120,
          height: 75,
          rotation: 0,
        },
      })),
    ],
    null
  );
  await addMixedScene(model, schema);
  const binding = createWhiteboardBinding(model, {
    pageId: "p",
    types: schema.types,
    preparedContracts: schema.prepared,
    coalesceLocalGesture: () => true,
    resolveEntity: async () => 1,
  });
  const extensions = [
    ...createStandardWhiteboardExtensions(),
    createDocumentExtension({
      Body: ({ element }) => (
        <img
          data-pdf-card={element.id}
          src={image}
          draggable={false}
          className="size-full select-none"
        />
      ),
    }),
  ];
  Object.assign(window, { releaseFixture: { model, binding } });
  createRoot(document.getElementById("root")!).render(
    <DndProvider backend={HTML5Backend}>
      <UiProvider className="h-full">
        <Whiteboard
          extensions={extensions}
          document={binding}
          initData={[]}
          initViewPort={{ minX: 0, minY: 0, width: 1000, height: 700, zoom: 1 }}
        />
      </UiProvider>
    </DndProvider>
  );
}
void mount();
