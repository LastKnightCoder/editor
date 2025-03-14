import { useMemo } from "react";

import useCardConfig from "./useCardConfig";
import useArticleConig from "./useArticleConfig";
import useProjectConfig from "./useProjectConfig";
import useDocumentConfig from "./useDocumentConfig";

// 定义通用的表格配置接口，包含 leftExtraNode
interface TableConfig {
  dataSource: any[];
  columns: any[];
  pagination: any;
  onChange: any;
  rowSelection: any;
  rightExtraNode: React.ReactNode;
  leftExtraNode?: React.ReactNode;
}

const useTableConfig = (key: string): TableConfig | null => {
  const cardConfig = useCardConfig();
  const articleConfig = useArticleConig();
  const projectConfig = useProjectConfig();
  const documentConfig = useDocumentConfig();

  const tableConfig = useMemo(() => {
    if (key === "card") {
      return cardConfig;
    } else if (key === "article") {
      return articleConfig;
    } else if (key === "project") {
      return projectConfig;
    } else if (key === "document") {
      return documentConfig;
    } else {
      return null;
    }
  }, [cardConfig, articleConfig, projectConfig, documentConfig, key]);

  return tableConfig;
};

export default useTableConfig;
