/**
 * 图片生成 —— 配置单选列表：左侧圆点决定 AI 对话生图、改图使用哪个配置，点行在行内展开编辑
 * （名称 + 插件提供的连接表单），一次只展开一项；末行「添加配置」从已启用的图片插件中选择。
 * 没有使用中的配置时，新添加的配置直接接任；删除使用中的配置后改用下一个已选模型的配置。
 */

import { useId, useState } from "react";
import { produce } from "immer";
import { copyJson } from "@tau/plugins/host";
import { Check, ChevronRight, Image as ImageIcon, Plus, Trash2 } from "lucide-react";
import { Button, ConfirmDialog, Input, Menu, Radio, SettingRow, cn } from "@tau/ui";
import useSettingStore from "@/stores/useSettingStore";
import { useDesktopPlugins } from "@/app/plugins/context";
import type { RegisteredPluginSettings } from "@/app/plugins/runtime";
import { savePluginImagesConfig } from "@/commands/plugin-images";
import { PluginSettingsView } from "@/features/plugins/views/PluginSettingsView";
import { useImageCapabilities } from "@/services/image-capabilities";
import type { ImageGenerationStoreShape, ImageProviderConfig } from "@/types/imageGeneration";
import { SettingsGroup } from "../components/SettingsGroup";

/** 列表项之间的分隔线；占 1px 高度，相邻项的悬停底色不会连成一片 */
const ITEM_DIVIDER =
  "[&+&]:pt-px [&+&]:before:border-line-2 [&+&]:before:absolute [&+&]:before:inset-x-3 [&+&]:before:top-0 [&+&]:before:border-t";
/** 展开区左缘对齐插件图标列：行内边距 12px + 圆点命中区 24px + 间距 12px */
const BODY_INSET = "ml-12 mr-2.5";

export function ImageGenerationSection() {
  const { providers, currentProviderId } = useSettingStore(state => state.setting.imageGeneration);
  const runtime = useDesktopPlugins();
  const sections =
    runtime?.listSettings().filter(item => item.definition.target === "images") ?? [];
  const [expandedId, setExpandedId] = useState("");
  const [deleting, setDeleting] = useState<ImageProviderConfig>();
  const radioName = useId();

  const mutate = (update: (draft: ImageGenerationStoreShape) => void) => {
    useSettingStore.setState(state => ({
      setting: produce(state.setting, draft => update(draft.imageGeneration)),
    }));
  };
  const updateProvider = (id: string, update: (target: ImageProviderConfig) => void) =>
    mutate(draft => {
      const target = draft.providers.find(item => item.id === id);
      if (target) update(target);
    });
  const selectProvider = (id: string) =>
    mutate(draft => {
      draft.currentProviderId = id;
    });

  const addProvider = (section: RegisteredPluginSettings) => {
    const { pluginId } = section.context;
    const id = crypto.randomUUID();
    const count = providers.filter(item => item.pluginId === pluginId).length;
    const name = count ? `${section.definition.title} ${count + 1}` : section.definition.title;
    mutate(draft => {
      draft.providers.push({ id, name, pluginId, modelId: "", config: {} });
      if (!draft.providers.some(item => item.id === draft.currentProviderId)) {
        draft.currentProviderId = id;
      }
    });
    setExpandedId(id);
  };

  const fallback = deleting && providers.find(item => item.id !== deleting.id && item.modelId);
  const confirmDelete = () => {
    if (!deleting) return;
    const id = deleting.id;
    mutate(draft => {
      draft.providers = draft.providers.filter(item => item.id !== id);
      if (draft.currentProviderId === id) {
        draft.currentProviderId = draft.providers.find(item => item.modelId)?.id ?? "";
      }
    });
    setDeleting(undefined);
  };

  return (
    <>
      <SettingsGroup>
        {providers.length === 0 ? (
          <EmptyState sections={sections} onAdd={addProvider} />
        ) : (
          <>
            {providers.map(provider => (
              <ProviderItem
                key={provider.id}
                provider={provider}
                section={sections.find(item => item.context.pluginId === provider.pluginId)}
                radioName={radioName}
                isCurrent={provider.id === currentProviderId}
                expanded={provider.id === expandedId}
                onToggle={() => setExpandedId(id => (id === provider.id ? "" : provider.id))}
                onUse={() => selectProvider(provider.id)}
                onUpdate={update => updateProvider(provider.id, update)}
                onDelete={() => setDeleting(provider)}
              />
            ))}
            {sections.length > 0 && <AddProviderMenu sections={sections} onAdd={addProvider} />}
          </>
        )}
      </SettingsGroup>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={open => !open && setDeleting(undefined)}
        title="删除图片生成配置"
        context={deleting?.name}
        description="此操作会移除该配置及其插件设置。"
        impact={
          deleting?.id === currentProviderId
            ? fallback
              ? `它正在使用，删除后改用「${fallback.name}」`
              : "它正在使用，删除后图片生成不可用，直到选择新的配置"
            : undefined
        }
        danger
        confirmText="删除"
        onConfirm={confirmDelete}
      />
    </>
  );
}

