import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { UiProvider } from "@tau/ui";
import searchIndexUrl from "virtual:tau-docs-search/developers";
import { mustQuery } from "../../lib/dom.ts";
import { DocsApp } from "../DocsApp.tsx";
import { loadDeveloperDoc } from "./loader.ts";
import { developerDocs } from "./manifest.ts";
import "../docs.css";

createRoot(mustQuery("#root")).render(
  <StrictMode>
    <UiProvider>
      <DocsApp collection={developerDocs} load={loadDeveloperDoc} searchIndexUrl={searchIndexUrl} />
    </UiProvider>
  </StrictMode>
);
