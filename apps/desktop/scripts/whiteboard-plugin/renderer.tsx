import { createRoot } from "react-dom/client";
import "../../src/tailwind.css";
import { useState } from "react";
import { UiProvider } from "@tau/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { defineWhiteboardExtension, type WhiteboardAPI, type BoardElement } from "@tau/whiteboard";
import { DesktopWhiteboard } from "../../src/features/shared/whiteboard/DesktopWhiteboard";
import { DesktopPageSchematic } from "../../src/features/shared/whiteboard/DesktopPageSchematic";
import { initializeContentPlugins } from "../../src/app/plugins/content-plugin-bootstrap";
import { invoke } from "../../src/electron";
import useDynamicExtensionsStore from "../../src/stores/useDynamicExtensionsStore";

let api: WhiteboardAPI;
const capture = defineWhiteboardExtension({
  id: "verification.capture",
  create(value) {
    api = value;
    return {};
  },
});
const extensions = [capture];

async function start() {
  // 未引用正文业务，本夹具只关闭无关编辑器扩展；白板适配器和插件装配保持正式实现。
  useDynamicExtensionsStore.setState({ initialized: true, extensions: [] });
  await initializeContentPlugins();
  const initial = await invoke<BoardElement[]>("verification:load");
  const preview = document.createElement("div");
  preview.id = "standalone-schematic";
  document.body.append(preview);
  createRoot(preview).render(
    <DesktopPageSchematic
      elements={[
        {
          id: "preview",
          type: "example.whiteboard-probe.box",
          x: 0,
          y: 0,
          width: 180,
          height: 90,
          data: { label: "预览" },
        },
      ]}
      aspect={2}
    />
  );
  function Canvas() {
    const [readonly, setReadonly] = useState(false);
    Object.assign(window, {
      whiteboardTest: {
        ready: () => Boolean(api),
        snapshot: () => api.getSnapshot(),
        select: (id: string) => api.select([id]),
        tool: (id: string) => api.setActiveTool(id),
        update: (id: string, patch: Record<string, unknown>) => api.updateElement(id, patch),
        execute: (id: string) => api.execute(id),
        readonly: setReadonly,
        sketch: () =>
          api.submit([
            {
              type: "set_sketch",
              properties: api.getSnapshot().sketch ?? {},
              newProperties: { mode: "sketch", level: "natural" },
            },
          ]),
        save: () => invoke("verification:save", api.getSnapshot().children),
      },
    });
    return (
      <DesktopWhiteboard
        initData={initial}
        extensions={extensions}
        readonly={readonly}
        showSidebar={false}
        style={{ width: 1000, height: 640 }}
        initViewPort={{ minX: 0, minY: 0, width: 1000, height: 640, zoom: 1 }}
      />
    );
  }
  createRoot(document.getElementById("root")!).render(
    <UiProvider>
      <QueryClientProvider client={new QueryClient()}>
        <DndProvider backend={HTML5Backend}>
          <Canvas />
        </DndProvider>
      </QueryClientProvider>
    </UiProvider>
  );
}
void start().catch(error => {
  document.body.dataset.error = String(error);
});
