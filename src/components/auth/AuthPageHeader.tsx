import { BrandLogo } from "@/components/brand/BrandLogo";

export function AuthPageHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-6 text-center">
      <BrandLogo className="mx-auto mb-3" />
      <h1 className="font-display m-0 text-[1.65rem] font-semibold text-foreground">
        {title}
      </h1>
      <p className="m-0 mt-2 text-[13px] text-muted">{subtitle}</p>
    </div>
  );
}
