import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { customers, invoices, invoiceItems, invoiceShares, debtors, debts, debtorPayments, customerPointRedemptions } from "@/db/schema";
import { eq, inArray, and } from "drizzle-orm";
import { isSamePerson } from "@/lib/personMatch";
import { getPointValue, calcEarnedPoints, getRedeemedPoints } from "@/lib/loyalty";
import { computeReliability } from "@/lib/loyaltyReliability";

const CHRONIC_DEBT_DAYS = 15;
const GOOD_CUSTOMER_MIN_VISITS = 3;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [customer] = await db.select().from(customers).where(eq(customers.id, parseInt(id)));
    if (!customer) return NextResponse.json({ error: "مشتری یافت نشد" }, { status: 404 });

    const person = { phone: customer.phone, name: customer.name };
    const allInvoices = await db.select().from(invoices);
    const splitInvoices = allInvoices.filter((i) => i.isSplit);
    const allShares = splitInvoices.length
      ? await db.select().from(invoiceShares).where(inArray(invoiceShares.invoiceId, splitInvoices.map((i) => i.id)))
      : [];
    const invoiceById = new Map(allInvoices.map((i) => [i.id, i]));

    const matchingInvoices = allInvoices.filter((i) => !i.isSplit && isSamePerson(person, { phone: i.customerPhone, name: i.customerName }));
    const matchingShares = allShares.filter((sh) => isSamePerson(person, { phone: sh.phone, name: sh.label }));

    // یک تاریخچه‌ی یکپارچه می‌سازیم: هم فاکتورهای عادی، هم سهم‌های این شخص از فاکتورهای تقسیم‌شده
    type HistoryEntry = {
      invoiceId: number;
      shareId: number | null;
      invoiceNumber: string;
      jalaaliDate: string | null;
      issuedAt: string;
      tableName: string | null;
      tableType: string | null;
      amount: number;
      status: string;
      paymentMethod: string | null;
      isSplit: boolean;
      partnerLabel: string | null;
    };
    const history: HistoryEntry[] = [];

    for (const inv of matchingInvoices) {
      history.push({
        invoiceId: inv.id,
        shareId: null,
        invoiceNumber: inv.invoiceNumber,
        jalaaliDate: inv.jalaaliDate,
        issuedAt: inv.issuedAt as unknown as string,
        tableName: inv.tableName,
        tableType: inv.tableType,
        amount: Number(inv.totalAmount),
        status: inv.status,
        paymentMethod: inv.paymentMethod,
        isSplit: false,
        partnerLabel: null,
      });
    }
    for (const sh of matchingShares) {
      const inv = invoiceById.get(sh.invoiceId);
      if (!inv) continue;
      const partners = allShares.filter((x) => x.invoiceId === sh.invoiceId && x.id !== sh.id).map((x) => x.label).join("، ");
      history.push({
        invoiceId: inv.id,
        shareId: sh.id,
        invoiceNumber: inv.invoiceNumber,
        jalaaliDate: inv.jalaaliDate,
        issuedAt: inv.issuedAt as unknown as string,
        tableName: inv.tableName,
        tableType: inv.tableType,
        amount: Number(sh.amount),
        status: sh.status,
        paymentMethod: sh.paymentMethod,
        isSplit: true,
        partnerLabel: partners || null,
      });
    }
    history.sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());

    // آخرین مراجعه رو از رویِ کل تاریخچه حساب می‌کنیم (نه فقط فاکتورهای پرداخت‌شده) — چون مشتری با
    // یه فاکتورِ در انتظار/بدهی هم واقعاً اومده بوده، فقط هنوز تسویه نکرده.
    const lastVisit = history.length > 0 ? history[0].issuedAt : null;
    const daysSinceVisit = lastVisit ? Math.floor((Date.now() - new Date(lastVisit).getTime()) / 86400000) : null;

    const visitCount = history.length;
    let totalPaid = history.filter((h) => h.status === "paid").reduce((s, h) => s + h.amount, 0);
    const totalDebtCreated = history.filter((h) => h.status === "debt").reduce((s, h) => s + h.amount, 0);
    const totalPendingAmount = history.filter((h) => h.status === "pending").reduce((s, h) => s + h.amount, 0);
    const cafeSpent = matchingInvoices.reduce((s, i) => s + Number(i.cafeTotal || 0), 0);
    const gameSpent = matchingInvoices.reduce((s, i) => s + Number(i.gamePrice || 0), 0);

    const typeCounts: Record<string, number> = {};
    for (const h of history) {
      if (h.tableType) typeCounts[h.tableType] = (typeCounts[h.tableType] || 0) + 1;
    }
    const favoriteType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    let favoriteCafeItems: { name: string; quantity: number }[] = [];
    const invoiceIds = matchingInvoices.map((i) => i.id);
    if (invoiceIds.length > 0) {
      const items = await db.select().from(invoiceItems).where(inArray(invoiceItems.invoiceId, invoiceIds));
      const map = new Map<string, number>();
      for (const it of items) {
        map.set(it.name, (map.get(it.name) || 0) + it.quantity);
      }
      favoriteCafeItems = [...map.entries()]
        .map(([name, quantity]) => ({ name, quantity }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5);
    }

    const allDebtors = await db.select().from(debtors);
    const matchingDebtor = allDebtors.find((d) => d.customerId === customer.id) || allDebtors.find((d) => isSamePerson(person, { phone: d.phone, name: d.name }));
    const outstandingDebt = matchingDebtor ? Number(matchingDebtor.totalDebt) : 0;

    // پرداخت‌های دستیِ بدهی که واقعاً انجام شده رو هم به «واقعاً پرداخت‌شده» اضافه می‌کنیم — چون مشتری‌ای
    // که بدهی می‌گیره و بعداً (حتی چند روز دیرتر) تسویه می‌کنه، باید بابت اون پول امتیاز بگیره.
    if (matchingDebtor) {
      const myPayments = await db.select().from(debtorPayments).where(eq(debtorPayments.debtorId, matchingDebtor.id));
      totalPaid += myPayments.reduce((s, p) => s + Number(p.amount), 0);
    }

    let oldestUnpaidDebtDays: number | null = null;
    if (matchingDebtor) {
      const myUnpaid = await db.select().from(debts).where(and(eq(debts.debtorId, matchingDebtor.id), eq(debts.isPaid, false)));
      if (myUnpaid.length > 0) {
        const oldest = myUnpaid.reduce((min, d) => (new Date(d.createdAt) < new Date(min.createdAt) ? d : min));
        oldestUnpaidDebtDays = Math.floor((Date.now() - new Date(oldest.createdAt).getTime()) / 86400000);
      }
    }
    const isChronicDebtor = outstandingDebt > 0 && oldestUnpaidDebtDays !== null && oldestUnpaidDebtDays >= CHRONIC_DEBT_DAYS;
    let tier: "good" | "watch" | "bad" | "new";
    if (isChronicDebtor) tier = "bad";
    else if (outstandingDebt > 0) tier = "watch";
    else if (visitCount >= GOOD_CUSTOMER_MIN_VISITS) tier = "good";
    else tier = "new";

    const pointValue = await getPointValue();
    const earnedPoints = calcEarnedPoints(totalPaid, pointValue);
    const redeemedPoints = await getRedeemedPoints(customer.id);
    const loyaltyPoints = Math.max(0, earnedPoints - redeemedPoints);
    const avgPerVisit = visitCount > 0 ? Math.round(totalPaid / visitCount) : null;

    // Smart Loyalty V1 — فقط داخلی (کارمند/مدیر)، هیچ‌جا مستقیم به مشتری نشون داده نمی‌شه
    const smartLoyalty = await computeReliability(customer.id);

    return NextResponse.json({
      ...customer,
      visitCount,
      totalPaid,
      totalDebtCreated,
      totalPendingAmount,
      outstandingDebt,
      cafeSpent,
      gameSpent,
      favoriteType,
      favoriteCafeItems,
      history,
      oldestUnpaidDebtDays,
      tier,
      loyaltyPoints,
      pointValue,
      smartLoyalty,
      lastVisit,
      daysSinceVisit,
      avgPerVisit,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در دریافت اطلاعات مشتری" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, phone, notes, isVip } = body;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (notes !== undefined) updateData.notes = notes || null;
    if (isVip !== undefined) updateData.isVip = isVip;

    const [customer] = await db
      .update(customers)
      .set(updateData)
      .where(eq(customers.id, parseInt(id)))
      .returning();

    return NextResponse.json(customer);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در ویرایش مشتری" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.delete(customers).where(eq(customers.id, parseInt(id)));
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در حذف مشتری" }, { status: 500 });
  }
}
