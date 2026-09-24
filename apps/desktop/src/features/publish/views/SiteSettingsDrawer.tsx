/**
 * 站点设置抽屉（右侧滑入 460px）—— 发布目标三选一 + 提供商字段 + 连接测试 + 站点信息 + favicon。
 *
 * 低频配置从页面主体收进来：修改即时写入 setting.publish，无保存按钮。
 * 常驻挂载（滑入/滑出靠 transform 过渡），关闭态 inert；Esc 走页面浮层仲裁（useOverlayDismiss）。
 * 层级同 Dialog z-[340]，PortalScope 让内部 Select 菜单留在同一层叠上下文。
 */

import clsx from "clsx";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { FolderOpen, Globe, Zap } from "lucide-react";
import { Button, Input, PortalScope, Select, Switch, usePortalContainer } from "@tau/ui";
import { useOverlayDismiss } from "@/page/PageProvider";
import LocalImage from "@/components/LocalImage";
import { EPublishProvider } from "@/stores/useSettingStore";
import { PROVIDER_LABELS, type PublishConfig, type PublishFieldKey } from "../usePublishConfig";

const PROVIDER_DESCS: Record<EPublishProvider, string> = {
  [EPublishProvider.Github]: "推送到仓库分支",
  [EPublishProvider.S3]: "兼容 S3 的对象存储",
  [EPublishProvider.Local]: "生成文件夹自行部署",
};

const PROVIDERS = [EPublishProvider.Github, EPublishProvider.S3, EPublishProvider.Local];

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

function ConnectionBar({ config }: { config: PublishConfig }) {
  const { connection, checkConnection } = config;
  const status =
    connection === "ok" ? (
      <span className="text-ok font-medium">● 连接正常</span>
    ) : connection === "fail" ? (
      <span className="text-danger font-medium">● 连接失败</span>
    ) : connection === "checking" ? (
      <span className="text-ink-2">正在测试…</span>
    ) : (
      <span className="text-ink-3">尚未测试</span>
    );
  const desc =
    config.active === EPublishProvider.Github
      ? connection === "fail"
        ? "检查 Token、仓库与分支"
        : "Token、仓库与分支可访问"
      : connection === "fail"
        ? "检查凭据与 Bucket"
        : "凭据与 Bucket 可访问";
  return (
    <div className="border-line-1 text-tau-sm text-ink-2 mt-3.5 flex items-center gap-2.5 rounded-[10px] border px-3 py-2.5">
      {status}
      {connection !== "idle" && connection !== "checking" && <span>{desc}</span>}
      <Button
        variant="secondary"
        size="sm"
        icon={Zap}
        className="ml-auto"
        loading={connection === "checking"}
        onClick={() => void checkConnection()}
      >
        {connection === "idle" ? "测试连接" : "重新测试"}
      </Button>
    </div>
  );
}

function IntegrationNote({ children, onOpen }: { children: ReactNode; onOpen: () => void }) {
  return (
    <div className="text-tau-micro text-ink-3 mt-2.5">
      {children} 在{" "}
      <button
        type="button"
        className="text-accent-text font-medium hover:underline"
        onClick={onOpen}
      >
        设置 · 集成
      </button>{" "}
      中配置
    </div>
  );
}

