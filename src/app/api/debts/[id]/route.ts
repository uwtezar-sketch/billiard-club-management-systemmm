import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { debts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { recomputeDebtorTotal } from "@/lib/debtorLink";

// PATCH /api/debts/[id]
// body: { amount?: number, description?: string, isPaid?: boolean }
// برای وقتی مبلغ اشتباه ثبت شده، توضیح باید عوض بشه، یا یک تسویه‌ی اشتباهی باید برگرده («در انتظار»)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const debtId = parseInt(id);
    const body = await req.json();
    const { amount, description, isPaid } = body;

    const [existing] = await db.select().from(debts).where(eq(debts.id, debtId));
    if (!existing) return NextResponse.json({ error: "بدهی یافت نشد" }, { status: 404 });

    const updateData: Record<string, unknown> = {};
    if (amount !== undefined && Number(amount) > 0) updateData.amount = Number(amount).toString();
    if (description !== undefined) updateData.description = description || null;
    if (isPaid !== undefined) {
      updateData.isPaid = isPaid;
      updateData.paidAt = isPaid ? new Date() : null;
    }

    const [updated] = await db.update(debts).set(updateData).where(eq(debts.id, debtId)).returning();
    await recomputeDebtorTotal(existing.debtorId);

    return NextResponse.json(updated);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در ویرایش بدهی" }, { status: 500 });
  }
}

// DELETE /api/debts/[id] — برای وقتی یک بدهی کلاً اشتباهی ثبت شده
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const debtId = parseInt(id);
    const [existing] = await db.select().from(debts).where(eq(debts.id, debtId));
    if (!existing) return NextResponse.json({ error: "بدهی یافت نشد" }, { status: 404 });

    await db.delete(debts).where(eq(debts.id, debtId));
    await recomputeDebtorTotal(existing.debtorId);

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در حذف بدهی" }, { status: 500 });
  }
}
