import type { ReleaseNote } from "@/commands/updater";
import type { useReleaseNotesI18n } from "./i18n";
export function releaseNotesTitle(
  notes: ReleaseNote[],
  t: ReturnType<typeof useReleaseNotesI18n>["t"]
): string {
  const newest = notes[0]?.version,
    oldest = notes.at(-1)?.version;
  if (!newest) return t("title");
  return newest === oldest
    ? t("title.single", { version: newest })
    : t("title.range", { oldest: oldest ?? "", newest });
}
