import { isElectron } from "@/electron";
import { useHtmlPreviewUrl } from "@/utils/html-preview";
import { memo } from "react";
import classNames from "classnames";
import { Check } from "lucide-react";

import { REPORT_TEMPLATES, type ReportTemplate } from "@/constants/report-templates";

interface ReportTemplateSelectorProps {
  selectedTemplateId: string;
  onSelectTemplate: (templateId: string) => void;
  title?: string;
}

const ReportTemplateSelector = memo((props: ReportTemplateSelectorProps) => {
  const { selectedTemplateId, onSelectTemplate, title = "选择报告风格" } = props;

  return (
    <div className="space-y-3">
      <label className="text-ink-2 block text-[11px] font-semibold uppercase tracking-wider">
        {title}
      </label>

      <div className="grid grid-cols-3 gap-3">
        {REPORT_TEMPLATES.map(template => (
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

  const previewUrl = useHtmlPreviewUrl(template.previewHtml);

  return (
    <div
      onClick={onClick}
      className={classNames(
        "relative cursor-pointer overflow-hidden rounded-xl transition-all duration-200",
        "border-2",
        isSelected
          ? "shadow-accent/20 border-accent shadow-lg"
          : "border-line-1 hover:border-line-1"
      )}
    >
      <div className="bg-hover relative w-full" style={{ aspectRatio: "16 / 10" }}>
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
            className="pointer-events-none h-full w-full border-0"
            sandbox="allow-scripts"
            title={`${template.name} Preview`}
            // @ts-expect-error inert is a valid HTML attribute
            inert="true"
          />
        )}

        {isSelected && (
          <div className="bg-accent absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full">
            <Check className="h-3 w-3 text-white" strokeWidth={3} />
          </div>
        )}
      </div>

      <div className="bg-surface px-3 py-2.5">
        <div
          className={classNames(
            "truncate text-xs font-medium",
            isSelected ? "text-accent-text" : "text-ink-2"
          )}
        >
          {template.name}
        </div>
        <div className="text-ink-3 mt-0.5 truncate text-[10px]">{template.description}</div>
      </div>
    </div>
  );
});

TemplateCard.displayName = "TemplateCard";

export default ReportTemplateSelector;
