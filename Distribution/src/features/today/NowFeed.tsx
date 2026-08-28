import { useNavigate } from "react-router-dom";
import { Radio } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ActivityNowItem } from "@/shared/types/distribution";

const TONE_CLASS: Record<string, string> = {
  danger: "border-red-200 bg-red-50",
  warning: "border-amber-200 bg-amber-50",
  success: "border-emerald-200 bg-emerald-50",
  info: "border-brand-200 bg-brand-50",
};

export function NowFeed({ items }: { items: ActivityNowItem[] }) {
  const navigate = useNavigate();
  return (
    <Card>
      <CardHeader>
        <CardTitle>En cours maintenant</CardTitle>
        <p className="t-body text-muted-foreground">Préparation, tournées et contrôles actifs.</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {!items.length && (
          <p className="rounded-md border border-hairline bg-surface-subtle p-3 t-body text-muted-foreground">
            Rien n’est en cours pour le moment.
          </p>
        )}
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => item.target && navigate(item.target)}
            className={`w-full rounded-md border p-3 text-left ${TONE_CLASS[item.tone] || TONE_CLASS.info}`}
          >
            <p className="flex items-start gap-2 text-sm font-medium text-foreground">
              <Radio className="mt-0.5 size-4 shrink-0" />
              {item.title}
            </p>
            <p className="mt-1 t-meta text-muted-foreground">{item.detail}</p>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
