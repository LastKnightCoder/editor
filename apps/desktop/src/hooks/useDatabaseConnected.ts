import useGlobalStateStore from "@/stores/useGlobalStateStore";
import useSettingStore from "@/stores/useSettingStore";

const useDatabaseConnected = () => {
  const databaseName = useSettingStore(
    (state) => state.setting.database.active,
  );
  const databaseStatus = useGlobalStateStore((state) => state.databaseStatus);
  const status = databaseStatus[databaseName];
  const isConnected = status === "ready" || status === "reconnecting";

  return isConnected;
};

export default useDatabaseConnected;
