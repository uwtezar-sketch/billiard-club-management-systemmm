import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { debtors, debts } from "@/db/schema";
import { eq, like, desc } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search");

    const allDebtors = await db.select().from(debtors).orderBy(desc(debtors.createdAt));

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
        return { ...debtor, debts: debtRows };
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
    const { name, phone, notes } = body;
    if (!name) return NextResponse.json({ error: "نام الزامی است" }, { status: 400 });

    const [debtor] = await db
      .insert(debtors)
      .values({ name, phone: phone || null, notes: notes || null })
      .returning();

    return NextResponse.json(debtor);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در افزودن بدهکار" }, { status: 500 });
  }
}
