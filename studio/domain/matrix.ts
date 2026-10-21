// Матрицы 2D-аффинных преобразований (совместимы с canvas setTransform).
// Один расчёт для рендера, рамки выбора и hit-test.

export type Mat2d = { a: number; b: number; c: number; d: number; e: number; f: number };

export const IDENTITY: Mat2d = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/** m1 ∘ m2: сначала применяется m2, затем m1 (как canvas.transform). */
export function compose(m1: Mat2d, m2: Mat2d): Mat2d {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  };
}

/** Локальная матрица узла: перенос, поворот вокруг pivot, масштаб вокруг pivot. */
export function localMatrix(t: {
  x: number; y: number; rotation: number; scaleX: number; scaleY: number; pivotX: number; pivotY: number;
}): Mat2d {
  // T(x + px, y + py) · R · S · T(-px, -py)
  const cos = Math.cos(t.rotation), sin = Math.sin(t.rotation);
  const rs_a = cos * t.scaleX, rs_b = sin * t.scaleX, rs_c = -sin * t.scaleY, rs_d = cos * t.scaleY;
  return {
    a: rs_a,
    b: rs_b,
    c: rs_c,
    d: rs_d,
    e: t.x + t.pivotX - (rs_a * t.pivotX + rs_c * t.pivotY),
    f: t.y + t.pivotY - (rs_b * t.pivotX + rs_d * t.pivotY),
  };
}

export function applyMatrix(m: Mat2d, px: number, py: number): { x: number; y: number } {
  return { x: m.a * px + m.c * py + m.e, y: m.b * px + m.d * py + m.f };
}

export function invert(m: Mat2d): Mat2d {
  const det = m.a * m.d - m.b * m.c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) throw new Error('Вырожденная матрица преобразования');
  return {
    a: m.d / det, b: -m.b / det,
    c: -m.c / det, d: m.a / det,
    e: (m.c * m.f - m.d * m.e) / det,
    f: (m.b * m.e - m.a * m.f) / det,
  };
}

/** Экранная точка → локальные координаты узла (для hit-test). */
export function toLocal(world: Mat2d, screenX: number, screenY: number): { x: number; y: number } {
  return applyMatrix(invert(world), screenX, screenY);
}
