import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { customers, invoices, invoiceShares, debtors, debtorPayments, customerPointRedemptions } from "@/db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { verifySessionToken } from "@/lib/auth";
import { todayJalaali } from "@/lib/jalaali";
import { isSamePerson } from "@/lib/personMatch";
import { getPointValue, calcEarnedPoints, getRedeemedPoints } from "@/lib/loyalty";
import { computeReliability } from "@/lib/loyaltyReliability";

// POST /api/customers/[id]/points
// body: { points: number, note?: string, capBasisAmount?: number, invoiceId?: number }
// یک «استفاده از امتیاز» ثبت می‌کنه. ارزش هر امتیاز از روی Smart Loyalty Score مشتری تعیین می‌شه
// (در حالت shadow همیشه ارزش پایه، در حالت active بر اساس اعتمادِ پرداختیِ مشتری کم/زیاد می‌شه).
// اگه capBasisAmount داده بشه (یعنی این استفاده مالِ یک فاکتور/سهمِ مشخصه)، سقفِ ۱۰٪ (یا هرچی تو
// تنظیمات باشه) روی همون مبلغ اعمال می‌شه؛ وگرنه (استفاده‌ی آزاد از پروفایل مشتری) فقط موجودی چک می‌شه.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const customerId = parseInt(id);
    const body = await req.json();
    const points = Number(body.points || 0);
    const note = body.note || null;
    const capBasisAmount = body.capBasisAmount !== undefined && body.capBasisAmount !== null ? Number(body.capBasisAmount) : null;
    const invoiceId = body.invoiceId ? Number(body.invoiceId) : null;

    if (!points || points <= 0) {
      return NextResponse.json({ error: "تعداد امتیاز باید بیشتر از صفر باشد" }, { status: 400 });
    }

    const [customer] = await db.select().from(customers).where(eq(customers.id, customerId));
    if (!customer) return NextResponse.json({ error: "مشتری یافت نشد" }, { status: 404 });

    // totalPaid رو مثل بقیه‌ی جاها از رویِ فاکتورها/سهم‌های واقعاً پرداخت‌شده حساب می‌کنیم
    const person = { phone: customer.phone, name: customer.name };
    const allInvoices = await db.select().from(invoices);
    const splitInvoices = allInvoices.filter((i) => i.isSplit);
    const allShares = splitInvoices.length
      ? await db.select().from(invoiceShares).where(inArray(invoiceShares.invoiceId, splitInvoices.map((i) => i.id)))
      : [];
    const matchingInvoices = allInvoices.filter((i) => !i.isSplit && isSamePerson(person, { phone: i.customerPhone, name: i.customerName }));
    const matchingShares = allShares.filter((sh) => isSamePerson(person, { phone: sh.phone, name: sh.label }));
    let totalPaid =
      matchingInvoices.filter((i) => i.status === "paid").reduce((s, i) => s + Number(i.totalAmount), 0) +
      matchingShares.filter((sh) => sh.status === "paid").reduce((s, sh) => s + Number(sh.amount), 0);

    // پرداخت‌های دستیِ بدهی که واقعاً انجام شده رو هم لحاظ می‌کنیم — یه مشتری که بدهی می‌گیره و بعداً
    // (حتی چند روز دیرتر) تسویه می‌کنه، باید بابت اون پول امتیاز بگیره.
    const allDebtors = await db.select().from(debtors);
    const matchingDebtor = allDebtors.find((d) => d.customerId === customerId) || allDebtors.find((d) => isSamePerson(person, { phone: d.phone, name: d.name }));
    if (matchingDebtor) {
      const myPayments = await db.select().from(debtorPayments).where(eq(debtorPayments.debtorId, matchingDebtor.id));
      totalPaid += myPayments.reduce((s, p) => s + Number(p.amount), 0);
    }

    const pointValue = await getPointValue();
    const earnedPoints = calcEarnedPoints(totalPaid, pointValue);
    const redeemedSoFar = await getRedeemedPoints(customerId);
    const available = Math.max(0, earnedPoints - redeemedSoFar);

    if (points > available) {
      return NextResponse.json({ error: `این مشتری فقط ${available.toLocaleString("fa-IR")} امتیاز داره` }, { status: 400 });
    }

    // ارزش هر امتیاز رو از روی Smart Loyalty Score محاسبه می‌کنیم (شادو یا اکتیو)
    const reliability = await computeReliability(customerId);
    const valueApplied = points * reliability.effectivePointValue;

    if (capBasisAmount !== null && capBasisAmount > 0) {
      const maxValue = capBasisAmount * (reliability.maxDiscountPercent / 100);
      if (valueApplied > maxValue) {
        const maxPoints = reliability.effectivePointValue > 0 ? Math.floor(maxValue / reliability.effectivePointValue) : 0;
        return NextResponse.json(
          { error: `سقف تخفیفِ امتیازی روی این فاکتور ${reliability.maxDiscountPercent}٪ (${maxPoints.toLocaleString("fa-IR")} امتیاز) است` },
          { status: 400 }
        );
      }
    }

    const sessionToken = req.cookies.get("session")?.value;
    const currentUser = sessionToken ? verifySessionToken(sessionToken) : null;

    const [redemption] = await db
      .insert(customerPointRedemptions)
      .values({
        customerId,
        points,
        note,
        jalaaliDate: todayJalaali(),
        byUsername: currentUser?.username || null,
        valueApplied: valueApplied.toString(),
        invoiceId,
      })
      .returning();

    return NextResponse.json({
      redemption,
      remainingPoints: available - points,
      valueApplied,
      mode: reliability.mode,
      effectivePointValue: reliability.effectivePointValue,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در ثبت استفاده از امتیاز" }, { status: 500 });
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const rows = await db
      .select()
      .from(customerPointRedemptions)
      .where(eq(customerPointRedemptions.customerId, parseInt(id)))
      .orderBy(desc(customerPointRedemptions.createdAt));
    return NextResponse.json(rows);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در دریافت تاریخچه‌ی امتیاز" }, { status: 500 });
  }
}
