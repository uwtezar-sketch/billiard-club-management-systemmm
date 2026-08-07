import { db } from "@/db";
import { debtors, customers, debts, debtorPayments } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { isSamePerson } from "@/lib/personMatch";

// بدهی واقعیِ فعلیِ یک بدهکار = جمع بدهی‌های بازِ ثبت‌شده منهای جمع پرداخت‌های دستی‌ای که براش ثبت شده.
// این تابع همیشه از نو محاسبه می‌کنه (نه جمع‌وتفریق تدریجی) تا هیچ‌وقت با ویرایش/حذف بدهی یا پرداخت
// عدد از واقعیت فاصله نگیره — همه‌ی مسیرهایی که بدهی/پرداخت رو تغییر می‌دن باید این رو صدا بزنن.
export async function recomputeDebtorTotal(debtorId: number): Promise<number> {
  const unpaidDebts = await db.select().from(debts).where(and(eq(debts.debtorId, debtorId), eq(debts.isPaid, false)));
  const payments = await db.select().from(debtorPayments).where(eq(debtorPayments.debtorId, debtorId));
  const unpaidSum = unpaidDebts.reduce((s, d) => s + Number(d.amount), 0);
  const paidSum = payments.reduce((s, p) => s + Number(p.amount), 0);
  const total = Math.max(0, unpaidSum - paidSum);
  await db.update(debtors).set({ totalDebt: total.toString() }).where(eq(debtors.id, debtorId));
  return total;
}

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
  if (input.debtorId) {
    const [existing] = await db.select().from(debtors).where(eq(debtors.id, input.debtorId));
    if (existing) return existing.id;
  }

  const name = input.newDebtorName || "نامشخص";
  const phone = input.newDebtorPhone || null;

  const allCustomers = await db.select().from(customers);
  const matchedCustomer = allCustomers.find((c) => isSamePerson({ phone, name }, { phone: c.phone, name: c.name }));

  if (matchedCustomer) {
    const allDebtors = await db.select().from(debtors);
    const linkedDebtor = allDebtors.find((d) => d.customerId === matchedCustomer.id);
    if (linkedDebtor) return linkedDebtor.id;

    const [created] = await db
      .insert(debtors)
      .values({
        name: matchedCustomer.name,
        phone: matchedCustomer.phone,
        totalDebt: "0",
        customerId: matchedCustomer.id,
      })
      .returning();
    return created.id;
  }

  const [created] = await db.insert(debtors).values({ name, phone, totalDebt: "0" }).returning();
  return created.id;
}
