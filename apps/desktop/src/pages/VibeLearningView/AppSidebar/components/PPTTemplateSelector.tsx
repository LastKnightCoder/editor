import { memo, useMemo } from "react";
import classNames from "classnames";
import { Check } from "lucide-react";

import { PPT_TEMPLATES, type PPTTemplate } from "@/constants/ppt-templates";

interface PPTTemplateSelectorProps {
  selectedTemplateId: string;
  onSelectTemplate: (templateId: string) => void;
  title?: string;
}

const PPTTemplateSelector = memo((props: PPTTemplateSelectorProps) => {
  const { selectedTemplateId, onSelectTemplate, title = "选择风格" } = props;

  // 检查是否是 Electron 环境
  const isElectron = typeof window !== "undefined" && !!window.electron;

  return (
    <div className="space-y-3">
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
        {title}
      </label>

      <div className="grid grid-cols-3 gap-3">
        {PPT_TEMPLATES.map(template => (
          <TemplateCard
            key={template.id}
            template={template}
            isSelected={selectedTemplateId === template.id}
            onClick={() => onSelectTemplate(template.id)}
            isElectron={isElectron}
          />
        ))}
      </div>
    </div>
  );
});

PPTTemplateSelector.displayName = "PPTTemplateSelector";

interface TemplateCardProps {
  template: PPTTemplate;
  isSelected: boolean;
  onClick: () => void;
  isElectron: boolean;
}

/**
 * 单个模板卡片组件
 */
const TemplateCard = memo((props: TemplateCardProps) => {
  const { template, isSelected, onClick, isElectron } = props;

  // 生成预览 URL
  const previewUrl = useMemo(() => {
    return `data:text/html;charset=utf-8,${encodeURIComponent(template.previewHtml)}`;
  }, [template.previewHtml]);

  return (
    <div
      onClick={onClick}
      className={classNames(
        "relative cursor-pointer overflow-hidden rounded-xl transition-all duration-200",
        "border-2",
        isSelected
          ? "border-blue-500 shadow-lg shadow-blue-500/20"
          : "border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600"
      )}
    >
      {/* 预览区域 */}
      <div
        className="relative w-full bg-gray-100 dark:bg-zinc-800"
        style={{ aspectRatio: "16 / 10" }}
      >
        {isElectron ? (
          // Electron 环境使用 webview
          <webview
            src={previewUrl}
            partition="persist:ppt-template-preview"
            webpreferences="sandbox=true,contextIsolation=true,nodeIntegration=false"
            allowpopups={false}
            // @ts-expect-error inert is a valid HTML attribute
            inert="true"
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              pointerEvents: "none",
            }}
          />
        ) : (
          // 浏览器环境使用 iframe
          <iframe
            src={previewUrl}
            className="pointer-events-none h-full w-full border-0"
            sandbox="allow-scripts"
            title={`${template.name} Preview`}
            // @ts-expect-error inert is a valid HTML attribute
            inert="true"
          />
        )}

        {/* 选中标记 */}
        {isSelected && (
          <div className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500">
            <Check className="h-3 w-3 text-white" strokeWidth={3} />
          </div>
        )}
      </div>

      {/* 模板信息 */}
      <div className="bg-white px-3 py-2.5 dark:bg-zinc-800/80">
        <div
          className={classNames(
            "truncate text-xs font-medium",
            isSelected ? "text-[var(--th-active-text)]" : "text-gray-700 dark:text-gray-300"
          )}
        >
          {template.name}
        </div>
        <div className="mt-0.5 truncate text-[10px] text-gray-400 dark:text-gray-500">
          {template.description}
        </div>
      </div>
    </div>
  );
});

TemplateCard.displayName = "TemplateCard";

export default PPTTemplateSelector;
