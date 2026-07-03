import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { invoices, invoiceItems } from "@/db/schema";
import { gte, inArray } from "drizzle-orm";
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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const range = searchParams.get("range") === "month" ? 30 : 7;

    const cutoff = new Date(Date.now() - range * 24 * 60 * 60 * 1000);
    const recentInvoices = await db
      .select()
      .from(invoices)
      .where(gte(invoices.issuedAt, cutoff));

    // Daily revenue (تمام فاکتورهای صادرشده در هر روز، صرف‌نظر از وضعیت تسویه)
    const dayLabels: string[] = [];
    for (let i = range - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      dayLabels.push(toJalaali(d));
    }
    const revenueByDay = new Map<string, number>();
    for (const label of dayLabels) revenueByDay.set(label, 0);
    for (const inv of recentInvoices) {
      if (inv.jalaaliDate && revenueByDay.has(inv.jalaaliDate)) {
        revenueByDay.set(
          inv.jalaaliDate,
          (revenueByDay.get(inv.jalaaliDate) || 0) + Number(inv.totalAmount)
        );
      }
    }
    const daily = dayLabels.map((label) => ({
      date: label,
      revenue: revenueByDay.get(label) || 0,
    }));

    // شلوغ‌ترین ساعات (بر اساس زمان واقعی صدور فاکتور، به وقت تهران)
    const hourCounts = new Array(24).fill(0);
    for (const inv of recentInvoices) {
      const h = getTehranHour(new Date(inv.issuedAt));
      hourCounts[h]++;
    }
    const busiestHours = hourCounts.map((count, hour) => ({ hour, count }));

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

    return NextResponse.json({ daily, topCafeItems, busiestHours });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در دریافت آمار" }, { status: 500 });
  }
}
