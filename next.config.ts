import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // 親ディレクトリに別の package-lock があると Next がルートを誤認し、ビルド時のチャンク解決が壊れるのを防ぐ
  outputFileTracingRoot: projectRoot,
  webpack: (config, { dev }) => {
    if (dev) {
      // ディスクキャッシュが HMR 中に壊れ Cannot find module './5611.js' になるのを防ぐ
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;
