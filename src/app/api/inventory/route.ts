import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { inventoryItems } from "@/db/schema";
import { desc } from "drizzle-orm";
import { verifySessionToken } from "@/lib/auth";

export async function GET() {
  try {
    const items = await db.select().from(inventoryItems).orderBy(desc(inventoryItems.lastUpdatedAt));
    return NextResponse.json(items);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در دریافت انبار" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, category, unit, currentQuantity, status } = body;
    if (!name) return NextResponse.json({ error: "نام کالا الزامی است" }, { status: 400 });

    const sessionToken = req.cookies.get("session")?.value;
    const currentUser = sessionToken ? verifySessionToken(sessionToken) : null;
    const qty = Number(currentQuantity ?? 0);

    const [item] = await db
      .insert(inventoryItems)
      .values({
        name,
        category: category || null,
        unit: unit || "عدد",
        currentQuantity: qty.toString(),
        // اگه از همون اول موجودی صفره، خودکار «تمام شده» بذار؛ وگرنه هرچی کاربر انتخاب کرده (یا پیش‌فرض کافی)
        status: qty <= 0 ? "out" : status === "low" || status === "ok" ? status : "ok",
        lastUpdatedByUsername: currentUser?.username || null,
      })
      .returning();

    return NextResponse.json(item);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در افزودن کالا" }, { status: 500 });
  }
}
