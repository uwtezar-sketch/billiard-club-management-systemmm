import { db } from "@/db";
import { debtors, customers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isSamePerson } from "@/lib/personMatch";

type DebtInput = {
  debtorId?: number | null;
  newDebtorName?: string;
  newDebtorPhone?: string;
  amount: number;
};

// این تابع مرکزیِ «پیدا کن یا بساز»ه برای بدهکار. هرجای کد که قراره یک بدهی جدید ثبت بشه
// (فاکتور معمولی، سهمِ فاکتور تقسیم‌شده، تسویه‌ی دستی) باید از همینجا رد بشه — نه مستقیم insert.
// اولویت‌ها:
//  ۱. اگه debtorId مستقیم داده شده (از لیست بدهکاران انتخاب شده) → همون رو استفاده کن.
//  ۲. وگرنه، اگه اسم/تلفن با یکی از مشتری‌های باشگاه مطابقت داشت:
//     - اگه اون مشتری قبلاً یک بدهکارِ لینک‌شده داره → همون بدهکار رو استفاده کن (دیگه رکورد دوم ساخته نمی‌شه)
//     - وگرنه یک بدهکار جدید بساز و از همون اول به این مشتری وصلش کن
//  ۳. اگه هیچ مشتری‌ای مطابقت نداشت → مثل قبل، یک بدهکار آزاد (بدون customerId) بساز
export async function findOrCreateDebtor(input: DebtInput): Promise<number> {
  const amount = Number(input.amount || 0);

  if (input.debtorId) {
    const [existing] = await db.select().from(debtors).where(eq(debtors.id, input.debtorId));
    if (existing) {
      await db
        .update(debtors)
        .set({ totalDebt: (Number(existing.totalDebt) + amount).toString() })
        .where(eq(debtors.id, existing.id));
      return existing.id;
    }
  }

  const name = input.newDebtorName || "نامشخص";
  const phone = input.newDebtorPhone || null;

  const allCustomers = await db.select().from(customers);
  const matchedCustomer = allCustomers.find((c) => isSamePerson({ phone, name }, { phone: c.phone, name: c.name }));

  if (matchedCustomer) {
    const allDebtors = await db.select().from(debtors);
    const linkedDebtor = allDebtors.find((d) => d.customerId === matchedCustomer.id);
    if (linkedDebtor) {
      await db
        .update(debtors)
        .set({ totalDebt: (Number(linkedDebtor.totalDebt) + amount).toString() })
        .where(eq(debtors.id, linkedDebtor.id));
      return linkedDebtor.id;
    }
    const [created] = await db
      .insert(debtors)
      .values({
        name: matchedCustomer.name,
        phone: matchedCustomer.phone,
        totalDebt: amount.toString(),
        customerId: matchedCustomer.id,
      })
      .returning();
    return created.id;
  }

  const [created] = await db
    .insert(debtors)
    .values({ name, phone, totalDebt: amount.toString() })
    .returning();
  return created.id;
}
