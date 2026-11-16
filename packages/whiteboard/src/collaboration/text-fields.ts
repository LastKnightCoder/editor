import * as Y from "yjs";
import {
  createSharedTextField,
  createNodeTreeDocument,
  type NodeTreeEditor,
} from "@tau/editor-collab";
import type { EditorTextField } from "@tau/editor/source-contracts";
import type { EditorDocument } from "@tau/editor";
import { flatten, flattenModel, authorElement, refresh } from "./projection";
import { assertWritable, canEditElement } from "./element-access";
import { enterGroup } from "./commands";
import type { CanvasBinding } from "./binding";

export function pageTitle(binding: CanvasBinding, id: string): EditorTextField {
  const text = binding.model.pages.get(id)?.get("title");
  if (!(text instanceof Y.Text) || binding.closed) throw new Error("页面文字已失效");
  const handle = createSharedTextField(
    text,
    binding.history,
    () =>
      !binding.closed &&
      binding.options.canWrite?.() !== false &&
      !!binding.board?.captureSubmission()() &&
      binding.model.read().pages.some(page => page.id === id),
    (changes, origin) => {
      assertWritable(binding, false);
      enterGroup(binding, `page-title:${id}`);
      binding.writing = true;
      try {
        binding.model.submit(
          changes.map(edit => ({ type: "edit_page_title", id, edit })),
          origin
        );
      } finally {
        binding.writing = false;
        refresh(binding);
      }
    },
    false
  );
  binding.fields.add(handle);
  return {
    ...handle,
    dispose: () => {
      handle.dispose();
      binding.fields.delete(handle);
    },
  };
}

export function textField(
  binding: CanvasBinding,
  id: string,
  field: string | null = null,
  read = false
): EditorTextField {
  if (read) {
    if (binding.closed || !binding.board || !authorElement(binding, id))
      throw new Error("文本目标已失效");
  } else assertWritable(binding);
  const handle = createSharedTextField(
    binding.model.text(id, field),
    binding.history,
    () => canEditElement(binding, id),
    (changes, origin) => {
      assertWritable(binding);
      if (binding.gesture) {
        binding.board?.interactions.cancel();
        binding.endGesture(false);
      }
      const entry = binding.options.catalog?.get(authorElement(binding, id)?.contractId ?? "");
      if (entry) {
        binding.validating = true;
        try {
          binding.model.preflight(candidate => {
            candidate.submit(
              changes.map(edit => ({ type: "edit_text", id, field, edit })),
              origin
            );
            const snapshot = candidate.read();
            const node = flattenModel([
              ...snapshot.pages.flatMap(page => [...page.children, ...page.recovery]),
              ...snapshot.recovery,
            ]).find(node => node.id === id);
            if (node) binding.options.catalog!.validate(entry, node.data);
          });
        } finally {
          binding.validating = false;
        }
      }
      enterGroup(binding, `field:${id}:${field}`);
      binding.writing = true;
      try {
        binding.model.submit(
          changes.map(edit => ({ type: "edit_text", id, field, edit })),
          origin
        );
      } finally {
        binding.writing = false;
        refresh(binding);
      }
    },
    false
  );
  binding.fields.add(handle);
  return {
    ...handle,
    dispose: () => {
      handle.dispose();
      binding.fields.delete(handle);
    },
  };
}

export function textDocument(binding: CanvasBinding, id: string): EditorDocument | undefined {
  if (binding.closed || !binding.board) return;
  const element = flatten(binding.board.children).find(node => node.id === id);
  if (!element || !binding.options.types[element.type]?.bodyProperty) return;
  if (element.type === "richtext" && element.entity?.kind === "content") return;
  const body = binding.model.elements.get(id)?.get("fieldBindings") as
    | { body?: { mode: string } }
    | undefined;
  if (body?.body?.mode !== "richtext") return;
  let document = binding.documents.get(id);
  if (!document) {
    const tree = binding.model.richText(id);
    document = createNodeTreeDocument(tree, {
      history: binding.history,
      versions: binding.options.editorVersions,
      normalizeOnConnect: false,
      canWrite: () => canEditElement(binding, id),
      mutate: (write, origin) => {
        assertWritable(binding);
        if (!canEditElement(binding, id)) throw new Error("富文本目标已失效");
        if (binding.gesture) {
          binding.board?.interactions.cancel();
          binding.endGesture(false);
        }
        enterGroup(binding, `text:${id}`);
        binding.writing = true;
        try {
          binding.model.withPreparedContracts(
            (binding.options.preparedContracts ?? []).filter(
              entry => entry.contract.domain === "editor-node"
            ),
            candidate => write(candidate.richText(id)),
            origin
          );
        } finally {
          binding.writing = false;
          refresh(binding);
        }
      },
    });
    const install = document.binding!.install;
    document.binding!.install = editor => {
      const bound = install(editor) as NodeTreeEditor;
      binding.editors.add(bound);
      return bound;
    };
    binding.documents.set(id, document);
  }
  return document;
}

export function flushInputs(binding: CanvasBinding): void {
  for (const editor of binding.editors) editor.flushNodeTreeInputs();
  for (const field of binding.fields) field.flushInputs?.();
}
