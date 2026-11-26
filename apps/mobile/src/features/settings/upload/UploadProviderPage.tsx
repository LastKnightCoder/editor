// 上传服务页：插件声明的连接表单 + 使用状态 + 上传测试。顶栏「保存」显式保存，保存不改变当前选用；
// 测试走真实上传链路并回读一次返回的地址，区分「传不上去」与「传上去了但打不开」。

import {
  storageTranslator,
  useStorageI18n,
  storageDisplayContext,
  storageErrorText,
} from "../storage/i18n";
import { useRef, useState } from "react";
import { Check, CircleAlert, Image, LoaderCircle } from "lucide-react";
import { PortalScope } from "@tau/ui";
import type { UploadTestResponse } from "../../../types";
import { GroupLabel } from "../../../components/GroupLabel";
import { PageHeader, PageHeaderTextButton } from "../../../components/PageHeader";
import { toast } from "../../../components/toast";
import { useAppContext } from "../../../app/AppContext";
import { useEdgeFade } from "../../../hooks/useScrollState";
import {
  enqueueProviderConfigWrite,
  flushProviderConfigWrites,
  mergeProviderSettings,
} from "../../../services/provider-config";

import * as tauri from "../../../services/tauri";
import { GroupCard, GroupRow } from "../components/ui";
import { useSaveProviderConfig } from "../providerEntries";
import { MobileProviderForm } from "../storage/ProviderForm";
import { UnsupportedProvider, UseRow, useDiscardGuard } from "../storage/providerPage";
import { useProviderDraft } from "../storage/useProviderDraft";
import { useUploadProviders } from "./providers";

type TestResult =
  | { status: "ok"; response: UploadTestResponse }
  | { status: "error"; cause: unknown };

