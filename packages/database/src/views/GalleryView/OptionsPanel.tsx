import React, { memo } from "react";
import { Radio, RadioGroup } from "@tau/ui";
import ColumnDropdown from "../../ColumnDropdown";
import type { GalleryViewConfig } from "../../types";
import type { ViewOptionsPanelProps } from "../types";
import { useDatabaseI18n } from "../../i18n";

/** 画廊视图的专属配置区块：封面类型与图片列（受控，viewOptions.gallery） */
const GalleryOptionsPanel: React.FC<ViewOptionsPanelProps<GalleryViewConfig>> = memo(
  ({ options, onChange, columns, pluginManager }) => {
    const { t } = useDatabaseI18n();
    const coverType = options?.coverType ?? "detail";
    const coverImageColumnId = options?.coverImageColumnId ?? "";
    const imageColumns = columns.filter(col => pluginManager.hasCapability(col.type, "images"));

    return (
      <>
        <RadioGroup
          label={t("gallery.coverTypeLabel")}
          value={coverType}
          onValueChange={value =>
            onChange({ coverType: value as "detail" | "image", coverImageColumnId })
          }
          orientation="vertical"
        >
          <Radio value="detail" label={t("gallery.cover.detail")} />
          <Radio
            value="image"
            disabled={imageColumns.length === 0}
            label={imageColumns.length === 0 ? t("gallery.cover.imageEmpty") : t("gallery.cover.image")}
          />
        </RadioGroup>

        {coverType === "image" && imageColumns.length > 0 && (
          <ColumnDropdown
            columns={imageColumns}
            selectedId={coverImageColumnId}
            onSelect={nextCoverImageColumnId =>
              onChange({ coverType, coverImageColumnId: nextCoverImageColumnId })
            }
            placeholder={t("gallery.imageColumnPlaceholder")}
            label={t("gallery.imageColumnLabel")}
          />
        )}
      </>
    );
  }
);

GalleryOptionsPanel.displayName = "GalleryOptionsPanel";

export default GalleryOptionsPanel;
