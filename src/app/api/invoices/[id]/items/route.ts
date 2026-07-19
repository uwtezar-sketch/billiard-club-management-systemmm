import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { invoices, invoiceItems, cafeMenu, debts, debtors } from "@/db/schema";
import { eq } from "drizzle-orm";

async function recomputeTotals(invoiceId: number) {
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!invoice) return null;

  const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
  const cafeTotal = items.reduce((s, it) => s + Number(it.totalPrice), 0);
  const subtotal = Number(invoice.gamePrice) + cafeTotal;

  let discountAmount = 0;
  if (invoice.discountType === "percent") {
    discountAmount = Math.round(subtotal * (Number(invoice.discountValue || 0) / 100));
  } else if (invoice.discountType === "fixed") {
    discountAmount = Number(invoice.discountValue || 0);
  }
  const newTotalAmount = Math.max(0, subtotal - discountAmount);
  const oldTotalAmount = Number(invoice.totalAmount);
  const delta = newTotalAmount - oldTotalAmount;

  await db
    .update(invoices)
    .set({
      cafeTotal: cafeTotal.toString(),
      subtotal: subtotal.toString(),
      discountAmount: discountAmount.toString(),
      totalAmount: newTotalAmount.toString(),
    })
    .where(eq(invoices.id, invoiceId));

  if (invoice.status === "debt" && delta !== 0) {
    const linkedDebts = await db.select().from(debts).where(eq(debts.invoiceId, invoiceId));
    const unpaidDebt = linkedDebts.find((d) => !d.isPaid);
    if (unpaidDebt) {
      const newDebtAmount = Math.max(0, Number(unpaidDebt.amount) + delta);
      await db.update(debts).set({ amount: newDebtAmount.toString() }).where(eq(debts.id, unpaidDebt.id));
      const [debtor] = await db.select().from(debtors).where(eq(debtors.id, unpaidDebt.debtorId));
      if (debtor) {
        const newDebtorTotal = Math.max(0, Number(debtor.totalDebt) + delta);
        await db.update(debtors).set({ totalDebt: newDebtorTotal.toString() }).where(eq(debtors.id, debtor.id));
      }
    }
  }

  const [updated] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  const updatedItems = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
  return { ...updated, items: updatedItems };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const invoiceId = parseInt(id);
    const body = await req.json();
    const { cafeItemId, name, quantity, unitPrice } = body;

    if (!name || !quantity || unitPrice === undefined) {
      return NextResponse.json({ error: "اطلاعات آیتم ناقص است" }, { status: 400 });
    }

    let validCafeItemId: number | null = null;
    if (cafeItemId) {
      const [menuItem] = await db.select().from(cafeMenu).where(eq(cafeMenu.id, cafeItemId));
      if (menuItem) validCafeItemId = cafeItemId;
    }

    await db.insert(invoiceItems).values({
      invoiceId,
      cafeItemId: validCafeItemId,
      name,
      quantity,
      unitPrice: Number(unitPrice).toString(),
      totalPrice: (Number(unitPrice) * Number(quantity)).toString(),
    });

    const updated = await recomputeTotals(invoiceId);
    if (!updated) return NextResponse.json({ error: "فاکتور یافت نشد" }, { status: 404 });

    return NextResponse.json(updated);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در افزودن آیتم" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const invoiceId = parseInt(id);
    const { searchParams } = new URL(req.url);
    const itemId = parseInt(searchParams.get("itemId") || "0");
    if (!itemId) return NextResponse.json({ error: "شناسه آیتم معتبر نیست" }, { status: 400 });

    await db.delete(invoiceItems).where(eq(invoiceItems.id, itemId));

    const updated = await recomputeTotals(invoiceId);
    if (!updated) return NextResponse.json({ error: "فاکتور یافت نشد" }, { status: 404 });

    return NextResponse.json(updated);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در حذف آیتم" }, { status: 500 });
  }
}
