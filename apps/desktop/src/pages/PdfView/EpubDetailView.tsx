import { Empty } from "antd";
import { useEffect, useState } from "react";

import EpubReader from "@/components/EpubReader";
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
        .then(epub => {
          setEpub(epub);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [epubId]);

  if (!epubId) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Empty description="EPUB不存在或已被删除" />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="relative flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-hidden">
            {loading ? (
              <div className="flex h-full w-full items-center justify-center">
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
