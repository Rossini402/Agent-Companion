import { ThumbsDown, ThumbsUp } from "lucide-react"
import { cn } from "@/lib/cn"
import type { UIMessage } from "@/lib/useAgentChat"

export function MessageBubble({
  message,
  onFeedback,
}: {
  message: UIMessage
  onFeedback?: (rating: "positive" | "negative") => void
}) {
  const isUser = message.role === "user"
  const canFeedback = !isUser && !!message.id && message.status === "completed" && !message.streaming && !!onFeedback

  return (
    <div className={cn("flex flex-col", isUser ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[78%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed",
          isUser ? "rounded-br-sm bg-brand text-brand-fg" : "rounded-bl-sm border border-neutral-200 bg-white",
          message.status === "failed" && "border-red-300",
        )}
      >
        {message.content || (message.streaming ? <span className="text-neutral-400">···</span> : "")}
      </div>
      {canFeedback ? (
        <div className="mt-1 flex gap-1 pl-1">
          <button
            onClick={() => onFeedback?.("positive")}
            aria-label="点赞"
            className={cn("rounded p-1 text-neutral-400 hover:bg-black/5", message.feedback?.rating === "positive" && "text-brand")}
          >
            <ThumbsUp size={14} />
          </button>
          <button
            onClick={() => onFeedback?.("negative")}
            aria-label="点踩"
            className={cn("rounded p-1 text-neutral-400 hover:bg-black/5", message.feedback?.rating === "negative" && "text-red-500")}
          >
            <ThumbsDown size={14} />
          </button>
        </div>
      ) : null}
    </div>
  )
}
