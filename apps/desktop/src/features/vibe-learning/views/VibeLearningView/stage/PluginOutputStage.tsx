/**
 * 阅读区 · 插件产物：宿主画标题栏（对话开关、关闭、生成过程入口），正文交给插件注册的 view。
 * 插件停用后找不到对应的输出，显示说明而不是空白。
 */

import { Sparkles } from "lucide-react";
import { Button, FadeScroll } from "@tau/ui";
import type { PluginEntityRecord } from "@/types/plugin-entities";
import { toEntity } from "@/app/plugins/entities";
import {
  PluginNotebookSlot,
  notebookOutputIcon,
  useNotebookOutputFor,
} from "@/app/plugins/notebook-outputs";
import { StageHeader } from "@/components/StageHeader";

interface PluginOutputStageProps {
  entity: PluginEntityRecord;
  notebook: { id: number; title: string };
  chatOpen: boolean;
  onToggleChat: () => void;
  onClose: () => void;
  onShowTrace?: () => void;
}

export function PluginOutputStage({
  entity,
  notebook,
  chatOpen,
  onToggleChat,
  onClose,
  onShowTrace,
}: PluginOutputStageProps) {
  const output = useNotebookOutputFor(entity.pluginId, entity.kind);
  const Icon = notebookOutputIcon(output);
  const View = output?.definition.view;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <StageHeader
        icon={<Icon className="size-4" strokeWidth={1.75} />}
        title={entity.title || output?.definition.title || "插件产物"}
        meta={output?.definition.title}
        chatOpen={chatOpen}
        onToggleChat={onToggleChat}
        onClose={onClose}
        actions={
          onShowTrace && (
            <Button variant="ghost" size="sm" icon={Sparkles} onClick={onShowTrace}>
              生成过程
            </Button>
          )
        }
      />
      <FadeScroll className="min-h-0 flex-1">
        {output && View ? (
          <PluginNotebookSlot output={output} resetKeys={[entity.id]}>
            <View
              context={output.context}
              entity={toEntity(entity)}
              notebook={{ id: String(notebook.id), title: notebook.title }}
            />
          </PluginNotebookSlot>
        ) : (
          <p className="text-tau-meta text-ink-3 m-0 px-10 py-10 text-center">
            生成它的插件已停用，启用后可以在这里查看
          </p>
        )}
      </FadeScroll>
    </div>
  );
}
