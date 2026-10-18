import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { UiProvider } from "@tau/ui";
import { mustQuery } from "../lib/dom.ts";
import { DocsApp } from "./DocsApp.tsx";
import "./docs.css";

createRoot(mustQuery("#root")).render(
  <StrictMode>
    <UiProvider>
      <DocsApp />
    </UiProvider>
  </StrictMode>
);
