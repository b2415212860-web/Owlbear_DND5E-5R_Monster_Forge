import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained Node.js server for Docker and other self-hosted
  // deployments. Vinext writes the runnable bundle to dist/standalone.
  output: "standalone",
};

export default nextConfig;
