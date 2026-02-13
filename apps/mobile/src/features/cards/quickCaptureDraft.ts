import type { Descendant } from "slate";
import {
  isEditorContentEmpty,
  normalizeEditorContent,
} from "./editorContentUtils";

const QUICK_CAPTURE_DRAFT_KEY = "tau-mobile-quick-capture-draft-v1";

export function readQuickCaptureDraft(): Descendant[] | null {
  try {
    const raw = localStorage.getItem(QUICK_CAPTURE_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const normalized = normalizeEditorContent(parsed);
    if (isEditorContentEmpty(normalized)) {
      return null;
    }
    return normalized;
  } catch {
    return null;
  }
}

export function writeQuickCaptureDraft(content: Descendant[]): void {
  try {
    if (isEditorContentEmpty(content)) {
      localStorage.removeItem(QUICK_CAPTURE_DRAFT_KEY);
      return;
    }
    localStorage.setItem(QUICK_CAPTURE_DRAFT_KEY, JSON.stringify(content));
  } catch {
    // localStorage 不可用时忽略
  }
}

export function clearQuickCaptureDraft(): void {
  try {
    localStorage.removeItem(QUICK_CAPTURE_DRAFT_KEY);
  } catch {
    // localStorage 不可用时忽略
  }
}

export function hasQuickCaptureDraft(): boolean {
  return Boolean(readQuickCaptureDraft());
}
