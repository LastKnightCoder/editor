import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { UiProvider } from "@tau/ui";
import { mustQuery } from "../lib/dom.ts";
import { ChangelogApp } from "./ChangelogApp.tsx";
import "../docs/docs.css";

createRoot(mustQuery("#root")).render(
  <StrictMode>
    <UiProvider>
      <ChangelogApp />
    </UiProvider>
  </StrictMode>
);
