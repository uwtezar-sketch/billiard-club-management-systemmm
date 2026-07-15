import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { customers, invoices } from "@/db/schema";
import { eq, like, or } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search");

    const allCustomers = search
      ? await db
          .select()
          .from(customers)
          .where(or(like(customers.name, `%${search}%`), like(customers.phone, `%${search}%`)))
      : await db.select().from(customers);

    const allInvoices = await db.select().from(invoices);

    const result = allCustomers.map((c) => {
      const matching = allInvoices.filter((i) => i.customerPhone === c.phone);
      const visitCount = matching.length;
      const totalSpent = matching.reduce((s, i) => s + Number(i.totalAmount), 0);
      const cafeSpent = matching.reduce((s, i) => s + Number(i.cafeTotal), 0);
      const lastVisit = matching.reduce((latest: string | null, i) => {
        if (!i.issuedAt) return latest;
        const t = new Date(i.issuedAt).toISOString();
        return !latest || t > latest ? t : latest;
      }, null);
      const daysSinceVisit = lastVisit ? Math.floor((Date.now() - new Date(lastVisit).getTime()) / 86400000) : null;

      return {
        ...c,
        visitCount,
        totalSpent,
        cafeSpent,
        lastVisit,
        daysSinceVisit,
      };
    });

    result.sort((a, b) => b.totalSpent - a.totalSpent);

    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در دریافت باشگاه مشتریان" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, phone, notes, isVip } = body;
    if (!name || !phone) {
      return NextResponse.json({ error: "نام و شماره تلفن الزامی است" }, { status: 400 });
    }

    const [existing] = await db.select().from(customers).where(eq(customers.phone, phone));
    if (existing) {
      return NextResponse.json({ error: "این شماره تلفن قبلاً تو باشگاه مشتریان ثبت شده" }, { status: 400 });
    }

    const [customer] = await db
      .insert(customers)
      .values({ name, phone, notes: notes || null, isVip: !!isVip })
      .returning();

    return NextResponse.json(customer);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در ثبت مشتری" }, { status: 500 });
  }
}
