export function getLevenshteinDistance(a: string, b: string): number {
  const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i])
    .map((row, i) => {
      if (i === 0) return Array.from({ length: a.length + 1 }, (_, j) => j);
      return row;
    });

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  return matrix[b.length][a.length];
}