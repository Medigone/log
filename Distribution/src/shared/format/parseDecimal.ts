/** Nombre saisi au clavier (virgule ou point) ; null si vide ou invalide. */
export function parseDecimal(value: string) {
  const parsed = Number(value.replace(",", ".").trim());
  return value.trim() && Number.isFinite(parsed) ? parsed : null;
}
