import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { debtors, debtorPayments } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { verifySessionToken } from "@/lib/auth";
import { todayJalaali } from "@/lib/jalaali";
import { recomputeDebtorTotal } from "@/lib/debtorLink";

// POST /api/debtors/[id]/payments
// body: { amount: number, note?: string }
// یک پرداخت دستیِ جزئی روی حساب بدهکار ثبت می‌کنه. برخلاف نسخه‌ی قبلی، این کار به هیچ‌کدوم از
// ردیف‌های «debts» دست نمی‌زنه — فقط به‌عنوان یک اعتبار کلی روی حساب ثبت می‌شه و از جمع بدهی‌های باز کم می‌شه.
// همین سادگی باعث می‌شه بعداً بشه پرداخت رو ویرایش یا حذف کرد بدون اینکه چیز دیگه‌ای بهم بریزه.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const debtorId = parseInt(id);
    const body = await req.json();
    const amount = Number(body.amount || 0);
    const note = body.note || null;

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "مبلغ پرداخت باید بیشتر از صفر باشد" }, { status: 400 });
    }

    const [debtor] = await db.select().from(debtors).where(eq(debtors.id, debtorId));
    if (!debtor) return NextResponse.json({ error: "بدهکار یافت نشد" }, { status: 404 });

    const sessionToken = req.cookies.get("session")?.value;
    const currentUser = sessionToken ? verifySessionToken(sessionToken) : null;

    const [payment] = await db
      .insert(debtorPayments)
      .values({
        debtorId,
        amount: amount.toString(),
        note,
        jalaaliDate: todayJalaali(),
        byUsername: currentUser?.username || null,
      })
      .returning();

    const newTotal = await recomputeDebtorTotal(debtorId);

    return NextResponse.json({ payment, totalDebt: newTotal });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در ثبت پرداخت" }, { status: 500 });
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const payments = await db
      .select()
      .from(debtorPayments)
      .where(eq(debtorPayments.debtorId, parseInt(id)))
      .orderBy(desc(debtorPayments.createdAt));
    return NextResponse.json(payments);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در دریافت پرداخت‌ها" }, { status: 500 });
  }
}
