import { db } from "@/db";
import { creditors, creditorTransactions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { normalizeName } from "@/lib/personMatch";
import { normalizePhone } from "@/lib/phone";

// مانده‌ی طلبِ فعلیِ یک طلبکار = جمع تراکنش‌های «credit» منهای جمع تراکنش‌های «usage».
// مثل recomputeDebtorTotal همیشه از نو حساب می‌شه، نه جمع‌وتفریق تدریجی — که هیچ‌وقت با ویرایش/حذف
// یک تراکنش عدد از واقعیت فاصله نگیره.
export async function recomputeCreditorTotal(creditorId: number): Promise<number> {
  const txs = await db.select().from(creditorTransactions).where(eq(creditorTransactions.creditorId, creditorId));
  const creditSum = txs.filter((t) => t.type === "credit").reduce((s, t) => s + Number(t.amount), 0);
  const usageSum = txs.filter((t) => t.type === "usage").reduce((s, t) => s + Number(t.amount), 0);
  const total = Math.max(0, creditSum - usageSum);
  await db.update(creditors).set({ totalCredit: total.toString() }).where(eq(creditors.id, creditorId));
  return total;
}

type CreditorInput = {
  creditorId?: number | null;
  name?: string;
  phone?: string | null;
};

// همون منطق findOrCreateDebtor توی debtorLink.ts (اول شماره‌تلفنِ دقیق، بعد نامِ دقیق) تا طلبِ یک نفر
// بین چند رکوردِ تکراری پخش نشه — همون اشتباهی که قبلاً باعث اشتباه‌محاسبه‌شدنِ بدهکارها می‌شد.
export async function findOrCreateCreditor(input: CreditorInput): Promise<number> {
  if (input.creditorId) {
    const [existing] = await db.select().from(creditors).where(eq(creditors.id, input.creditorId));
    if (existing) return existing.id;
  }

  const name = input.name || "نامشخص";
  const phone = input.phone || null;
  const normPhone = normalizePhone(phone);
  const normName = normalizeName(name);

  const allCreditors = await db.select().from(creditors);

  let matched = normPhone ? allCreditors.find((c) => normalizePhone(c.phone) === normPhone) : undefined;
  if (!matched && normName) {
    matched = allCreditors.find((c) => normalizeName(c.name) === normName);
  }
  if (matched) return matched.id;

  const [created] = await db.insert(creditors).values({ name, phone, totalCredit: "0" }).returning();
  return created.id;
}