export function SiteSettingsDrawer({
  open,
  onClose,
  config,
  onOpenIntegration,
}: {
  open: boolean;
  onClose: () => void;
  config: PublishConfig;
  onOpenIntegration: () => void;
}) {
  const container = usePortalContainer();
  useOverlayDismiss(onClose, open);
  const { publish, active } = config;

  const textField = (field: PublishFieldKey, label: string, placeholder?: string, full = false) => (
    <Field key={field} label={label} full={full}>
      <Input
        className="font-tau-mono"
        value={config.getField(field)}
        placeholder={placeholder}
        onChange={e => config.setField(field, e.target.value)}
      />
    </Field>
  );

  return createPortal(
    <PortalScope>
      <div
        aria-hidden
        onClick={onClose}
        className={clsx(
          "bg-overlay fixed inset-0 z-[340] transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="站点设置"
        inert={!open}
        className={clsx(
          "bg-surface shadow-float fixed bottom-2 right-2 top-2 z-[340] flex w-[460px] flex-col rounded-[14px]",
          "transition-transform duration-[280ms] ease-[cubic-bezier(.2,.8,.2,1)]",
          open ? "translate-x-0" : "translate-x-[calc(100%+16px)]"
        )}
      >
        <div className="flex items-center px-5 pb-1.5 pt-[18px]">
          <h3 className="text-[16px] font-semibold">站点设置</h3>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={onClose}>
            完成
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 pb-5 pt-1.5">
          <SectionHead title="发布目标" />
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="发布目标">
            {PROVIDERS.map(p => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={active === p}
                onClick={() => config.setProvider(p)}
                className={clsx(
                  "bg-surface rounded-[11px] px-[11px] pb-2.5 pt-[11px] text-left transition-[background,box-shadow] duration-150",
                  active === p
                    ? "ring-accent shadow-card ring-[1.5px] ring-inset"
                    : "ring-line-1 hover:bg-surface-hover ring-1 ring-inset"
                )}
              >
                <b className="block text-[12.5px] font-semibold">{PROVIDER_LABELS[p]}</b>
                <span className="text-ink-3 mt-0.5 block text-[11px] leading-[1.45]">
                  {PROVIDER_DESCS[p]}
                </span>
              </button>
            ))}
          </div>

          {active === EPublishProvider.Github && (
            <>
              <div className="mt-3.5 grid grid-cols-2 gap-3">
                <Field label="仓库">
                  <Select
                    aria-label="发布仓库"
                    className="w-full"
                    value={publish.github.repo}
                    placeholder={
                      config.githubTokenReady
                        ? config.reposLoading
                          ? "加载中…"
                          : "选择仓库"
                        : "需先配置 Token"
                    }
                    disabled={!config.githubTokenReady}
                    options={config.repoOptions}
                    onValueChange={v => void config.selectRepo(v)}
                  />
                </Field>
                <Field label="部署分支">
                  <Select
                    aria-label="部署分支"
                    className="w-full"
                    value={publish.github.branch}
                    placeholder={publish.github.repo ? "选择分支" : "先选择仓库"}
                    disabled={!config.githubTokenReady || !publish.github.repo}
                    options={config.branchOptions}
                    onValueChange={v => config.setField("branch", v)}
                  />
                </Field>
                <Field label="访问路径" hint="按仓库名推导">
                  <Input value={publish.github.basePath} readOnly className="font-tau-mono" />
                </Field>
                <div className="col-span-2 flex min-w-0 flex-col gap-[5px]">
                  <span className="text-tau-sm text-ink-2 font-medium">发布方式</span>
                  <div className="text-tau-meta text-ink-2 flex h-8 items-center gap-2.5">
                    <Switch
                      checked={publish.github.useGitCli}
                      onCheckedChange={config.setUseGitCli}
                    />
                    Git Push（快，避开限速）
                  </div>
                </div>
                <Field label="Git 工作目录" hint="可选，缓存克隆加速" full>
                  <div className="flex items-center gap-2">
                    <Input
                      className="font-tau-mono min-w-0 flex-1"
                      value={publish.github.gitWorkingDir}
                      placeholder="留空则使用应用缓存目录"
                      disabled={!publish.github.useGitCli}
                      onChange={e => config.setField("gitWorkingDir", e.target.value)}
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={FolderOpen}
                      disabled={!publish.github.useGitCli}
                      onClick={() => void config.selectGitWorkingDir()}
                    >
                      选择
                    </Button>
                    {publish.github.gitWorkingDir && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!publish.github.useGitCli}
                        onClick={() => config.setField("gitWorkingDir", "")}
                      >
                        清空
                      </Button>
                    )}
                  </div>
                </Field>
              </div>
              <ConnectionBar config={config} />
              <IntegrationNote onOpen={onOpenIntegration}>
                {config.githubTokenReady ? "Token" : "尚未配置 GitHub Token——Token"}
              </IntegrationNote>
            </>
          )}

          {active === EPublishProvider.S3 && (
            <>
              <div className="mt-3.5 grid grid-cols-2 gap-3">
                {textField("bucket", "Bucket", "my-blog-bucket")}
                {textField("region", "Region", "us-east-1")}
                {textField("path", "路径前缀", "blog/（可选）")}
                {textField("basePath", "访问路径", "/")}
              </div>
              <ConnectionBar config={config} />
              <IntegrationNote onOpen={onOpenIntegration}>
                AccessKey / Secret / Endpoint
              </IntegrationNote>
            </>
          )}

          {active === EPublishProvider.Local && (
            <>
              <div className="mt-3.5 grid grid-cols-2 gap-3">
                {textField("basePath", "访问路径", "/ 或 /docs/", true)}
              </div>
              <div className="text-tau-micro text-ink-3 mt-2.5">
                无需凭据：点击导出时选择输出文件夹，生成完整静态站点。
              </div>
            </>
          )}

          <SectionHead title="站点信息" hint="写入首页、RSS 与页面 meta" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="站点标题">
              <Input
                value={publish.site.title}
                placeholder="我的博客"
                onChange={e => config.setSiteField("title", e.target.value)}
              />
            </Field>
            <Field label="公开 URL" hint="RSS 用">
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
        </div>

        <div className="text-tau-micro text-ink-3 px-5 py-3">修改即时保存</div>
      </aside>
    </PortalScope>,
    container
  );
}
