import { useEffect, useState } from "react";
import { getName, getVersion } from "@tauri-apps/api/app";
import { ChevronLeft } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { resolveScreenMotion } from "../../navigation/screenTransition";
import type { PageTransitionConfig } from "../../navigation/types";

type AboutPageProps = {
  onBack: () => void;
  transition?: PageTransitionConfig;
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
    <div className="rounded-lg bg-gray-50 px-4 py-3 dark:bg-neutral-900">
      <p className="text-xs text-gray-400 dark:text-gray-500">{props.label}</p>
      <p className="mt-1 text-base font-semibold text-gray-800 dark:text-neutral-100">
        {props.value}
      </p>
    </div>
  );
}

export function AboutPage({ onBack, transition }: AboutPageProps) {
  const [appInfo, setAppInfo] = useState<AppInfo>(DEFAULT_APP_INFO);
  const [loading, setLoading] = useState(true);
  const reducedMotion = useReducedMotion();
  const motionProps = resolveScreenMotion(transition, reducedMotion === true);

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
    <motion.div
      initial={motionProps.initial}
      animate={motionProps.animate}
      exit={motionProps.exit}
      className="fixed inset-0 z-50 flex flex-col bg-gray-50 dark:bg-black"
    >
      <header className="mobile-topbar topbar-immersive flex items-center px-2">
        <button
          type="button"
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center rounded-full text-gray-600 transition-colors active:bg-gray-100 dark:text-neutral-300 dark:active:bg-neutral-800"
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <h1 className="flex-1 text-center text-base font-semibold text-gray-900 dark:text-neutral-100">
          关于
        </h1>
        <div className="w-10" />
      </header>

      <div className="flex-1 overflow-y-auto p-4">
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
      </div>
    </motion.div>
  );
}

export default AboutPage;
