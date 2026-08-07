import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { debtorPayments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { recomputeDebtorTotal } from "@/lib/debtorLink";

// برای وقتی مبلغ پرداختی اشتباه تایپ شده (مثلاً ۵ میلیون به‌جای ۵۰۰ هزار)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  try {
    const { id, paymentId } = await params;
    const debtorId = parseInt(id);
    const body = await req.json();
    const { amount, note } = body;

    const updateData: Record<string, unknown> = {};
    if (amount !== undefined && Number(amount) > 0) updateData.amount = Number(amount).toString();
    if (note !== undefined) updateData.note = note || null;

    const [updated] = await db
      .update(debtorPayments)
      .set(updateData)
      .where(eq(debtorPayments.id, parseInt(paymentId)))
      .returning();
    if (!updated) return NextResponse.json({ error: "پرداخت یافت نشد" }, { status: 404 });

    const newTotal = await recomputeDebtorTotal(debtorId);
    return NextResponse.json({ payment: updated, totalDebt: newTotal });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در ویرایش پرداخت" }, { status: 500 });
  }
}

// برای وقتی یک پرداخت کلاً اشتباهی ثبت شده
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  try {
    const { id, paymentId } = await params;
    const debtorId = parseInt(id);

    await db.delete(debtorPayments).where(eq(debtorPayments.id, parseInt(paymentId)));
    const newTotal = await recomputeDebtorTotal(debtorId);

    return NextResponse.json({ success: true, totalDebt: newTotal });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در حذف پرداخت" }, { status: 500 });
  }
}
