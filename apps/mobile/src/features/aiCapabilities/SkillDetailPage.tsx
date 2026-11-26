// Skill 详情：使用方式（自动 / 仅手动 / 停用）、只读正文、来源。
// 带脚本的 Skill 包在手机端只读取说明与参考资料。

import { skillsTranslator, useSkillsI18n } from "./skills.i18n";
import { useState } from "react";
import { ChevronRight, ExternalLink } from "lucide-react";
import { MarkdownRenderer } from "@tau/chat-ui/conversation";
import { useThemeStore } from "@tau/themes/react";
import { BottomSheet } from "../../components/BottomSheet";
import { CheckBubble } from "../../components/CheckBubble";
import { GroupLabel } from "../../components/GroupLabel";
import { toast } from "../../components/toast";
import { useNavigator } from "../../router";
import {
  skillModeOf,
  useCapabilityPreferences,
  useLibraryPreferences,
  type SkillMode,
} from "../../services/aiChat/capabilityPreferences";
import { GroupCard, GroupNote, GroupRow } from "../settings/components/ui";
import { useSkillCatalog, useSkillDocument } from "./data";
import { SkillIcon } from "./SkillsPage";
import { CapabilityPage } from "./ui";

const MODES: SkillMode[] = ["auto", "manual", "off"];

export function SkillDetailPage(props: { skillId: string }) {
  const { t } = useSkillsI18n();
  const navigator = useNavigator();
  const { databaseName, query, items } = useSkillCatalog();
  const item = items.find(value => value.skill.id === props.skillId);
  const preferences = useLibraryPreferences(databaseName);
  const setSkillMode = useCapabilityPreferences(state => state.setSkillMode);
  const document = useSkillDocument(databaseName, props.skillId);
  const isDark = useThemeStore(state => state.mode === "dark");
  const [picking, setPicking] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (!item) {
    return (
      <CapabilityPage title="Skill">
        <p className="text-ink-3 text-tau-meta px-8 py-16 text-center">
          {query.isPending ? t("detail.loading") : t("detail.unavailable")}
        </p>
      </CapabilityPage>
    );
  }
  const { skill } = item;
  const mode = skillModeOf(preferences, skill);
  const tokens = Math.ceil((skill.name.length + skill.description.length) / 1.6);

  return (
    <CapabilityPage>
      <div className="flex items-center gap-3 px-1 pt-1 pb-1">
        <SkillIcon kind={item.kind} large />
        <span className="min-w-0 flex-1">
          <span className="text-ink-1 block truncate text-[19px] font-extrabold">{skill.name}</span>
          <span className="text-ink-3 text-tau-sm block truncate">
            {item.sourceName ? `${item.sourceName} · ` : ""}
            {t(`kind.${item.kind}`)}
          </span>
        </span>
      </div>
      <p className="text-ink-2 text-tau-sm px-1 leading-relaxed">{skill.description}</p>

      <GroupLabel>{t("mode.title")}</GroupLabel>
      <GroupCard>
        <GroupRow onClick={() => setPicking(true)}>
          <span className="min-w-0 flex-1">
            <span className="text-ink-1 text-tau-body block font-medium">
              {t(`mode.${mode}.label`)}
            </span>
          </span>
          <ChevronRight size={16} className="text-ink-3 shrink-0" aria-hidden="true" />
        </GroupRow>
      </GroupCard>
      {mode === "auto" && <GroupNote>{t("mode.tokens", { tokens })}</GroupNote>}

      <GroupLabel>{t("body.title")}</GroupLabel>
      <div className="bg-surface relative overflow-hidden rounded-2xl px-3.5 py-3">
        {document.isPending && <p className="text-ink-3 text-tau-sm py-2">{t("body.loading")}</p>}
        {document.isError && (
          <p className="text-ink-3 text-tau-sm py-2">
            {t("body.failed")}
            <button
              type="button"
              className="text-accent-text ml-3"
              onClick={() => void document.refetch()}
            >
              {t("retry")}
            </button>
          </p>
        )}
        {document.data && (
          <div className={expanded ? undefined : "max-h-[220px] overflow-hidden"}>
            <MarkdownRenderer content={document.data.instructions} isDark={isDark} />
          </div>
        )}
        {document.data && !expanded && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-b from-transparent to-[var(--tau-bg-surface)]" />
        )}
      </div>
      {document.data && (
        <button
          type="button"
          className="text-accent-text text-tau-sm w-full py-2 text-center font-semibold"
          onClick={() => setExpanded(value => !value)}
        >
          {expanded ? t("body.collapse") : t("body.expand")}
        </button>
      )}
      {item.kind === "skills" && <GroupNote>{t("body.scriptsHint")}</GroupNote>}

      {item.kind !== "internal" && (
        <>
          <GroupLabel>{t("source.title")}</GroupLabel>
          <GroupCard>
            <GroupRow onClick={() => navigator.push("pluginDetail", { pluginId: skill.sourceId })}>
              <span className="min-w-0 flex-1">
                <span className="text-ink-1 text-tau-body block font-medium">
                  {item.sourceName ?? skill.sourceId}
                </span>
                <span className="text-ink-3 text-tau-sm block">{t("source.manage")}</span>
              </span>
              <ExternalLink size={15} className="text-ink-3 shrink-0" aria-hidden="true" />
            </GroupRow>
          </GroupCard>
        </>
      )}

      <BottomSheet open={picking} title={t("mode.title")} onClose={() => setPicking(false)}>
        <div className="space-y-2 px-4 pb-5">
          {MODES.map(option => (
            <button
              key={option}
              type="button"
              aria-pressed={option === mode}
              className={`bg-surface flex w-full items-start gap-3 rounded-2xl border-[1.5px] px-3.5 py-3 text-left ${
                option === mode ? "border-accent" : "border-transparent"
              }`}
              onClick={() => {
                setSkillMode(databaseName, skill, option);
                setPicking(false);
                if (option !== mode)
                  toast.success(
                    skillsTranslator.t("mode.changed", {
                      mode: skillsTranslator.t(`mode.${option}.label`),
                    })
                  );
              }}
            >
              <span className="min-w-0 flex-1">
                <span className="text-ink-1 text-tau-body block font-semibold">
                  {t(`mode.${option}.label`)}
                </span>
                <span className="text-ink-3 text-tau-sm mt-0.5 block leading-relaxed">
                  {t(`mode.${option}.desc`)}
                </span>
              </span>
              {option === mode ? (
                <CheckBubble />
              ) : (
                <span className="border-line-1 h-[22px] w-[22px] shrink-0 rounded-full border-[1.5px]" />
              )}
            </button>
          ))}
          <p className="text-ink-3 text-tau-sm px-1 pt-1">{t("mode.localHint")}</p>
        </div>
      </BottomSheet>
    </CapabilityPage>
  );
}
