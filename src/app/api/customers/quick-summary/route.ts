import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { customers, invoices, invoiceShares, debtors, debts, debtorPayments } from "@/db/schema";
import { inArray, eq, isNull, and } from "drizzle-orm";
import { normalizePhone } from "@/lib/phone";
import { isSamePerson } from "@/lib/personMatch";
import { getPointValue, calcEarnedPoints, getRedeemedPoints } from "@/lib/loyalty";

// GET /api/customers/quick-summary?phones=09121234567,09123334444
// برای کارتِ اطلاعاتیِ مشتری تو پنجره‌ی فاکتور و بخشِ «فاکتورهای در انتظارِ چندباره»: برای هر شماره،
// بدهیِ بازِ فعلی (ریز به ریز + خلاصه‌ی ناخالص/پرداخت‌شده/مانده) رو برمی‌گردونه — این نیازی نداره که
// شخص حتماً تو «باشگاه مشتریان» ثبت شده باشه، چون بدهکار می‌تونه بدون عضویت تو باشگاه هم وجود داشته
// باشه. امتیاز فقط برای کسایی که واقعاً تو باشگاه مشتریان ثبتن حساب می‌شه.
//
// «مانده‌ی واقعی» همیشه مستقیم از رویِ debtors.total_debt خونده می‌شه (نه دوباره محاسبه) — چون اون
// ستون تنها منبع معتبرِ این عدده (توسط recomputeDebtorTotal نگه‌داری می‌شه) و همه‌جای دیگه‌ی اپ
// (بخش بدهکاران، پروفایل مشتری) هم دقیقاً همون رو می‌خونن؛ اینجا دوباره حساب کردنش فقط ریسکِ
// ناهماهنگی بین صفحات رو بالا می‌بره.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const phonesParam = searchParams.get("phones") || "";
    const requestedPhones = [...new Set(phonesParam.split(",").map((p) => normalizePhone(p)).filter((p) => p.length >= 10))];

    if (requestedPhones.length === 0) return NextResponse.json({});

    const allDebtors = await db.select().from(debtors);
    const allCustomers = await db.select().from(customers);

    const relevantDebtors = allDebtors.filter((d) => requestedPhones.includes(normalizePhone(d.phone)));
    const relevantCustomers = allCustomers.filter((c) => requestedPhones.includes(normalizePhone(c.phone)));

    if (relevantDebtors.length === 0 && relevantCustomers.length === 0) return NextResponse.json({});

    const allInvoices = await db.select().from(invoices);
    const splitInvoices = allInvoices.filter((i) => i.isSplit);
    const allShares = splitInvoices.length
      ? await db.select().from(invoiceShares).where(inArray(invoiceShares.invoiceId, splitInvoices.map((i) => i.id)))
      : [];
    const pointValue = await getPointValue();

    const result: Record<
      string,
      {
        customerId: number | null;
        name: string;
        points: number;
        grossDebt: number;
        paidAmount: number;
        remainingDebt: number;
        debts: { date: string; description: string; amount: number }[];
      } | null
    > = {};

    for (const phone of requestedPhones) {
      const debtor = relevantDebtors.find((d) => normalizePhone(d.phone) === phone) || null;
      const customer = relevantCustomers.find((c) => normalizePhone(c.phone) === phone) || null;

      if (!debtor && !customer) {
        result[phone] = null;
        continue;
      }

      // ── بدهیِ بازِ فعلی: ریز به ریز (ناخالص، برای شفافیت) + خلاصه‌ی ناخالص/پرداخت‌شده/مانده‌ی واقعی ──
      let debtRows: { date: string; description: string; amount: number }[] = [];
      let grossDebt = 0;
      let paidAmount = 0;
      let remainingDebt = 0;
      if (debtor) {
        const myDebts = await db.select().from(debts).where(and(eq(debts.debtorId, debtor.id), eq(debts.isPaid, false)));
        debtRows = myDebts
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
          .map((d) => ({
            date: d.jalaaliDate || new Date(d.createdAt).toLocaleDateString("fa-IR"),
            description: d.description || "بدهی",
            amount: Number(d.amount),
          }));
        grossDebt = debtRows.reduce((s, d) => s + d.amount, 0);

        // فقط پرداخت‌های دستیِ *غیرِ وصل‌شده* (بدون debt_id) — همون چیزی که واقعاً از بدهیِ باز کم می‌شه.
        // پرداخت‌هایی که برای تسویه‌ی کاملِ یک بدهیِ دیگه (که الان isPaid=true شده) ثبت شدن، اینجا
        // حساب نمی‌شن، چون خودِ اون بدهی از myDebts (بالا) کنار گذاشته شده و دوباره‌شماری می‌شه.
        const manualPayments = await db
          .select()
          .from(debtorPayments)
          .where(and(eq(debtorPayments.debtorId, debtor.id), isNull(debtorPayments.debtId)));
        paidAmount = manualPayments.reduce((s, p) => s + Number(p.amount), 0);

        // مانده‌ی واقعی رو مستقیم از debtors.total_debt می‌خونیم (منبع معتبر)، نه grossDebt−paidAmount —
        // این دو باید همیشه برابر باشن، ولی خوندن مستقیم safety-net بهتریه اگه یه‌جا recompute صدا زده نشده باشه
        remainingDebt = Number(debtor.totalDebt);
      }

      // ── امتیاز — فقط اگه واقعاً تو باشگاه مشتریان ثبت شده باشه (دقیقاً همون منطق loyalty.ts) ──
      let points = 0;
      if (customer) {
        const person = { phone: customer.phone, name: customer.name };
        const matchingInvoices = allInvoices.filter((i) => !i.isSplit && isSamePerson(person, { phone: i.customerPhone, name: i.customerName }));
        const matchingShares = allShares.filter((sh) => isSamePerson(person, { phone: sh.phone, name: sh.label }));
        let totalPaid =
          matchingInvoices.filter((i) => i.status === "paid").reduce((s, i) => s + Number(i.totalAmount), 0) +
          matchingShares.filter((sh) => sh.status === "paid").reduce((s, sh) => s + Number(sh.amount), 0);
        if (debtor) {
          // برای امتیاز، *همه‌ی* پرداخت‌ها حساب می‌شن (چه وصل‌شده به یه بدهی، چه دستیِ عمومی) — چون
          // هر دو یعنی پول واقعاً وارد باشگاه شده؛ این با محاسبه‌ی «مانده‌ی بدهی» بالا فرق داره.
          const allMyPayments = await db.select().from(debtorPayments).where(eq(debtorPayments.debtorId, debtor.id));
          totalPaid += allMyPayments.reduce((s, p) => s + Number(p.amount), 0);
        }
        const earnedPoints = calcEarnedPoints(totalPaid, pointValue);
        const redeemedPoints = await getRedeemedPoints(customer.id);
        points = Math.max(0, earnedPoints - redeemedPoints);
      }

      if (remainingDebt <= 0 && points <= 0) {
        result[phone] = null;
        continue;
      }

      result[phone] = {
        customerId: customer?.id ?? null,
        name: customer?.name || debtor?.name || "",
        points,
        grossDebt,
        paidAmount,
        remainingDebt,
        debts: debtRows,
      };
    }

    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در دریافت خلاصه‌ی مشتری" }, { status: 500 });
  }
}
