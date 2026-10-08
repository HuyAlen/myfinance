import type { NextConfig } from "next";

function resolveDeploymentRevision() {
  return (
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.GITHUB_SHA?.trim() ||
    process.env.SOURCE_VERSION?.trim() ||
    `build-${Date.now().toString(36)}`
  );
}

const deploymentRevision = resolveDeploymentRevision();

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_MYFINANCE_DEPLOYMENT_REVISION: deploymentRevision,
  },
};

export default nextConfig;