import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { inventoryItems, inventoryLogs } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { verifySessionToken } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, parseInt(id)));
    if (!item) return NextResponse.json({ error: "کالا یافت نشد" }, { status: 404 });
    const logs = await db
      .select()
      .from(inventoryLogs)
      .where(eq(inventoryLogs.itemId, item.id))
      .orderBy(desc(inventoryLogs.createdAt));
    return NextResponse.json({ ...item, logs });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در دریافت کالا" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const itemId = parseInt(id);
    const body = await req.json();
    const { name, category, unit, currentQuantity, status, notes, note } = body;

    const [existing] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, itemId));
    if (!existing) return NextResponse.json({ error: "کالا یافت نشد" }, { status: 404 });

    const sessionToken = req.cookies.get("session")?.value;
    const currentUser = sessionToken ? verifySessionToken(sessionToken) : null;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (category !== undefined) updateData.category = category || null;
    if (unit !== undefined) updateData.unit = unit;
    if (notes !== undefined) updateData.notes = notes || null;
    if (status !== undefined && (status === "ok" || status === "low" || status === "out")) {
      updateData.status = status;
    }

    // اگه مقدار موجودی تغییر کرده، هم آخرین بروزرسانی رو ثبت کن، هم توی تاریخچه بنویس
    if (currentQuantity !== undefined && currentQuantity !== null) {
      const newQty = Number(currentQuantity);
      if (newQty !== Number(existing.currentQuantity)) {
        updateData.currentQuantity = newQty.toString();
        updateData.lastUpdatedAt = new Date();
        updateData.lastUpdatedByUsername = currentUser?.username || null;
        // اگه موجودی به صفر رسید، به‌عنوان یک پیش‌فرض مفید خودکار «تمام شده» می‌کنیم
        // (ولی اگه کاربر توی همین درخواست خودش status دیگه‌ای فرستاده، همون رو محترم می‌شماریم)
        if (newQty <= 0 && status === undefined) updateData.status = "out";

        await db.insert(inventoryLogs).values({
          itemId,
          previousQuantity: existing.currentQuantity,
          newQuantity: newQty.toString(),
          note: note || null,
          byUsername: currentUser?.username || null,
        });
      }
    } else if (status !== undefined) {
      // فقط وضعیت (کم/کافی/تمام‌شده) عوض شده، بدون تغییر عدد — بازم یک بروزرسانی حساب می‌شه
      updateData.lastUpdatedAt = new Date();
      updateData.lastUpdatedByUsername = currentUser?.username || null;
    }

    const [updated] = await db.update(inventoryItems).set(updateData).where(eq(inventoryItems.id, itemId)).returning();
    return NextResponse.json(updated);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در بروزرسانی کالا" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const itemId = parseInt(id);
    await db.delete(inventoryLogs).where(eq(inventoryLogs.itemId, itemId));
    await db.delete(inventoryItems).where(eq(inventoryItems.id, itemId));
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در حذف کالا" }, { status: 500 });
  }
}
