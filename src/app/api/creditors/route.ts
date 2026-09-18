import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { creditors, creditorTransactions } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { todayJalaali } from "@/lib/jalaali";
import { findOrCreateCreditor, recomputeCreditorTotal } from "@/lib/creditorLink";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search");

    const all = await db.select().from(creditors).orderBy(desc(creditors.createdAt));
    const filtered = search ? all.filter((c) => c.name.includes(search) || (c.phone && c.phone.includes(search))) : all;

    const withTx = await Promise.all(
      filtered.map(async (c) => {
        const txs = await db
          .select()
          .from(creditorTransactions)
          .where(eq(creditorTransactions.creditorId, c.id))
          .orderBy(desc(creditorTransactions.createdAt));
        return { ...c, transactions: txs };
      })
    );

    return NextResponse.json(withTx);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در دریافت طلبکاران" }, { status: 500 });
  }
}

// POST /api/creditors
// body: { name, phone?, notes?, amount?, description? }
// یک طلبکار جدید می‌سازه (یا اگه با شماره/نامِ یک طلبکارِ قبلی مچ بشه، طلب به همون اضافه می‌شه — پخش نمی‌شه)
// و اگه amount داده شده باشه، یک تراکنشِ «credit» اولیه هم براش ثبت می‌کنه.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, phone, notes, amount, description } = body;
    if (!name) return NextResponse.json({ error: "نام الزامی است" }, { status: 400 });

    const creditorId = await findOrCreateCreditor({ name, phone: phone || null });

    if (notes !== undefined) {
      await db.update(creditors).set({ notes: notes || null }).where(eq(creditors.id, creditorId));
    }

    if (amount && Number(amount) > 0) {
      await db.insert(creditorTransactions).values({
        creditorId,
        type: "credit",
        amount: Number(amount).toString(),
        description: description || null,
        jalaaliDate: todayJalaali(),
      });
      await recomputeCreditorTotal(creditorId);
    }

    const [creditor] = await db.select().from(creditors).where(eq(creditors.id, creditorId));
    return NextResponse.json(creditor);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در ثبت طلبکار" }, { status: 500 });
  }
}
