import { cn } from "@/lib/cn"
import type { UIMessage } from "@/lib/useAgentChat"

export function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user"
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[78%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed",
          isUser ? "rounded-br-sm bg-brand text-brand-fg" : "rounded-bl-sm border border-neutral-200 bg-white",
          message.status === "failed" && "border-red-300",
        )}
      >
        {message.content || (message.streaming ? <span className="text-neutral-400">···</span> : "")}
      </div>
    </div>
  )
}
