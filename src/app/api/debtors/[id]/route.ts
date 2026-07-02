import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { debtors, debts } from "@/db/schema";
import { eq } from "drizzle-orm";

// Add debt to debtor
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const debtorId = parseInt(id);
    const body = await req.json();
    const { amount, description, invoiceId, invoiceNumber, jalaaliDate } = body;

    if (!amount) return NextResponse.json({ error: "مبلغ الزامی است" }, { status: 400 });

    const [debt] = await db
      .insert(debts)
      .values({
        debtorId,
        invoiceId: invoiceId || null,
        invoiceNumber: invoiceNumber || null,
        amount: amount.toString(),
        description: description || null,
        jalaaliDate: jalaaliDate || null,
        isPaid: false,
      })
      .returning();

    // Update total debt
    const [debtor] = await db.select().from(debtors).where(eq(debtors.id, debtorId));
    if (debtor) {
      await db
        .update(debtors)
        .set({ totalDebt: (Number(debtor.totalDebt) + Number(amount)).toString() })
        .where(eq(debtors.id, debtorId));
    }

    return NextResponse.json(debt);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در افزودن بدهی" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const debtorId = parseInt(id);
    const body = await req.json();
    const { name, phone, notes, settleAll, debtId } = body;

    if (settleAll) {
      // Settle all debts
      const unpaidDebts = await db
        .select()
        .from(debts)
        .where(eq(debts.debtorId, debtorId));

      const totalPaid = unpaidDebts
        .filter((d) => !d.isPaid)
        .reduce((sum, d) => sum + Number(d.amount), 0);

      await db
        .update(debts)
        .set({ isPaid: true, paidAt: new Date() })
        .where(eq(debts.debtorId, debtorId));

      await db
        .update(debtors)
        .set({ totalDebt: "0" })
        .where(eq(debtors.id, debtorId));

      return NextResponse.json({ success: true, totalPaid });
    }

    if (debtId) {
      // Settle single debt
      const [debt] = await db.select().from(debts).where(eq(debts.id, debtId));
      if (debt && !debt.isPaid) {
        await db
          .update(debts)
          .set({ isPaid: true, paidAt: new Date() })
          .where(eq(debts.id, debtId));

        const [debtor] = await db.select().from(debtors).where(eq(debtors.id, debtorId));
        if (debtor) {
          const newTotal = Math.max(0, Number(debtor.totalDebt) - Number(debt.amount));
          await db
            .update(debtors)
            .set({ totalDebt: newTotal.toString() })
            .where(eq(debtors.id, debtorId));
        }
      }
      return NextResponse.json({ success: true });
    }

    // Update debtor info
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone || null;
    if (notes !== undefined) updateData.notes = notes || null;

    const [debtor] = await db
      .update(debtors)
      .set(updateData)
      .where(eq(debtors.id, debtorId))
      .returning();

    return NextResponse.json(debtor);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در ویرایش" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.delete(debts).where(eq(debts.debtorId, parseInt(id)));
    await db.delete(debtors).where(eq(debtors.id, parseInt(id)));
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در حذف بدهکار" }, { status: 500 });
  }
}
