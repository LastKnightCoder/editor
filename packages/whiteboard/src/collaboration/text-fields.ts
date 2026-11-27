import * as Y from "yjs";
import {
  createSharedTextField,
  createNodeTreeDocument,
  type NodeTreeEditor,
} from "@tau/editor-collab";
import type { EditorTextField } from "@tau/editor/source-contracts";
import type { EditorDocument } from "@tau/editor";
import { canvasElement, flattenModel, authorElement, refresh } from "./projection";
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
  field: string | null = null
): EditorTextField {
  const preview = binding.board?.creationPreviewSession;
  const draft = preview?.getElement(id);
  if (preview && draft) {
    const codec = binding.options.types[draft.type];
    const contract =
      codec &&
      (binding.model.contracts.get(codec.contractId) ??
        binding.options.preparedContracts?.find(entry => entry.id === codec.contractId)?.contract);
    if (
      !field ||
      !contract ||
      contract.domain !== "whiteboard-element" ||
      !contract.textFields.includes(field)
    )
      throw new Error("文本字段未声明");
    return preview.textField(id, element => {
      const value = element[field];
      return typeof value === "string" ? value : "";
    });
  }
  if (binding.closed || !binding.board || !authorElement(binding, id))
    throw new Error("文本目标已失效");
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
      const catalog = binding.options.catalog;
      const entry = catalog?.get(authorElement(binding, id)?.contractId ?? "");
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
            if (node && catalog) catalog.validate(entry, node.data);
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
  const element = canvasElement(binding.board.children, id);
  if (!element || !binding.options.types[element.type]?.bodyProperty) return;
  if (element.type === "richtext" && element.entity?.kind === "content") return;
  const body = binding.model.elements.get(id)?.get("fieldBindings") as
    | { body?: { mode: string } }
    | undefined;
  if (body?.body?.mode !== "richtext") return;
  let document = binding.documents.get(id);
  if (!document) {
    const tree = binding.model.richText(id);
    const prepared = (binding.options.preparedContracts ?? []).filter(
      entry => entry.contract.domain === "editor-node"
    );
    document = createNodeTreeDocument(tree, {
      history: binding.history,
      versions: binding.options.editorVersions,
      normalizeOnConnect: false,
      canWrite: () => canEditElement(binding, id),
      mutate: (write, origin, textEdit) => {
        assertWritable(binding);
        if (!canEditElement(binding, id)) throw new Error("富文本目标已失效");
        if (binding.gesture) {
          binding.board?.interactions.cancel();
          binding.endGesture(false);
        }
        enterGroup(binding, `text:${id}`);
        const before = binding.readSnapshot();
        binding.writing = true;
        let projected = false;
        try {
          const result = textEdit && binding.model.tryLocalBodyEdit(id, textEdit, origin);
          if (result) {
            if (result.isolated) projected = binding.publishBody(before, id);
            return;
          }
          binding.model.withPreparedContracts(
            prepared,
            candidate => write(candidate.richText(id)),
            origin
          );
        } finally {
          binding.writing = false;
          if (!projected) refresh(binding);
        }
      },
    });
    const documentBinding = document.binding;
    if (!documentBinding) throw new Error("文档绑定尚未初始化");
    const install = documentBinding.install;
    documentBinding.install = editor => {
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
