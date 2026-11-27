import { Table } from "lucide-react";
import { IBlockPanelListItem } from "@tau/editor";
import { insertDatabase } from "../utils";

import { databaseEmbedTranslator } from "../i18n";

const items: IBlockPanelListItem[] = [
  {
    id: "host.database.insert",
    icon: Table,
    get title() {
      return databaseEmbedTranslator.t("insert.title");
    },
    get description() {
      return databaseEmbedTranslator.t("insert.description");
    },
    keywords: ["database", "数据表", "table"],
    onClick: editor => {
      insertDatabase(editor);
    },
  },
];

export default items;
