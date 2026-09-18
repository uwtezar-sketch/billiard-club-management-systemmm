import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { creditors, creditorTransactions } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, phone, notes } = body;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone || null;
    if (notes !== undefined) updateData.notes = notes || null;

    const [updated] = await db.update(creditors).set(updateData).where(eq(creditors.id, parseInt(id))).returning();
    if (!updated) return NextResponse.json({ error: "طلبکار یافت نشد" }, { status: 404 });

    return NextResponse.json(updated);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در ویرایش طلبکار" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.delete(creditorTransactions).where(eq(creditorTransactions.creditorId, parseInt(id)));
    await db.delete(creditors).where(eq(creditors.id, parseInt(id)));
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در حذف طلبکار" }, { status: 500 });
  }
}
