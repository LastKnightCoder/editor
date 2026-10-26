import clsx from "clsx";
import { useEffect, useRef, type ReactNode } from "react";
import { ExternalLink, Globe } from "lucide-react";
import { Button, Drawer, Input, Select, Switch, Textarea } from "@tau/ui";
import type { SiteFieldValue, TemplateSiteField } from "@tau/plugins/template";
import LocalImage from "@/components/LocalImage";
import { EPublishProvider } from "@/stores/useSettingStore";
import type { ConnectionState, PublishConfig } from "../usePublishConfig";
import { PluginSettingsView } from "@/features/plugins/views/PluginSettingsView";
import { openPage } from "@/services/page-navigation";

/** 组内行：左标签 64px + 右控件，行间 line-2 分隔；发布插件的 form 由宿主以同一度量渲染（ProviderFormFields 的 inline 布局） */
function Row({
  label,
  top,
  children,
}: {
  label: string;
  /** 多行控件时标签顶对齐 */
  top?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={clsx(
        "border-line-2 grid min-h-[46px] grid-cols-[64px_minmax(0,1fr)] gap-3 border-t px-3 py-2 first:border-t-0",
        top ? "items-start" : "items-center"
      )}
    >
      <span className={clsx("text-tau-meta text-ink-2 break-words", top && "pt-1.5")}>{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function TemplateFieldRow({
  field,
  value,
  onChange,
}: {
  field: TemplateSiteField;
  value: SiteFieldValue | undefined;
  onChange: (value: SiteFieldValue) => void;
}) {
  const text = typeof value === "string" ? value : "";
  const hint = field.description && (
    <p className="text-tau-tiny text-ink-3 mt-1">{field.description}</p>
  );
  if (field.type === "switch")
    return (
      <Row label={field.label}>
        <div className="flex items-center gap-3">
          <span className="text-tau-micro text-ink-3 min-w-0 flex-1">{field.description}</span>
          <Switch aria-label={field.label} checked={value === true} onCheckedChange={onChange} />
        </div>
      </Row>
    );
  if (field.type === "select")
    return (
      <Row label={field.label}>
        <Select
          aria-label={field.label}
          className="w-full"
          value={text}
          options={field.options}
          onValueChange={onChange}
        />
        {hint}
      </Row>
    );
  if (field.type === "textarea")
    return (
      <Row label={field.label} top>
        <Textarea
          aria-label={field.label}
          rows={3}
          value={text}
          placeholder={field.placeholder}
          onChange={event => onChange(event.target.value)}
        />
        {hint}
      </Row>
    );
  return (
    <Row label={field.label}>
      <Input
        aria-label={field.label}
        type={field.type === "url" ? "url" : "text"}
        className={clsx(field.type === "url" && "font-tau-mono")}
        value={text}
        placeholder={field.placeholder}
        onChange={event => onChange(event.target.value)}
      />
      {hint}
    </Row>
  );
}

function Group({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mt-4 first:mt-1">
      <div className="mb-[7px] flex items-baseline justify-between gap-3 px-0.5">
        <h4 className="text-tau-meta text-ink-1 font-semibold">{title}</h4>
        {action ?? (hint && <span className="text-tau-micro text-ink-3">{hint}</span>)}
      </div>
      <div className="border-line-1 rounded-tau-md border">{children}</div>
    </section>
  );
}

const CONNECTION_VIEW: Record<ConnectionState, { label: string; dot: string }> = {
  idle: { label: "未检测", dot: "bg-ink-3" },
  checking: { label: "检测中", dot: "bg-accent" },
  ok: { label: "已连接", dot: "bg-ok" },
  fail: { label: "连接失败", dot: "bg-danger" },
};

function ConnectionBar({ config }: { config: PublishConfig }) {
  const failed = config.connection === "fail" || Boolean(config.targetError);
  const state = config.targetError ? "fail" : config.connection;
  const view = CONNECTION_VIEW[state];
  const detail =
    config.targetError ||
    (config.connection === "fail" && (config.connectionMessage || "请检查凭证、仓库与分支")) ||
    [config.siteUrl, config.basePath].filter(Boolean).join(" · ");
  return (
    <div
      className={clsx(
        "border-line-2 flex items-center gap-2.5 rounded-t-[11px] border-b px-3 py-2",
        failed ? "bg-danger-soft" : "bg-surface-hover"
      )}
    >
      <span className="bg-surface text-tau-micro text-ink-2 inline-flex flex-none items-center gap-1.5 rounded-full px-2 py-px">
        <span className={clsx("size-1.5 rounded-full", view.dot)} />
        {view.label}
      </span>
      <span
        className={clsx(
          "text-tau-micro min-w-0 flex-1 truncate",
          failed ? "text-danger" : "text-ink-3 font-tau-mono"
        )}
        title={detail || undefined}
      >
        {detail}
      </span>
      <Button
        size="sm"
        variant="secondary"
        loading={config.connection === "checking"}
        onClick={() => void config.checkConnection()}
      >
        {failed ? "重试" : "测试连接"}
      </Button>
    </div>
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
  const isLocal = active === EPublishProvider.Local;
  const selected = isLocal ? "local" : config.pluginId;
  const options = [
    { value: "local", label: "本地导出" },
    ...config.providers.map(item => ({ value: item.id, label: item.name })),
  ];
  if (selected && !options.some(item => item.value === selected))
    options.push({ value: selected, label: selected + "（不可用）" });

  // 每次打开抽屉自动检测一次；之后改配置只回到「未检测」，由用户手动重测，避免自动保存触发连续请求
  const autoChecked = useRef(false);
  const { checkConnection } = config;
  useEffect(() => {
    if (!open) {
      autoChecked.current = false;
      return;
    }
    if (autoChecked.current || isLocal || !config.targetReady || config.connection !== "idle")
      return;
    autoChecked.current = true;
    void checkConnection();
  });

  return (
    <Drawer
      open={open}
      onOpenChange={next => !next && onClose()}
      title="站点设置"
      width={460}
      footer={
        <div className="flex w-full items-center justify-between">
          <span className="text-tau-micro text-ink-3">修改自动保存</span>
          <Button variant="primary" size="sm" onClick={onClose}>
            完成
          </Button>
        </div>
      }
    >
      <Group
        title="发布目标"
        action={
          <button
            type="button"
            className="text-tau-micro text-accent-text inline-flex items-center gap-1 hover:underline"
            onClick={() => {
              onClose();
              openPage("plugins", { tab: "installed" });
            }}
          >
            管理发布插件
            <ExternalLink size={11} strokeWidth={2} />
          </button>
        }
      >
        {!isLocal && <ConnectionBar config={config} />}
        <Row label="服务">
          <Select
            aria-label="发布目标"
            className="w-full"
            value={selected}
            options={options}
            onValueChange={config.setProvider}
          />
        </Row>
        {isLocal ? (
          <Row label="访问路径">
            <Input
              aria-label="访问路径"
              className="font-tau-mono"
              value={publish.local.basePath}
              onChange={event => config.setLocalBasePath(event.target.value)}
            />
          </Row>
        ) : (
          <PluginSettingsView
            section={config.section}
            embedded
            publishConfig={{ value: config.providerConfig, save: config.saveConfig }}
          />
        )}
        <Row label="公开 URL">
          <Input
            aria-label="公开 URL"
            className="font-tau-mono"
            value={publish.site.publicUrl}
            placeholder={config.targetPublicUrl || "https://example.com"}
            onChange={e => config.setSiteField("publicUrl", e.target.value)}
          />
        </Row>
        {isLocal && (
          <p className="border-line-2 text-tau-micro text-ink-3 border-t px-3 py-2">
            导出时选择输出文件夹，生成完整静态站点。
          </p>
        )}
      </Group>

      <Group title="站点" hint="名称与图标，各模板通用">
        <Row label="标题">
          <Input
            aria-label="站点标题"
            value={publish.site.title}
            placeholder="我的博客"
            onChange={e => config.setSiteField("title", e.target.value)}
          />
        </Row>
        <Row label="图标">
          <div className="flex items-center gap-2">
            <span className="bg-hover text-ink-3 rounded-tau-sm grid size-8 flex-none place-items-center overflow-hidden">
              {publish.site.favicon ? (
                <LocalImage
                  url={publish.site.favicon.cachePath}
                  alt={publish.site.favicon.fileName}
                  className="size-5 object-contain"
                />
              ) : (
                <Globe size={16} strokeWidth={1.75} />
              )}
            </span>
            <div className="text-tau-sm min-w-0 flex-1">
              <div className="truncate">{publish.site.favicon?.fileName ?? "默认图标"}</div>
              <small className="text-tau-tiny text-ink-3 block">SVG / PNG / ICO</small>
            </div>
            <Button variant="secondary" size="sm" onClick={() => void config.selectFavicon()}>
              {publish.site.favicon ? "更换" : "选择"}
            </Button>
            {publish.site.favicon && (
              <Button variant="ghost" size="sm" onClick={() => void config.clearFavicon()}>
                清除
              </Button>
            )}
          </div>
        </Row>
      </Group>

      <Group title="博客模板" hint="字段由所选模板声明">
        <Row label="模板">
          <Select
            aria-label="博客模板"
            className="w-full"
            value={publish.site.templateId ?? ""}
            options={config.templateOptions}
            placeholder="请先安装模板插件"
            onValueChange={value => config.setSiteField("templateId", value)}
          />
        </Row>
        {config.templateError && (
          <p className="border-line-2 text-danger text-tau-sm border-t px-3 py-2">
            {config.templateError}
          </p>
        )}
        {config.templateFields.map(field => (
          <TemplateFieldRow
            key={field.key}
            field={field}
            value={config.templateFieldValues[field.key]}
            onChange={value => config.setTemplateField(field.key, value)}
          />
        ))}
        {config.templateReady && config.templateFields.length === 0 && (
          <p className="border-line-2 text-tau-micro text-ink-3 border-t px-3 py-2">
            该模板没有可配置的站点字段。
          </p>
        )}
      </Group>
    </Drawer>
  );
}
