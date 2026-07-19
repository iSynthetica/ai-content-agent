import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Обов'язково: @forteq/shared експортує сирі .ts (exports "." → "./src/index.ts"),
  // тож Next мусить його транспілювати, а не очікувати збілджений dist.
  transpilePackages: ["@forteq/shared"],
};

export default nextConfig;
