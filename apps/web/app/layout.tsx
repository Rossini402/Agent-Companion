import "./globals.css"
import type { Metadata } from "next"
import type { ReactNode } from "react"
import { Providers } from "@/lib/providers"

export const metadata: Metadata = {
  title: "AI 陪伴",
  description: "AI Companion — 四阶段 Agent 后端的前端",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
