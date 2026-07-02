import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sessions, tables, sessionCafeOrders } from "@/db/schema";
import { eq } from "drizzle-orm";

// GET session with cafe orders
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sessionId = parseInt(id);
    const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
    if (!session) return NextResponse.json({ error: "سشن یافت نشد" }, { status: 404 });

    const cafeOrders = await db
      .select()
      .from(sessionCafeOrders)
      .where(eq(sessionCafeOrders.sessionId, sessionId));

    return NextResponse.json({ ...session, cafeOrders });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا" }, { status: 500 });
  }
}

// PATCH - update session (edit start time, price, notes, customer)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sessionId = parseInt(id);
    const body = await req.json();
    const { customerName, customerPhone, startTime, pricePerHour, notes, status, endTime } = body;

    const updateData: Record<string, unknown> = {};
    if (customerName !== undefined) updateData.customerName = customerName || null;
    if (customerPhone !== undefined) updateData.customerPhone = customerPhone || null;
    if (startTime !== undefined) updateData.startTime = new Date(startTime);
    if (pricePerHour !== undefined) updateData.pricePerHour = pricePerHour.toString();
    if (notes !== undefined) updateData.notes = notes || null;
    if (status !== undefined) updateData.status = status;
    if (endTime !== undefined) updateData.endTime = new Date(endTime);

    const [session] = await db
      .update(sessions)
      .set(updateData)
      .where(eq(sessions.id, sessionId))
      .returning();

    if (status === "closed") {
      await db.update(tables).set({ isActive: false }).where(eq(tables.id, session.tableId));
    }

    return NextResponse.json(session);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در ویرایش سشن" }, { status: 500 });
  }
}
