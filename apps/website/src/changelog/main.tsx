import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { initScrollbarAutoHide, UiProvider } from "@tau/ui";
import { mustQuery } from "../lib/dom.ts";
import { initScrollFade } from "../modules/scrollFade.ts";
import { ChangelogApp } from "./ChangelogApp.tsx";
import "../docs/docs.css";

initScrollbarAutoHide();
initScrollFade({ stickyHeader: true });

createRoot(mustQuery("#root")).render(
  <StrictMode>
    <UiProvider>
      <ChangelogApp />
    </UiProvider>
  </StrictMode>
);
