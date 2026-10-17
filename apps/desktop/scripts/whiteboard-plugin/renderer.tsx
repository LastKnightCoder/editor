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
import { DesktopPluginRuntime } from "../../src/app/plugins/runtime";
import { PluginRuntimeContext } from "../../src/app/plugins/context";
import { createBrowserStorage } from "@tau/plugins/host";
import { desktopContentPlugins } from "../../shared/content-plugins";
import { captureBlobWithSnapdom } from "../../src/utils/snapdom-export";

let api: WhiteboardAPI;
declare global {
  interface Window {
    whiteboardAcceptance: {
      createCaptureExtension(
        capture: (element: Element, options: Record<string, unknown>) => Promise<Blob>
      ): import("@tau/whiteboard").WhiteboardExtension;
      checkStickmanParity(
        api: WhiteboardAPI,
        definition: import("@tau/plugins/whiteboard").WhiteboardElementDefinition
      ): Promise<{ renderCases: number; schematicCases: number }>;
    };
    captureWhiteboard(): Promise<{ size: number; type: string } | null>;
    checkWhiteboardConnections(): boolean;
  }
}
const capture = defineWhiteboardExtension({
  id: "verification.capture",
  create(value) {
    api = value;
    return {};
  },
});
const extensions = [
  capture,
  window.whiteboardAcceptance.createCaptureExtension(captureBlobWithSnapdom),
];

async function start() {
  // 未引用正文业务，本夹具只关闭无关编辑器扩展；白板适配器和插件装配保持正式实现。
  useDynamicExtensionsStore.setState({ initialized: true, extensions: [] });
  await initializeContentPlugins();
  const id = await invoke<string>("verification:id");
  const stickman = id === "taunote.stickman";
  const runtime = new DesktopPluginRuntime({
    workspaceId: "verification",
    storage: createBrowserStorage(localStorage),
    navigator: { push: () => undefined },
    plugins: desktopContentPlugins.list(),
  });
  for (const plugin of desktopContentPlugins.list()) await runtime.host.enable(plugin.id);
  const initial = await invoke<BoardElement[]>("verification:load");
  const preview = document.createElement("div");
  preview.id = "standalone-schematic";
  document.body.append(preview);
  createRoot(preview).render(
    <DesktopPageSchematic
      elements={[
        {
          id: "preview",
          type: stickman ? "taunote.stickman.figure" : "example.whiteboard-probe.box",
          schemaVersion: 1,
          x: 0,
          y: 0,
          width: 180,
          height: 90,
          data: stickman
            ? { pose: "stand", body: "classic", tint: "color", flip: false }
            : { label: "预览" },
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
        style: () => runtime.host.getStorage(id).get("style"),
        parity: () =>
          window.whiteboardAcceptance.checkStickmanParity(
            api,
            desktopContentPlugins.whiteboardElements.find(
              item => item.type === "taunote.stickman.figure"
            )!
          ),
        capture: () => window.captureWhiteboard(),
        connections: () => window.checkWhiteboardConnections(),
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
          <PluginRuntimeContext value={runtime}>
            <Canvas />
          </PluginRuntimeContext>
        </DndProvider>
      </QueryClientProvider>
    </UiProvider>
  );
}
void start().catch(error => {
  document.body.dataset.error = String(error);
});
