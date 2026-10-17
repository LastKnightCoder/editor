import { createPortableContentRuntime } from "@tau/plugins/portable";

const runtime = createPortableContentRuntime(
  async () => (await import("virtual:tau-editor-plugins")).default
);
export const contentPlugins = runtime.registry;
export const initializeContentPlugins = runtime.initialize;
