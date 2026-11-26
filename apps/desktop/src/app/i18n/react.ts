import { useSyncExternalStore } from "react";
import { useI18n } from "@tau/i18n/react";
import { appMessages } from "./messages";
import { desktopI18n } from "./runtime";

export function useAppI18n() {
  return useI18n(appMessages, desktopI18n);
}

export function useDesktopLocale() {
  return useSyncExternalStore(
    desktopI18n.subscribe,
    desktopI18n.getSnapshot,
    desktopI18n.getSnapshot
  );
}