function TestRow(props: { testing: boolean; result: TestResult | null }) {
  useStorageI18n();
  if (props.testing) {
    return (
      <GroupRow>
        <LoaderCircle size={17} className="text-ink-3 animate-spin" aria-hidden="true" />
        <span className="text-ink-2 text-tau-body flex-1">
          {storageTranslator.t("test.uploading")}
        </span>
      </GroupRow>
    );
  }
  if (!props.result) {
    return (
      <GroupRow>
        <span className="text-ink-3 text-tau-meta flex-1">
          {storageTranslator.t("test.notRun")}
        </span>
      </GroupRow>
    );
  }
  if (props.result.status === "error") {
    return (
      <GroupRow>
        <CircleAlert size={17} className="text-danger shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="text-danger text-tau-body block font-medium">
            {storageTranslator.t("test.failed")}
          </span>
          <span className="text-ink-3 text-tau-sm block leading-snug">
            {storageErrorText(props.result.cause)}
          </span>
        </span>
      </GroupRow>
    );
  }
  const { response } = props.result;
  const seconds = (response.elapsedMs / 1000).toLocaleString(storageDisplayContext().locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  if (!response.readable) {
    return (
      <GroupRow>
        <CircleAlert size={17} className="text-danger shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="text-danger text-tau-body block font-medium">
            {storageTranslator.t("test.unreadable")}
          </span>
          <span className="text-ink-3 text-tau-sm block leading-snug">
            {storageTranslator.t("test.unreadableHint")}
          </span>
        </span>
      </GroupRow>
    );
  }
  return (
    <GroupRow>
      <Check size={17} className="text-ok shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="text-ink-1 text-tau-body block font-medium">
          {storageTranslator.t("test.success")}
        </span>
        <span className="text-ink-3 text-tau-sm block break-all">
          {storageTranslator.t("test.result", { seconds, url: response.url })}
        </span>
      </span>
    </GroupRow>
  );
}

export function UploadProviderPage(props: { providerId: string }) {
  useStorageI18n();
  const app = useAppContext();
  const scrollRef = useRef<HTMLDivElement>(null);
  useEdgeFade(scrollRef);
  const provider = useUploadProviders().find(item => item.id === props.providerId);
  const setting = app.syncSettings.safeSetting;
  const persist = useSaveProviderConfig("upload");
  const draft = useProviderDraft(
    provider?.form ?? null,
    setting && provider ? provider.stored(setting) : undefined,
    config => persist(props.providerId, config),
    storageErrorText
  );
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const back = useDiscardGuard(draft.dirty, draft.reset);

  if (!provider || !setting || !provider.form)
    return (
      <UnsupportedProvider
        title={storageTranslator.t("service.upload")}
        legacy={!!provider && !provider.form}
      />
    );

  const isActive =
    setting.imageBed.active === "plugin" && setting.imageBed.plugin?.id === provider.id;
  const configured = provider.isConfigured(setting);
  const failedTest =
    result?.status === "error" || (result?.status === "ok" && !result.response.readable);

  const save = async () => {
    if (await draft.save()) {
      setResult(null);
      toast.success(storageTranslator.t("feedback.saved"));
    }
  };

  const runTest = async () => {
    setTesting(true);
    try {
      // 后端从 setting.json 读取配置，先等待排队中的写入落盘
      await flushProviderConfigWrites();
      await app.syncSettings.persistSetting();
      const response = await tauri.resourceUploadTest(provider.id);
      setResult({ status: "ok", response });
    } catch (error) {
      setResult({ status: "error", cause: error });
    } finally {
      setTesting(false);
    }
  };

  const activate = async () => {
    try {
      await enqueueProviderConfigWrite(async () => {
        const saved = await tauri.selectPluginProvider(
          setting.database.active,
          "upload",
          provider.id,
          provider.stored(setting) ?? null
        );
        app.syncSettings.updateSetting(previous => mergeProviderSettings(previous, saved));
      });
      toast.success(storageTranslator.t("feedback.selected", { name: provider.name }));
    } catch (error) {
      toast.error(storageErrorText(error));
    }
  };

  return (
    <PortalScope>
      <div className="mobile-kb-screen bg-page fixed inset-0 z-50 flex flex-col">
        <PageHeader
          title={provider.name}
          onBack={back.request}
          actions={
            <PageHeaderTextButton
              disabled={(!draft.dirty && configured) || draft.saving}
              onClick={() => void save()}
            >
              {draft.saving
                ? storageTranslator.t("action.saving")
                : storageTranslator.t("action.save")}
            </PageHeaderTextButton>
          }
        />
        <div
          ref={scrollRef}
          className="edge-fade-scroll mobile-page-scroll flex-1 overflow-y-auto px-4"
        >
          <div className="page-enter space-y-1">
            <GroupLabel>{storageTranslator.t("service.use")}</GroupLabel>
            <GroupCard>
              <UseRow
                icon={<Image size={17} strokeWidth={1.9} aria-hidden="true" />}
                title={storageTranslator.t("service.resource")}
                active={isActive}
                activeText={storageTranslator.t("service.active")}
                idleText={
                  configured
                    ? storageTranslator.t("service.saved")
                    : storageTranslator.t("service.configure")
                }
                actionLabel={storageTranslator.t("service.activate")}
                disabled={!configured || draft.dirty || testing || failedTest}
                onAction={() => void activate()}
              />
            </GroupCard>
            <MobileProviderForm
              form={provider.form}
              values={draft.values}
              errors={draft.errors}
              disabled={draft.saving}
              signal={draft.signal}
              onChange={draft.change}
            />
            {draft.error && (
              <p role="alert" className="text-danger text-tau-meta px-[15px] pt-2">
                {draft.error}
              </p>
            )}
            <GroupLabel>{storageTranslator.t("test.title")}</GroupLabel>
            <GroupCard>
              <TestRow testing={testing} result={result} />
              <GroupRow
                onClick={() => void runTest()}
                disabled={!configured || draft.dirty || testing}
              >
                <span
                  className={`text-tau-body ${configured && !draft.dirty ? "text-accent-text" : "text-ink-3"}`}
                >
                  {result ? storageTranslator.t("test.retry") : storageTranslator.t("test.upload")}
                </span>
              </GroupRow>
            </GroupCard>
            {draft.dirty && (
              <p className="text-ink-3 text-tau-sm px-[15px] pt-[7px]">
                {storageTranslator.t("test.saveFirst")}
              </p>
            )}
          </div>
        </div>
        {back.sheet}
      </div>
    </PortalScope>
  );
}
