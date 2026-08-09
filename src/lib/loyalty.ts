import { db } from "@/db";
import { customerPointRedemptions, settings } from "@/db/schema";
import { eq } from "drizzle-orm";

// نرخِ کسبِ امتیاز: هر ۱۰٬۰۰۰ تومان واقعاً پرداخت‌شده = ۱ امتیاز.
// این کاملاً جدا از «ارزش هر امتیاز هنگام استفاده» (۵۰۰ تومان، تو src/lib/loyaltyReliability.ts) هست —
// اون یکی می‌گه هر امتیاز موقع خرج‌کردن چقدر می‌ارزه، این یکی می‌گه چقدر خرج مشتری = ۱ امتیاز کسب می‌کنه.
const DEFAULT_POINT_VALUE = 10000;
// اگه یه وقت تو تنظیمات یه عدد خیلی کوچیک (مثلاً به‌اشتباه همون ۵۰۰ تومانِ «ارزش هر امتیاز» به‌جای
// «نرخ کسب امتیاز» ذخیره شده باشه) نباید بذاریم امتیازها به‌شکل غیرمنطقی زیاد حساب بشن — زیر این
// آستانه رو نامعتبر در نظر می‌گیریم و به پیش‌فرض برمی‌گردیم.
const MIN_SANE_POINT_VALUE = 1000;

export async function getPointValue(): Promise<number> {
  const [row] = await db.select().from(settings).where(eq(settings.key, "loyalty_point_value"));
  const val = row ? Number(row.value) : DEFAULT_POINT_VALUE;
  return val >= MIN_SANE_POINT_VALUE ? val : DEFAULT_POINT_VALUE;
}

// امتیازِ کسب‌شده همیشه از رویِ totalPaid (مجموع واقعاً پرداخت‌شده) حساب می‌شه، نه از یک ستونِ ذخیره‌شده —
// این‌جوری با ویرایش/حذفِ فاکتورهای قدیمی هم عدد همیشه درست می‌مونه (مثل منطق بدهکارها).
export function calcEarnedPoints(totalPaid: number, pointValue: number): number {
  return Math.floor(totalPaid / pointValue);
}

export async function getRedeemedPoints(customerId: number): Promise<number> {
  const rows = await db.select().from(customerPointRedemptions).where(eq(customerPointRedemptions.customerId, customerId));
  return rows.reduce((s, r) => s + r.points, 0);
}

export async function getAvailablePoints(customerId: number, totalPaid: number, pointValue: number): Promise<number> {
  const earned = calcEarnedPoints(totalPaid, pointValue);
  const redeemed = await getRedeemedPoints(customerId);
  return Math.max(0, earned - redeemed);
}
