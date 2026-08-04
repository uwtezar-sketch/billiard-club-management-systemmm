import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { customers, invoices, invoiceShares, debtors } from "@/db/schema";
import { like, or, inArray } from "drizzle-orm";
import { normalizePhone } from "@/lib/phone";
import { normalizeName, isSamePerson } from "@/lib/personMatch";

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
    const splitInvoices = allInvoices.filter((i) => i.isSplit);
    const allShares = splitInvoices.length
      ? await db.select().from(invoiceShares).where(inArray(invoiceShares.invoiceId, splitInvoices.map((i) => i.id)))
      : [];
    const allDebtors = await db.select().from(debtors);
    const invoiceById = new Map(allInvoices.map((i) => [i.id, i]));

    const result = allCustomers.map((c) => {
      const person = { phone: c.phone, name: c.name };

      // فاکتورهای عادی (غیرتقسیم‌شده) که مال همین مشتری‌ان
      const matchingInvoices = allInvoices.filter((i) => !i.isSplit && isSamePerson(person, { phone: i.customerPhone, name: i.customerName }));
      // سهم‌هایی که مال همین مشتری‌ان (از فاکتورهای تقسیم‌شده)
      const matchingShares = allShares.filter((sh) => isSamePerson(person, { phone: sh.phone, name: sh.label }));

      let totalPaid = 0, totalDebtCreated = 0, totalPendingAmount = 0, cafeSpent = 0;
      let lastVisit: string | null = null;

      for (const inv of matchingInvoices) {
        const amt = Number(inv.totalAmount);
        if (inv.status === "paid") totalPaid += amt;
        else if (inv.status === "debt") totalDebtCreated += amt;
        else if (inv.status === "pending") totalPendingAmount += amt;
        cafeSpent += Number(inv.cafeTotal || 0);
        if (inv.issuedAt) {
          const t = new Date(inv.issuedAt).toISOString();
          if (!lastVisit || t > lastVisit) lastVisit = t;
        }
      }
      for (const sh of matchingShares) {
        const amt = Number(sh.amount);
        if (sh.status === "paid") totalPaid += amt;
        else if (sh.status === "debt") totalDebtCreated += amt;
        else if (sh.status === "pending") totalPendingAmount += amt;
        const parentInv = invoiceById.get(sh.invoiceId);
        if (parentInv?.issuedAt) {
          const t = new Date(parentInv.issuedAt).toISOString();
          if (!lastVisit || t > lastVisit) lastVisit = t;
        }
      }

      const visitCount = matchingInvoices.length + matchingShares.length;
      const daysSinceVisit = lastVisit ? Math.floor((Date.now() - new Date(lastVisit).getTime()) / 86400000) : null;

      // بدهی فعلاً بازِ این مشتری (از جدول بدهکاران، که با تسویه‌شدن به‌روز می‌مونه)
      const matchingDebtor = allDebtors.find((d) => isSamePerson(person, { phone: d.phone, name: d.name }));
      const outstandingDebt = matchingDebtor ? Number(matchingDebtor.totalDebt) : 0;

      return {
        ...c,
        visitCount,
        totalPaid,
        totalDebtCreated,
        totalPendingAmount,
        outstandingDebt,
        cafeSpent,
        lastVisit,
        daysSinceVisit,
      };
    });

    result.sort((a, b) => b.totalPaid - a.totalPaid);

    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در دریافت باشگاه مشتریان" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, phone, notes, isVip, force } = body;
    if (!name || !phone) {
      return NextResponse.json({ error: "نام و شماره تلفن الزامی است" }, { status: 400 });
    }

    const existingCustomers = await db.select().from(customers);
    const normalizedNewPhone = normalizePhone(phone);
    const existingByPhone = existingCustomers.find((c) => normalizePhone(c.phone) === normalizedNewPhone);
    if (existingByPhone) {
      return NextResponse.json({ error: "این شماره تلفن قبلاً تو باشگاه مشتریان ثبت شده" }, { status: 400 });
    }

    if (!force) {
      const normalizedNewName = normalizeName(name);
      const existingByName = existingCustomers.find((c) => normalizeName(c.name) === normalizedNewName);
      if (existingByName) {
        return NextResponse.json(
          {
            error: `یک مشتری با نام «${existingByName.name}» (${existingByName.phone}) قبلاً ثبت شده. مطمئنی همون شخص نیست؟`,
            duplicateName: true,
          },
          { status: 409 }
        );
      }
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
