import { EntityPicker } from "@/components/EntityPicker";
import { PICKER_KINDS, pickedEntity, usePluginPickerUi } from "@/app/plugins/app";
import type { PluginPickedEntity } from "@tau/plugins";

/** 插件 context.app.pick 的选择弹窗（壳层挂载）：复用「关联已有」的检索弹窗，关闭即返回空选择 */
export function PluginEntityPickerHost() {
  const request = usePluginPickerUi(state => state.request);
  return (
    <EntityPicker
      key={request?.id}
      open={Boolean(request)}
      onClose={() => request?.settle([])}
      title={request?.options.title ?? ""}
      subtitle={request ? `供「${request.plugin.name}」关联` : undefined}
      kinds={request ? request.options.kinds.flatMap(kind => PICKER_KINDS[kind]) : ["card"]}
      multiple={request?.options.multiple ?? false}
      confirmLabel="选择"
      onConfirm={picked =>
        request?.settle(
          picked.map(pickedEntity).filter((item): item is PluginPickedEntity => item !== null)
        )
      }
    />
  );
}
