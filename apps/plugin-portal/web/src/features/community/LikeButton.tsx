import { Heart } from "lucide-react";
import { Button, cn, toast } from "@tau/ui";
import { errorMessage } from "../../api/errors";
import { useCommunity, useLike } from "./useCommunity";

export function LikeButton({ pluginId }: { pluginId: string }) {
  const { first } = useCommunity(pluginId);
  const like = useLike(pluginId);
  if (!first) return null;
  return (
    <Button
      aria-pressed={first.liked}
      aria-label={`${first.liked ? "取消喜欢" : "喜欢"} · ${first.likes}`}
      disabled={like.isPending}
      onClick={() =>
        like.mutate(!first.liked, {
          onError: error => toast.error(`操作失败：${errorMessage(error)}`),
        })
      }
      className={cn(first.liked && "text-danger [&_svg]:fill-current")}
    >
      <Heart size={16} strokeWidth={1.75} />
      {first.likes}
    </Button>
  );
}
