import type { NextConfig } from "next";

if (process.env.VERCEL === "1" && process.env.VERCEL_ENV === "production") {
  const secret = process.env.AUTH_SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_SESSION_SECRET (≥32 characters) is required for Vercel production.",
    );
  }
}

const nextConfig: NextConfig = {
  devIndicators: false,
};

export default nextConfig;
