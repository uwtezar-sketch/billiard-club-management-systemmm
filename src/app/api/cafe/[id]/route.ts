import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { cafeMenu } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, price, isActive } = body;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (price !== undefined) updateData.price = price.toString();
    if (isActive !== undefined) updateData.isActive = isActive;

    const [item] = await db
      .update(cafeMenu)
      .set(updateData)
      .where(eq(cafeMenu.id, parseInt(id)))
      .returning();

    return NextResponse.json(item);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در ویرایش آیتم" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.delete(cafeMenu).where(eq(cafeMenu.id, parseInt(id)));
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در حذف آیتم" }, { status: 500 });
  }
}
