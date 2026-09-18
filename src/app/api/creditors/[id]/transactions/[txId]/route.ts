import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { creditorTransactions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { recomputeCreditorTotal } from "@/lib/creditorLink";

// برای وقتی مبلغ یک تراکنش اشتباه ثبت شده
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; txId: string }> }
) {
  try {
    const { id, txId } = await params;
    const creditorId = parseInt(id);
    const body = await req.json();
    const { amount, description } = body;

    const updateData: Record<string, unknown> = {};
    if (amount !== undefined && Number(amount) > 0) updateData.amount = Number(amount).toString();
    if (description !== undefined) updateData.description = description || null;

    const [updated] = await db
      .update(creditorTransactions)
      .set(updateData)
      .where(eq(creditorTransactions.id, parseInt(txId)))
      .returning();
    if (!updated) return NextResponse.json({ error: "تراکنش یافت نشد" }, { status: 404 });

    const newTotal = await recomputeCreditorTotal(creditorId);
    return NextResponse.json({ transaction: updated, totalCredit: newTotal });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در ویرایش تراکنش" }, { status: 500 });
  }
}

// برای وقتی یک تراکنش کلاً اشتباهی ثبت شده
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; txId: string }> }
) {
  try {
    const { id, txId } = await params;
    const creditorId = parseInt(id);
    await db.delete(creditorTransactions).where(eq(creditorTransactions.id, parseInt(txId)));
    const newTotal = await recomputeCreditorTotal(creditorId);
    return NextResponse.json({ success: true, totalCredit: newTotal });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در حذف تراکنش" }, { status: 500 });
  }
}
