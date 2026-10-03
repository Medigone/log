import { useState } from "react";
import { toast } from "sonner";
import { changedFields, type SaveCustomer } from "@/features/customers/customerShared";
import type { CustomerChanges } from "@/shared/api/customers";
import { apiErrorMessage } from "@/shared/api/distribution";

/** État d'un formulaire d'onglet : n'envoie que les champs modifiés. */
export function useFormSave<T extends Partial<CustomerChanges>>(initial: T, onSave: SaveCustomer, message?: string) {
  const [values, setValues] = useState<T>(initial);
  const [pending, setPending] = useState(false);
  const changes = changedFields(initial, values);
  const dirty = Object.keys(changes).length > 0;

  const set = <K extends keyof T>(key: K, value: T[K]) => setValues((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    if (!dirty || pending) return;
    setPending(true);
    try {
      await onSave(changes as CustomerChanges, message);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return { values, set, dirty, pending, submit, reset: () => setValues(initial) };
}
