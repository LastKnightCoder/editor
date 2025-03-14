import { useMemo } from "react";

import useCardConfig from "./useCardConfig";
import useArticleConig from "./useArticleConfig";

const useTableConfig = (key: string) => {
  const cardConfig = useCardConfig();
  const articleConfig = useArticleConig();

  const tableConfig = useMemo(() => {
    if (key === "card") {
      return cardConfig;
    } else if (key === "article") {
      return articleConfig;
    } else {
      return null;
    }
  }, [cardConfig, articleConfig, key]);

  return tableConfig;
};

export default useTableConfig;
