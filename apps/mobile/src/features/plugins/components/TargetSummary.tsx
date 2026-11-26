import { pluginTranslator, usePluginI18n } from "../i18n";
import type { CenterTargets } from "@tau/plugins/center";
import { PORTABLE_PLATFORMS, type PortablePlatform } from "@tau/plugins/portable";
import { PLATFORM_LABELS } from "./centerDisplay";
const t = pluginTranslator.t;

/** 本平台的目标声明摘要，外加其他声明平台；未声明本平台时明确说明。 */
export function TargetSummary({
  targets,
  platform,
}: {
  targets: CenterTargets;
  platform: PortablePlatform | null;
}) {
  usePluginI18n();
  const target = platform ? targets[platform] : undefined;
  const others = PORTABLE_PLATFORMS.filter(item => item !== platform && targets[item]);
  return (
    <section aria-label={t("target.label")} className="flex flex-col gap-2 text-[13px]">
      {platform && !target && (
        <p className="text-warn">
          {t("target.unsupported", { platform: PLATFORM_LABELS[platform] })}
        </p>
      )}
      {platform && target && (
        <dl className="grid grid-cols-[84px_minmax(0,1fr)] gap-x-3 gap-y-1.5">
          <dt className="text-ink-3">{t("target.minimum")}</dt>
          <dd className="text-ink-1 font-mono">Tau {target.minAppVersion}</dd>
        </dl>
      )}
      {others.length > 0 && (
        <p className="text-ink-3">
          {t(platform ? "target.other" : "target.declared", {
            platforms: others.map(item => PLATFORM_LABELS[item]).join("、"),
          })}
        </p>
      )}
    </section>
  );
}
