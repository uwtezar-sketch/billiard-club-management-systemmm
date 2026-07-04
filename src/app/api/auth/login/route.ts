import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyPassword, createSessionToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();
    if (!username || !password) {
      return NextResponse.json({ error: "نام کاربری و رمز عبور الزامی است" }, { status: 400 });
    }

    const [user] = await db.select().from(users).where(eq(users.username, username));
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ error: "نام کاربری یا رمز عبور اشتباه است" }, { status: 401 });
    }

    const token = createSessionToken({
      uid: user.id,
      username: user.username,
      role: user.role as "admin" | "employee",
      exp: Date.now() + 1000 * 60 * 60 * 24 * 180,
    });

    const res = NextResponse.json({ username: user.username, role: user.role });
    res.cookies.set("session", token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 180,
      path: "/",
    });
    return res;
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در ورود" }, { status: 500 });
  }
}
