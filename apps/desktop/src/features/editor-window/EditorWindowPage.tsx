/**
 * 内容编辑窗口（路由 /editor-window?kind=&db=&id=）：卡片 / 文章 / 项目文档共用。
 * 主进程 windows/editor-window.ts 负责开窗（同一文档只开一个窗口）。
 *
 * 启动：字体 / 主题运行时（跨窗口同步）→ 等设置就绪 → 连接 URL 指定的数据库 → 加载文档。
 * 数据库按 URL 连接而非当前库：协作页「回到原内容」会用编辑窗口打开其它数据库的文档；
 * 连接是全局共享的，本窗口不负责关闭（关了会连带主窗口失去连接）。
 */

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FileText } from "lucide-react";
import { Button, Loading, ToastHost, initScrollbarAutoHide } from "@tau/ui";
import { connectDatabaseByName } from "@/commands";
import useSettingStore from "@/stores/useSettingStore";
import { useThemeRuntime } from "@/app/useThemeRuntime";
import "@/app/base.css";
import { DOCUMENT_DRIVERS, isEditorWindowKind, type DocumentDriver } from "./documentDrivers";
import { useEditorDocument } from "./useEditorDocument";
import { EditorWindow } from "./EditorWindow";
import { EditorWindowTitlebar } from "./EditorWindowTitlebar";
import { WindowMessage } from "./WindowMessage";
import { useEditorWindowI18n } from "./window.i18n";
import { DesktopPluginServicesProvider } from "@/app/plugins/ServiceProvider";

// .app：base.css 作用域锚点（控件 reset / focus-ring / 滚动条）；布局尺度变量见 base.css
const rootClass =
  "app flex h-screen flex-col overflow-hidden bg-page font-tau text-tau-body text-ink-1 antialiased";

export default function EditorWindowPage() {
  const { t } = useEditorWindowI18n();
  const [params] = useSearchParams();
  const kind = params.get("kind");
  const databaseName = params.get("db") ?? "";
  const id = Number(params.get("id"));
  const driver = isEditorWindowKind(kind) ? DOCUMENT_DRIVERS[kind] : null;
  const valid = Boolean(driver && databaseName && Number.isSafeInteger(id) && id > 0);

  useThemeRuntime();
  useEffect(() => initScrollbarAutoHide(), []);

  const settingInited = useSettingStore(s => s.inited);
  const [boot, setBoot] = useState<"connecting" | "ready" | "failed">("connecting");
  const [bootError, setBootError] = useState("");

  const connect = useCallback(() => {
    setBoot("connecting");
    connectDatabaseByName(databaseName).then(
      () => setBoot("ready"),
      error => {
        setBootError(error instanceof Error ? error.message : String(error));
        setBoot("failed");
      }
    );
  }, [databaseName]);

  useEffect(() => {
    if (valid && settingInited) connect();
  }, [valid, settingInited, connect]);

  const chrome = (title: string, body: React.ReactNode) => (
    <>
      <EditorWindowTitlebar
        icon={driver?.icon ?? FileText}
        label={driver ? t(`type.${driver.kind}`) : t("type.edit")}
        title={title}
      />
      <div className="min-h-0 flex-1">{body}</div>
    </>
  );

  let content: React.ReactNode;
  if (!driver || !valid) {
    content = chrome(
      "",
      <WindowMessage title={t("boot.invalid")} description={t("boot.invalidHint")} />
    );
  } else if (boot === "failed") {
    content = chrome(
      "",
      <WindowMessage
        title={t("boot.failed")}
        description={bootError}
        actions={<Button onClick={connect}>{t("action.retry")}</Button>}
      />
    );
  } else if (boot === "connecting") {
    content = chrome("", <Loading label={t("boot.connecting")} />);
  } else {
    content = (
      <DesktopPluginServicesProvider workspace={databaseName}>
        <DocumentView driver={driver} id={id} databaseName={databaseName} />
      </DesktopPluginServicesProvider>
    );
  }

  return (
    <div className={rootClass}>
      {content}
      <ToastHost />
    </div>
  );
}

function DocumentView({
  driver,
  id,
  databaseName,
}: {
  driver: DocumentDriver;
  id: number;
  databaseName: string;
}) {
  const { t } = useEditorWindowI18n();
  const { document, status, saveState, updateFields } = useEditorDocument(driver, id);

  if (status === "ready" && document) {
    return (
      <EditorWindow
        driver={driver}
        databaseName={databaseName}
        document={document}
        saveState={saveState}
        updateFields={updateFields}
      />
    );
  }
  return (
    <>
      <EditorWindowTitlebar icon={driver.icon} label={t(`type.${driver.kind}`)} title="" />
      <div className="min-h-0 flex-1">
        {status === "loading" ? (
          <Loading />
        ) : (
          <WindowMessage
            title={t("document.missing", { kind: t(`type.${driver.kind}`) })}
            description={t("document.missingHint")}
          />
        )}
      </div>
    </>
  );
}
