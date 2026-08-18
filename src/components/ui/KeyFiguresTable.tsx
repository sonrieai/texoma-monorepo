import { Card } from "@/components/ui/Cards";

export function KeyFiguresTable({
  rows,
  title,
  subtitle,
}: {
  rows: { label: string; value: string }[];
  title?: string;
  subtitle?: string;
}) {
  return (
    <Card
      title={title}
      subtitle={subtitle}
      className={title ? "" : "overflow-hidden p-0 sm:p-0"}
    >
      <table className="w-full border-collapse text-[12.5px]">
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-line last:border-0">
              <td className="px-4 py-2.5 text-muted">{row.label}</td>
              <td className="px-4 py-2.5 text-right font-bold tabular-nums">
                {row.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
