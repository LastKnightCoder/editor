import { createRoot } from "react-dom/client";
import { I18nRuntimeProvider } from "@tau/i18n/react";
import { extensionI18n, bindExtensionLanguage } from "../../shared/i18n";
import { NoteApp } from "../../note/NoteApp";
import "./style.css";

bindExtensionLanguage(document.documentElement);
createRoot(document.getElementById("root")!).render(
  <I18nRuntimeProvider runtime={extensionI18n}>
    <NoteApp />
  </I18nRuntimeProvider>
);
