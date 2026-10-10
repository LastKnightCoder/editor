import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Button, UiProvider } from "@tau/ui";
import { initThemeRuntime, useThemeStore } from "@tau/themes/react";
import WhiteBoard, { type BoardElement, type WhiteboardSnapshot } from "@tau/whiteboard";
import "@tau/ui/styles.css";
import "./style.css";
import { createStandardWhiteboardExtensions } from "@tau/whiteboard/extensions";
const extensions = createStandardWhiteboardExtensions();

const initial = (): BoardElement[] => [
  {
    id: "example-text",
    type: "richtext",
    x: 60,
    y: 90,
    width: 300,
    height: 100,
    maxWidth: 300,
    maxHeight: 1000,
    readonly: false,
    resized: false,
    content: [
      {
        type: "paragraph",
        children: [
          { type: "formatted", text: "双击空白处创建文字；工具栏可绘制图形、脑图和手绘。" },
        ],
      },
    ],
  },
];

function App() {
  const [readonly, setReadonly] = useState(false);
  const [dual, setDual] = useState(false);
  const [outline, setOutline] = useState(false);
  const [latest, setLatest] = useState<WhiteboardSnapshot>();
  const theme = useThemeStore();
  return (
    <div className="bg-page text-ink-1 flex h-full flex-col">
      <div className="border-line-1 flex flex-wrap items-center gap-2 border-b p-3">
        <span className="mr-auto font-semibold">Whiteboard 独立示例</span>
        <Button onClick={() => setReadonly(value => !value)}>
          {readonly ? "切换编辑" : "切换只读"}
        </Button>
        <Button onClick={() => setDual(value => !value)}>{dual ? "单实例" : "双实例"}</Button>
        <Button onClick={() => setOutline(value => !value)}>元素栏</Button>
        <Button onClick={() => theme.setAppearance(theme.mode === "dark" ? "light" : "dark")}>
          切换明暗
        </Button>
        <Button
          onClick={() => {
            const blob = new Blob([JSON.stringify(latest, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = "whiteboard.json";
            anchor.click();
            URL.revokeObjectURL(url);
          }}
          disabled={!latest}
        >
          下载当前数据
        </Button>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <WhiteBoard
            extensions={extensions}
            initData={initial()}
            readonly={readonly}
            showSidebar={outline}
            onChange={setLatest}
          />
        </div>
        {dual && (
          <div className="border-line-1 min-w-0 flex-1 border-l">
            <WhiteBoard extensions={extensions} initData={initial()} showSidebar={outline} />
          </div>
        )}
      </div>
    </div>
  );
}

function Host() {
  useEffect(() => initThemeRuntime(), []);
  return (
    <DndProvider backend={HTML5Backend}>
      <UiProvider className="h-full">
        <App />
      </UiProvider>
    </DndProvider>
  );
}
createRoot(document.getElementById("root")!).render(<Host />);
