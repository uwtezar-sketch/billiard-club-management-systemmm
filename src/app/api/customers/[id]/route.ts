import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { customers, invoices, invoiceItems, debtors } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { normalizePhone } from "@/lib/phone";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [customer] = await db.select().from(customers).where(eq(customers.id, parseInt(id)));
    if (!customer) return NextResponse.json({ error: "مشتری یافت نشد" }, { status: 404 });

    const normalizedPhone = normalizePhone(customer.phone);
    const allInvoices = await db.select().from(invoices);
    const matching = allInvoices
      .filter((i) => normalizePhone(i.customerPhone) === normalizedPhone)
      .sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());

    const visitCount = matching.length;
    const totalSpent = matching.reduce((s, i) => s + Number(i.totalAmount), 0);
    const gameSpent = matching.reduce((s, i) => s + Number(i.gamePrice), 0);
    const cafeSpent = matching.reduce((s, i) => s + Number(i.cafeTotal), 0);

    const typeCounts: Record<string, number> = {};
    for (const inv of matching) {
      if (inv.tableType) typeCounts[inv.tableType] = (typeCounts[inv.tableType] || 0) + 1;
    }
    const favoriteType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    let favoriteCafeItems: { name: string; quantity: number }[] = [];
    const invoiceIds = matching.map((i) => i.id);
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
    const matchingDebtor = allDebtors.find((d) => normalizePhone(d.phone) === normalizedPhone && normalizedPhone !== "");
    const outstandingDebt = matchingDebtor ? Number(matchingDebtor.totalDebt) : 0;

    return NextResponse.json({
      ...customer,
      visitCount,
      totalSpent,
      gameSpent,
      cafeSpent,
      favoriteType,
      favoriteCafeItems,
      outstandingDebt,
      invoices: matching.slice(0, 20),
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
