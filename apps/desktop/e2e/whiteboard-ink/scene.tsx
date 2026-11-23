import { createRoot } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import * as Y from "yjs";
import { WhiteboardModel } from "@tau/collaboration";
import { UiProvider } from "@tau/ui";
import Whiteboard from "@tau/whiteboard";
import { createStandardWhiteboardExtensions } from "@tau/whiteboard/extensions";
import {
  createWhiteboardBinding,
  prepareBuiltinWhiteboardTypes,
} from "@tau/whiteboard/collaboration";
import { seedInk } from "./fixture";
import "@tau/ui/styles.css";
import "../../../../examples/whiteboard/src/style.css";

async function mount() {
  const model = new WhiteboardModel(new Y.Doc({ gc: false }));
  const schema = await prepareBuiltinWhiteboardTypes();
  seedInk(model, schema, Number(new URLSearchParams(location.search).get("size")));
  const binding = createWhiteboardBinding(model, {
    pageId: "p",
    types: schema.types,
    preparedContracts: schema.prepared,
    coalesceLocalGesture: () => true,
  });
  Object.assign(window, { inkBench: { model, binding } });
  createRoot(document.getElementById("root")!).render(
    <DndProvider backend={HTML5Backend}>
      <UiProvider className="h-full">
        <Whiteboard
          extensions={createStandardWhiteboardExtensions()}
          document={binding}
          initData={[]}
          initViewPort={{ minX: 0, minY: 0, width: 1000, height: 700, zoom: 1 }}
        />
      </UiProvider>
    </DndProvider>
  );
}
void mount();
