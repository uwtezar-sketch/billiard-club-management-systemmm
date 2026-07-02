import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { cafeMenu } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    const items = await db
      .select()
      .from(cafeMenu)
      .where(eq(cafeMenu.isActive, true))
      .orderBy(cafeMenu.id);
    return NextResponse.json(items);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در دریافت منو" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, price } = body;
    if (!name || !price) {
      return NextResponse.json({ error: "نام و قیمت الزامی است" }, { status: 400 });
    }
    const [item] = await db
      .insert(cafeMenu)
      .values({ name, price: price.toString() })
      .returning();
    return NextResponse.json(item);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در افزودن آیتم" }, { status: 500 });
  }
}
