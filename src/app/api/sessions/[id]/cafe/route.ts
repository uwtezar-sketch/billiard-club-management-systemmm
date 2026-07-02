import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sessionCafeOrders } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const orders = await db
      .select()
      .from(sessionCafeOrders)
      .where(eq(sessionCafeOrders.sessionId, parseInt(id)));
    return NextResponse.json(orders);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { cafeItemId, name, quantity, unitPrice, customerName } = body;

    if (!name || !quantity || !unitPrice) {
      return NextResponse.json({ error: "اطلاعات ناقص است" }, { status: 400 });
    }

    const totalPrice = quantity * unitPrice;
    const [order] = await db
      .insert(sessionCafeOrders)
      .values({
        sessionId: parseInt(id),
        cafeItemId: cafeItemId || null,
        name,
        quantity,
        unitPrice: unitPrice.toString(),
        totalPrice: totalPrice.toString(),
        customerName: customerName || null,
      })
      .returning();

    return NextResponse.json(order);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در افزودن سفارش" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { searchParams } = new URL(req.url);
    const orderId = parseInt(searchParams.get("orderId") || "0");
    if (!orderId) return NextResponse.json({ error: "شناسه معتبر نیست" }, { status: 400 });
    await db.delete(sessionCafeOrders).where(eq(sessionCafeOrders.id, orderId));
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در حذف سفارش" }, { status: 500 });
  }
}
