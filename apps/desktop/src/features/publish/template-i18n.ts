import { defineI18n } from "@tau/i18n";
import { resolveTemplateSiteFields, type TemplateListing } from "@tau/plugins/template";
import { desktopI18n } from "@/app/i18n/runtime";

export function resolvePublishTemplateFields(listing: TemplateListing | undefined) {
  const translator = listing?.messages ? desktopI18n.get(defineI18n(listing.messages)) : undefined;
  return resolveTemplateSiteFields(listing?.manifest.template.siteFields, text => {
    if (typeof text === "string") return text;
    if (!translator) throw new Error("模板未提供词典");
    return translator.resolve(text);
  });
}
