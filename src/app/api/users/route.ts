import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "@/lib/auth";

export async function GET() {
  try {
    const all = await db
      .select({ id: users.id, username: users.username, role: users.role, createdAt: users.createdAt })
      .from(users);
    return NextResponse.json(all);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در دریافت کاربران" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { username, password, role } = await req.json();
    if (!username || !password || !role) {
      return NextResponse.json({ error: "همه‌ی فیلدها الزامی است" }, { status: 400 });
    }
    if (role !== "admin" && role !== "employee") {
      return NextResponse.json({ error: "نقش نامعتبر است" }, { status: 400 });
    }
    if (String(password).length < 4) {
      return NextResponse.json({ error: "رمز عبور باید حداقل ۴ کاراکتر باشد" }, { status: 400 });
    }

    const [existing] = await db.select().from(users).where(eq(users.username, username));
    if (existing) {
      return NextResponse.json({ error: "این نام کاربری قبلاً استفاده شده" }, { status: 400 });
    }

    const passwordHash = hashPassword(password);
    const [user] = await db
      .insert(users)
      .values({ username, passwordHash, role })
      .returning({ id: users.id, username: users.username, role: users.role });

    return NextResponse.json(user);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در ساخت کاربر" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = parseInt(searchParams.get("id") || "0");
    if (!id) return NextResponse.json({ error: "شناسه معتبر نیست" }, { status: 400 });
    await db.delete(users).where(eq(users.id, id));
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در حذف کاربر" }, { status: 500 });
  }
}
