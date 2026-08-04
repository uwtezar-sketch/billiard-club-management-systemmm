// شباهت دو رشته، بین ۰ (کاملاً متفاوت) تا ۱ (دقیقاً یکی). بر پایه‌ی فاصله‌ی Levenshtein.
export function stringSimilarity(a: string, b: string): number {
  const s1 = a.trim().toLowerCase();
  const s2 = b.trim().toLowerCase();
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;

  const m = s1.length;
  const n = s2.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  const distance = dp[m][n];
  const maxLen = Math.max(m, n);
  return maxLen === 0 ? 1 : 1 - distance / maxLen;
}
