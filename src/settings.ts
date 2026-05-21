function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function mergeSettings(source: unknown, target: unknown): unknown {
  if (!isRecord(source) || !isRecord(target)) {
    return target ?? source;
  }

  const merged: Record<string, unknown> = { ...source };
  for (const [key, targetValue] of Object.entries(target)) {
    const sourceValue = merged[key];
    if (isRecord(sourceValue) && isRecord(targetValue)) {
      merged[key] = mergeSettings(sourceValue, targetValue);
    } else {
      merged[key] = targetValue;
    }
  }

  return merged;
}
