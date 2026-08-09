import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { customers, invoices, invoiceShares, debtors, debts, debtorPayments } from "@/db/schema";
import { inArray, eq } from "drizzle-orm";
import { normalizePhone } from "@/lib/phone";
import { isSamePerson } from "@/lib/personMatch";
import { getPointValue, calcEarnedPoints, getRedeemedPoints } from "@/lib/loyalty";

// GET /api/customers/quick-summary?phones=09121234567,09123334444
// برای کارتِ اطلاعاتیِ مشتری تو پنجره‌ی فاکتور (تاریخچه): برای هر شماره، اگه تو باشگاه مشتریان ثبت
// شده باشه، بدهیِ بازِ فعلی (ریز به ریز) + امتیازِ موجودش رو برمی‌گردونه. اگه ثبت نشده، مقدارش null.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const phonesParam = searchParams.get("phones") || "";
    const requestedPhones = [...new Set(phonesParam.split(",").map((p) => normalizePhone(p)).filter((p) => p.length >= 10))];

    if (requestedPhones.length === 0) return NextResponse.json({});

    const allCustomers = await db.select().from(customers);
    const matched = allCustomers.filter((c) => requestedPhones.includes(normalizePhone(c.phone)));

    if (matched.length === 0) return NextResponse.json({});

    const allDebtors = await db.select().from(debtors);
    const allInvoices = await db.select().from(invoices);
    const splitInvoices = allInvoices.filter((i) => i.isSplit);
    const allShares = splitInvoices.length
      ? await db.select().from(invoiceShares).where(inArray(invoiceShares.invoiceId, splitInvoices.map((i) => i.id)))
      : [];
    const pointValue = await getPointValue();

    const result: Record<
      string,
      { customerId: number; name: string; points: number; debts: { date: string; description: string; amount: number }[] } | null
    > = {};

    for (const phone of requestedPhones) result[phone] = null;

    for (const c of matched) {
      const person = { phone: c.phone, name: c.name };
      const matchingDebtor = allDebtors.find((d) => d.customerId === c.id) || allDebtors.find((d) => isSamePerson(person, { phone: d.phone, name: d.name }));

      // ── امتیاز — دقیقاً همون منطق loyalty.ts، شاملِ پرداخت‌های دستیِ بدهیِ واقعاً انجام‌شده ──
      const matchingInvoices = allInvoices.filter((i) => !i.isSplit && isSamePerson(person, { phone: i.customerPhone, name: i.customerName }));
      const matchingShares = allShares.filter((sh) => isSamePerson(person, { phone: sh.phone, name: sh.label }));
      let totalPaid =
        matchingInvoices.filter((i) => i.status === "paid").reduce((s, i) => s + Number(i.totalAmount), 0) +
        matchingShares.filter((sh) => sh.status === "paid").reduce((s, sh) => s + Number(sh.amount), 0);
      if (matchingDebtor) {
        const myPayments = await db.select().from(debtorPayments).where(eq(debtorPayments.debtorId, matchingDebtor.id));
        totalPaid += myPayments.reduce((s, p) => s + Number(p.amount), 0);
      }
      const earnedPoints = calcEarnedPoints(totalPaid, pointValue);
      const redeemedPoints = await getRedeemedPoints(c.id);
      const points = Math.max(0, earnedPoints - redeemedPoints);

      // ── بدهیِ بازِ فعلی، ریز به ریز، قدیمی‌ترین اول ─────────────────────────
      let debtRows: { date: string; description: string; amount: number }[] = [];
      if (matchingDebtor) {
        const myUnpaid = await db.select().from(debts).where(eq(debts.debtorId, matchingDebtor.id));
        debtRows = myUnpaid
          .filter((d) => !d.isPaid)
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
          .map((d) => ({
            date: d.jalaaliDate || new Date(d.createdAt).toLocaleDateString("fa-IR"),
            description: d.description || "بدهی",
            amount: Number(d.amount),
          }));
      }

      const entry = { customerId: c.id, name: c.name, points, debts: debtRows };
      const normalized = normalizePhone(c.phone);
      if (requestedPhones.includes(normalized)) result[normalized] = entry;
    }

    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در دریافت خلاصه‌ی مشتری" }, { status: 500 });
  }
}
