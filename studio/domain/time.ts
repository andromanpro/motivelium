// Время Project v2: кадры — целые, fromFrame включительно, toFrame исключительно.
// fps хранится как {num, den}; на первом этапе num/den целые и fps() даёт целое.

export type Fps = { num: number; den: number };

export function validFps(f: unknown): Fps {
  if (typeof f !== 'object' || f === null) throw new Error('fps: ожидается объект {num, den}');
  const num = (f as Record<string, unknown>).num;
  const den = (f as Record<string, unknown>).den;
  if (typeof num !== 'number' || typeof den !== 'number' || !Number.isInteger(num) || !Number.isInteger(den) || num <= 0 || den <= 0 || num / den < 1 || num / den > 240) {
    throw new Error(`fps: недопустимое значение ${String(num)}/${String(den)}`);
  }
  return { num, den };
}

export function fpsValue(f: Fps): number {
  return f.num / f.den;
}

/** Секунды → кадр (целое, округление к ближайшему). */
export function secondsToFrame(seconds: number, fps: Fps): number {
  return Math.round(seconds * fpsValue(fps));
}

/** Кадр → секунды. Одна общая функция для всего UI. */
export function frameToSeconds(frame: number, fps: Fps): number {
  return frame / fpsValue(fps);
}

/** Допустимый диапазон кадров проекта: [0, durationFrames - 1]. */
export function clampFrame(frame: number, durationFrames: number): number {
  if (!Number.isFinite(frame)) return 0;
  return Math.max(0, Math.min(Math.trunc(frame), durationFrames - 1));
}

/** Принадлежит ли кадр интервалу [fromFrame, toFrame). */
export function frameInRange(frame: number, fromFrame: number, toFrame: number): boolean {
  return frame >= fromFrame && frame < toFrame;
}

/** Проверка интервала; бросает ошибку с именем сущности. */
export function assertFrameRange(fromUnknown: unknown, toUnknown: unknown, durationFrames: number, what: string): { fromFrame: number; toFrame: number } {
  if (typeof fromUnknown !== 'number' || typeof toUnknown !== 'number' || !Number.isInteger(fromUnknown) || !Number.isInteger(toUnknown)) {
    throw new Error(`${what}: границы кадра должны быть целыми`);
  }
  const from = fromUnknown, to = toUnknown;
  if (from < 0 || to <= from) throw new Error(`${what}: требуется 0 ≤ fromFrame < toFrame`);
  if (from > durationFrames || to > durationFrames) throw new Error(`${what}: интервал выходит за durationFrames=${durationFrames}`);
  return { fromFrame: from, toFrame: to };
}
