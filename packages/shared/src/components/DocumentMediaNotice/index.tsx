import type { ContentResourceKind } from "@tau/db-schema/content-resources";
import { useDocumentNoticeI18n } from "./i18n";
export function DocumentMediaNotice({
  kind,
  alt,
  inline = false,
}: {
  kind: ContentResourceKind;
  alt: string;
  inline?: boolean;
}) {
  const { t } = useDocumentNoticeI18n();
  const notice = t("notice", { kind: t(`kind.${kind}`) });
  const label = alt ? t("withAlt", { notice, alt }) : notice;
  return (
    <span role="note" contentEditable={false}>
      {inline ? `[${label}]` : label}
    </span>
  );
}
