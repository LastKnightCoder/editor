import { useEffect } from "react";
import { toast } from "@tau/ui";
import { useMemoizedFn } from "ahooks";

import { connectDatabaseByName } from "@/commands";
import useSettingStore from "@/stores/useSettingStore";
import useGlobalStateStore, { DatabaseConnectionStatus } from "@/stores/useGlobalStateStore";

const useInitDatabase = () => {
  const databaseStatus = useGlobalStateStore(state => state.databaseStatus);

  const inited = useSettingStore(state => state.inited);
  const database = useSettingStore(state => state.setting.database);

  const { active } = database;

  const handleDatabaseStatus = useMemoizedFn(
    (databaseName: string, status: DatabaseConnectionStatus) => {
      useGlobalStateStore.setState(state => ({
        databaseStatus: {
          ...state.databaseStatus,
          [databaseName]: status,
        },
      }));
    }
  );

  useEffect(() => {
    if (!inited || !active) return;
    const toastId = toast.loading("正在初始化数据库...");
    handleDatabaseStatus(active, "connecting");
    connectDatabaseByName(active)
      .then(async () => {
        toast.dismiss(toastId);
        handleDatabaseStatus(active, "ready");
      })
      .catch(e => {
        handleDatabaseStatus(active, "error");
        toast.reject(toastId, e.message);
      });
  }, [inited, active, handleDatabaseStatus]);

  return {
    databaseStatus,
    active,
  };
};

export default useInitDatabase;
