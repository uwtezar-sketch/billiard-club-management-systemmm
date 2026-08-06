import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { debtors, debts, debtorPayments } from "@/db/schema";
import { eq, and, asc, desc } from "drizzle-orm";
import { verifySessionToken } from "@/lib/auth";
import { todayJalaali } from "@/lib/jalaali";

// POST /api/debtors/[id]/payments
// body: { amount: number, note?: string }
// یک پرداخت دستیِ جزئی روی حساب بدهکار ثبت می‌کنه: مبلغ از کل بدهی‌اش کم می‌شه (از قدیمی‌ترین ردیف‌های
// بدهیِ باز شروع می‌کنه — اگه یک ردیف کامل پوشش داده بشه «تسویه‌شده» می‌شه، وگرنه فقط مبلغش کم می‌شه)
// و خودِ پرداخت با تاریخ/ساعت و اسم ثبت‌کننده جداگانه ذخیره می‌شه.
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

    const unpaidDebts = await db
      .select()
      .from(debts)
      .where(and(eq(debts.debtorId, debtorId), eq(debts.isPaid, false)))
      .orderBy(asc(debts.createdAt));

    let remaining = amount;
    for (const debt of unpaidDebts) {
      if (remaining <= 0) break;
      const debtAmt = Number(debt.amount);
      if (debtAmt <= remaining) {
        await db.update(debts).set({ isPaid: true, paidAt: new Date() }).where(eq(debts.id, debt.id));
        remaining -= debtAmt;
      } else {
        await db.update(debts).set({ amount: (debtAmt - remaining).toString() }).where(eq(debts.id, debt.id));
        remaining = 0;
      }
    }
    const applied = amount - remaining; // اگه پرداختی از کل بدهیِ ثبت‌شده بیشتر بود، مازادش عملاً به هیچ ردیفی نمی‌خوره

    const sessionToken = req.cookies.get("session")?.value;
    const currentUser = sessionToken ? verifySessionToken(sessionToken) : null;

    const newTotal = Math.max(0, Number(debtor.totalDebt) - applied);
    await db.update(debtors).set({ totalDebt: newTotal.toString() }).where(eq(debtors.id, debtorId));

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

    return NextResponse.json({ payment, appliedToDebts: applied, remainder: remaining });
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
