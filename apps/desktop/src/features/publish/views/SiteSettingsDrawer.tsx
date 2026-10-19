import clsx from "clsx";
import type { ReactNode } from "react";
import { Globe } from "lucide-react";
import { Button, Drawer, Input, Select } from "@tau/ui";
import LocalImage from "@/components/LocalImage";
import { EPublishProvider } from "@/stores/useSettingStore";
import type { PublishConfig } from "../usePublishConfig";
import { PluginSettingsView } from "@/features/plugins/views/PluginSettingsView";
import { openPage } from "@/services/page-navigation";

function Field({
  label,
  hint,
  full,
  children,
}: {
  label: string;
  hint?: string;
  full?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={clsx("flex min-w-0 flex-col gap-[5px]", full && "col-span-2")}>
      <span className="text-tau-sm text-ink-2 font-medium">
        {label}
        {hint && <small className="text-ink-3 ml-1.5 text-[11px] font-normal">{hint}</small>}
      </span>
      {children}
    </label>
  );
}

function SectionHead({ title, hint }: { title: string; hint?: string }) {
  return (
    <h4 className="mb-2.5 mt-4 flex items-baseline gap-2 text-[13px] font-semibold">
      {title}
      {hint && <small className="text-tau-micro text-ink-3 font-normal">{hint}</small>}
    </h4>
  );
}

export function SiteSettingsDrawer({
  open,
  onClose,
  config,
}: {
  open: boolean;
  onClose: () => void;
  config: PublishConfig;
}) {
  const { publish, active } = config;
  const selected = active === EPublishProvider.Local ? "local" : config.pluginId;
  const options = [
    { value: "local", label: "本地导出" },
    ...config.providers.map(item => ({ value: item.id, label: item.name })),
  ];
  if (selected && !options.some(item => item.value === selected))
    options.push({ value: selected, label: selected + "（不可用）" });
  return (
    <Drawer
      open={open}
      onOpenChange={next => !next && onClose()}
      title="站点设置"
      width={460}
      footer={
        <Button variant="secondary" size="sm" onClick={onClose}>
          完成
        </Button>
      }
    >
      <SectionHead title="发布目标" />
      <Select
        aria-label="发布目标"
        value={selected}
        options={options}
        onValueChange={config.setProvider}
      />
      {active === EPublishProvider.Local ? (
        <div className="mt-3">
          <Field label="访问路径">
            <Input
              aria-label="访问路径"
              value={publish.local.basePath}
              onChange={event => config.setLocalBasePath(event.target.value)}
            />
          </Field>
          <p className="text-tau-meta text-ink-3 mt-2">导出时选择输出文件夹，生成完整静态站点。</p>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <PluginSettingsView
            section={config.section}
            publishConfig={{ value: config.providerConfig, save: config.saveConfig }}
          />
          {config.targetError && <p className="text-danger text-tau-sm">{config.targetError}</p>}
          <Button
            size="sm"
            variant="secondary"
            loading={config.connection === "checking"}
            onClick={() => void config.checkConnection()}
          >
            测试连接
          </Button>
          {config.connection === "ok" && (
            <span className="text-ok text-tau-meta ml-2">连接正常</span>
          )}
          {config.connection === "fail" && (
            <span className="text-danger text-tau-meta ml-2">连接失败</span>
          )}
        </div>
      )}
      <Button
        className="mt-3"
        variant="ghost"
        size="sm"
        onClick={() => {
          onClose();
          openPage("plugins", { tab: "installed" });
        }}
      >
        管理发布插件
      </Button>
      <SectionHead title="博客模板" />
      <Field label="模板插件" hint="从已安装的模板中选择" full>
        <Select
          aria-label="博客模板"
          value={publish.site.templateId ?? ""}
          options={config.templateOptions}
          placeholder="请先安装模板插件"
          onValueChange={value => config.setSiteField("templateId", value)}
        />
      </Field>
      {config.templateError && (
        <p className="text-danger text-tau-sm mt-2">{config.templateError}</p>
      )}
      <SectionHead title="站点信息" hint="提供给模板的数据" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="站点标题">
          <Input
            value={publish.site.title}
            placeholder="我的博客"
            onChange={e => config.setSiteField("title", e.target.value)}
          />
        </Field>
        <Field label="公开 URL" hint="用于打开已发布站点">
          <Input
            className="font-tau-mono"
            value={publish.site.publicUrl}
            placeholder="https://example.com"
            onChange={e => config.setSiteField("publicUrl", e.target.value)}
          />
        </Field>
        <Field label="站点描述" full>
          <Input
            value={publish.site.description}
            placeholder="记录学习与思考"
            onChange={e => config.setSiteField("description", e.target.value)}
          />
        </Field>
      </div>
      <div className="border-line-1 mt-3 flex items-center gap-3 rounded-[10px] border px-3 py-2.5">
        <span className="bg-hover text-ink-3 grid size-9 flex-none place-items-center overflow-hidden rounded-[10px]">
          {publish.site.favicon ? (
            <LocalImage
              url={publish.site.favicon.cachePath}
              alt={publish.site.favicon.fileName}
              className="size-5 object-contain"
            />
          ) : (
            <Globe size={18} strokeWidth={1.75} />
          )}
        </span>
        <div className="text-tau-meta min-w-0 flex-1">
          <div className="truncate">{publish.site.favicon?.fileName ?? "默认 favicon"}</div>
          <small className="text-ink-3 block text-[11px]">
            SVG / PNG / ICO，缓存到本地自动复用
          </small>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void config.selectFavicon()}>
          {publish.site.favicon ? "重新选择" : "选择文件"}
        </Button>
        {publish.site.favicon && (
          <Button variant="ghost" size="sm" onClick={() => void config.clearFavicon()}>
            清除
          </Button>
        )}
      </div>
    </Drawer>
  );
}
