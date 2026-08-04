import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { debtors, debts, invoiceShares, customers } from "@/db/schema";
import { eq } from "drizzle-orm";

// POST /api/debtors/[id]/merge
// body: { customerId?: number, targetDebtorId?: number } — دقیقاً یکی از این دو باید داده بشه
//
// حالت ۱ (customerId): این بدهکار به یک رکورد باشگاه مشتریان وصل می‌شه.
//   - اگه اون مشتری از قبل بدهکارِ لینک‌شده‌ی دیگه‌ای داره → بدهی‌های این بدهکار به اون منتقل و این حذف می‌شه.
//   - اگه نداره → فقط لینک می‌شه (customerId ست می‌شه)، چیزی حذف نمی‌شه.
// حالت ۲ (targetDebtorId): این بدهکار مستقیم داخل یک بدهکار دیگه ادغام می‌شه (بدهی‌ها منتقل، این حذف می‌شه).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const debtorId = parseInt(id);
    const body = await req.json();
    const { customerId, targetDebtorId } = body;

    const [debtor] = await db.select().from(debtors).where(eq(debtors.id, debtorId));
    if (!debtor) return NextResponse.json({ error: "بدهکار یافت نشد" }, { status: 404 });

    if (targetDebtorId) {
      if (Number(targetDebtorId) === debtorId) {
        return NextResponse.json({ error: "نمی‌شه یک بدهکار رو با خودش ادغام کرد" }, { status: 400 });
      }
      const [target] = await db.select().from(debtors).where(eq(debtors.id, targetDebtorId));
      if (!target) return NextResponse.json({ error: "بدهکار مقصد یافت نشد" }, { status: 404 });

      await db.update(debts).set({ debtorId: target.id }).where(eq(debts.debtorId, debtor.id));
      await db.update(invoiceShares).set({ debtorId: target.id }).where(eq(invoiceShares.debtorId, debtor.id));
      await db
        .update(debtors)
        .set({
          totalDebt: (Number(target.totalDebt) + Number(debtor.totalDebt)).toString(),
          customerId: target.customerId ?? debtor.customerId ?? null,
        })
        .where(eq(debtors.id, target.id));
      await db.delete(debtors).where(eq(debtors.id, debtor.id));

      return NextResponse.json({ merged: true, targetDebtorId: target.id });
    }

    if (customerId) {
      const [customer] = await db.select().from(customers).where(eq(customers.id, customerId));
      if (!customer) return NextResponse.json({ error: "مشتری یافت نشد" }, { status: 404 });

      const existingLinked = await db.select().from(debtors).where(eq(debtors.customerId, customerId));
      const otherLinked = existingLinked.find((d) => d.id !== debtor.id);

      if (otherLinked) {
        // یک بدهکارِ دیگه از قبل به همین مشتری وصله → بدهی‌های این یکی رو منتقل کن و خودش حذف بشه
        await db.update(debts).set({ debtorId: otherLinked.id }).where(eq(debts.debtorId, debtor.id));
        await db.update(invoiceShares).set({ debtorId: otherLinked.id }).where(eq(invoiceShares.debtorId, debtor.id));
        await db
          .update(debtors)
          .set({ totalDebt: (Number(otherLinked.totalDebt) + Number(debtor.totalDebt)).toString() })
          .where(eq(debtors.id, otherLinked.id));
        await db.delete(debtors).where(eq(debtors.id, debtor.id));
        return NextResponse.json({ merged: true, targetDebtorId: otherLinked.id });
      }

      // هیچ بدهکار دیگه‌ای به این مشتری وصل نیست → فقط لینکش کن (چیزی حذف نمی‌شه)
      const [updated] = await db
        .update(debtors)
        .set({ customerId, name: customer.name, phone: customer.phone })
        .where(eq(debtors.id, debtor.id))
        .returning();
      return NextResponse.json({ merged: true, linkedOnly: true, debtor: updated });
    }

    return NextResponse.json({ error: "باید customerId یا targetDebtorId بدید" }, { status: 400 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در ادغام" }, { status: 500 });
  }
}
