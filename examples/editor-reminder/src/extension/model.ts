import type { Element } from "slate";

export interface ReminderElement {
  type: "example.reminder";
  done: boolean;
  children: Element[];
}
