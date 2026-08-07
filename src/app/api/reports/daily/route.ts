import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { invoices, debts, invoiceShares, debtorPayments } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { todayJalaali } from "@/lib/jalaali";
import * as jalaali from "jalaali-js";
import { invoiceRatios, paidByMethod, type ShareLite } from "@/lib/invoiceRevenue";

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

async function getSharesMap(invIds: number[]): Promise<Map<number, ShareLite[]>> {
  const map = new Map<number, ShareLite[]>();
  if (invIds.length === 0) return map;
  const rows = await db.select().from(invoiceShares).where(inArray(invoiceShares.invoiceId, invIds));
  for (const sh of rows) {
    const list = map.get(sh.invoiceId) || [];
    list.push({ status: sh.status, amount: sh.amount, paymentMethod: sh.paymentMethod });
    map.set(sh.invoiceId, list);
  }
  return map;
}

async function computeRevenueForDate(date: string) {
  const dayInvoices = await db.select().from(invoices).where(eq(invoices.jalaaliDate, date));
  const splitIds = dayInvoices.filter((i) => i.isSplit).map((i) => i.id);
  const sharesByInvoice = await getSharesMap(splitIds);

  const allPaidDebts = await db.select().from(debts).where(eq(debts.isPaid, true));
  const debtCollectedFromSettled = allPaidDebts
    .filter((d) => d.paidAt && tehranJalaliOf(new Date(d.paidAt)) === date)
    .reduce((sum, d) => sum + Number(d.amount), 0);

  // پرداخت‌های دستیِ جزئی (از بخش بدهکاران) هم پول واقعیه که همون روز وصول شده — باید حساب بشه
  const dayPayments = await db.select().from(debtorPayments).where(eq(debtorPayments.jalaaliDate, date));
  const debtCollectedFromManualPayments = dayPayments.reduce((sum, p) => sum + Number(p.amount), 0);

  const debtCollected = debtCollectedFromSettled + debtCollectedFromManualPayments;

  // درآمد واقعی = فقط سهمِ «پرداخت‌شده»ی هر فاکتور (چه عادی چه تقسیم‌شده) + بدهی‌هایی که همین امروز وصول شدن
  const paidAmountOf = (inv: (typeof dayInvoices)[number]) =>
    Number(inv.totalAmount) * invoiceRatios(inv, sharesByInvoice, inv.id).paid;

  const totalRevenue = dayInvoices.reduce((sum, i) => sum + paidAmountOf(i), 0) + debtCollected;
  return { dayInvoices, sharesByInvoice, debtCollected, totalRevenue };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") || todayJalaali();

    const { dayInvoices, sharesByInvoice, debtCollected, totalRevenue } = await computeRevenueForDate(date);

    // برای فاکتورهای عادی، وضعیت مستقیماً از خودِ فاکتوره؛ برای تقسیم‌شده‌ها با نگاه به نسبت‌های سهم تشخیص می‌دیم
    const pending = dayInvoices.filter((i) => {
      const r = invoiceRatios(i, sharesByInvoice, i.id);
      return i.isSplit ? r.pending > 0 : i.status === "pending";
    });
    const debt = dayInvoices.filter((i) => {
      const r = invoiceRatios(i, sharesByInvoice, i.id);
      return i.isSplit ? r.debt > 0 : i.status === "debt";
    });

    let totalBilliard = 0;
    let totalPlaystation = 0;
    let totalCafe = 0;
    let totalCash = 0;
    let totalCard = 0;
    let paidInvoiceCount = 0;

    for (const inv of dayInvoices) {
      const r = invoiceRatios(inv, sharesByInvoice, inv.id);
      if (r.paid <= 0) continue;
      paidInvoiceCount++;
      const gamePortion = Number(inv.gamePrice || 0) * r.paid;
      const cafePortion = Number(inv.cafeTotal || 0) * r.paid;
      if (inv.tableType === "snooker" || inv.tableType === "eightball") totalBilliard += gamePortion;
      if (inv.tableType === "playstation") totalPlaystation += gamePortion;
      totalCafe += cafePortion;
      const { cash, card } = paidByMethod(inv, sharesByInvoice, inv.id);
      totalCash += cash;
      totalCard += card;
    }

    const pendingTotal = pending.reduce((sum, i) => sum + Number(i.totalAmount) * invoiceRatios(i, sharesByInvoice, i.id).pending, 0);
    const totalDebtTransfer = debt.reduce((sum, i) => sum + Number(i.totalAmount) * invoiceRatios(i, sharesByInvoice, i.id).debt, 0);

    const avgInvoiceAmount = paidInvoiceCount > 0 ? Math.round(totalBilliard + totalPlaystation + totalCafe) / paidInvoiceCount : 0;
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
      totalBilliard: Math.round(totalBilliard),
      totalPlaystation: Math.round(totalPlaystation),
      totalCafe: Math.round(totalCafe),
      debtCollected,
      pendingTotal: Math.round(pendingTotal),
      debtTransferTotal: Math.round(totalDebtTransfer),
      totalRevenue: Math.round(totalRevenue),
      totalCash: Math.round(totalCash + debtCollected),
      totalCard: Math.round(totalCard),
      totalDebtTransfer: Math.round(totalDebtTransfer),
      invoiceCount: dayInvoices.length,
      paidCount: paidInvoiceCount,
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
