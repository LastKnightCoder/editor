import type { Editor, Element } from "slate";
import type { ElementSpec } from "./extension";
import { IElementEditingPolicy } from "../services/elementEditingPolicy";

export interface ElementVersionAccess {
  element: ElementSpec;
  access: "read" | "edit" | "none";
}

export type ElementVersionResolver = (element: Element) => ElementVersionAccess | undefined;
const resolvers = new WeakMap<Editor, ElementVersionResolver>();
const definitions = new WeakMap<Editor, ReadonlyMap<string, ElementSpec>>();

export function bindElementDefinitions(editor: Editor, elements: readonly ElementSpec[]): void {
  definitions.set(editor, new Map(elements.map(element => [element.type, element])));
}

export const currentElementDefinition = (editor: Editor, type: string): ElementSpec | undefined =>
  definitions.get(editor)?.get(type);

export function setElementVersionResolver(
  editor: Editor,
  resolver: ElementVersionResolver | undefined
): void {
  if (resolver) resolvers.set(editor, resolver);
  else resolvers.delete(editor);
}

export const getElementVersionResolver = (editor: Editor) => resolvers.get(editor);

export function canEditElement(editor: Editor, element: Element): boolean {
  if (editor.tryGetService?.(IElementEditingPolicy)?.canEdit(element.type) === false) return false;
  const resolve = resolvers.get(editor);
  return !resolve || resolve(element)?.access === "edit";
}
