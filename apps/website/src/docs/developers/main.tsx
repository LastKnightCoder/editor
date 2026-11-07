import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { initScrollbarAutoHide, UiProvider } from "@tau/ui";
import searchIndexUrl from "virtual:tau-docs-search/developers";
import { mustQuery } from "../../lib/dom.ts";
import { initScrollFade } from "../../modules/scrollFade.ts";
import { DocsApp } from "../DocsApp.tsx";
import { loadDeveloperDoc } from "./loader.ts";
import { developerDocs } from "./manifest.ts";
import "../docs.css";

initScrollbarAutoHide();
initScrollFade({ stickyHeader: true });

createRoot(mustQuery("#root")).render(
  <StrictMode>
    <UiProvider>
      <DocsApp collection={developerDocs} load={loadDeveloperDoc} searchIndexUrl={searchIndexUrl} />
    </UiProvider>
  </StrictMode>
);
