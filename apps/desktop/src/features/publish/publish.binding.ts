import type { TranslationValues } from "@tau/i18n";
import { desktopI18n } from "@/app/i18n/runtime";
import { publishMessages } from "./publish.messages";
export const publishTranslator = desktopI18n.get(publishMessages);
export function publishFeedback(
  key: Parameters<typeof publishMessages.ref>[0],
  values?: TranslationValues
) {
  const params = values && Object.freeze({ ...values });
  return () => publishTranslator.t(key, params);
}
