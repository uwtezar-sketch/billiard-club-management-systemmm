import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sessions, tables, sessionCafeOrders } from "@/db/schema";
import { eq, and } from "drizzle-orm";

// GET active sessions
export async function GET() {
  try {
    const activeSessions = await db
      .select()
      .from(sessions)
      .where(eq(sessions.status, "active"));
    return NextResponse.json(activeSessions);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در دریافت سشن‌ها" }, { status: 500 });
  }
}

// POST - start a new session
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tableId, customerName, customerPhone, startTime, pricePerHour, notes } = body;

    if (!tableId || !pricePerHour) {
      return NextResponse.json({ error: "اطلاعات ناقص است" }, { status: 400 });
    }

    // Check if table already has active session
    const existing = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.tableId, tableId), eq(sessions.status, "active")));

    if (existing.length > 0) {
      return NextResponse.json({ error: "این میز در حال استفاده است" }, { status: 400 });
    }

    const start = startTime ? new Date(startTime) : new Date();

    const [session] = await db
      .insert(sessions)
      .values({
        tableId,
        customerName: customerName || null,
        customerPhone: customerPhone || null,
        startTime: start,
        pricePerHour: pricePerHour.toString(),
        notes: notes || null,
        status: "active",
      })
      .returning();

    // Mark table as active
    await db.update(tables).set({ isActive: true }).where(eq(tables.id, tableId));

    return NextResponse.json(session);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در شروع سشن" }, { status: 500 });
  }
}
