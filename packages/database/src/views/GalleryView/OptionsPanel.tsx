import React, { memo } from "react";
import { Radio, RadioGroup } from "@tau/ui";
import ColumnDropdown from "../../ColumnDropdown";
import type { GalleryViewConfig } from "../../types";
import type { ViewOptionsPanelProps } from "../types";

/** 画廊视图的专属配置区块：封面类型与图片列（受控，viewOptions.gallery） */
const GalleryOptionsPanel: React.FC<ViewOptionsPanelProps<GalleryViewConfig>> = memo(
  ({ options, onChange, columns, pluginManager }) => {
    const coverType = options?.coverType ?? "detail";
    const coverImageColumnId = options?.coverImageColumnId ?? "";
    const imageColumns = columns.filter(col => pluginManager.hasCapability(col.type, "images"));

    return (
      <>
        <RadioGroup
          label="封面类型"
          value={coverType}
          onValueChange={value =>
            onChange({ coverType: value as "detail" | "image", coverImageColumnId })
          }
          orientation="vertical"
        >
          <Radio value="detail" label="详情" />
          <Radio
            value="image"
            disabled={imageColumns.length === 0}
            label={imageColumns.length === 0 ? "图片（无图片列）" : "图片"}
          />
        </RadioGroup>

        {coverType === "image" && imageColumns.length > 0 && (
          <ColumnDropdown
            columns={imageColumns}
            selectedId={coverImageColumnId}
            onSelect={nextCoverImageColumnId =>
              onChange({ coverType, coverImageColumnId: nextCoverImageColumnId })
            }
            placeholder="选择图片列"
            label="图片列"
          />
        )}
      </>
    );
  }
);

GalleryOptionsPanel.displayName = "GalleryOptionsPanel";

export default GalleryOptionsPanel;
