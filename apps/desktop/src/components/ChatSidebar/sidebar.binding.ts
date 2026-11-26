import { desktopI18n } from "@/app/i18n/runtime";
import { sidebarMessages } from "./sidebar.messages";
export const sidebarTranslator = desktopI18n.get(sidebarMessages);
export const sidebarT = sidebarTranslator.t;
export const sidebarNumber = (value: number) =>
  new Intl.NumberFormat(desktopI18n.getSnapshot()).format(value);
