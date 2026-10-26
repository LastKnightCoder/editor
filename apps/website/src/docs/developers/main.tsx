import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { UiProvider } from "@tau/ui";
import { mustQuery } from "../../lib/dom.ts";
import { DocsApp } from "../DocsApp.tsx";
import { loadDeveloperDoc } from "./loader.ts";
import { developerDocs } from "./manifest.ts";
import "../docs.css";

createRoot(mustQuery("#root")).render(
  <StrictMode>
    <UiProvider>
      <DocsApp collection={developerDocs} load={loadDeveloperDoc} />
    </UiProvider>
  </StrictMode>
);
