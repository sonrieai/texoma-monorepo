import type { NextConfig } from "next";

if (process.env.VERCEL === "1" && process.env.VERCEL_ENV === "production") {
  const secret = process.env.AUTH_SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_SESSION_SECRET (≥32 characters) is required for Vercel production.",
    );
  }
  const debugFlag = process.env.NEXHEALTH_DEBUG?.trim().toLowerCase();
  if (debugFlag === "1" || debugFlag === "true" || debugFlag === "yes") {
    console.warn(
      "[texoma] NEXHEALTH_DEBUG is enabled in Vercel production env — debug routes stay disabled at runtime (NODE_ENV=production). Set NEXHEALTH_DEBUG=0 in Vercel → Settings → Environment Variables to silence this warning.",
    );
  }
}

const nextConfig: NextConfig = {
  devIndicators: false,
};

export default nextConfig;
