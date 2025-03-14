import { useState } from "react";
import { useAsyncEffect } from "ahooks";
import { getVersions } from "@/commands";

import styles from "./index.module.less";

const AppAbout = () => {
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState("0.0");

  useAsyncEffect(async () => {
    setLoading(true);
    const versions = await getVersions();
    setVersion(versions.app);
    setLoading(false);
  });

  if (loading) {
    return (
      <div className={styles.loadContainer}>
        <div className={styles.loader} />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.version}>软件版本：{version}</div>
    </div>
  );
};

export default AppAbout;
