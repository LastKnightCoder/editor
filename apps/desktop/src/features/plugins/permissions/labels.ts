import type { PluginPermission } from "@tau/plugins";
import type { PermissionRowState } from "@/app/plugins/permissions";
import { pluginControlsTranslator } from "../controls.i18n";
const t = pluginControlsTranslator.t;

export const PERMISSION_LABELS: Record<PluginPermission, { label: string; detail: string }> = {
  "cards:read": {
    get label() {
      return t("permission.label.cards:read");
    },
    get detail() {
      return t("permission.detail.cards:read");
    },
  },
  "cards:write": {
    get label() {
      return t("permission.label.cards:write");
    },
    get detail() {
      return t("permission.detail.cards:write");
    },
  },
  "cards:delete": {
    get label() {
      return t("permission.label.cards:delete");
    },
    get detail() {
      return t("permission.detail.cards:delete");
    },
  },
  "articles:read": {
    get label() {
      return t("permission.label.articles:read");
    },
    get detail() {
      return t("permission.detail.articles:read");
    },
  },
  "articles:write": {
    get label() {
      return t("permission.label.articles:write");
    },
    get detail() {
      return t("permission.detail.articles:write");
    },
  },
  "articles:delete": {
    get label() {
      return t("permission.label.articles:delete");
    },
    get detail() {
      return t("permission.detail.articles:delete");
    },
  },
  "documents:read": {
    get label() {
      return t("permission.label.documents:read");
    },
    get detail() {
      return t("permission.detail.documents:read");
    },
  },
  "documents:write": {
    get label() {
      return t("permission.label.documents:write");
    },
    get detail() {
      return t("permission.detail.documents:write");
    },
  },
  "documents:delete": {
    get label() {
      return t("permission.label.documents:delete");
    },
    get detail() {
      return t("permission.detail.documents:delete");
    },
  },
  "whiteboards:read": {
    get label() {
      return t("permission.label.whiteboards:read");
    },
    get detail() {
      return t("permission.detail.whiteboards:read");
    },
  },
  "whiteboards:write": {
    get label() {
      return t("permission.label.whiteboards:write");
    },
    get detail() {
      return t("permission.detail.whiteboards:write");
    },
  },
  "whiteboards:delete": {
    get label() {
      return t("permission.label.whiteboards:delete");
    },
    get detail() {
      return t("permission.detail.whiteboards:delete");
    },
  },
  "projects:read": {
    get label() {
      return t("permission.label.projects:read");
    },
    get detail() {
      return t("permission.detail.projects:read");
    },
  },
  "projects:write": {
    get label() {
      return t("permission.label.projects:write");
    },
    get detail() {
      return t("permission.detail.projects:write");
    },
  },
  "projects:delete": {
    get label() {
      return t("permission.label.projects:delete");
    },
    get detail() {
      return t("permission.detail.projects:delete");
    },
  },
  "todos:read": {
    get label() {
      return t("permission.label.todos:read");
    },
    get detail() {
      return t("permission.detail.todos:read");
    },
  },
  "todos:write": {
    get label() {
      return t("permission.label.todos:write");
    },
    get detail() {
      return t("permission.detail.todos:write");
    },
  },
  "todos:delete": {
    get label() {
      return t("permission.label.todos:delete");
    },
    get detail() {
      return t("permission.detail.todos:delete");
    },
  },
  "calendar:read": {
    get label() {
      return t("permission.label.calendar:read");
    },
    get detail() {
      return t("permission.detail.calendar:read");
    },
  },
  "calendar:write": {
    get label() {
      return t("permission.label.calendar:write");
    },
    get detail() {
      return t("permission.detail.calendar:write");
    },
  },
  "calendar:delete": {
    get label() {
      return t("permission.label.calendar:delete");
    },
    get detail() {
      return t("permission.detail.calendar:delete");
    },
  },
  "notebooks:read": {
    get label() {
      return t("permission.label.notebooks:read");
    },
    get detail() {
      return t("permission.detail.notebooks:read");
    },
  },
  "materials:read": {
    get label() {
      return t("permission.label.materials:read");
    },
    get detail() {
      return t("permission.detail.materials:read");
    },
  },
  "chats:read": {
    get label() {
      return t("permission.label.chats:read");
    },
    get detail() {
      return t("permission.detail.chats:read");
    },
  },
  "flashcards:read": {
    get label() {
      return t("permission.label.flashcards:read");
    },
    get detail() {
      return t("permission.detail.flashcards:read");
    },
  },
  "flashcards:write": {
    get label() {
      return t("permission.label.flashcards:write");
    },
    get detail() {
      return t("permission.detail.flashcards:write");
    },
  },
  "speech:input": {
    get label() {
      return t("permission.label.speech:input");
    },
    get detail() {
      return t("permission.detail.speech:input");
    },
  },
  "tts:synthesize": {
    get label() {
      return t("permission.label.tts:synthesize");
    },
    get detail() {
      return t("permission.detail.tts:synthesize");
    },
  },
  "ai:chat": {
    get label() {
      return t("permission.label.ai:chat");
    },
    get detail() {
      return t("permission.detail.ai:chat");
    },
  },
  "ai:flashcardGeneration": {
    get label() {
      return t("permission.label.ai:flashcardGeneration");
    },
    get detail() {
      return t("permission.detail.ai:flashcardGeneration");
    },
  },
};
export const PERMISSION_STATE_LABELS: Record<PermissionRowState, string> = {
  get always() {
    return t("permission.always");
  },
  get once() {
    return t("permission.allowedOnce");
  },
  get blocked() {
    return t("permission.blocked");
  },
  get none() {
    return t("permission.ask");
  },
};
