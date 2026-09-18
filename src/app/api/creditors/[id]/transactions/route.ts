import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { creditors, creditorTransactions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifySessionToken } from "@/lib/auth";
import { todayJalaali } from "@/lib/jalaali";
import { recomputeCreditorTotal } from "@/lib/creditorLink";

// POST /api/creditors/[id]/transactions
// body: { type: 'credit' | 'usage', amount, description? }
// 'usage' = مشتری از طلبش توی باشگاه/کافه مصرف کرده (مانده کم می‌شه)
// 'credit' = یک شارژ/اضافه‌ی جدید به طلبش (مانده زیاد می‌شه)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const creditorId = parseInt(id);
    const body = await req.json();
    const type = body.type === "credit" ? "credit" : "usage";
    const amount = Number(body.amount || 0);
    const description = body.description || null;

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "مبلغ باید بیشتر از صفر باشد" }, { status: 400 });
    }

    const [creditor] = await db.select().from(creditors).where(eq(creditors.id, creditorId));
    if (!creditor) return NextResponse.json({ error: "طلبکار یافت نشد" }, { status: 404 });

    const sessionToken = req.cookies.get("session")?.value;
    const currentUser = sessionToken ? verifySessionToken(sessionToken) : null;

    const [tx] = await db
      .insert(creditorTransactions)
      .values({
        creditorId,
        type,
        amount: amount.toString(),
        description,
        jalaaliDate: todayJalaali(),
        byUsername: currentUser?.username || null,
      })
      .returning();

    const newTotal = await recomputeCreditorTotal(creditorId);
    return NextResponse.json({ transaction: tx, totalCredit: newTotal });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در ثبت تراکنش" }, { status: 500 });
  }
}
