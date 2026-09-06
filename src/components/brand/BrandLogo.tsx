import Image from "next/image";

type BrandLogoProps = {
  size?: "sm" | "md";
  className?: string;
};

const LOGO_SRC = "/texoma-logo.png";

const SIZES = {
  sm: { width: 150, height: 150, className: "h-9 w-9 rounded-md" },
  md: { width: 150, height: 150, className: "h-24 w-24 rounded-lg sm:h-28 sm:w-28" },
} as const;

export function BrandLogo({ size = "md", className }: BrandLogoProps) {
  const dim = SIZES[size];
  return (
    <Image
      src={LOGO_SRC}
      alt="Texoma Dentures & Implants"
      width={dim.width}
      height={dim.height}
      priority={size === "md"}
      className={`object-cover ${dim.className} ${className ?? ""}`}
    />
  );
}
