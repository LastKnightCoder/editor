/**
 * `$` Skill 选择面板：与 @ 面板同一套 ComposerPanel，从输入框上沿向上展开、同宽。
 * 列出启用中的 Skill（仅手动的也在，点名就是它的用法）；按名称 / 标识 / 描述过滤。
 */

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { ReactEditor } from "slate-react";
import { Sparkles } from "lucide-react";
import {
  COMPOSER_ANCHOR_ATTR,
  ComposerPanel,
  ComposerPanelFooter,
  ComposerPanelItem,
} from "@tau/shared";
import useSkillStore, {
  dedupeSkills,
  getSkillInvocation,
  isSkillEnabled,
} from "@/stores/useSkillStore";
import { selectSkill, useSkillPickerStore, type SkillPickerItem } from "./store";

const GAP = 8;
const MAX_ITEMS = 8;

export function SkillPickerPanel({ composerRef }: { composerRef: RefObject<HTMLElement | null> }) {
  const editor = useSkillPickerStore(s => s.editor);
  const query = useSkillPickerStore(s => s.query);
  const activeIndex = useSkillPickerStore(s => s.activeIndex);
  const skills = useSkillStore(s => s.skills);
  const preferences = useSkillStore(s => s.preferences);
  const loaded = useSkillStore(s => s.loaded);
  const [style, setStyle] = useState<CSSProperties>({});

  // 面板只属于包含该编辑器的输入框
  const mine = useMemo(() => {
    if (!editor || !composerRef.current) return false;
    try {
      return composerRef.current.contains(ReactEditor.toDOMNode(editor as ReactEditor, editor));
    } catch {
      return false;
    }
  }, [editor, composerRef]);

  useEffect(() => {
    if (mine && !loaded) void useSkillStore.getState().loadSkills();
  }, [mine, loaded]);

  const items = useMemo<SkillPickerItem[]>(() => {
    const q = query.trim().toLowerCase();
    return dedupeSkills(skills)
      .filter(skill => isSkillEnabled(skill, preferences))
      .filter(
        skill =>
          !q ||
          skill.name.toLowerCase().includes(q) ||
          skill.folderName.toLowerCase().includes(q) ||
          skill.description.toLowerCase().includes(q)
      )
      .slice(0, MAX_ITEMS)
      .map(skill => ({
        folderName: skill.folderName,
        name: skill.name,
        description: skill.description,
        manual: getSkillInvocation(skill, preferences) === "manual",
      }));
  }, [skills, preferences, query]);

  useEffect(() => {
    if (mine) useSkillPickerStore.setState({ items });
  }, [mine, items]);

  useLayoutEffect(() => {
    if (!mine || !composerRef.current) return;
    // 贴输入框外框（带锚点标记的祖先）上沿，没有则贴输入区自身
    const anchor =
      composerRef.current.closest<HTMLElement>(`[${COMPOSER_ANCHOR_ATTR}]`) ?? composerRef.current;
    const rect = anchor.getBoundingClientRect();
    setStyle({
      left: rect.left,
      width: rect.width,
      bottom: window.innerHeight - rect.top + GAP,
      maxHeight: Math.max(160, rect.top - GAP * 2),
    });
  }, [mine, composerRef, items.length]);

  if (!mine) return null;

  return createPortal(
    <ComposerPanel className="fixed z-[250] max-w-[calc(100vw-16px)]" style={style}>
      <div className="text-tau-body text-ink-1 flex items-center gap-2 px-3.5 pb-1 pt-3">
        <Sparkles size={15} strokeWidth={1.75} className="text-ink-3 shrink-0" />
        <span className="min-w-0 truncate">
          {query ? (
            <>
              $<span className="text-accent-text">{query}</span>
            </>
          ) : (
            <span className="text-ink-3">点名一个 Skill，本条消息按它的说明来做</span>
          )}
        </span>
      </div>
      {items.length === 0 ? (
        <div className="text-tau-sm text-ink-3 px-3.5 pb-4 pt-3">
          {loaded ? "没有匹配的 Skill" : "加载中…"}
        </div>
      ) : (
        <div role="listbox" className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5">
          {items.map((item, index) => (
            <ComposerPanelItem
              key={item.folderName}
              icon={<Sparkles />}
              label={item.name}
              description={item.description || item.folderName}
              active={index === activeIndex}
              trailing={
                item.manual ? (
                  <span className="bg-info-soft text-info text-tau-tiny ml-auto shrink-0 rounded-full px-1.5 leading-[18px]">
                    仅手动
                  </span>
                ) : undefined
              }
              onHover={() => useSkillPickerStore.setState({ activeIndex: index })}
              onSelect={() => selectSkill(item)}
            />
          ))}
        </div>
      )}
      <ComposerPanelFooter
        hints={[
          ["↑↓", "选择"],
          ["Enter", "点名"],
          ["Esc", "关闭"],
        ]}
      />
    </ComposerPanel>,
    document.body
  );
}
