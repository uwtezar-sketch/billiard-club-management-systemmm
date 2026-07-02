import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { reservations } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const updateData: Record<string, unknown> = {};
    const allowed = [
      "customerName", "customerPhone", "tableId", "tableType",
      "reservationDate", "startTime", "durationMinutes", "playerCount",
      "notes", "status", "sessionId",
    ];
    for (const key of allowed) {
      if (body[key] !== undefined) updateData[key] = body[key];
    }

    const [reservation] = await db
      .update(reservations)
      .set(updateData)
      .where(eq(reservations.id, parseInt(id)))
      .returning();

    return NextResponse.json(reservation);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در ویرایش رزرو" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.delete(reservations).where(eq(reservations.id, parseInt(id)));
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در حذف رزرو" }, { status: 500 });
  }
}
