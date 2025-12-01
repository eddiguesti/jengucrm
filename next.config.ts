import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Mark pino and related packages as external (not bundled by Turbopack)
  // This fixes build issues with thread-stream test files
  serverExternalPackages: ['pino', 'pino-pretty', 'thread-stream'],
};

export default nextConfig;
