import { db } from "@/db";
import { invoices, invoiceShares, debtors, debts, debtorPayments, customers, settings as settingsTable } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { normalizePhone } from "@/lib/phone";

// ─────────────────────────────────────────────────────────────────────────
// Smart Loyalty V1 — Payment Reliability Score
//
// این فایل یک engine مرکزیه که برای هر مشتری یک «امتیاز قابل‌اعتماد بودن در
// پرداخت» بین ۰ تا ۱۰۰ حساب می‌کنه، و از روی اون یک multiplier برای ارزش
// امتیازهای وفاداریش تعیین می‌کنه. این عدد فقط داخلیه (برای کارمند/مدیر) و
// هیچ‌جا مستقیم به خودِ مشتری نشون داده نمی‌شه.
//
// همه‌چی real-time محاسبه می‌شه (نه cache/batch) — چون حجم داده‌ی این باشگاه
// کوچیکه و همین الان هم کل پروژه با همین فلسفه («recompute always»، مثل
// totalDebt بدهکارها و loyaltyPoints مشتری‌ها) کار می‌کنه.
// ─────────────────────────────────────────────────────────────────────────

export type SmartLoyaltyMode = "shadow" | "active";
export type ReliabilityTier = "excellent" | "good" | "average" | "risky" | "very_risky";

export interface SmartLoyaltySettings {
  mode: SmartLoyaltyMode;
  recentWindowDays: number;
  defaultNewCustomerScore: number;
  maxDiscountPercent: number;
}

const SETTING_KEYS = {
  mode: "smart_loyalty_mode",
  recentWindowDays: "smart_loyalty_recent_window_days",
  defaultNewCustomerScore: "smart_loyalty_default_new_customer_score",
  maxDiscountPercent: "loyalty_max_discount_percent",
} as const;

const DEFAULTS: SmartLoyaltySettings = {
  mode: "shadow",
  recentWindowDays: 60,
  defaultNewCustomerScore: 75,
  maxDiscountPercent: 10,
};

// ارزش پایه‌ی هر امتیاز هنگام استفاده (تومان) — این جدا از نرخ کسبِ امتیاز
// (هر ۱۰٬۰۰۰ تومان پرداخت‌شده = ۱ امتیاز، تو src/lib/loyalty.ts) هست.
export const BASE_POINT_VALUE = 500;

export async function getSmartLoyaltySettings(): Promise<SmartLoyaltySettings> {
  const rows = await db.select().from(settingsTable).where(inArray(settingsTable.key, Object.values(SETTING_KEYS)));
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const modeRaw = map.get(SETTING_KEYS.mode);
  const mode: SmartLoyaltyMode = modeRaw === "active" ? "active" : "shadow";

  const recentWindowDaysRaw = Number(map.get(SETTING_KEYS.recentWindowDays));
  const recentWindowDays = Number.isFinite(recentWindowDaysRaw) && recentWindowDaysRaw > 0 ? recentWindowDaysRaw : DEFAULTS.recentWindowDays;

  const defaultScoreRaw = Number(map.get(SETTING_KEYS.defaultNewCustomerScore));
  const defaultNewCustomerScore = Number.isFinite(defaultScoreRaw) && defaultScoreRaw >= 0 && defaultScoreRaw <= 100 ? defaultScoreRaw : DEFAULTS.defaultNewCustomerScore;

  const maxDiscountRaw = Number(map.get(SETTING_KEYS.maxDiscountPercent));
  const maxDiscountPercent = Number.isFinite(maxDiscountRaw) && maxDiscountRaw > 0 ? maxDiscountRaw : DEFAULTS.maxDiscountPercent;

  return { mode, recentWindowDays, defaultNewCustomerScore, maxDiscountPercent };
}

interface Obligation {
  amount: number;
  issuedAt: Date;
  cleanSettled: boolean;
  enteredDebt: boolean;
}

