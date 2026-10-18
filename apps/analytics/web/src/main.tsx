import "./styles.css";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { UiProvider } from "@tau/ui";
import { initThemeRuntime } from "@tau/themes/react";
import { App } from "./App";
import { queryClient } from "./api";

const disposeTheme = initThemeRuntime();
const root = document.getElementById("root");
if (!root) throw new Error("统计后台挂载节点不存在");
createRoot(root).render(
  <QueryClientProvider client={queryClient}>
    <UiProvider>
      <App />
    </UiProvider>
  </QueryClientProvider>
);
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    disposeTheme();
    queryClient.clear();
  });
