import { useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AiSkillDescriptor } from "@tau/ai/skills";
import { useMobilePlugins } from "../../app/plugins/context";
import { BottomSheet } from "../../components/BottomSheet";
import { CheckBubble } from "../../components/CheckBubble";
import { listChatSkills } from "../../services/aiChat/chatController";
import { useLibraryPreferences } from "../../services/aiChat/capabilityPreferences";
import { getNavigator } from "../../router";

const subscribeEmpty = () => () => undefined;
const emptySnapshot = () => 0;

export function SkillPickerSheet(props: {
  databaseName: string;
  selected: readonly AiSkillDescriptor[];
  onChange(skills: AiSkillDescriptor[]): void;
  onClose(): void;
}) {
  const runtime = useMobilePlugins();
  const sources = runtime?.aiSkills;
  const revision = useSyncExternalStore(
    sources?.subscribe ?? subscribeEmpty,
    sources ? () => sources.getSnapshot().revision : emptySnapshot,
    emptySnapshot
  );
  // 偏好变化后目录要跟着变：停用的 Skill 从这里消失
  const preferences = useLibraryPreferences(props.databaseName);
  const query = useQuery({
    queryKey: ["ai-chat-skills", props.databaseName, revision, preferences.skills],
    queryFn: ({ signal }) => listChatSkills(props.databaseName, signal),
    gcTime: 0,
    refetchOnWindowFocus: true,
  });
  const selectedIds = new Set(props.selected.map(skill => skill.id));
  return (
    <BottomSheet open title="选择 Skill" onClose={props.onClose}>
      <div className="px-5 pb-5">
        <p className="text-ink-3 text-tau-sm mb-3">选择的 Skill 用于下一条消息，发送后清空。</p>
        {query.isPending && <p className="text-ink-3 text-tau-sm py-4">正在读取 Skill…</p>}
        {query.isError && (
          <div role="alert" className="text-ink-2 text-tau-sm py-4">
            Skill 读取失败
            <button
              type="button"
              className="text-accent-text ml-3"
              onClick={() => void query.refetch()}
            >
              重试
            </button>
          </div>
        )}
        {query.data?.length === 0 && (
          <p className="text-ink-3 text-tau-sm py-4 text-center">
            没有可用的 Skill。停用的 Skill 可以在 Skill 管理里重新启用。
          </p>
        )}
        {query.data?.map(skill => (
          <button
            key={skill.id}
            type="button"
            aria-pressed={selectedIds.has(skill.id)}
            className="active:bg-hover flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left"
            onClick={() =>
              props.onChange(
                selectedIds.has(skill.id)
                  ? props.selected.filter(item => item.id !== skill.id)
                  : [...props.selected, skill]
              )
            }
          >
            <span className="min-w-0 flex-1">
              <span className="text-ink-1 text-tau-body block font-semibold">{skill.name}</span>
              <span className="text-ink-3 text-tau-sm mt-1 line-clamp-2 block">
                {skill.description}
              </span>
              {skill.disableModelInvocation && (
                <span className="text-ink-3 text-tau-meta mt-1 block">仅手动调用</span>
              )}
            </span>
            {selectedIds.has(skill.id) && <CheckBubble />}
          </button>
        ))}
        <button
          type="button"
          className="bg-accent text-ink-inverse text-tau-body mt-3 w-full rounded-2xl py-3 font-semibold"
          onClick={props.onClose}
        >
          完成
        </button>
        <button
          type="button"
          className="text-accent-text text-tau-sm mt-2 w-full py-2 font-semibold"
          onClick={() => {
            props.onClose();
            getNavigator().push("aiSkills", {});
          }}
        >
          管理 Skill
        </button>
      </div>
    </BottomSheet>
  );
}
