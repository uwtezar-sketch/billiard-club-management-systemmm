import { NextResponse } from "next/server";
import { db } from "@/db";
import { debtors, customers } from "@/db/schema";
import { normalizePhone } from "@/lib/phone";
import { stringSimilarity } from "@/lib/similarity";

const NAME_SIMILARITY_THRESHOLD = 0.6;

// GET /api/debtors/merge-suggestions
// پیشنهادهای احتمالی «این دو رکورد یک نفرن» — هم بین بدهکار و مشتری، هم بین دو بدهکار.
// چیزهایی که از قبل با شماره‌تلفن یا اسمِ دقیق مچ می‌شن (isSamePerson) خودکار توی گزارش‌ها ادغام می‌شن؛
// اینجا هدف پیدا کردنِ شباهت‌های مشکوکه که نیاز به تأیید انسانی داره (مثلاً تفاوت جزئی در نوشتن اسم).
export async function GET() {
  try {
    const allDebtors = await db.select().from(debtors);
    const allCustomers = await db.select().from(customers);

    type Suggestion = {
      type: "debtor-customer" | "debtor-debtor";
      debtorId: number;
      debtorName: string;
      debtorPhone: string | null;
      customerId?: number;
      customerName?: string;
      customerPhone?: string;
      targetDebtorId?: number;
      targetDebtorName?: string;
      targetDebtorPhone?: string | null;
      confidence: "high" | "medium";
      reason: string;
    };
    const suggestions: Suggestion[] = [];

    // ── بدهکار ↔ مشتری ──────────────────────────────────────────────────────
    for (const d of allDebtors) {
      // اگه از قبل به یه مشتری لینکه، نیازی به پیشنهاد نیست
      if (d.customerId) continue;
      const dPhone = normalizePhone(d.phone);

      for (const c of allCustomers) {
        const cPhone = normalizePhone(c.phone);
        // اگه شماره‌ی هردو موجوده ولی متفاوته، قطعاً یک نفر نیستن
        if (dPhone && cPhone && dPhone !== cPhone) continue;

        if (dPhone && cPhone && dPhone === cPhone) {
          suggestions.push({
            type: "debtor-customer",
            debtorId: d.id,
            debtorName: d.name,
            debtorPhone: d.phone,
            customerId: c.id,
            customerName: c.name,
            customerPhone: c.phone,
            confidence: "high",
            reason: "شماره تلفن یکسان",
          });
          continue;
        }

        const sim = stringSimilarity(d.name, c.name);
        if (sim >= NAME_SIMILARITY_THRESHOLD) {
          suggestions.push({
            type: "debtor-customer",
            debtorId: d.id,
            debtorName: d.name,
            debtorPhone: d.phone,
            customerId: c.id,
            customerName: c.name,
            customerPhone: c.phone,
            confidence: sim >= 0.85 ? "high" : "medium",
            reason: sim === 1 ? "نام یکسان" : "نام مشابه",
          });
        }
      }
    }

    // ── بدهکار ↔ بدهکار (رکورد تکراری) ─────────────────────────────────────
    for (let i = 0; i < allDebtors.length; i++) {
      for (let j = i + 1; j < allDebtors.length; j++) {
        const a = allDebtors[i];
        const b = allDebtors[j];
        const aPhone = normalizePhone(a.phone);
        const bPhone = normalizePhone(b.phone);
        if (aPhone && bPhone && aPhone !== bPhone) continue;

        if (aPhone && bPhone && aPhone === bPhone) {
          suggestions.push({
            type: "debtor-debtor",
            debtorId: a.id,
            debtorName: a.name,
            debtorPhone: a.phone,
            targetDebtorId: b.id,
            targetDebtorName: b.name,
            targetDebtorPhone: b.phone,
            confidence: "high",
            reason: "شماره تلفن یکسان",
          });
          continue;
        }

        const sim = stringSimilarity(a.name, b.name);
        if (sim >= NAME_SIMILARITY_THRESHOLD) {
          suggestions.push({
            type: "debtor-debtor",
            debtorId: a.id,
            debtorName: a.name,
            debtorPhone: a.phone,
            targetDebtorId: b.id,
            targetDebtorName: b.name,
            targetDebtorPhone: b.phone,
            confidence: sim >= 0.85 ? "high" : "medium",
            reason: sim === 1 ? "نام یکسان" : "نام مشابه",
          });
        }
      }
    }

    suggestions.sort((a, b) => (a.confidence === b.confidence ? 0 : a.confidence === "high" ? -1 : 1));

    return NextResponse.json(suggestions);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در پیدا کردن پیشنهادهای ادغام" }, { status: 500 });
  }
}
