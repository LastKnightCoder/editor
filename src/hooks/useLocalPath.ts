import { convertFileSrc, getHomeDir } from "@/commands/file";
import { remoteResourceToLocal } from "@/utils/resouce";
import { useAsyncEffect } from "ahooks";
import { useState } from "react";

const useLocalPath = (src: string) => {
  const [localPath, setLocalPath] = useState("");
  const [loading, setLoading] = useState(true);

  useAsyncEffect(async () => {
    setLoading(true);
    try {
      if (!src) {
        setLocalPath("");
        return;
      }

      if (src.startsWith("data:") || src.startsWith("blob:")) {
        setLocalPath(src);
        return;
      }

      if (src.startsWith("http")) {
        try {
          const localUrl = await remoteResourceToLocal(src);
          const filePath = await convertFileSrc(localUrl);
          setLocalPath(filePath);
        } catch (error) {
          console.error(error);
          setLocalPath(src);
        }
      } else {
        const homeDir = await getHomeDir();
        const absolutePath = src.startsWith("~")
          ? `${homeDir}${src.slice(1)}`
          : src;
        const filePath = await convertFileSrc(absolutePath);
        setLocalPath(filePath);
      }
    } catch (error) {
      console.error(error);
      setLocalPath(src);
    } finally {
      setLoading(false);
    }
  }, [src]);

  return { localPath, loading };
};

export default useLocalPath;
