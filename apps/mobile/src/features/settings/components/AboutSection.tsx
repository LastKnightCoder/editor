import { useEffect, useState } from "react";
import { getName, getVersion } from "@tauri-apps/api/app";

type AppInfo = {
  name: string;
  version: string;
  author: string;
};

const DEFAULT_APP_INFO: AppInfo = {
  name: "Tau",
  version: "0.1.0",
  author: "LastKnightCoder",
};

function InfoItem(props: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 px-4 py-3 dark:bg-neutral-900">
      <p className="text-xs text-gray-400 dark:text-gray-500">{props.label}</p>
      <p className="mt-1 text-base font-semibold text-gray-800 dark:text-neutral-100">
        {props.value}
      </p>
    </div>
  );
}

export function AboutSection() {
  const [appInfo, setAppInfo] = useState<AppInfo>(DEFAULT_APP_INFO);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [name, version] = await Promise.all([getName(), getVersion()]);
        if (cancelled) return;
        setAppInfo((prev) => ({
          ...prev,
          name: name || prev.name,
          version: version || prev.version,
        }));
      } catch {
        // ignore
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="list-group p-4">
      <h2 className="mb-3 text-sm font-medium text-gray-700 dark:text-neutral-200">
        应用信息
      </h2>
      <div className="space-y-3">
        <InfoItem label="项目名称" value={appInfo.name} />
        <InfoItem
          label="版本号"
          value={loading ? "读取中..." : appInfo.version}
        />
        <InfoItem label="作者" value={appInfo.author} />
      </div>
    </div>
  );
}

export default AboutSection;
