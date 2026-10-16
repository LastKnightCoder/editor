/**
 * 批量导入向导的壳层承载：app/transferStore 有请求时挂载，关闭即卸载（下次打开状态归零）。
 */

import { useTransferStore } from "@/app/transferStore";
import { ImportWizard } from "./ImportWizard";

export function ImportWizardHost() {
  const request = useTransferStore(s => s.importWizard);
  const close = useTransferStore(s => s.closeImportWizard);
  if (!request) return null;
  return <ImportWizard request={request} onClose={close} />;
}
