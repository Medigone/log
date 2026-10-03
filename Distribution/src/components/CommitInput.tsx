import { useEffect, useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";

/** Champ saisi librement, transmis à la sortie du champ ou sur Entrée (évite un calcul par frappe). */
export function CommitInput({
  value,
  onCommit,
  ...props
}: Omit<ComponentProps<typeof Input>, "value" | "onChange"> & { value: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft === value) return;
    onCommit(draft);
    // Valeur refusée par le parent : on réaffiche la valeur courante (une valeur acceptée revient par `value`).
    setDraft(value);
  };
  return (
    <Input
      {...props}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        }
      }}
    />
  );
}
