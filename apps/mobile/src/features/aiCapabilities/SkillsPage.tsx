// Skill 管理：按来源（内置 / 插件提供 / Skill 包）分组，行尾开关管启用与停用，
// 细分自动与仅手动进详情。新建与编辑留在桌面端。

import { useState } from "react";
import { BookOpen, CircleAlert, Package, Puzzle, WandSparkles } from "lucide-react";
import { GroupLabel } from "../../components/GroupLabel";
import { useNavigator } from "../../router";
import {
  skillModeOf,
  useCapabilityPreferences,
  useLibraryPreferences,
  type SkillMode,
} from "../../services/aiChat/capabilityPreferences";
import { GroupCard, GroupNote, GroupRow, SwitchButton } from "../settings/components/ui";
import { useSkillCatalog, type SkillItem, type SkillSourceKind } from "./data";
import { Banner, CapabilityPage, Pill, Tag, Tile, TitleLine } from "./ui";

const SECTIONS: { kind: SkillSourceKind; label: string; hint: string }[] = [
  { kind: "internal", label: "内置", hint: "随应用更新" },
  { kind: "plugin", label: "插件提供", hint: "随插件启停" },
  { kind: "skills", label: "Skill 包", hint: "从插件中心安装" },
];

type Filter = "all" | "enabled" | "manual";

export function SkillIcon(props: { kind: SkillSourceKind; large?: boolean }) {
  const size = props.large ? 22 : 16;
  if (props.kind === "plugin")
    return (
      <Tile tone="lilac" large={props.large}>
        <Puzzle size={size} aria-hidden="true" />
      </Tile>
    );
  if (props.kind === "skills")
    return (
      <Tile tone="sky" large={props.large}>
        <Package size={size} aria-hidden="true" />
      </Tile>
    );
  return (
    <Tile tone="accent" large={props.large}>
      <WandSparkles size={size} aria-hidden="true" />
    </Tile>
  );
}

export function SkillsPage(props: { sourceId?: string }) {
  const navigator = useNavigator();
  const { databaseName, query, items, sourceError, retrySources } = useSkillCatalog();
  const preferences = useLibraryPreferences(databaseName);
  const setSkillMode = useCapabilityPreferences(state => state.setSkillMode);
  const [filter, setFilter] = useState<Filter>("all");
  const scoped = props.sourceId
    ? items.filter(item => item.skill.sourceId === props.sourceId)
    : items;
  const modeOf = (item: SkillItem) => skillModeOf(preferences, item.skill);
  const visible = scoped.filter(item =>
    filter === "enabled"
      ? modeOf(item) !== "off"
      : filter === "manual"
        ? modeOf(item) === "manual"
        : true
  );
  const count = (predicate: (mode: SkillMode) => boolean) =>
    scoped.filter(item => predicate(modeOf(item))).length;

  const toggle = (item: SkillItem) => {
    const mode = modeOf(item);
    const restored = item.skill.disableModelInvocation ? "manual" : "auto";
    setSkillMode(databaseName, item.skill, mode === "off" ? restored : "off");
  };

  return (
    <CapabilityPage
      title={scoped[0] && props.sourceId ? (scoped[0].sourceName ?? "Skill") : "Skill"}
    >
      {scoped.length > 0 && (
        <div className="flex gap-2 px-1 pt-2">
          <Pill
            active={filter === "all"}
            onClick={() => setFilter("all")}
            label="全部"
            count={scoped.length}
          />
          <Pill
            active={filter === "enabled"}
            onClick={() => setFilter("enabled")}
            label="已启用"
            count={count(mode => mode !== "off")}
          />
          <Pill
            active={filter === "manual"}
            onClick={() => setFilter("manual")}
            label="仅手动"
            count={count(mode => mode === "manual")}
          />
        </div>
      )}
      {sourceError && (
        <Banner
          tone="error"
          icon={<CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />}
          title="插件 Skill 读取失败"
          action={{ label: "重试", onClick: retrySources }}
        >
          {sourceError.message}
        </Banner>
      )}
      {query.isPending && (
        <p className="text-ink-3 text-tau-sm py-8 text-center">正在读取 Skill…</p>
      )}
      {query.isError && (
        <Banner
          tone="error"
          icon={<CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />}
          title="Skill 读取失败"
          action={{ label: "重试", onClick: () => void query.refetch() }}
        />
      )}
      {SECTIONS.map(section => {
        const rows = visible.filter(item => item.kind === section.kind);
        if (!rows.length) return null;
        return (
          <div key={section.kind}>
            <GroupLabel>
              {section.label}
              <span className="text-ink-3 ml-2">{section.hint}</span>
            </GroupLabel>
            <GroupCard>
              {rows.map(item => {
                const mode = modeOf(item);
                return (
                  <GroupRow
                    key={item.skill.id}
                    className="items-start"
                    onClick={() => navigator.push("aiSkillDetail", { skillId: item.skill.id })}
                  >
                    <span className={mode === "off" ? "opacity-50" : undefined}>
                      <SkillIcon kind={item.kind} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={mode === "off" ? "opacity-60" : undefined}>
                        <TitleLine
                          title={item.skill.name}
                          tags={mode === "manual" ? <Tag tone="sky">仅手动</Tag> : null}
                        />
                      </span>
                      <span className="text-ink-3 text-tau-sm mt-0.5 line-clamp-2 block">
                        {mode === "off" ? "已停用 · " : ""}
                        {item.sourceName ? `${item.sourceName} · ` : ""}
                        {item.skill.description}
                      </span>
                    </span>
                    <span className="mt-1 shrink-0" onClick={event => event.stopPropagation()}>
                      <SwitchButton checked={mode !== "off"} onChange={() => toggle(item)} />
                    </span>
                  </GroupRow>
                );
              })}
            </GroupCard>
          </div>
        );
      })}
      {query.isSuccess && !scoped.length && (
        <div className="text-ink-3 text-tau-sm px-8 py-14 text-center leading-relaxed">
          <span className="bg-surface text-ink-2 mx-auto mb-3 grid h-11 w-11 place-items-center rounded-[14px]">
            <BookOpen size={20} aria-hidden="true" />
          </span>
          <b className="text-ink-1 text-tau-body mb-1 block">还没有 Skill</b>
          插件中心里有现成的 Skill 包，安装后会出现在这里。
        </div>
      )}
      {query.isSuccess && scoped.length > 0 && !visible.length && (
        <p className="text-ink-3 text-tau-sm py-8 text-center">没有符合筛选的 Skill</p>
      )}
      {scoped.length > 0 && (
        <GroupNote className="pt-3">
          关闭后 AI 不会使用它，「选择 Skill」里也不再显示。只在这台手机上生效。
        </GroupNote>
      )}
    </CapabilityPage>
  );
}
