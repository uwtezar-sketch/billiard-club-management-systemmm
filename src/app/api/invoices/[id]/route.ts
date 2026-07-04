import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { invoices, invoiceItems, debts, debtors } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, parseInt(id)));
    if (!invoice) return NextResponse.json({ error: "فاکتور یافت نشد" }, { status: 404 });
    const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoice.id));
    return NextResponse.json({ ...invoice, items });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const invoiceId = parseInt(id);
    const body = await req.json();
    const { status, settledAt, paymentMethod, debtorId, newDebtorName, newDebtorPhone } = body;

    const [existing] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
    if (!existing) return NextResponse.json({ error: "فاکتور یافت نشد" }, { status: 404 });

    const updateData: Record<string, unknown> = {};
    if (paymentMethod !== undefined) updateData.paymentMethod = paymentMethod;
    if (status !== undefined) updateData.status = status;
    if (settledAt !== undefined) updateData.settledAt = settledAt ? new Date(settledAt) : new Date();

    const wasDebt = existing.status === "debt";
    const willBeDebt = paymentMethod === "debt";

    if (paymentMethod !== undefined && willBeDebt && !wasDebt) {
      // انتقال فاکتور به بدهکاری (مثلاً مشتری الان پول نداشته)
      let finalDebtorId: number;
      if (debtorId) {
        finalDebtorId = debtorId;
        const [debtor] = await db.select().from(debtors).where(eq(debtors.id, debtorId));
        if (debtor) {
          await db
            .update(debtors)
            .set({ totalDebt: (Number(debtor.totalDebt) + Number(existing.totalAmount)).toString() })
            .where(eq(debtors.id, debtorId));
        }
      } else {
        const [newDebtor] = await db
          .insert(debtors)
          .values({
            name: newDebtorName || existing.customerName || "نامشخص",
            phone: newDebtorPhone || existing.customerPhone || null,
            totalDebt: existing.totalAmount,
          })
          .returning();
        finalDebtorId = newDebtor.id;
      }
      await db.insert(debts).values({
        debtorId: finalDebtorId,
        invoiceId: existing.id,
        invoiceNumber: existing.invoiceNumber,
        amount: existing.totalAmount,
        description: `فاکتور ${existing.invoiceNumber} - ${existing.tableName || ""} - ${existing.jalaaliDate}`,
        jalaaliDate: existing.jalaaliDate,
        isPaid: false,
      });
      updateData.status = "debt";
    } else if (paymentMethod !== undefined && !willBeDebt && wasDebt) {
      // خروج از بدهکاری (مثلاً مشتری الان بدهیش رو پرداخت کرده)
      const linkedDebts = await db.select().from(debts).where(eq(debts.invoiceId, existing.id));
      for (const debt of linkedDebts) {
        if (!debt.isPaid) {
          const [debtor] = await db.select().from(debtors).where(eq(debtors.id, debt.debtorId));
          if (debtor) {
            const newTotal = Math.max(0, Number(debtor.totalDebt) - Number(debt.amount));
            await db.update(debtors).set({ totalDebt: newTotal.toString() }).where(eq(debtors.id, debtor.id));
          }
        }
        await db.update(debts).set({ isPaid: true, paidAt: new Date() }).where(eq(debts.id, debt.id));
      }
      if (status === undefined) updateData.status = "paid";
    }

    if (updateData.status === "paid" && settledAt === undefined) updateData.settledAt = new Date();

    const [invoice] = await db
      .update(invoices)
      .set(updateData)
      .where(eq(invoices.id, invoiceId))
      .returning();

    return NextResponse.json(invoice);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در ویرایش فاکتور" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const invoiceId = parseInt(id);

    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
    if (!invoice) return NextResponse.json({ error: "فاکتور یافت نشد" }, { status: 404 });

    const linkedDebts = await db.select().from(debts).where(eq(debts.invoiceId, invoiceId));
    for (const debt of linkedDebts) {
      if (!debt.isPaid) {
        const [debtor] = await db.select().from(debtors).where(eq(debtors.id, debt.debtorId));
        if (debtor) {
          const newTotal = Math.max(0, Number(debtor.totalDebt) - Number(debt.amount));
          await db.update(debtors).set({ totalDebt: newTotal.toString() }).where(eq(debtors.id, debtor.id));
        }
      }
      await db.delete(debts).where(eq(debts.id, debt.id));
    }

    await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
    await db.delete(invoices).where(eq(invoices.id, invoiceId));

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در حذف فاکتور" }, { status: 500 });
  }
}
