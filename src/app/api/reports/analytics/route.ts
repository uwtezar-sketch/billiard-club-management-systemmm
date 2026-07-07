import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { invoices, invoiceItems } from "@/db/schema";
import { gte, lt, and, inArray } from "drizzle-orm";
import { toJalaali } from "@/lib/jalaali";

function getTehranHour(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tehran",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const raw = parts.find((p) => p.type === "hour")?.value || "0";
  return Number(raw) % 24;
}

const DAY_LABELS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];
const WEEKDAY_TO_INDEX: Record<string, number> = {
  Sat: 0, Sun: 1, Mon: 2, Tue: 3, Wed: 4, Thu: 5, Fri: 6,
};

function getTehranDayIndex(date: Date): number {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tehran",
    weekday: "short",
  }).format(date);
  return WEEKDAY_TO_INDEX[weekday] ?? 0;
}

const BLOCK_LABELS = ["۰-۴", "۴-۸", "۸-۱۲", "۱۲-۱۶", "۱۶-۲۰", "۲۰-۲۴"];

const WEEKDAY_SHORT = ["ش", "ی", "د", "س", "چ", "پ", "ج"];

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const range = searchParams.get("range") === "month" ? 30 : 7;

    const cutoff = new Date(Date.now() - range * 24 * 60 * 60 * 1000);
    const prevCutoff = new Date(Date.now() - range * 2 * 24 * 60 * 60 * 1000);

    const [recentInvoices, previousInvoices] = await Promise.all([
      db.select().from(invoices).where(gte(invoices.issuedAt, cutoff)),
      db
        .select()
        .from(invoices)
        .where(and(gte(invoices.issuedAt, prevCutoff), lt(invoices.issuedAt, cutoff))),
    ]);

    // Daily revenue (تمام فاکتورهای صادرشده در هر روز، صرف‌نظر از وضعیت تسویه)
    const dayLabels: string[] = [];
    const dayWeekdayIdx: number[] = [];
    for (let i = range - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      dayLabels.push(toJalaali(d));
      dayWeekdayIdx.push(getTehranDayIndex(d));
    }
    const revenueByDay = new Map<string, number>();
    const countByDay = new Map<string, number>();
    for (const label of dayLabels) {
      revenueByDay.set(label, 0);
      countByDay.set(label, 0);
    }
    for (const inv of recentInvoices) {
      if (inv.jalaaliDate && revenueByDay.has(inv.jalaaliDate)) {
        revenueByDay.set(inv.jalaaliDate, (revenueByDay.get(inv.jalaaliDate) || 0) + Number(inv.totalAmount));
        countByDay.set(inv.jalaaliDate, (countByDay.get(inv.jalaaliDate) || 0) + 1);
      }
    }
    const daily = dayLabels.map((label, idx) => ({
      date: label,
      revenue: revenueByDay.get(label) || 0,
      count: countByDay.get(label) || 0,
      weekday: WEEKDAY_SHORT[dayWeekdayIdx[idx]],
      isWeekend: dayWeekdayIdx[idx] === 6, // جمعه
    }));

    const totalRevenue = daily.reduce((s, d) => s + d.revenue, 0);
    const totalInvoices = daily.reduce((s, d) => s + d.count, 0);
    const avgDailyRevenue = daily.length > 0 ? Math.round(totalRevenue / daily.length) : 0;
    const bestDay = daily.reduce((best, d) => (d.revenue > best.revenue ? d : best), daily[0] || { date: "", revenue: 0 });

    const previousTotalRevenue = previousInvoices.reduce((s, inv) => s + Number(inv.totalAmount), 0);
    const changePercent =
      previousTotalRevenue > 0
        ? Math.round(((totalRevenue - previousTotalRevenue) / previousTotalRevenue) * 100)
        : totalRevenue > 0
        ? 100
        : 0;

    // شلوغ‌ترین ساعات به تفکیک روز هفته (heatmap): ۷ روز × ۶ بازه‌ی ۴ ساعته
    const heatmap: number[][] = Array.from({ length: 7 }, () => new Array(6).fill(0));
    for (const inv of recentInvoices) {
      const d = new Date(inv.issuedAt);
      const day = getTehranDayIndex(d);
      const hour = getTehranHour(d);
      const block = Math.floor(hour / 4);
      heatmap[day][block]++;
    }
    let peakCell = { day: 0, block: 0, count: 0 };
    for (let day = 0; day < 7; day++) {
      for (let block = 0; block < 6; block++) {
        if (heatmap[day][block] > peakCell.count) {
          peakCell = { day, block, count: heatmap[day][block] };
        }
      }
    }

    // پرفروش‌ترین آیتم‌های کافه
    const invoiceIds = recentInvoices.map((i) => i.id);
    let topCafeItems: { name: string; quantity: number; revenue: number }[] = [];
    if (invoiceIds.length > 0) {
      const items = await db
        .select()
        .from(invoiceItems)
        .where(inArray(invoiceItems.invoiceId, invoiceIds));

      const map = new Map<string, { quantity: number; revenue: number }>();
      for (const it of items) {
        const cur = map.get(it.name) || { quantity: 0, revenue: 0 };
        cur.quantity += it.quantity;
        cur.revenue += Number(it.totalPrice);
        map.set(it.name, cur);
      }
      topCafeItems = [...map.entries()]
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 6);
    }

    return NextResponse.json({
      daily,
      totalRevenue,
      totalInvoices,
      avgDailyRevenue,
      bestDay,
      changePercent,
      topCafeItems,
      heatmap,
      dayLabels: DAY_LABELS,
      blockLabels: BLOCK_LABELS,
      peakCell,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در دریافت آمار" }, { status: 500 });
  }
}
