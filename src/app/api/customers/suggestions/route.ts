import { NextResponse } from "next/server";
import { db } from "@/db";
import { customers, invoices } from "@/db/schema";
import { normalizePhone } from "@/lib/phone";

const MIN_VISITS_FOR_SUGGESTION = 3;

export async function GET() {
  try {
    const [allInvoices, existingCustomers] = await Promise.all([
      db.select().from(invoices),
      db.select().from(customers),
    ]);

    const registeredPhones = new Set(existingCustomers.map((c) => normalizePhone(c.phone)));

    const byPhone = new Map<string, { name: string; count: number; totalSpent: number }>();
    for (const inv of allInvoices) {
      const normalized = normalizePhone(inv.customerPhone);
      if (!normalized) continue;
      if (registeredPhones.has(normalized)) continue;
      const cur = byPhone.get(normalized) || { name: inv.customerName || "بدون نام", count: 0, totalSpent: 0 };
      cur.count += 1;
      cur.totalSpent += Number(inv.totalAmount);
      if (inv.customerName) cur.name = inv.customerName;
      byPhone.set(normalized, cur);
    }

    const suggestions = [...byPhone.entries()]
      .filter(([, v]) => v.count >= MIN_VISITS_FOR_SUGGESTION)
      .map(([phone, v]) => ({ phone, ...v }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json(suggestions);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در دریافت پیشنهادها" }, { status: 500 });
  }
}
