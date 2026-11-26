import { snapshotDisplayText, type DisplayText } from "@tau/i18n";
import { snapshotMCPDefinition, type PluginMCPDeclaration, type PluginMCPDefinition } from "./mcp";

type Field = "name" | "description";

export function bindMCPDeclaration(
  input: PluginMCPDeclaration,
  resolve: (text: DisplayText) => string,
  signal: AbortSignal
): PluginMCPDefinition {
  const captured: Partial<Record<Field, DisplayText>> = {};
  const snapshot = snapshotMCPDefinition(input, (field, value) => {
    const text = snapshotDisplayText(value);
    captured[field] = text;
    return typeof text === "string" ? text : resolve(text);
  });
  for (const field of ["name", "description"] as const) {
    const text = captured[field];
    if (text === undefined || typeof text === "string") continue;
    let last = snapshot[field];
    Object.defineProperty(snapshot, field, {
      enumerable: true,
      configurable: true,
      get: () => {
        if (!signal.aborted) {
          const value = resolve(text);
          last = field === "name" ? value.trim() : value;
        }
        return last;
      },
    });
  }
  return snapshot;
}

export function copyMCPDisplayFields<T extends PluginMCPDefinition>(
  source: PluginMCPDefinition,
  target: T
): T {
  for (const field of ["name", "description"] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(source, field);
    if (descriptor) Object.defineProperty(target, field, descriptor);
  }
  return target;
}