export interface ReliabilityMetrics {
  resolvedObligationsLifetime: number;
  resolvedObligationsRecent: number;
  cleanRatioLifetime: number | null;
  cleanRatioRecent: number | null;
  currentDebt: number;
  totalManualPaid: number;
  recentPaymentsCount: number;
}

export interface ReliabilityResult {
  score: number;
  tier: ReliabilityTier;
  multiplier: number;
  basePointValue: number;
  effectivePointValue: number; // در حالت shadow همیشه = basePointValue؛ در active = basePointValue × multiplier
  mode: SmartLoyaltyMode;
  maxDiscountPercent: number;
  usedDefaultScore: boolean;
  metrics: ReliabilityMetrics;
  reasonFlags: string[];
}

function tierFromScore(score: number): { tier: ReliabilityTier; multiplier: number } {
  if (score >= 85) return { tier: "excellent", multiplier: 1.0 };
  if (score >= 70) return { tier: "good", multiplier: 0.85 };
  if (score >= 55) return { tier: "average", multiplier: 0.7 };
  if (score >= 35) return { tier: "risky", multiplier: 0.5 };
  return { tier: "very_risky", multiplier: 0.25 };
}

function buildResult(score: number, usedDefaultScore: boolean, metrics: ReliabilityMetrics, reasonFlags: string[], s: SmartLoyaltySettings): ReliabilityResult {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const { tier, multiplier } = tierFromScore(clamped);
  const effectivePointValue = s.mode === "active" ? Math.round(BASE_POINT_VALUE * multiplier) : BASE_POINT_VALUE;
  return {
    score: clamped,
    tier,
    multiplier,
    basePointValue: BASE_POINT_VALUE,
    effectivePointValue,
    mode: s.mode,
    maxDiscountPercent: s.maxDiscountPercent,
    usedDefaultScore,
    metrics,
    reasonFlags,
  };
}

const EMPTY_METRICS: ReliabilityMetrics = {
  resolvedObligationsLifetime: 0,
  resolvedObligationsRecent: 0,
  cleanRatioLifetime: null,
  cleanRatioRecent: null,
  currentDebt: 0,
  totalManualPaid: 0,
  recentPaymentsCount: 0,
};

// مشتری‌ای که اصلاً پیدا نشد (edge case امن) — نتیجه‌ی خنثیِ پیش‌فرض برمی‌گردونیم، کرش نمی‌کنیم
async function neutralResult(): Promise<ReliabilityResult> {
  const s = await getSmartLoyaltySettings();
  return buildResult(s.defaultNewCustomerScore, true, EMPTY_METRICS, ["limited_history"], s);
}

