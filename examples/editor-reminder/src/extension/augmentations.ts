import type {} from "@tau/editor/api";
import type { ReminderElement } from "./model";

declare module "@tau/editor/api" {
  interface ExtensionElementMap {
    "example.reminder": ReminderElement;
  }
}
