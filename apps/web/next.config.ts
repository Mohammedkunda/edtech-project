import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source; transpile them for the browser.
  transpilePackages: ["@localfirst/shared", "@localfirst/db"],
};

export default nextConfig;
