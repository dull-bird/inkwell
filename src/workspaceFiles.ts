export function normalizePdfPaths(paths: string[]): string[] {
  return Array.from(new Set(paths.filter((path) => /\.pdf$/i.test(path)))).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  );
}
