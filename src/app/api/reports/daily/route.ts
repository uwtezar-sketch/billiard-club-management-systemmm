import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { invoices, debts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { todayJalaali } from "@/lib/jalaali";
import * as jalaali from "jalaali-js";

function tehranJalaliOf(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = Number(parts.find((p) => p.type === "year")!.value);
  const m = Number(parts.find((p) => p.type === "month")!.value);
  const d = Number(parts.find((p) => p.type === "day")!.value);
  const { jy, jm, jd } = jalaali.toJalaali(y, m, d);
  return `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`;
}

function shiftJalaliDate(dateStr: string, deltaDays: number): string {
  const [jy, jm, jd] = dateStr.split("/").map(Number);
  const { gy, gm, gd } = jalaali.toGregorian(jy, jm, jd);
  const g = new Date(Date.UTC(gy, gm - 1, gd));
  g.setUTCDate(g.getUTCDate() + deltaDays);
  const { jy: ny, jm: nm, jd: nd } = jalaali.toJalaali(g.getUTCFullYear(), g.getUTCMonth() + 1, g.getUTCDate());
  return `${ny}/${String(nm).padStart(2, "0")}/${String(nd).padStart(2, "0")}`;
}

async function computeRevenueForDate(date: string) {
  const dayInvoices = await db.select().from(invoices).where(eq(invoices.jalaaliDate, date));
  const paid = dayInvoices.filter((i) => i.status === "paid");

  const allPaidDebts = await db.select().from(debts).where(eq(debts.isPaid, true));
  const debtCollected = allPaidDebts
    .filter((d) => d.paidAt && tehranJalaliOf(new Date(d.paidAt)) === date)
    .reduce((sum, d) => sum + Number(d.amount), 0);

  const totalRevenue = paid.reduce((sum, i) => sum + Number(i.totalAmount), 0) + debtCollected;
  return { dayInvoices, paid, debtCollected, totalRevenue };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") || todayJalaali();

    const { dayInvoices, paid, debtCollected, totalRevenue } = await computeRevenueForDate(date);
    const pending = dayInvoices.filter((i) => i.status === "pending");
    const debt = dayInvoices.filter((i) => i.status === "debt");

    const totalBilliard = paid
      .filter((i) => i.tableType === "snooker" || i.tableType === "eightball")
      .reduce((sum, i) => sum + Number(i.totalAmount), 0);
    const totalPlaystation = paid
      .filter((i) => i.tableType === "playstation")
      .reduce((sum, i) => sum + Number(i.totalAmount), 0);
    const totalCafe = paid.reduce((sum, i) => sum + Number(i.cafeTotal), 0);

    const totalCash = paid
      .filter((i) => i.paymentMethod === "cash")
      .reduce((sum, i) => sum + Number(i.totalAmount), 0);
    const totalCard = paid
      .filter((i) => i.paymentMethod === "card")
      .reduce((sum, i) => sum + Number(i.totalAmount), 0);
    const totalDebtTransfer = debt.reduce((sum, i) => sum + Number(i.totalAmount), 0);

    const avgInvoiceAmount = paid.length > 0 ? Math.round(totalBilliard + totalPlaystation + totalCafe) / paid.length : 0;
    const durations = dayInvoices.map((i) => i.durationMinutes).filter((m): m is number => !!m);
    const avgDurationMinutes = durations.length > 0 ? Math.round(durations.reduce((s, m) => s + m, 0) / durations.length) : 0;

    // مقایسه با روز قبل
    const prevDate = shiftJalaliDate(date, -1);
    const { totalRevenue: prevRevenue } = await computeRevenueForDate(prevDate);
    const changePercent =
      prevRevenue > 0 ? Math.round(((totalRevenue - prevRevenue) / prevRevenue) * 100) : totalRevenue > 0 ? 100 : 0;

    return NextResponse.json({
      date,
      prevDate,
      nextDate: shiftJalaliDate(date, 1),
      isToday: date === todayJalaali(),
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
      avgInvoiceAmount,
      avgDurationMinutes,
      changePercent,
      invoices: dayInvoices,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در دریافت گزارش" }, { status: 500 });
  }
}
