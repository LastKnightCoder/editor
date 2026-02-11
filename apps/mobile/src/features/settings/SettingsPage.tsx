import { useState, useEffect } from "react";
import type {
  DatabaseListResponse,
  SettingCompat,
  SyncVersionResponse,
} from "../../types";

type SettingModule =
  | "theme"
  | "sync-webdav"
  | "sync-alioss"
  | "database"
  | null;

type SettingsPageProps = {
  safeSetting: SettingCompat | null;
  databases: DatabaseListResponse | null;
  versions: SyncVersionResponse | null;
  isSavingSetting: boolean;
  isSyncing: boolean;
  onBack: () => void;
  onSwitchDatabase: (name: string) => Promise<void>;
  onSaveSetting: () => Promise<void>;
  onCheckVersions: () => Promise<void>;
  onSyncUpload: () => Promise<void>;
  onSyncDownload: () => Promise<void>;
  updateSetting: (updater: (prev: SettingCompat) => SettingCompat) => void;
};

function IconChevronLeft() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function IconMoon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function IconCloud() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
    </svg>
  );
}

function IconDatabase() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  );
}

function FieldInput(props: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label?: string;
  type?: string;
}) {
  return (
    <div>
      {props.label && (
        <label className="mb-1.5 block text-sm text-gray-500 dark:text-gray-400">
          {props.label}
        </label>
      )}
      <input
        value={props.value}
        onChange={(e) => props.onChange(e.currentTarget.value)}
        type={props.type ?? "text"}
        placeholder={props.placeholder}
        className="input-base w-full rounded-lg px-4 py-3 text-[15px] text-gray-900 placeholder:text-gray-400 dark:text-gray-100 dark:placeholder:text-gray-500"
      />
    </div>
  );
}

function ListItem({
  icon,
  label,
  value,
  onClick,
  showArrow = true,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  onClick?: () => void;
  showArrow?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="list-item w-full"
      disabled={!onClick}
    >
      <div className="flex items-center gap-3">
        <span className="text-gray-500 dark:text-gray-400">{icon}</span>
        <span className="text-[15px] text-gray-800 dark:text-gray-100">
          {label}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {value && (
          <span className="text-sm text-gray-400 dark:text-gray-500">
            {value}
          </span>
        )}
        {showArrow && onClick && (
          <span className="text-gray-300 dark:text-gray-600">
            <IconChevronRight />
          </span>
        )}
      </div>
    </button>
  );
}

