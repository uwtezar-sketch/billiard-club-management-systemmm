import { NextResponse } from "next/server";
import { db } from "@/db";
import { navigationSummaryQuery } from "@/lib/navigationSummary";

export async function GET() {
  try {
    const result = await db.execute(navigationSummaryQuery);
    return NextResponse.json(result.rows[0], {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ error: "خطا در دریافت خلاصه وضعیت" }, { status: 500 });
  }
}
