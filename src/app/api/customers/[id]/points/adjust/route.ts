import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { customers, customerPointRedemptions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifySessionToken } from "@/lib/auth";
import { todayJalaali } from "@/lib/jalaali";
import { getRedeemedPoints } from "@/lib/loyalty";

// POST /api/customers/[id]/points/adjust
// body: { delta: number, note?: string }
// فقط مدیر — هدیه/تنظیم دستیِ امتیاز، جدا از منطق Smart Loyalty و بدون هیچ تاثیری روش.
// delta مثبت یعنی هدیه (امتیاز مشتری زیاد می‌شه)، delta منفی یعنی کسر دستی (کم می‌شه).
// چون فرمولِ موجودی همیشه «earned − مجموعِ ستونِ points تو این جدول» هست، برای اینکه delta مثبت
// باعث افزایش موجودی بشه، باید با علامتِ عکس ذخیره بشه (points = −delta) — این یه جزئیاتِ داخلیه،
// همه‌جای دیگه‌ی کد فقط با delta (که همون چیزیه که مدیر می‌بینه و می‌فهمه) کار می‌کنه.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = req.cookies.get("session")?.value;
    const session = token ? verifySessionToken(token) : null;
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "فقط مدیر می‌تونه امتیاز هدیه بده یا کم کنه" }, { status: 403 });
    }

    const { id } = await params;
    const customerId = parseInt(id);
    const body = await req.json();
    const delta = Number(body.delta);
    const note = body.note || null;

    if (!delta || !Number.isFinite(delta) || delta === 0) {
      return NextResponse.json({ error: "عدد امتیاز نامعتبره" }, { status: 400 });
    }

    const [customer] = await db.select().from(customers).where(eq(customers.id, customerId));
    if (!customer) return NextResponse.json({ error: "مشتری یافت نشد" }, { status: 404 });

    const [row] = await db
      .insert(customerPointRedemptions)
      .values({
        customerId,
        points: -delta,
        note: note || (delta > 0 ? "هدیه‌ی دستی مدیر" : "کسر دستی مدیر"),
        jalaaliDate: todayJalaali(),
        byUsername: session.username,
        kind: "adjustment",
      })
      .returning();

    const redeemedSoFar = await getRedeemedPoints(customerId);

    return NextResponse.json({ adjustment: row, delta, totalRedeemedNow: redeemedSoFar });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در ثبت هدیه/کسر امتیاز" }, { status: 500 });
  }
}
