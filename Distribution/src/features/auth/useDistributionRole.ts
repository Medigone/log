import { useMemo } from "react";
import { useDistributionUser } from "@/shared/api/auth";
import type { DistributionRole, DistributionUser } from "@/shared/types/distribution";

const rolePriority: Array<{ names: string[]; role: DistributionRole }> = [
  { names: ["Administrator", "System Manager", "Responsable", "Responsable Distribution"], role: "responsable" },
  { names: ["Planificateur", "Planificateur Distribution"], role: "planificateur" },
  { names: ["Préparateur", "Préparateur Distribution", "Preparateur Distribution"], role: "preparateur" },
  { names: ["Livreur", "Livreur Distribution"], role: "livreur" },
  { names: ["Caissier", "Caissier Distribution"], role: "caissier" },
];

export function resolveDistributionRole(roleNames: Iterable<string>, currentUser?: string): DistributionRole {
  const names = new Set(roleNames);
  if (currentUser) names.add(currentUser);
  return rolePriority.find((candidate) => candidate.names.some((name) => names.has(name)))?.role || "none";
}

export function useDistributionRole(currentUser?: string | null) {
  const { data, isLoading, error } = useDistributionUser(currentUser);

  const user = useMemo<DistributionUser | null>(() => {
    if (!currentUser) return null;
    return data?.message || null;
  }, [currentUser, data]);

  return { user, isLoading, error };
}
