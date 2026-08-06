import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { debtors, debts, customers, debtorPayments } from "@/db/schema";
import { eq, like, desc } from "drizzle-orm";
import { isSamePerson } from "@/lib/personMatch";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search");

    const allDebtors = await db.select().from(debtors).orderBy(desc(debtors.createdAt));
    const allCustomers = await db.select().from(customers);
    const customerById = new Map(allCustomers.map((c) => [c.id, c]));

    const filtered = search
      ? allDebtors.filter(
          (d) => d.name.includes(search) || (d.phone && d.phone.includes(search))
        )
      : allDebtors;

    const withDebts = await Promise.all(
      filtered.map(async (debtor) => {
        const debtRows = await db
          .select()
          .from(debts)
          .where(eq(debts.debtorId, debtor.id))
          .orderBy(desc(debts.createdAt));
        const paymentRows = await db
          .select()
          .from(debtorPayments)
          .where(eq(debtorPayments.debtorId, debtor.id))
          .orderBy(desc(debtorPayments.createdAt));
        const linkedCustomer = debtor.customerId ? customerById.get(debtor.customerId) : null;
        return { ...debtor, debts: debtRows, payments: paymentRows, customerName: linkedCustomer?.name || null };
      })
    );

    return NextResponse.json(withDebts);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در دریافت بدهکاران" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, phone, notes, force } = body;
    if (!name) return NextResponse.json({ error: "نام الزامی است" }, { status: 400 });

    const allCustomers = await db.select().from(customers);
    const matchedCustomer = allCustomers.find((c) => isSamePerson({ phone, name }, { phone: c.phone, name: c.name }));

    if (matchedCustomer && !force) {
      const allDebtors = await db.select().from(debtors);
      const linkedDebtor = allDebtors.find((d) => d.customerId === matchedCustomer.id);
      if (linkedDebtor) {
        return NextResponse.json(
          {
            error: `یک بدهکار به نام «${linkedDebtor.name}» همین الان به مشتری «${matchedCustomer.name}» وصله. به‌جای ساختن رکورد تکراری، از همون استفاده کن.`,
            existingDebtorId: linkedDebtor.id,
          },
          { status: 409 }
        );
      }
    }

    const [debtor] = await db
      .insert(debtors)
      .values({
        name,
        phone: phone || null,
        notes: notes || null,
        customerId: matchedCustomer?.id || null,
      })
      .returning();

    return NextResponse.json(debtor);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در افزودن بدهکار" }, { status: 500 });
  }
}
