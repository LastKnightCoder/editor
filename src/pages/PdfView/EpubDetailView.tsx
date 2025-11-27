import { Empty } from "antd";
import { useEffect, useState } from "react";

import EpubReader from "./EpubReader/index";
import { getEpubById } from "@/commands/epub";
import { Epub } from "@/types";
import { LoadingOutlined } from "@ant-design/icons";
import useTabParams from "@/hooks/useTabParams";
import { TabType } from "@/types/tab";

const EpubDetailView = () => {
  const { id } = useTabParams(TabType.EpubDetail);
  const epubId = id;

  const [epub, setEpub] = useState<Epub | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (epubId) {
      setLoading(true);
      getEpubById(epubId)
        .then((epub) => {
          setEpub(epub);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [epubId]);

  if (!epubId) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Empty description="EPUB不存在或已被删除" />
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-1 flex overflow-hidden relative">
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0 overflow-hidden">
            {loading ? (
              <div className="w-full h-full flex items-center justify-center">
                <LoadingOutlined />
              </div>
            ) : epub ? (
              <EpubReader epub={epub} />
            ) : (
              <Empty description="请选择一个EPUB文件" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EpubDetailView;
