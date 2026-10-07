import type { Metadata, Viewport } from "next";
import { Fraunces } from "next/font/google";
import { GlobalNavigationProgress } from "@/components/shell/GlobalNavigationProgress";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
});

export const metadata: Metadata = {
  title: "Texoma Dentures & Implants — Practice KPI Dashboard",
  description:
    "Practice KPI dashboard for Texoma Dentures & Implants",
  icons: {
    icon: "/texoma-logo.png",
    apple: "/texoma-logo.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={fraunces.variable}>
      <body className="min-h-full antialiased">
        <GlobalNavigationProgress />
        {children}
      </body>
    </html>
  );
}
