import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys, useApi } from "../../app/api";

/** 读取上传记录；服务端仍在校验时轮询 */
export function useUploadRecord(id: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.upload(id ?? ""),
    queryFn: () => api.getUpload(id!),
    enabled: !!id,
    staleTime: Infinity,
    refetchInterval: query => (query.state.data?.status === "checking" ? 2000 : false),
  });
}

/**
 * 图片预览：携带 Cookie 拉取二进制再转对象 URL。
 * 不直接把接口地址写进 <img src>，跨站部署时图片请求不一定带上会话 Cookie。
 */
export function useUploadImageUrl(id: string | null) {
  const api = useApi();
  const query = useQuery({
    queryKey: queryKeys.uploadContent(id ?? ""),
    queryFn: () => api.getUploadContent(id!),
    enabled: !!id,
    staleTime: Infinity,
    retry: false,
  });
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!query.data) return setUrl(null);
    const objectUrl = URL.createObjectURL(query.data);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [query.data]);
  return { url, isError: query.isError, isLoading: query.isLoading };
}