function ProviderItem({
  provider,
  section,
  radioName,
  isCurrent,
  expanded,
  onToggle,
  onUse,
  onUpdate,
  onDelete,
}: {
  provider: ImageProviderConfig;
  section?: RegisteredPluginSettings;
  radioName: string;
  isCurrent: boolean;
  expanded: boolean;
  onToggle(): void;
  onUse(): void;
  onUpdate(update: (target: ImageProviderConfig) => void): void;
  onDelete(): void;
}) {
  const capabilityError = useImageCapabilities(state => state.error);
  const name = provider.name || "未命名";
  return (
    <div className={cn("relative", ITEM_DIVIDER)}>
      <div className="rounded-tau-sm hover:bg-hover flex items-center gap-3 px-3">
        <Radio
          name={radioName}
          value={provider.id}
          checked={isCurrent}
          onChange={onUse}
          aria-label={`使用「${name}」`}
        />
        <button
          type="button"
          aria-expanded={expanded}
          onClick={onToggle}
          className="flex min-h-[60px] min-w-0 flex-1 items-center gap-3 py-2.5 text-left"
        >
          <span className="bg-hover border-line-1 text-ink-1 grid size-8 flex-none place-items-center rounded-[9px] border">
            <ImageIcon size={15} strokeWidth={1.75} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-tau-body-lg text-ink-1 flex items-center gap-2 font-medium">
              <span className="truncate">{name}</span>
              {isCurrent && (
                <span className="bg-accent-soft text-accent-text text-tau-sm flex-none rounded-full px-2 font-medium">
                  使用中
                </span>
              )}
            </span>
            <span className="text-tau-meta text-ink-2 flex min-w-0 items-center gap-1.5">
              <span className="truncate">{section?.definition.title ?? provider.pluginId}</span>
              {provider.modelId && (
                <>
                  <span>·</span>
                  <span className="font-tau-mono truncate">{provider.modelId}</span>
                </>
              )}
            </span>
          </span>
          <ProviderStatus provider={provider} section={section} isCurrent={isCurrent} />
          <ChevronRight
            size={14}
            strokeWidth={1.75}
            className={cn(
              "text-ink-3 ease-tau-out flex-none transition-transform duration-150",
              expanded && "rotate-90"
            )}
          />
        </button>
      </div>

      {expanded && (
        <div className="pb-3.5">
          <div
            className={cn("bg-surface border-line-1 rounded-tau-md mt-2.5 border p-1", BODY_INSET)}
          >
            <SettingRow title="名称">
              <Input
                wrapperClassName="w-[300px] max-w-full"
                value={provider.name}
                placeholder="配置名称"
                onChange={event => {
                  const value = event.target.value;
                  onUpdate(target => {
                    target.name = value;
                  });
                }}
              />
            </SettingRow>
            <PluginSettingsView
              section={section}
              embedded
              imageConfig={{
                instanceId: provider.id,
                value: copyJson(provider.config),
                modelId: provider.modelId,
                save: async (config, modelId) => {
                  await savePluginImagesConfig(provider.id, provider.pluginId, config, modelId);
                  onUpdate(target => {
                    if (target.pluginId !== provider.pluginId) return;
                    target.config = config;
                    target.modelId = modelId;
                  });
                },
              }}
            />
          </div>
          {isCurrent && capabilityError && (
            <p className={cn("text-tau-meta text-warn mt-2", BODY_INSET)}>{capabilityError}</p>
          )}
          <div className={cn("mt-2.5 flex items-center justify-between", BODY_INSET)}>
            <Button
              variant="ghost"
              size="sm"
              icon={Trash2}
              className="text-danger hover:text-danger"
              onClick={onDelete}
            >
              删除配置
            </Button>
            {!isCurrent && (
              <Button size="sm" icon={Check} onClick={onUse}>
                使用此配置
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** 只展示宿主能如实判断的状态：插件是否可用、是否选了模型，以及使用中配置的实际能力 */
function ProviderStatus({
  provider,
  section,
  isCurrent,
}: {
  provider: ImageProviderConfig;
  section?: RegisteredPluginSettings;
  isCurrent: boolean;
}) {
  const { canGenerate, canEdit, error } = useImageCapabilities();
  let warning = "";
  if (!section) warning = "插件未启用";
  else if (!provider.modelId) warning = "未选择模型";
  else if (isCurrent && error) warning = "暂不可用";
  if (warning)
    return (
      <span className="text-tau-meta text-warn flex flex-none items-center gap-1.5">
        <span className="bg-warn size-1.5 rounded-full" />
        {warning}
      </span>
    );
  if (!isCurrent || !(canGenerate || canEdit)) return null;
  return (
    <span className="text-tau-meta text-ink-2 flex flex-none items-center gap-1.5">
      <span className="bg-ok size-1.5 rounded-full" />
      {[canGenerate && "可生成", canEdit && "可编辑"].filter(Boolean).join(" · ")}
    </span>
  );
}

function AddProviderMenu({
  sections,
  onAdd,
}: {
  sections: RegisteredPluginSettings[];
  onAdd(section: RegisteredPluginSettings): void;
}) {
  return (
    <div className={cn("relative", ITEM_DIVIDER)}>
      <Menu
        trigger={
          <button
            type="button"
            className="rounded-tau-sm hover:bg-hover text-accent-text flex h-12 w-full items-center gap-3 px-3 font-medium"
          >
            <span className="grid size-6 flex-none place-items-center">
              <Plus size={16} strokeWidth={1.75} />
            </span>
            添加配置
          </button>
        }
      >
        {sections.map(section => (
          <Menu.Item
            key={section.key}
            icon={<ImageIcon strokeWidth={1.75} />}
            onSelect={() => onAdd(section)}
          >
            {section.definition.title}
          </Menu.Item>
        ))}
      </Menu>
    </div>
  );
}

function EmptyState({
  sections,
  onAdd,
}: {
  sections: RegisteredPluginSettings[];
  onAdd(section: RegisteredPluginSettings): void;
}) {
  return (
    <div className="px-6 pb-7 pt-9 text-center">
      <div className="bg-accent-soft text-accent-text mx-auto mb-3 grid size-12 place-items-center rounded-[14px]">
        <ImageIcon size={22} strokeWidth={1.75} />
      </div>
      {sections.length === 0 ? (
        <>
          <p className="text-tau-body-lg text-ink-1 font-semibold">还没有可用的图片生成插件</p>
          <p className="text-tau-meta text-ink-2 mt-1">
            到插件中心安装并启用图片生成插件（如 OpenAI Images）后，就能在这里添加配置
          </p>
        </>
      ) : (
        <>
          <p className="text-tau-body-lg text-ink-1 font-semibold">添加第一个图片生成配置</p>
          <p className="text-tau-meta text-ink-2 mb-4 mt-1">
            选一个已启用的插件，填好连接信息后即可在对话里生成和编辑图片
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {sections.map(section => (
              <Button key={section.key} icon={Plus} onClick={() => onAdd(section)}>
                {section.definition.title}
              </Button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