export function SettingsPage(props: SettingsPageProps) {
  const [activeModule, setActiveModule] = useState<SettingModule>(null);
  const [isDark, setIsDark] = useState(() => {
    return document.documentElement.classList.contains("dark");
  });

  const activeSync = props.safeSetting?.sync.active ?? "aliOSS";

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    try {
      localStorage.setItem("tau-mobile-theme", isDark ? "dark" : "light");
    } catch {
      // ignore
    }
  }, [isDark]);

  const handleBack = () => {
    if (activeModule) {
      setActiveModule(null);
    } else {
      props.onBack();
    }
  };

  const getTitle = () => {
    switch (activeModule) {
      case "theme":
        return "颜色主题";
      case "sync-webdav":
        return "WebDAV 配置";
      case "sync-alioss":
        return "AliOSS 配置";
      case "database":
        return "数据库管理";
      default:
        return "设置";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* 顶部导航 */}
      <header className="flex h-14 items-center border-b border-gray-100 bg-white px-2 pt-safe dark:border-gray-800 dark:bg-gray-900">
        <button
          type="button"
          onClick={handleBack}
          className="flex h-10 w-10 items-center justify-center rounded-full text-gray-600 transition-colors active:bg-gray-100 dark:text-gray-300 dark:active:bg-gray-800"
        >
          <IconChevronLeft />
        </button>
        <h1 className="flex-1 text-center text-base font-semibold text-gray-900 dark:text-gray-100">
          {getTitle()}
        </h1>
        <div className="w-10" />
      </header>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto p-4">
        {!activeModule && (
          <div className="space-y-4">
            {/* 基础设置 */}
            <div className="list-group">
              <ListItem
                icon={<IconMoon />}
                label="颜色主题"
                value={isDark ? "深色" : "浅色"}
                onClick={() => setActiveModule("theme")}
              />
            </div>

            {/* 数据管理 */}
            <div className="list-group">
              <ListItem
                icon={<IconDatabase />}
                label="数据库管理"
                value={props.databases?.activeDatabase}
                onClick={() => setActiveModule("database")}
              />
            </div>

            {/* 同步设置 */}
            <div className="list-group">
              <div className="px-4 py-3 text-sm font-medium text-gray-500 dark:text-gray-400">
                同步设置
              </div>
              <ListItem
                icon={<IconCloud />}
                label="WebDAV"
                value={activeSync === "webdav" ? "已启用" : ""}
                onClick={() => setActiveModule("sync-webdav")}
              />
              <ListItem
                icon={<IconCloud />}
                label="AliOSS"
                value={activeSync === "aliOSS" ? "已启用" : ""}
                onClick={() => setActiveModule("sync-alioss")}
              />
            </div>

            {/* 同步状态 */}
            <div className="list-group p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  同步状态
                </h3>
                <button
                  type="button"
                  onClick={() => void props.onCheckVersions()}
                  disabled={props.isSyncing}
                  className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors active:bg-gray-200 disabled:opacity-50 dark:bg-gray-800 dark:text-gray-300 dark:active:bg-gray-700"
                >
                  刷新
                </button>
              </div>

              <div className="mb-4 grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-gray-50 p-3 text-center dark:bg-gray-800">
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    数据库
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold text-gray-700 dark:text-gray-200">
                    {props.versions?.databaseName ?? "-"}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3 text-center dark:bg-gray-800">
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    本地
                  </p>
                  <p className="mt-1 text-sm font-bold text-gray-800 dark:text-gray-100">
                    {props.versions?.localVersion ?? "-"}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3 text-center dark:bg-gray-800">
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    远端
                  </p>
                  <p className="mt-1 text-sm font-bold text-gray-800 dark:text-gray-100">
                    {props.versions?.remoteVersion ?? "-"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => void props.onSyncUpload()}
                  disabled={props.isSyncing}
                  className="rounded-lg bg-blue-500 py-3 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
                >
                  {props.isSyncing ? "处理中..." : "上传"}
                </button>
                <button
                  type="button"
                  onClick={() => void props.onSyncDownload()}
                  disabled={props.isSyncing}
                  className="rounded-lg bg-gray-100 py-3 text-sm font-semibold text-gray-700 transition-transform active:scale-[0.98] disabled:opacity-50 dark:bg-gray-800 dark:text-gray-200"
                >
                  {props.isSyncing ? "处理中..." : "下载"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 主题设置 */}
        {activeModule === "theme" && (
          <div className="list-group">
            <button
              type="button"
              onClick={() => setIsDark(false)}
              className="list-item w-full"
            >
              <span className="text-[15px] text-gray-800 dark:text-gray-100">
                浅色
              </span>
              {!isDark && (
                <span className="text-blue-500">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setIsDark(true)}
              className="list-item w-full"
            >
              <span className="text-[15px] text-gray-800 dark:text-gray-100">
                深色
              </span>
              {isDark && (
                <span className="text-blue-500">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
              )}
            </button>
          </div>
        )}

        {/* 数据库管理 */}
        {activeModule === "database" && (
          <div className="space-y-4">
            <div className="list-group">
              {props.databases?.databases.map((db) => {
                const active = db.name === props.databases?.activeDatabase;
                return (
                  <button
                    key={db.name}
                    type="button"
                    onClick={() => void props.onSwitchDatabase(db.name)}
                    className="list-item w-full"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-[15px] text-gray-800 dark:text-gray-100">
                        {db.name}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        v{db.version}
                      </span>
                    </div>
                    {active && (
                      <span className="text-blue-500">
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* WebDAV 配置 */}
        {activeModule === "sync-webdav" && (
          <div className="space-y-4">
            <div className="list-group p-4">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-[15px] text-gray-800 dark:text-gray-100">
                  启用 WebDAV
                </span>
                <button
                  type="button"
                  onClick={() =>
                    props.updateSetting((prev) => ({
                      ...prev,
                      sync: {
                        ...prev.sync,
                        active: activeSync === "webdav" ? "aliOSS" : "webdav",
                      },
                    }))
                  }
                  className={`relative h-7 w-12 rounded-full transition-colors ${
                    activeSync === "webdav"
                      ? "bg-blue-500"
                      : "bg-gray-200 dark:bg-gray-700"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                      activeSync === "webdav" ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
              </div>

              <div className="space-y-3">
                <FieldInput
                  label="服务器地址"
                  value={props.safeSetting?.integration.webdav.url ?? ""}
                  onChange={(v) =>
                    props.updateSetting((prev) => ({
                      ...prev,
                      integration: {
                        ...prev.integration,
                        webdav: { ...prev.integration.webdav, url: v },
                      },
                    }))
                  }
                  placeholder="https://example.com/dav"
                />
                <FieldInput
                  label="用户名"
                  value={props.safeSetting?.integration.webdav.username ?? ""}
                  onChange={(v) =>
                    props.updateSetting((prev) => ({
                      ...prev,
                      integration: {
                        ...prev.integration,
                        webdav: { ...prev.integration.webdav, username: v },
                      },
                    }))
                  }
                  placeholder="用户名"
                />
                <FieldInput
                  label="密码"
                  value={props.safeSetting?.integration.webdav.password ?? ""}
                  onChange={(v) =>
                    props.updateSetting((prev) => ({
                      ...prev,
                      integration: {
                        ...prev.integration,
                        webdav: { ...prev.integration.webdav, password: v },
                      },
                    }))
                  }
                  placeholder="密码"
                  type="password"
                />
                <FieldInput
                  label="路径前缀"
                  value={props.safeSetting?.sync.webdav.pathPrefix ?? ""}
                  onChange={(v) =>
                    props.updateSetting((prev) => ({
                      ...prev,
                      sync: {
                        ...prev.sync,
                        webdav: { ...prev.sync.webdav, pathPrefix: v },
                      },
                    }))
                  }
                  placeholder="/sync"
                />
              </div>

              <button
                type="button"
                onClick={() => void props.onSaveSetting()}
                disabled={props.isSavingSetting}
                className="mt-4 w-full rounded-lg bg-gray-900 py-3 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900"
              >
                {props.isSavingSetting ? "保存中..." : "保存配置"}
              </button>
            </div>
          </div>
        )}

        {/* AliOSS 配置 */}
        {activeModule === "sync-alioss" && (
          <div className="space-y-4">
            <div className="list-group p-4">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-[15px] text-gray-800 dark:text-gray-100">
                  启用 AliOSS
                </span>
                <button
                  type="button"
                  onClick={() =>
                    props.updateSetting((prev) => ({
                      ...prev,
                      sync: {
                        ...prev.sync,
                        active: activeSync === "aliOSS" ? "webdav" : "aliOSS",
                      },
                    }))
                  }
                  className={`relative h-7 w-12 rounded-full transition-colors ${
                    activeSync === "aliOSS"
                      ? "bg-blue-500"
                      : "bg-gray-200 dark:bg-gray-700"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                      activeSync === "aliOSS" ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
              </div>

              <div className="space-y-3">
                <FieldInput
                  label="AccessKeyId"
                  value={
                    props.safeSetting?.integration.aliOSS.accessKeyId ?? ""
                  }
                  onChange={(v) =>
                    props.updateSetting((prev) => ({
                      ...prev,
                      integration: {
                        ...prev.integration,
                        aliOSS: { ...prev.integration.aliOSS, accessKeyId: v },
                      },
                    }))
                  }
                  placeholder="AccessKeyId"
                />
                <FieldInput
                  label="AccessKeySecret"
                  value={
                    props.safeSetting?.integration.aliOSS.accessKeySecret ?? ""
                  }
                  onChange={(v) =>
                    props.updateSetting((prev) => ({
                      ...prev,
                      integration: {
                        ...prev.integration,
                        aliOSS: {
                          ...prev.integration.aliOSS,
                          accessKeySecret: v,
                        },
                      },
                    }))
                  }
                  placeholder="AccessKeySecret"
                  type="password"
                />
                <FieldInput
                  label="Bucket"
                  value={props.safeSetting?.sync.aliOSS.bucket ?? ""}
                  onChange={(v) =>
                    props.updateSetting((prev) => ({
                      ...prev,
                      sync: {
                        ...prev.sync,
                        aliOSS: { ...prev.sync.aliOSS, bucket: v },
                      },
                    }))
                  }
                  placeholder="Bucket"
                />
                <FieldInput
                  label="Region"
                  value={props.safeSetting?.sync.aliOSS.region ?? ""}
                  onChange={(v) =>
                    props.updateSetting((prev) => ({
                      ...prev,
                      sync: {
                        ...prev.sync,
                        aliOSS: { ...prev.sync.aliOSS, region: v },
                      },
                    }))
                  }
                  placeholder="例如 oss-cn-hangzhou"
                />
                <FieldInput
                  label="路径前缀"
                  value={props.safeSetting?.sync.aliOSS.path ?? ""}
                  onChange={(v) =>
                    props.updateSetting((prev) => ({
                      ...prev,
                      sync: {
                        ...prev.sync,
                        aliOSS: { ...prev.sync.aliOSS, path: v },
                      },
                    }))
                  }
                  placeholder="/sync"
                />
              </div>

              <button
                type="button"
                onClick={() => void props.onSaveSetting()}
                disabled={props.isSavingSetting}
                className="mt-4 w-full rounded-lg bg-gray-900 py-3 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900"
              >
                {props.isSavingSetting ? "保存中..." : "保存配置"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
