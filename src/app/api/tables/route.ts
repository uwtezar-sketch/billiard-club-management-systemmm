import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tables, sessions } from "@/db/schema";
import { eq, isNull } from "drizzle-orm";

export async function GET() {
  try {
    const allTables = await db.select().from(tables).orderBy(tables.id);
    // Get active sessions for each table
    const activeSessions = await db
      .select()
      .from(sessions)
      .where(eq(sessions.status, "active"));

    const result = allTables.map((t) => ({
      ...t,
      activeSession: activeSessions.find((s) => s.tableId === t.id) || null,
    }));

    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در دریافت میزها" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, type } = body;
    if (!name || !type) {
      return NextResponse.json({ error: "نام و نوع میز الزامی است" }, { status: 400 });
    }
    const [table] = await db.insert(tables).values({ name, type }).returning();
    return NextResponse.json(table);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در افزودن میز" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = parseInt(searchParams.get("id") || "0");
    if (!id) return NextResponse.json({ error: "شناسه معتبر نیست" }, { status: 400 });
    await db.delete(tables).where(eq(tables.id, id));
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در حذف میز" }, { status: 500 });
  }
}
