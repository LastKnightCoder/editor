import { memo, useMemo } from "react";
import classNames from "classnames";
import { Check } from "lucide-react";

import {
  REPORT_TEMPLATES,
  type ReportTemplate,
} from "@/constants/report-templates";

interface ReportTemplateSelectorProps {
  selectedTemplateId: string;
  onSelectTemplate: (templateId: string) => void;
  title?: string;
}

const ReportTemplateSelector = memo((props: ReportTemplateSelectorProps) => {
  const {
    selectedTemplateId,
    onSelectTemplate,
    title = "选择报告风格",
  } = props;

  const isElectron = typeof window !== "undefined" && !!window.electron;

  return (
    <div className="space-y-3">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400 block">
        {title}
      </label>

      <div className="grid grid-cols-3 gap-3">
        {REPORT_TEMPLATES.map((template) => (
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

ReportTemplateSelector.displayName = "ReportTemplateSelector";

interface TemplateCardProps {
  template: ReportTemplate;
  isSelected: boolean;
  onClick: () => void;
  isElectron: boolean;
}

const TemplateCard = memo((props: TemplateCardProps) => {
  const { template, isSelected, onClick, isElectron } = props;

  const previewUrl = useMemo(() => {
    return `data:text/html;charset=utf-8,${encodeURIComponent(template.previewHtml)}`;
  }, [template.previewHtml]);

  return (
    <div
      onClick={onClick}
      className={classNames(
        "relative rounded-xl overflow-hidden cursor-pointer transition-all duration-200",
        "border-2",
        isSelected
          ? "border-blue-500 shadow-lg shadow-blue-500/20"
          : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600",
      )}
    >
      <div
        className="relative w-full bg-gray-100 dark:bg-zinc-800"
        style={{ aspectRatio: "16 / 10" }}
      >
        {isElectron ? (
          <webview
            src={previewUrl}
            partition="persist:report-template-preview"
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
          <iframe
            src={previewUrl}
            className="w-full h-full border-0 pointer-events-none"
            sandbox="allow-scripts"
            title={`${template.name} Preview`}
            // @ts-expect-error inert is a valid HTML attribute
            inert="true"
          />
        )}

        {isSelected && (
          <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
            <Check className="w-3 h-3 text-white" strokeWidth={3} />
          </div>
        )}
      </div>

      <div className="px-3 py-2.5 bg-white dark:bg-zinc-800/80">
        <div
          className={classNames(
            "text-xs font-medium truncate",
            isSelected
              ? "text-blue-600 dark:text-blue-400"
              : "text-gray-700 dark:text-gray-300",
          )}
        >
          {template.name}
        </div>
        <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate mt-0.5">
          {template.description}
        </div>
      </div>
    </div>
  );
});

TemplateCard.displayName = "TemplateCard";

export default ReportTemplateSelector;
