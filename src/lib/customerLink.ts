import { db } from "@/db";
import { customers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { normalizePhone } from "@/lib/phone";

// این تابع مرکزیِ «پیدا کن یا بساز»ه برای مشتری. هرجای کد که یک بدهکار، فاکتور، یا سهمِ فاکتور
// با شماره تلفن ساخته می‌شه، باید قبلش از همینجا رد بشه — نه مستقیم چک/insert. هدف اینه که هیچ‌وقت
// یه «مشتریِ یتیم» (بدهکار/فاکتور/سهمی که تلفن داره ولی تو جدول customers ثبت نشده) ساخته نشه،
// چون بدون این وصل، امتیاز وفاداری و Smart Loyalty براش اصلاً کار نمی‌کنه.
//
// بدون شماره تلفن هیچ کاری نمی‌شه کرد — چون customers.phone هم NOT NULL و هم UNIQUE هست، و بدون
// شماره نمی‌شه مطمئن بود این همون شخصِ قبلیه یا یکیِ دیگه. تو اون حالت null برمی‌گردونه.
export async function ensureCustomerExists(
  phone: string | null | undefined,
  name?: string | null
): Promise<number | null> {
  const normalized = normalizePhone(phone);
  if (!normalized || !phone) return null;

  const allCustomers = await db.select().from(customers);
  const existing = allCustomers.find((c) => normalizePhone(c.phone) === normalized);
  if (existing) return existing.id;

  try {
    const [created] = await db
      .insert(customers)
      .values({
        name: name && name.trim() ? name.trim() : "مشتری ناشناس",
        phone: phone.trim(),
      })
      .returning();
    return created.id;
  } catch {
    // اگه هم‌زمان یه درخواستِ دیگه همین شماره رو ثبت کرده بود (race condition نادر)، دوباره پیداش کن
    const [again] = await db.select().from(customers).where(eq(customers.phone, phone.trim()));
    return again?.id ?? null;
  }
}
