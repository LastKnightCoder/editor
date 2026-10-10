import type { ComponentType } from "react";
import { defineWhiteboardExtension, type WhiteboardExtension } from "../extensions/api";
import { createStandardWhiteboardExtensions } from "../extensions/builtins";

const extensions = new WeakMap<ComponentType, readonly WhiteboardExtension[]>();
export function extensionsWithLayer(component: ComponentType) {
  let value = extensions.get(component);
  if (!value) {
    value = [
      ...createStandardWhiteboardExtensions(),
      defineWhiteboardExtension({
        id: "test.capture",
        create: () => ({ layers: [{ id: "test.capture.layer", position: "outside", component }] }),
      }),
    ];
    extensions.set(component, value);
  }
  return value;
}
