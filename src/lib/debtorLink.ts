import { db } from "@/db";
import { debtors, customers, debts, debtorPayments, invoices, invoiceShares } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { isSamePerson } from "@/lib/personMatch";
import { ensureCustomerExists } from "@/lib/customerLink";
import { todayJalaali } from "@/lib/jalaali";

// بدهی واقعیِ فعلیِ یک بدهکار = جمع بدهی‌های بازِ ثبت‌شده منهای جمع پرداخت‌های دستیِ *غیرِ وصل‌شده*
// (یعنی بدون debt_id). این تابع همیشه از نو محاسبه می‌کنه (نه جمع‌وتفریق تدریجی) تا هیچ‌وقت با
// ویرایش/حذف بدهی یا پرداخت عدد از واقعیت فاصله نگیره — همه‌ی مسیرهایی که بدهی/پرداخت رو تغییر
// می‌دن باید این رو صدا بزنن.
//
// نکته‌ی مهم درباره‌ی دوباره‌شماری: پرداخت‌هایی که settleDebtRow برای تسویه‌ی *کاملِ* یک بدهیِ مشخص
// ساخته، به همون بدهی وصلن (debt_id پر شده). چون اون بدهی خودش دیگه isPaid=true شده (پس از
// unpaidSum کنار گذاشته می‌شه)، اگه اون پرداخت رو *هم* از unpaidSum کم کنیم، همون مبلغ دوبار اثر
// می‌ذاره — و اگه بعداً بدهیِ جدیدِ دیگه‌ای برای همون بدهکار ثبت بشه، این پرداختِ قدیمی به‌اشتباه
// روی بدهیِ جدید هم اثر می‌ذاره. برای همین فقط پرداخت‌های بدونِ debt_id (یعنی پرداخت‌های دستیِ
// جزئی/عمومی که به بدهیِ خاصی وصل نیستن) رو کم می‌کنیم.
export async function recomputeDebtorTotal(debtorId: number): Promise<number> {
  const unpaidDebts = await db.select().from(debts).where(and(eq(debts.debtorId, debtorId), eq(debts.isPaid, false)));
  const manualPayments = await db.select().from(debtorPayments).where(and(eq(debtorPayments.debtorId, debtorId), isNull(debtorPayments.debtId)));
  const unpaidSum = unpaidDebts.reduce((s, d) => s + Number(d.amount), 0);
  const paidSum = manualPayments.reduce((s, p) => s + Number(p.amount), 0);
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
//  ۲. وگرنه، اگه شماره تلفن داریم → اول مطمئن می‌شیم مشتری تو باشگاه ثبته (یا خودکار می‌سازیمش،
//     از طریق ensureCustomerExists) تا هیچ‌وقت «بدهکارِ یتیم» ساخته نشه — چون بدون این وصل،
//     امتیاز وفاداری و Smart Loyalty براش کار نمی‌کنه:
//     - اگه اون مشتری قبلاً یک بدهکارِ لینک‌شده داره → همون بدهکار رو استفاده کن (رکورد دوم ساخته نمی‌شه)
//     - وگرنه یک بدهکار جدید بساز و از همون اول به این مشتری وصلش کن
//  ۳. اگه شماره نداریم → مثل قبل، فقط بر اساس نام سعی می‌کنیم به مشتریِ موجود وصل بشیم
//  ۴. اگه هیچ‌کدوم جواب نداد → یک بدهکار آزاد (بدون customerId) بساز — این فقط وقتی پیش میاد که
//     اصلاً شماره‌ای در کار نبوده (بدون شماره نمی‌شه مطمئن بود این کیه)
export async function findOrCreateDebtor(input: DebtInput): Promise<number> {
  if (input.debtorId) {
    const [existing] = await db.select().from(debtors).where(eq(debtors.id, input.debtorId));
    if (existing) return existing.id;
  }

  const name = input.newDebtorName || "نامشخص";
  const phone = input.newDebtorPhone || null;

  if (phone) {
    const customerId = await ensureCustomerExists(phone, name);
    if (customerId) {
      const allDebtors = await db.select().from(debtors);
      const linkedDebtor = allDebtors.find((d) => d.customerId === customerId);
      if (linkedDebtor) return linkedDebtor.id;

      const [created] = await db
        .insert(debtors)
        .values({ name, phone, totalDebt: "0", customerId })
        .returning();
      return created.id;
    }
  }

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

// این تابع مرکزیِ «تسویه‌ی واقعی»ه برای یک ردیفِ بدهی. هرجای کد که یک debt از حالتِ باز به تسویه‌شده
// می‌ره، باید از همینجا رد بشه — نه فقط isPaid رو true کنه. سه‌تا کار با هم انجام می‌ده:
//  ۱. خودِ debt رو paid می‌کنه
//  ۲. یک رکورد پرداختِ واقعی تو debtor_payments ثبت می‌کنه — این پایه‌ی محاسبه‌ی «واقعاً پرداخت‌کرده»
//     و امتیاز وفاداریه؛ بدون این رکورد، اون پول همیشه ناپیدا می‌مونه و مشتری هیچ‌وقت امتیازش رو نمی‌گیره.
//  ۳. اگه این بدهی از یک فاکتور/سهمِ مشخص اومده، وضعیتِ اون فاکتور/سهم رو هم به paid برمی‌گردونه —
//     وگرنه برای همیشه debt می‌موند، حتی بعد از تسویه‌ی کامل.
// توجه: recomputeDebtorTotal بعدش جدا صدا زده می‌شه (چون معمولاً چندتا debt با هم تسویه می‌شن و
// نیازی نیست هر بار دوباره کل جمع رو حساب کنیم).
export async function settleDebtRow(debtId: number, byUsername: string | null): Promise<void> {
  const [debt] = await db.select().from(debts).where(eq(debts.id, debtId));
  if (!debt || debt.isPaid) return;

  await db.update(debts).set({ isPaid: true, paidAt: new Date() }).where(eq(debts.id, debt.id));

  await db.insert(debtorPayments).values({
    debtorId: debt.debtorId,
    amount: debt.amount,
    note: debt.invoiceNumber ? `تسویه‌ی بدهیِ فاکتور ${debt.invoiceNumber}` : debt.description || "تسویه‌ی بدهی",
    jalaaliDate: todayJalaali(),
    byUsername,
    debtId: debt.id,
  });

  if (debt.invoiceId) {
    await db.update(invoices).set({ status: "paid", settledAt: new Date() }).where(eq(invoices.id, debt.invoiceId));
  }
  if (debt.shareId) {
    await db.update(invoiceShares).set({ status: "paid", settledAt: new Date() }).where(eq(invoiceShares.id, debt.shareId));
  }
}
