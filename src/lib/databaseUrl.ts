export function normalizeDatabaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
    if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error();
  } catch {
    // URL's native exception includes its input; never pass a credential-bearing URL to logs.
    throw new Error("DATABASE_URL is invalid");
  }
  // Preserve pg 8's existing certificate verification explicitly, without downgrading TLS.
  if (!url.searchParams.has("uselibpqcompat") &&
      ["require", "prefer", "verify-ca"].includes(url.searchParams.get("sslmode") || "")) {
    url.searchParams.set("sslmode", "verify-full");
  }
  return url.toString();
}
