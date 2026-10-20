import type { NextConfig } from "next";

// Refuse to start without a session secret in every environment (no open dashboard).
{
  const secret = process.env.AUTH_SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_SESSION_SECRET (≥32 characters) is required. The dashboard will not start without login.",
    );
  }
}

const googleMapsApiKey =
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
  process.env.REACT_APP_GOOGLE_MAPS_API_KEY?.trim() ||
  "";

const nextConfig: NextConfig = {
  serverExternalPackages: ["nodemailer"],
  allowedDevOrigins: ["127.0.0.1", "192.168.1.10"],
  devIndicators: false,
  env: {
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: googleMapsApiKey,
  },
};

export default nextConfig;