export async function computeReliability(customerId: number): Promise<ReliabilityResult> {
  const s = await getSmartLoyaltySettings();

  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId));
  if (!customer) return neutralResult();

  const normalizedPhone = normalizePhone(customer.phone);
  if (!normalizedPhone) return neutralResult();

  const [allInvoices, allDebtors, allDebtorPayments, allDebts] = await Promise.all([
    db.select().from(invoices),
    db.select().from(debtors),
    db.select().from(debtorPayments),
    db.select().from(debts),
  ]);

  const matchingDebtor =
    allDebtors.find((d) => d.customerId === customerId) || allDebtors.find((d) => normalizePhone(d.phone) === normalizedPhone);
  const currentDebt = matchingDebtor ? Number(matchingDebtor.totalDebt) : 0;

  // ── جمع‌آوری «obligation»ها — فاکتورهای عادی + سهم‌های فاکتورهای تقسیم‌شده ──
  const unsplitInvoices = allInvoices.filter((inv) => !inv.isSplit && normalizePhone(inv.customerPhone) === normalizedPhone);
  const splitInvoices = allInvoices.filter((inv) => inv.isSplit);
  const invoiceById = new Map(allInvoices.map((i) => [i.id, i]));

  const splitInvoiceIds = splitInvoices.map((i) => i.id);
  const allShares = splitInvoiceIds.length > 0 ? await db.select().from(invoiceShares).where(inArray(invoiceShares.invoiceId, splitInvoiceIds)) : [];

  // سهم‌هایی که واقعاً مالِ همین مشتری‌ان — اول از طریق بدهکارِ وصل‌شده، وگرنه از طریق تلفنِ خودِ سهم.
  // اگه هیچ‌کدوم نبود، امن نیست حدس بزنیم؛ کنار گذاشته می‌شه (طبق دستورالعمل V1).
  const myShares = allShares.filter((sh) => {
    if (sh.debtorId) {
      const d = allDebtors.find((dd) => dd.id === sh.debtorId);
      return d?.customerId === customerId;
    }
    if (sh.phone) return normalizePhone(sh.phone) === normalizedPhone;
    return false;
  });

  const obligations: Obligation[] = [];

  for (const inv of unsplitInvoices) {
    const resolved = inv.status === "paid" || inv.status === "debt";
    if (!resolved) continue; // pending/سایر وضعیت‌ها از مخرج کسر می‌شن، نه اینکه بد حساب بشن
    const enteredDebt = allDebts.some((d) => d.invoiceId === inv.id);
    obligations.push({
      amount: Number(inv.totalAmount) || 0,
      issuedAt: new Date(inv.issuedAt),
      cleanSettled: inv.status === "paid" && !enteredDebt,
      enteredDebt,
    });
  }

  for (const sh of myShares) {
    const resolved = sh.status === "paid" || sh.status === "debt";
    if (!resolved) continue;
    const parentInv = invoiceById.get(sh.invoiceId);
    const enteredDebt = allDebts.some((d) => d.shareId === sh.id) || !!sh.debtorId || sh.status === "debt";
    obligations.push({
      amount: Number(sh.amount) || 0,
      issuedAt: parentInv ? new Date(parentInv.issuedAt) : new Date(sh.createdAt),
      cleanSettled: sh.status === "paid" && !enteredDebt,
      enteredDebt,
    });
  }

  const recentCutoff = Date.now() - s.recentWindowDays * 86400000;
  const recentObligations = obligations.filter((o) => o.issuedAt.getTime() >= recentCutoff);

  const resolvedObligationsLifetime = obligations.length;
  const resolvedObligationsRecent = recentObligations.length;
  const enteredDebtLifetimeCount = obligations.filter((o) => o.enteredDebt).length;

  const cleanRatioLifetime = resolvedObligationsLifetime > 0 ? obligations.filter((o) => o.cleanSettled).length / resolvedObligationsLifetime : null;
  const cleanRatioRecent = resolvedObligationsRecent > 0 ? recentObligations.filter((o) => o.cleanSettled).length / resolvedObligationsRecent : null;

  const totalManualPaid = matchingDebtor ? allDebtorPayments.filter((p) => p.debtorId === matchingDebtor.id).reduce((sum, p) => sum + Number(p.amount), 0) : 0;
  const recentPaymentsCount = matchingDebtor
    ? allDebtorPayments.filter((p) => p.debtorId === matchingDebtor.id && new Date(p.createdAt).getTime() >= recentCutoff).length
    : 0;

  const metrics: ReliabilityMetrics = {
    resolvedObligationsLifetime,
    resolvedObligationsRecent,
    cleanRatioLifetime,
    cleanRatioRecent,
    currentDebt,
    totalManualPaid,
    recentPaymentsCount,
  };

  // مشتری خیلی کم‌سابقه و بدون سیگنال منفی → امتیاز خنثی، نیازی به محاسبه‌ی خام نیست
  const hasNegativeSignal = currentDebt > 0 || enteredDebtLifetimeCount > 0;
  if (resolvedObligationsLifetime < 3 && !hasNegativeSignal) {
    return buildResult(s.defaultNewCustomerScore, true, metrics, ["limited_history"], s);
  }

  // وزن‌دهی اخیر/کل بر اساس تعداد obligationِ resolved‌شده‌ی اخیر
  let wRecent: number, wLifetime: number;
  if (resolvedObligationsRecent >= 3) [wRecent, wLifetime] = [0.7, 0.3];
  else if (resolvedObligationsRecent >= 1) [wRecent, wLifetime] = [0.4, 0.6];
  else [wRecent, wLifetime] = [0, 1];

  const blendedClean = wRecent * (cleanRatioRecent ?? 0) + wLifetime * (cleanRatioLifetime ?? 0);

  // Component 1 — نسبتِ تسویه‌ی تمیز (۳۵ امتیاز)
  const componentClean = blendedClean * 35;

  // Component 2 — بارِ بدهیِ بازِ فعلی (۳۰ امتیاز)
  const lifetimeTotalObligationAmount = obligations.reduce((sum, o) => sum + o.amount, 0);
  const debtRatio = currentDebt / Math.max(lifetimeTotalObligationAmount, 1);
  const componentDebtBurden = 30 * Math.max(0, 1 - Math.min(debtRatio, 1));

  // Component 3 — رفتارِ پرداختِ بدهی (۲۵ امتیاز)
  let componentDebtService: number;
  if (currentDebt <= 0) {
    componentDebtService = 25;
  } else {
    const serviceRatio = totalManualPaid / Math.max(currentDebt + totalManualPaid, 1);
    const serviceBase = 20 * Math.min(serviceRatio, 1);
    const recentBonus = recentPaymentsCount >= 2 ? 5 : recentPaymentsCount === 1 ? 3 : 0;
    componentDebtService = Math.min(25, serviceBase + recentBonus);
  }

  // Component 4 — عمقِ سابقه/اطمینان (۱۰ امتیاز)
  let componentConfidence: number;
  if (resolvedObligationsLifetime >= 10) componentConfidence = 10;
  else if (resolvedObligationsLifetime >= 5) componentConfidence = 8;
  else if (resolvedObligationsLifetime >= 3) componentConfidence = 6;
  else if (resolvedObligationsLifetime === 2) componentConfidence = 4;
  else if (resolvedObligationsLifetime === 1) componentConfidence = 2;
  else componentConfidence = 0;

  const rawScore = Math.max(0, Math.min(100, componentClean + componentDebtBurden + componentDebtService + componentConfidence));

  // قانون محافظتی: کسی که الان بدهی داره ولی اخیراً واقعاً پرداخت کرده، نباید هم‌ردیفِ کسی بشه که بدهی رو رها کرده
  const activeDebtServicing = currentDebt > 0 && recentPaymentsCount >= 1;
  const finalScore = activeDebtServicing ? Math.max(rawScore, 35) : rawScore;

  const reasonFlags: string[] = [];
  if (debtRatio >= 0.7) reasonFlags.push("high_open_debt");
  if (activeDebtServicing) reasonFlags.push("active_debt_servicing");
  if ((cleanRatioLifetime ?? 0) >= 0.9 && resolvedObligationsLifetime >= 3) reasonFlags.push("clean_payment_history");
  if (resolvedObligationsLifetime < 3) reasonFlags.push("limited_history");
  if ((cleanRatioRecent ?? 1) < 0.5 && resolvedObligationsRecent >= 1) reasonFlags.push("debt_heavy_recently");

  return buildResult(finalScore, false, metrics, reasonFlags, s);
}

export const REASON_FLAG_LABELS_FA: Record<string, string> = {
  high_open_debt: "بدهی باز بالا نسبت به سابقه",
  active_debt_servicing: "اخیراً پرداخت دستی روی بدهی داشته",
  clean_payment_history: "سابقه‌ی پرداخت تمیز",
  limited_history: "سابقه هنوز کمه",
  debt_heavy_recently: "اخیراً بدهی‌محور بوده",
};

export const TIER_LABELS_FA: Record<ReliabilityTier, { label: string; color: string }> = {
  excellent: { label: "عالی", color: "#5ee89b" },
  good: { label: "خوب", color: "#7fd88f" },
  average: { label: "متوسط", color: "#e0b23a" },
  risky: { label: "پرریسک", color: "#e08a3a" },
  very_risky: { label: "خیلی پرریسک", color: "#f27f8a" },
};
