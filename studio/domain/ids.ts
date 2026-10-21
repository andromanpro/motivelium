// Идентификаторы Project v2: стабильные, человекочитаемые, kebab-case.
export const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;

export function isValidId(id: unknown): id is string {
  return typeof id === 'string' && ID_PATTERN.test(id);
}

/** Новый уникальный id с префиксом, например newId('node') → 'node-k3f9c2'. */
export function newId(prefix: string): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
      : String(Math.random()).slice(2, 12);
  return `${prefix}-${rnd}`;
}

export function assertId(id: unknown, what: string): string {
  if (!isValidId(id)) throw new Error(`${what}: некорректный id "${String(id)}"`);
  return id;
}
