// 上传服务页外壳：服务面板 + 图片地址示例 + 上传测试 + 设为上传位置。
// 测试走真实上传链路并回读一次返回的地址，区分「传不上去」与「传上去了但打不开」。

import { useRef, useState } from "react";
import { Check, CircleAlert, LoaderCircle } from "lucide-react";
import type { UploadTestResponse } from "../../../types";
import { GroupLabel } from "../../../components/GroupLabel";
import { PageHeader } from "../../../components/PageHeader";
import { toast } from "../../../components/toast";
import { useAppContext } from "../../../app/AppContext";
import { useEdgeFade } from "../../../hooks/useScrollState";
import { useNavigator } from "../../../router";
import { classifyUploadError } from "../../../services/uploadOutcome";
import * as tauri from "../../../services/tauri";
import type { SettingModuleKey } from "../components/types";
import { GroupCard, GroupRow } from "../components/ui";
import { ActionButton } from "../storage/fields";
import { findUploadProvider } from "./providers";

type TestResult =
  { status: "ok"; response: UploadTestResponse } | { status: "error"; message: string };

function TestRow(props: { testing: boolean; result: TestResult | null }) {
  if (props.testing) {
    return (
      <GroupRow>
        <LoaderCircle size={17} className="text-ink-3 animate-spin" aria-hidden="true" />
        <span className="text-ink-2 flex-1 text-[14px]">正在上传测试图片…</span>
      </GroupRow>
    );
  }
  if (!props.result) {
    return (
      <GroupRow>
        <span className="text-ink-3 flex-1 text-[13px]">
          尚未测试，点「上传测试图片」确认能传上去、能显示
        </span>
      </GroupRow>
    );
  }
  if (props.result.status === "error") {
    return (
      <GroupRow>
        <CircleAlert size={17} className="text-danger shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="text-danger block text-[14px] font-medium">传不上去</span>
          <span className="text-ink-3 block text-[11.5px] leading-snug">
            {props.result.message}
          </span>
        </span>
      </GroupRow>
    );
  }
  const { response } = props.result;
  const seconds = (response.elapsedMs / 1000).toFixed(1);
  if (!response.readable) {
    return (
      <GroupRow>
        <CircleAlert size={17} className="text-danger shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="text-danger block text-[14px] font-medium">传上去了，但打不开</span>
          <span className="text-ink-3 block text-[11.5px] leading-snug">
            这个地址不能直接访问，文档里会显示裂图。请为存储开启公共读，或换一个公开的位置。
          </span>
        </span>
      </GroupRow>
    );
  }
  return (
    <GroupRow>
      <Check size={17} className="text-ok shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="text-ink-1 block text-[14px] font-medium">上传成功，图片可以打开</span>
        <span className="text-ink-3 block break-all text-[11.5px]">
          {seconds} 秒 · {response.url}
        </span>
      </span>
    </GroupRow>
  );
}

export function UploadProviderPage(props: { providerId: string }) {
  const app = useAppContext();
  const navigator = useNavigator();
  const scrollRef = useRef<HTMLDivElement>(null);
  useEdgeFade(scrollRef, { bottom: false });
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  const provider = findUploadProvider(props.providerId);
  const setting = app.syncSettings.safeSetting;
  const updateSetting = app.syncSettings.updateSetting;

  if (!provider || !setting) {
    return (
      <div className="bg-page fixed inset-0 z-50 flex flex-col">
        <PageHeader title="上传位置" onBack={() => navigator.goBack("ui")} />
        <p className="text-ink-3 p-8 text-center text-[13px]">找不到这个上传服务</p>
      </div>
    );
  }

  const isActive = setting.imageBed.active === provider.id;
  const configured = provider.isConfigured(setting);
  const sampleUrl = provider.sampleUrl(setting);
  const failedTest =
    result?.status === "error" || (result?.status === "ok" && !result.response.readable);
  const Panel = provider.Panel;

  const runTest = async () => {
    setTesting(true);
    try {
      // 后端从 setting.json 读取配置，先落盘刚输入但尚未失焦保存的字段
      await app.syncSettings.persistSetting();
      const response = await tauri.resourceUploadTest(provider.id);
      setResult({ status: "ok", response });
    } catch (error) {
      setResult({ status: "error", message: classifyUploadError(error).message });
    } finally {
      setTesting(false);
    }
  };

  const activate = () => {
    updateSetting(prev => ({ ...prev, imageBed: { ...prev.imageBed, active: provider.id } }), {
      persist: true,
    });
    toast.success(`之后的新图片会保存到 ${provider.name}`);
  };

  const openModule = (module: SettingModuleKey) => navigator.push("settingsModule", { module });

  return (
    <div className="mobile-kb-screen bg-page fixed inset-0 z-50 flex flex-col">
      <PageHeader title={provider.name} onBack={() => navigator.goBack("ui")} />
      <div
        ref={scrollRef}
        className="edge-fade-scroll mobile-kb-scroll flex-1 overflow-y-auto px-4"
        style={{ paddingBottom: "calc(var(--kb-height, 0px) + 24px)" }}
      >
        <div className="page-enter space-y-1">
          <Panel setting={setting} updateSetting={updateSetting} onOpenModule={openModule} />
          <p className="text-ink-3 px-[15px] text-[11.5px]">修改会自动保存</p>
          {sampleUrl && (
            <>
              <GroupLabel>图片地址示例</GroupLabel>
              <GroupCard>
                <p className="text-ink-2 break-all px-3.5 py-3 font-mono text-[11px] leading-relaxed">
                  {sampleUrl}
                </p>
              </GroupCard>
            </>
          )}
          <GroupLabel>测试</GroupLabel>
          <GroupCard>
            <TestRow testing={testing} result={result} />
          </GroupCard>
        </div>
      </div>
      <div
        className="flex gap-2.5 px-4 pt-2"
        style={{ paddingBottom: "calc(var(--page-bottom-inset) + 8px)" }}
      >
        <ActionButton
          label={result ? "再测一次" : "上传测试图片"}
          emphasis={false}
          busy={testing}
          disabled={!configured || testing}
          onClick={() => void runTest()}
        />
        <ActionButton
          label={isActive ? "当前上传位置" : "设为上传位置"}
          emphasis
          disabled={isActive || !configured || testing || failedTest}
          onClick={activate}
        />
      </div>
      {!configured && (
        <p className="text-ink-3 pb-2 text-center text-[11.5px]">补全账号与必填项后可测试与启用</p>
      )}
    </div>
  );
}
