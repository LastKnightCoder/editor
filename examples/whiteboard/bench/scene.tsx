import { createRoot } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { UiProvider } from "@tau/ui";
import Whiteboard, { defineWhiteboardExtension, type BoardElement } from "@tau/whiteboard";
import { createStandardWhiteboardExtensions } from "@tau/whiteboard/extensions";
import "@tau/ui/styles.css";
import "../src/style.css";

const params = new URLSearchParams(location.search);
const size = Number(params.get("size") ?? 100);
const rich = params.has("rich");
const elements: BoardElement[] = Array.from({ length: size }, (_, index) => {
  const box = {
    id: `node-${index}`,
    x: 22 + (index % 50) * 120,
    y: 30 + Math.floor(index / 50) * 85,
    width: 96,
    height: 60,
  };
  if (rich)
    return {
      ...box,
      type: "richtext",
      maxWidth: 96,
      maxHeight: 500,
      readonly: false,
      resized: true,
      content: [
        { type: "paragraph", children: [{ type: "formatted", text: `文档摘要 ${index}` }] },
      ],
    };
  return {
    ...box,
    type: "geometry",
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
      content: [{ type: "paragraph", children: [{ type: "formatted", text: "" }] }],
    },
  };
});

const probe = defineWhiteboardExtension({
  id: "bench.probe",
  create(api) {
    Object.assign(window, {
      readBenchElement: () => api.children[0],
      readBenchViewport: () => api.viewPort,
    });
    return {};
  },
});
createRoot(document.getElementById("root")!).render(
  <DndProvider backend={HTML5Backend}>
    <UiProvider className="h-full">
      <Whiteboard
        extensions={[...createStandardWhiteboardExtensions(), probe]}
        initData={elements}
        initViewPort={{ minX: 0, minY: 0, width: 1000, height: 700, zoom: 1 }}
      />
    </UiProvider>
  </DndProvider>
);
