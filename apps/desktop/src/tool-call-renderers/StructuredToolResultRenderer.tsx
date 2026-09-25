import type { ToolCallCustomRendererProps } from "./types";
import {
  ToolBadge,
  ToolCard,
  ToolCardBody,
  ToolCardHeader,
  ToolDividerList,
  ToolDividerListItem,
  ToolMutedText,
  ToolSectionTitle,
  ToolValuePill,
} from "./ui";

type StructuredToolResultPayload = {
  layout?: "operation" | "detail" | "list";
  title?: string;
  subtitle?: string;
  status?: string;
  badges?: string[];
  metrics?: Array<{ label: string; value: string | number }>;
  fields?: Array<{ label: string; value: string | number | null | undefined }>;
  items?: Array<{
    title?: string;
    subtitle?: string;
    description?: string;
    badges?: string[];
  }>;
  emptyText?: string;
};

const getStructuredPayload = (
  metadata?: Record<string, unknown>
): StructuredToolResultPayload | null => {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const render =
    metadata.render && typeof metadata.render === "object"
      ? (metadata.render as Record<string, unknown>)
      : null;
  const payload =
    render?.payload && typeof render.payload === "object"
      ? (render.payload as StructuredToolResultPayload)
      : null;

  return payload;
};

const StructuredToolResultRenderer = ({
  execution,
  isDark,
  renderDefault,
}: ToolCallCustomRendererProps) => {
  const payload = getStructuredPayload(execution.metadata);
  if (!payload) {
    return <>{renderDefault()}</>;
  }

  return (
    <ToolCard isDark={isDark}>
      <ToolCardHeader isDark={isDark}>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="text-tau-body text-ink-1 min-w-0 flex-1 font-medium">
            {payload.title || execution.toolName}
          </div>
          {payload.status ? <ToolBadge isDark={isDark}>{payload.status}</ToolBadge> : null}
          {payload.badges?.map(badge => (
            <ToolBadge key={badge} isDark={isDark}>
              {badge}
            </ToolBadge>
          ))}
        </div>
        {payload.subtitle ? (
          <ToolMutedText isDark={isDark} className="mt-2 break-words">
            {payload.subtitle}
          </ToolMutedText>
        ) : null}
      </ToolCardHeader>
      <ToolCardBody>
        {payload.metrics?.length ? (
          <div className="flex flex-wrap gap-2">
            {payload.metrics.map(metric => (
              <ToolValuePill key={metric.label} isDark={isDark}>
                {metric.label}：{metric.value}
              </ToolValuePill>
            ))}
          </div>
        ) : null}

        {payload.fields?.length ? (
          <div className="space-y-2">
            {payload.fields.map(field => (
              <ToolMutedText key={field.label} isDark={isDark} className="break-words">
                {field.label}：{field.value ?? "-"}
              </ToolMutedText>
            ))}
          </div>
        ) : null}

        {payload.items?.length ? (
          <ToolDividerList isDark={isDark}>
            {payload.items.map((item, index) => (
              <ToolDividerListItem key={`${item.title || "item"}-${index}`} isDark={isDark}>
                <ToolSectionTitle isDark={isDark}>
                  {item.title || `项目 ${index + 1}`}
                </ToolSectionTitle>
                {item.subtitle ? (
                  <ToolMutedText isDark={isDark} className="mt-1 break-words">
                    {item.subtitle}
                  </ToolMutedText>
                ) : null}
                {item.description ? (
                  <ToolMutedText isDark={isDark} className="mt-1.5 break-words">
                    {item.description}
                  </ToolMutedText>
                ) : null}
                {item.badges?.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {item.badges.map(badge => (
                      <ToolBadge key={badge} isDark={isDark}>
                        {badge}
                      </ToolBadge>
                    ))}
                  </div>
                ) : null}
              </ToolDividerListItem>
            ))}
          </ToolDividerList>
        ) : null}

        {!payload.metrics?.length && !payload.fields?.length && !payload.items?.length ? (
          <ToolMutedText isDark={isDark}>
            {payload.emptyText || "没有更多可展示的内容。"}
          </ToolMutedText>
        ) : null}
      </ToolCardBody>
    </ToolCard>
  );
};

export default StructuredToolResultRenderer;
