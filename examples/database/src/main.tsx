import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { UiProvider } from "@tau/ui";
import { initThemeRuntime } from "@tau/themes/react";
import "@tau/ui/styles.css";
import "./style.css";
import { App } from "./App";

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
