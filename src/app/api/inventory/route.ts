import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { inventoryItems } from "@/db/schema";
import { desc } from "drizzle-orm";
import { verifySessionToken } from "@/lib/auth";

function computeStatus(currentQuantity: string, minThreshold: string | null): "out" | "low" | "ok" {
  const qty = Number(currentQuantity);
  if (qty <= 0) return "out";
  if (minThreshold !== null && qty <= Number(minThreshold)) return "low";
  return "ok";
}

export async function GET() {
  try {
    const items = await db.select().from(inventoryItems).orderBy(desc(inventoryItems.lastUpdatedAt));
    const withStatus = items.map((item) => ({
      ...item,
      status: computeStatus(item.currentQuantity, item.minThreshold),
    }));
    return NextResponse.json(withStatus);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در دریافت انبار" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, category, unit, currentQuantity, minThreshold, notes } = body;
    if (!name) return NextResponse.json({ error: "نام کالا الزامی است" }, { status: 400 });

    const sessionToken = req.cookies.get("session")?.value;
    const currentUser = sessionToken ? verifySessionToken(sessionToken) : null;

    const [item] = await db
      .insert(inventoryItems)
      .values({
        name,
        category: category || null,
        unit: unit || "عدد",
        currentQuantity: (currentQuantity ?? 0).toString(),
        minThreshold: minThreshold !== undefined && minThreshold !== null && minThreshold !== "" ? minThreshold.toString() : null,
        notes: notes || null,
        lastUpdatedByUsername: currentUser?.username || null,
      })
      .returning();

    return NextResponse.json({ ...item, status: computeStatus(item.currentQuantity, item.minThreshold) });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در افزودن کالا" }, { status: 500 });
  }
}
