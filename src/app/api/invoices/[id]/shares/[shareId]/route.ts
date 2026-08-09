import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { invoices, invoiceShares, debts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { findOrCreateDebtor, recomputeDebtorTotal, settleDebtRow } from "@/lib/debtorLink";
import { ensureCustomerExists } from "@/lib/customerLink";
import { verifySessionToken } from "@/lib/auth";

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
    const { status, paymentMethod, debtorId, newDebtorName, newDebtorPhone, label, phone } = body;
    // status: 'paid' | 'debt' | 'pending'
    // paymentMethod (فقط برای paid): 'cash' | 'card'
    // label/phone: تغییر نام یا شماره‌ی صاحبِ این سهم (بدون تغییر وضعیت پرداخت)

    const [share] = await db
      .select()
      .from(invoiceShares)
      .where(and(eq(invoiceShares.id, shareIdNum), eq(invoiceShares.invoiceId, invoiceId)));
    if (!share) return NextResponse.json({ error: "سهم یافت نشد" }, { status: 404 });

    const wasDebt = share.status === "debt";
    const willBeDebt = status === "debt";
    const updateData: Record<string, unknown> = {};
    if (label !== undefined) updateData.label = label;
    if (phone !== undefined) updateData.phone = phone;

    // اگه شماره‌ی صاحبِ این سهم همین‌جا ثبت/تغییر کرد، مطمئن می‌شیم تو باشگاه مشتریان هم ثبت باشه
    if (phone) {
      await ensureCustomerExists(phone, label || share.label);
    }

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
      const finalDebtorId = await findOrCreateDebtor({
        debtorId,
        newDebtorName: newDebtorName || share.label,
        newDebtorPhone: newDebtorPhone || share.phone || undefined,
        amount: Number(share.amount),
      });

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
      await recomputeDebtorTotal(finalDebtorId);
    } else if (!willBeDebt && wasDebt) {
      // بدهیِ این سهم تسویه شد (یا لغو شد) — از همون تسویه‌ی مرکزی استفاده می‌کنیم تا هم
      // debtor_payments ثبت بشه، هم امتیاز وفاداری بهش تعلق بگیره
      const sessionToken = req.cookies.get("session")?.value;
      const currentUser = sessionToken ? verifySessionToken(sessionToken) : null;
      const linkedDebts = await db.select().from(debts).where(eq(debts.shareId, share.id));
      const touchedDebtorIds = new Set<number>();
      for (const debt of linkedDebts) {
        if (!debt.isPaid) touchedDebtorIds.add(debt.debtorId);
        await settleDebtRow(debt.id, currentUser?.username || null);
      }
      for (const debtorId of touchedDebtorIds) await recomputeDebtorTotal(debtorId);
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
