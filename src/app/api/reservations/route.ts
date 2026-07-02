import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { reservations } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { todayJalaali } from "@/lib/jalaali";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    let allReservations = await db
      .select()
      .from(reservations)
      .orderBy(desc(reservations.createdAt));

    if (date) {
      allReservations = allReservations.filter((r) => r.reservationDate === date);
    }
    if (status) {
      allReservations = allReservations.filter((r) => r.status === status);
    }
    if (search) {
      allReservations = allReservations.filter(
        (r) =>
          r.customerName.includes(search) ||
          (r.customerPhone && r.customerPhone.includes(search))
      );
    }

    return NextResponse.json(allReservations);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در دریافت رزروها" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      customerName,
      customerPhone,
      tableId,
      tableType,
      reservationDate,
      startTime,
      durationMinutes,
      playerCount,
      notes,
    } = body;

    if (!customerName || !tableType || !reservationDate || !startTime) {
      return NextResponse.json({ error: "اطلاعات ناقص است" }, { status: 400 });
    }

    const [reservation] = await db
      .insert(reservations)
      .values({
        customerName,
        customerPhone: customerPhone || null,
        tableId: tableId || null,
        tableType,
        reservationDate,
        startTime,
        durationMinutes: durationMinutes || null,
        playerCount: playerCount || null,
        notes: notes || null,
        status: "registered",
      })
      .returning();

    return NextResponse.json(reservation);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در ثبت رزرو" }, { status: 500 });
  }
}
