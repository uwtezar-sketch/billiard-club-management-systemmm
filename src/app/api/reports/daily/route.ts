import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { invoices, debts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { todayJalaali } from "@/lib/jalaali";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") || todayJalaali();

    const dayInvoices = await db
      .select()
      .from(invoices)
      .where(eq(invoices.jalaaliDate, date));

    const paid = dayInvoices.filter((i) => i.status === "paid");
    const pending = dayInvoices.filter((i) => i.status === "pending");
    const debt = dayInvoices.filter((i) => i.status === "debt");

    const totalBilliard = paid
      .filter((i) => i.tableType === "snooker" || i.tableType === "eightball")
      .reduce((sum, i) => sum + Number(i.totalAmount), 0);
    const totalPlaystation = paid
      .filter((i) => i.tableType === "playstation")
      .reduce((sum, i) => sum + Number(i.totalAmount), 0);
    const totalCafe = paid.reduce((sum, i) => sum + Number(i.cafeTotal), 0);

    // Debt collections for today
    const todayDebts = await db
      .select()
      .from(debts)
      .where(and(eq(debts.isPaid, true)));
    
    const debtCollected = todayDebts
      .filter((d) => d.paidAt && new Date(d.paidAt).toDateString() === new Date().toDateString())
      .reduce((sum, d) => sum + Number(d.amount), 0);

    const totalCash = paid
      .filter((i) => i.paymentMethod === "cash")
      .reduce((sum, i) => sum + Number(i.totalAmount), 0);
    const totalCard = paid
      .filter((i) => i.paymentMethod === "card")
      .reduce((sum, i) => sum + Number(i.totalAmount), 0);
    const totalDebtTransfer = debt.reduce((sum, i) => sum + Number(i.totalAmount), 0);

    const totalRevenue =
      paid.reduce((sum, i) => sum + Number(i.totalAmount), 0) + debtCollected;

    return NextResponse.json({
      date,
      totalBilliard,
      totalPlaystation,
      totalCafe,
      debtCollected,
      pendingTotal: pending.reduce((sum, i) => sum + Number(i.totalAmount), 0),
      debtTransferTotal: totalDebtTransfer,
      totalRevenue,
      totalCash: totalCash + debtCollected,
      totalCard,
      totalDebtTransfer,
      invoiceCount: dayInvoices.length,
      paidCount: paid.length,
      pendingCount: pending.length,
      debtCount: debt.length,
      invoices: dayInvoices,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در دریافت گزارش" }, { status: 500 });
  }
}
