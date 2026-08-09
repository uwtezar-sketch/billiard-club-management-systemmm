import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { debtors, debts, debtorPayments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { recomputeDebtorTotal, settleDebtRow } from "@/lib/debtorLink";
import { verifySessionToken } from "@/lib/auth";

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

    await recomputeDebtorTotal(debtorId);

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
      const sessionToken = req.cookies.get("session")?.value;
      const currentUser = sessionToken ? verifySessionToken(sessionToken) : null;

      const unpaidDebts = await db.select().from(debts).where(eq(debts.debtorId, debtorId));
      for (const debt of unpaidDebts.filter((d) => !d.isPaid)) {
        await settleDebtRow(debt.id, currentUser?.username || null);
      }
      const total = await recomputeDebtorTotal(debtorId);
      return NextResponse.json({ success: true, totalDebt: total });
    }

    if (debtId) {
      const sessionToken = req.cookies.get("session")?.value;
      const currentUser = sessionToken ? verifySessionToken(sessionToken) : null;
      await settleDebtRow(debtId, currentUser?.username || null);
      await recomputeDebtorTotal(debtorId);
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
    await db.delete(debtorPayments).where(eq(debtorPayments.debtorId, parseInt(id)));
    await db.delete(debtors).where(eq(debtors.id, parseInt(id)));
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در حذف بدهکار" }, { status: 500 });
  }
}
