import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth";

export const runtime = "nodejs";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/manifest.json"];

const EMPLOYEE_ALLOWED: { method: string; pattern: RegExp }[] = [
  { method: "GET", pattern: /^\/api\/tables$/ },
  { method: "GET", pattern: /^\/api\/cafe$/ },
  { method: "GET", pattern: /^\/api\/settings$/ },
  { method: "GET", pattern: /^\/api\/reservations$/ },
  { method: "POST", pattern: /^\/api\/reservations$/ },
  { method: "PATCH", pattern: /^\/api\/reservations\/\d+$/ },
  { method: "DELETE", pattern: /^\/api\/reservations\/\d+$/ },
  { method: "POST", pattern: /^\/api\/sessions$/ },
  { method: "PATCH", pattern: /^\/api\/sessions\/\d+$/ },
  { method: "GET", pattern: /^\/api\/sessions\/\d+\/cafe$/ },
  { method: "POST", pattern: /^\/api\/sessions\/\d+\/cafe$/ },
  { method: "DELETE", pattern: /^\/api\/sessions\/\d+\/cafe$/ },
  { method: "GET", pattern: /^\/api\/invoices$/ },
  { method: "POST", pattern: /^\/api\/invoices$/ },
  { method: "PATCH", pattern: /^\/api\/invoices\/\d+$/ },
  { method: "DELETE", pattern: /^\/api\/invoices\/\d+$/ },
  { method: "GET", pattern: /^\/api\/debtors$/ },
  { method: "POST", pattern: /^\/api\/debtors$/ },
  { method: "POST", pattern: /^\/api\/debtors\/\d+$/ },
  { method: "PATCH", pattern: /^\/api\/debtors\/\d+$/ },
  { method: "DELETE", pattern: /^\/api\/debtors\/\d+$/ },
  { method: "GET", pattern: /^\/api\/auth\/me$/ },
  { method: "POST", pattern: /^\/api\/auth\/logout$/ },
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get("session")?.value;
  const session = token ? verifySessionToken(token) : null;

  const isApi = pathname.startsWith("/api");

  if (!session) {
    if (isApi) {
      return NextResponse.json({ error: "لطفاً وارد شوید" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }

  if (session.role === "employee" && isApi) {
    const allowed = EMPLOYEE_ALLOWED.some(
      (rule) => rule.method === req.method && rule.pattern.test(pathname)
    );
    if (!allowed) {
      return NextResponse.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.png$|.*\\.svg$|.*\\.ico$).*)"],
};
