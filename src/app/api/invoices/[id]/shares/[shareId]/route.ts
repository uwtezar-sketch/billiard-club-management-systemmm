import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { invoices, invoiceShares, debts, debtors } from "@/db/schema";
import { eq, and } from "drizzle-orm";

// PATCH /api/invoices/[id]/shares/[shareId]
// تسویه یا تغییر وضعیت یک سهم مشخص از یک فاکتور تقسیم‌شده
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; shareId: string }> }
) {
  try {
    const { id, shareId } = await params;
    const invoiceId = parseInt(id);
    const shareIdNum = parseInt(shareId);
    const body = await req.json();
    const { status, paymentMethod, debtorId, newDebtorName, newDebtorPhone } = body;
    // status: 'paid' | 'debt' | 'pending'
    // paymentMethod (فقط برای paid): 'cash' | 'card'

    const [share] = await db
      .select()
      .from(invoiceShares)
      .where(and(eq(invoiceShares.id, shareIdNum), eq(invoiceShares.invoiceId, invoiceId)));
    if (!share) return NextResponse.json({ error: "سهم یافت نشد" }, { status: 404 });

    const wasDebt = share.status === "debt";
    const willBeDebt = status === "debt";
    const updateData: Record<string, unknown> = {};

    if (status !== undefined) updateData.status = status;
    if (status === "paid") {
      updateData.paymentMethod = paymentMethod || "cash";
      updateData.settledAt = new Date();
    } else if (status === "pending") {
      updateData.paymentMethod = null;
      updateData.settledAt = null;
    }

    if (willBeDebt && !wasDebt) {
      // این سهم بدهکاری شد
      let finalDebtorId: number;
      if (debtorId) {
        finalDebtorId = debtorId;
        const [debtor] = await db.select().from(debtors).where(eq(debtors.id, debtorId));
        if (debtor) {
          await db
            .update(debtors)
            .set({ totalDebt: (Number(debtor.totalDebt) + Number(share.amount)).toString() })
            .where(eq(debtors.id, debtorId));
        }
      } else {
        const [newDebtor] = await db
          .insert(debtors)
          .values({
            name: newDebtorName || share.label || "نامشخص",
            phone: newDebtorPhone || null,
            totalDebt: share.amount,
          })
          .returning();
        finalDebtorId = newDebtor.id;
      }

      const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
      await db.insert(debts).values({
        debtorId: finalDebtorId,
        invoiceId,
        shareId: share.id,
        invoiceNumber: invoice?.invoiceNumber || null,
        amount: share.amount,
        description: `سهم «${share.label}» از فاکتور ${invoice?.invoiceNumber || ""} - ${invoice?.tableName || ""} - ${invoice?.jalaaliDate || ""}`,
        jalaaliDate: invoice?.jalaaliDate || null,
        isPaid: false,
      });
      updateData.paymentMethod = "debt";
      updateData.debtorId = finalDebtorId;
    } else if (!willBeDebt && wasDebt) {
      // بدهیِ این سهم تسویه شد (یا لغو شد)
      const linkedDebts = await db.select().from(debts).where(eq(debts.shareId, share.id));
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
    }

    const [updatedShare] = await db
      .update(invoiceShares)
      .set(updateData)
      .where(eq(invoiceShares.id, shareIdNum))
      .returning();

    // اگه همه‌ی سهم‌های این فاکتور «پرداخت‌شده» شدن، خود فاکتور رو هم paid کن
    const allShares = await db.select().from(invoiceShares).where(eq(invoiceShares.invoiceId, invoiceId));
    const allPaid = allShares.length > 0 && allShares.every((s) => s.status === "paid");
    await db
      .update(invoices)
      .set({
        status: allPaid ? "paid" : "split",
        settledAt: allPaid ? new Date() : null,
      })
      .where(eq(invoices.id, invoiceId));

    return NextResponse.json(updatedShare);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در تسویه سهم" }, { status: 500 });
  }
}
