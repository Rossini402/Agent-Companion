/** @type {import('next').NextConfig} */
const nextConfig = {
  // contracts 是 workspace 内的 TS 源码包，让 Next 转译它
  transpilePackages: ["@ai-companion/contracts"],
}

export default nextConfig
