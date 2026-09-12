import { useEffect, useRef, useState } from "react";
import { getName, getVersion } from "@tauri-apps/api/app";
import { PageHeader } from "../../components/PageHeader";
import { useEdgeFade } from "../../hooks/useScrollState";

type AboutPageProps = {
  onBack: () => void;
};

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
    <div className="bg-input rounded-2xl px-4 py-3">
      <p className="text-ink-3 text-xs font-bold">{props.label}</p>
      <p className="text-ink mt-1 text-[15px] font-bold">{props.value}</p>
    </div>
  );
}

export function AboutPage({ onBack }: AboutPageProps) {
  const [appInfo, setAppInfo] = useState<AppInfo>(DEFAULT_APP_INFO);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEdgeFade(scrollRef, { bottom: false });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [name, version] = await Promise.all([getName(), getVersion()]);
        if (cancelled) return;
        setAppInfo(prev => ({
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
    <div className="mobile-kb-screen bg-page fixed inset-0 z-50 flex flex-col">
      <PageHeader title="关于" onBack={onBack} />

      <div ref={scrollRef} className="edge-fade-scroll mobile-kb-scroll flex-1 overflow-y-auto p-4">
        <div className="list-group p-4">
          <h2 className="text-ink mb-3 text-[15px] font-bold">应用信息</h2>
          <div className="space-y-3">
            <InfoItem label="项目名称" value={appInfo.name} />
            <InfoItem label="版本号" value={loading ? "读取中..." : appInfo.version} />
            <InfoItem label="作者" value={appInfo.author} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default AboutPage;
