import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { initScrollbarAutoHide, UiProvider } from "@tau/ui";
import searchIndexUrl from "virtual:tau-docs-search/docs";
import { mustQuery } from "../lib/dom.ts";
import { initScrollFade } from "../modules/scrollFade.ts";
import { DocsApp } from "./DocsApp.tsx";
import { userDocs } from "./manifest.ts";
import { loadUserDoc } from "./userDocsLoader.ts";
import "./docs.css";

initScrollbarAutoHide();
initScrollFade({ stickyHeader: true });

createRoot(mustQuery("#root")).render(
  <StrictMode>
    <UiProvider>
      <DocsApp collection={userDocs} load={loadUserDoc} searchIndexUrl={searchIndexUrl} />
    </UiProvider>
  </StrictMode>
);
