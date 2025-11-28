import React from "react";
import { motion } from "framer-motion";
import useSettingStore from "@/stores/useSettingStore";

const YouTubeSetting: React.FC = () => {
  const { setting, updateYoutubeProxy } = useSettingStore();
  const yt = setting.integration.youtube;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{ scale: 1.02, y: -4 }}
      whileTap={{ scale: 0.98 }}
      className="relative group bg-white dark:bg-[#333] rounded-xl shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden h-[280px] flex flex-col"
    >
      {/* Status Badge */}
      <div className="absolute top-4 right-4">
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-700">
          <div
            className={`w-2 h-2 rounded-full ${
              yt.enabled ? "bg-green-500" : "bg-gray-400"
            }`}
          />
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
            {yt.enabled ? "已连接" : "未连接"}
          </span>
        </div>
      </div>

      {/* Header */}
      <div className="p-6 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-linear-to-br from-red-500 to-red-600 flex items-center justify-center text-white text-xl font-bold shadow-sm">
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">
              YouTube
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              视频平台
            </p>
          </div>
        </div>
      </div>

      {/* Info Section */}
      <div className="px-6 py-4 flex-1 overflow-hidden">
        <div className="space-y-2">
          <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
            <svg
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            代理设置
          </label>
          <input
            type="text"
            className="w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white shadow-inner placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-indigo-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(99,102,241,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(99,102,241,0.25)]"
            placeholder="例如: http://127.0.0.1:7890"
            value={yt.proxy}
            onChange={(e) => updateYoutubeProxy(e.target.value)}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            配置 HTTP/HTTPS 代理以访问 YouTube
          </p>
        </div>
      </div>
    </motion.div>
  );
};

export default YouTubeSetting;
