import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { invoices, invoiceItems, debts, invoiceShares } from "@/db/schema";
import { eq } from "drizzle-orm";
import { findOrCreateDebtor, recomputeDebtorTotal, settleDebtRow } from "@/lib/debtorLink";
import { ensureCustomerExists } from "@/lib/customerLink";
import { verifySessionToken } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, parseInt(id)));
    if (!invoice) return NextResponse.json({ error: "فاکتور یافت نشد" }, { status: 404 });
    const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoice.id));
    const shares = invoice.isSplit
      ? await db.select().from(invoiceShares).where(eq(invoiceShares.invoiceId, invoice.id))
      : [];
    return NextResponse.json({ ...invoice, items, shares });
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
    const { status, settledAt, paymentMethod, debtorId, newDebtorName, newDebtorPhone, customerName, customerPhone } = body;

    const [existing] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
    if (!existing) return NextResponse.json({ error: "فاکتور یافت نشد" }, { status: 404 });

    if (existing.isSplit && (status !== undefined || paymentMethod !== undefined)) {
      return NextResponse.json(
        { error: "این فاکتور تقسیم‌شده. برای تسویه هر سهم از مسیر مخصوص سهم‌ها استفاده کنید." },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (paymentMethod !== undefined) updateData.paymentMethod = paymentMethod;
    if (status !== undefined) updateData.status = status;
    if (settledAt !== undefined) updateData.settledAt = settledAt ? new Date(settledAt) : new Date();
    if (customerName !== undefined) updateData.customerName = customerName || null;
    if (customerPhone !== undefined) updateData.customerPhone = customerPhone || null;

    // اگه شماره‌ی مشتری همین‌جا ثبت/تغییر کرد، مطمئن می‌شیم تو باشگاه مشتریان هم ثبت باشه —
    // مستقل از اینکه این فاکتور بدهی می‌شه یا نه.
    if (customerPhone) {
      await ensureCustomerExists(customerPhone, customerName || existing.customerName);
    }

    const wasDebt = existing.status === "debt";
    const willBeDebt = paymentMethod === "debt";

    if (paymentMethod !== undefined && willBeDebt && !wasDebt) {
      // انتقال فاکتور به بدهکاری (مثلاً مشتری الان پول نداشته)
      const finalDebtorId = await findOrCreateDebtor({
        debtorId,
        newDebtorName: newDebtorName || existing.customerName || undefined,
        newDebtorPhone: newDebtorPhone || existing.customerPhone || undefined,
        amount: Number(existing.totalAmount),
      });
      await db.insert(debts).values({
        debtorId: finalDebtorId,
        invoiceId: existing.id,
        invoiceNumber: existing.invoiceNumber,
        amount: existing.totalAmount,
        description: `فاکتور ${existing.invoiceNumber} - ${existing.tableName || ""} - ${existing.jalaaliDate}`,
        jalaaliDate: existing.jalaaliDate,
        isPaid: false,
      });
      await recomputeDebtorTotal(finalDebtorId);
      updateData.status = "debt";
    } else if (paymentMethod !== undefined && !willBeDebt && wasDebt) {
      // خروج از بدهکاری (مثلاً مشتری الان بدهیش رو پرداخت کرده) — از همون تسویه‌ی مرکزی استفاده می‌کنیم
      // تا هم debtor_payments ثبت بشه، هم امتیاز وفاداری بهش تعلق بگیره
      const sessionToken = req.cookies.get("session")?.value;
      const currentUser = sessionToken ? verifySessionToken(sessionToken) : null;
      const linkedDebts = await db.select().from(debts).where(eq(debts.invoiceId, existing.id));
      const touchedDebtorIds = new Set<number>();
      for (const debt of linkedDebts) {
        if (!debt.isPaid) touchedDebtorIds.add(debt.debtorId);
        await settleDebtRow(debt.id, currentUser?.username || null);
      }
      for (const debtorId of touchedDebtorIds) await recomputeDebtorTotal(debtorId);
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
    const touchedDebtorIds = new Set<number>();
    for (const debt of linkedDebts) {
      if (!debt.isPaid) touchedDebtorIds.add(debt.debtorId);
      await db.delete(debts).where(eq(debts.id, debt.id));
    }
    for (const debtorId of touchedDebtorIds) await recomputeDebtorTotal(debtorId);

    await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
    await db.delete(invoiceShares).where(eq(invoiceShares.invoiceId, invoiceId));
    await db.delete(invoices).where(eq(invoices.id, invoiceId));

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در حذف فاکتور" }, { status: 500 });
  }
}
