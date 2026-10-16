import "./styles.css";
import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { ToastHost, UiProvider } from "@tau/ui";
import { initThemeRuntime } from "@tau/themes/react";
import { guardSession } from "./api/guardSession";
import { createHttpApi } from "./api/http";
import type { PortalApi } from "./api/types";
import { ApiProvider, createQueryClient } from "./app/api";
import { createPortalRouter } from "./app/router";
import { sessionExpiry } from "./app/session";
import { resolvePortalEnv } from "./env";

async function bootstrap() {
  const env = resolvePortalEnv(import.meta.env);
  const queryClient = createQueryClient();

  let transport: PortalApi;
  let devPanel: ReactNode = null;
  // DEV 为构建期常量：生产产物中这一分支与模拟代码一起被移除
  if (import.meta.env.DEV && env.mock) {
    const { startMock } = await import("./api/mock/startMock");
    const mock = startMock();
    transport = mock.api;
    devPanel = mock.panel;
  } else {
    transport = createHttpApi({ baseUrl: env.apiBaseUrl });
  }
  const api = guardSession(transport, () => sessionExpiry.mark(queryClient));

  initThemeRuntime();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ApiProvider api={api}>
        <QueryClientProvider client={queryClient}>
          <UiProvider>
            <RouterProvider router={createPortalRouter()} />
            {devPanel}
            <ToastHost />
          </UiProvider>
        </QueryClientProvider>
      </ApiProvider>
    </StrictMode>
  );
}

void bootstrap();
