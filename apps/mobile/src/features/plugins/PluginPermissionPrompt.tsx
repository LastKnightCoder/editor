import { useNavigator, useRouterContext } from "../../router";
import { useSyncExternalStore, useState, useEffect, useRef } from "react";
import type { PluginPermissionBroker, PermissionDecision } from "@tau/plugins/permission-host";
import { describeCenterPermissions } from "@tau/plugins/center";
import { ActionSheet } from "../../components/ActionSheet";
import { toast } from "../../components/toast";

export function PluginPermissionPrompt({ broker }: { broker: PluginPermissionBroker }) {
  useSyncExternalStore(broker.subscribe, broker.getSnapshot);
  const prompt = broker.prompts[0];
  const [answered, setAnswered] = useState<number | null>(null);
  const navigator = useNavigator();
  const router = useRouterContext();
  const promptId = prompt?.id;
  const latest = useRef<() => void>(() => undefined);
  const entry = navigator.getTopOverlay() ?? navigator.getActiveScreen();
  const entryId = entry?.id;
  useEffect(() => {
    if (!promptId || !entryId) return;
    return navigator.registerBackHandler(
      entryId,
      () => {
        latest.current();
        return true;
      },
      { blockEdgeBack: true }
    );
  }, [navigator, promptId, entryId, router]);
  if (!prompt) return null;
  const decide = (decision: PermissionDecision) => {
    if (answered === prompt.id) return;
    setAnswered(prompt.id);
    void prompt.decide(decision).catch(error => toast.error(String(error)));
  };
  latest.current = () => decide("deny");
  return (
    <ActionSheet
      backDismiss={false}
      key={prompt.id}
      open
      title={`允许「${prompt.plugin.name}」访问笔记？`}
      subtitle={`${describeCenterPermissions([...prompt.permissions])
        .map(item => item.label)
        .join("、")}。插件可将获得的数据发送到网络。`}
      items={[
        { label: "仅这次", desc: "本次插件运行期间允许", onClick: () => decide("once") },
        {
          label: "始终允许",
          desc: "仅此设备和笔记库，可在插件详情撤销",
          onClick: () => decide("always"),
        },
        { label: "拒绝", onClick: () => decide("deny") },
      ]}
      onClose={() => decide("deny")}
    />
  );
}
