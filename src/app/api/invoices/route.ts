import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { invoices, invoiceItems, sessions, tables, debts, cafeMenu, invoiceShares } from "@/db/schema";
import { eq, desc, like, and, or, gte, lte, inArray } from "drizzle-orm";
import { toJalaali, generateInvoiceNumber } from "@/lib/jalaali";
import { verifySessionToken } from "@/lib/auth";
import { findOrCreateDebtor, recomputeDebtorTotal } from "@/lib/debtorLink";
import { ensureCustomerExists } from "@/lib/customerLink";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const date = searchParams.get("date");
    const tableType = searchParams.get("tableType");
    const paymentMethod = searchParams.get("paymentMethod");
    const days = searchParams.get("days");
    const limit = parseInt(searchParams.get("limit") || "200");
    const offset = parseInt(searchParams.get("offset") || "0");

    const conditions = [];
    // فاکتورهای تقسیم‌شده status='split' دارن، پس وقتی دنبال «در انتظار» می‌گردیم باید
    // اونا رو هم بیاریم و بعد از خوندن سهم‌ها، فقط اونایی که واقعاً سهم معلق دارن نگه داریم
    if (status === "pending") {
      conditions.push(or(eq(invoices.status, "pending"), eq(invoices.status, "split")));
    } else if (status) {
      conditions.push(eq(invoices.status, status));
    }
    if (date) conditions.push(eq(invoices.jalaaliDate, date));
    if (tableType) conditions.push(eq(invoices.tableType, tableType));
    if (paymentMethod) conditions.push(eq(invoices.paymentMethod, paymentMethod));
    if (days) {
      const cutoff = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);
      conditions.push(gte(invoices.issuedAt, cutoff));
    }

    const allInvoices = await db
      .select()
      .from(invoices)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(invoices.issuedAt))
      .limit(limit)
      .offset(offset);

    // Filter by search client side for simplicity
    const filtered = search
      ? allInvoices.filter(
          (inv) =>
            inv.customerName?.includes(search) ||
            inv.invoiceNumber.includes(search)
        )
      : allInvoices;

    // Attach items + shares (سهم‌ها فقط برای فاکتورهای تقسیم‌شده وجود دارن)
    const withItems = await Promise.all(
      filtered.map(async (inv) => {
        const items = await db
          .select()
          .from(invoiceItems)
          .where(eq(invoiceItems.invoiceId, inv.id));
        const shares = inv.isSplit
          ? await db.select().from(invoiceShares).where(eq(invoiceShares.invoiceId, inv.id))
          : [];
        return { ...inv, items, shares };
      })
    );

    // برای فاکتورهای تقسیم‌شده، فقط اگه واقعاً یک سهم «در انتظار» داشته باشن جزو لیست معلق‌ها بمونن
    const finalList =
      status === "pending"
        ? withItems.filter((inv) =>
            inv.isSplit ? inv.shares.some((sh) => sh.status === "pending") : inv.status === "pending"
          )
        : withItems;

    return NextResponse.json(finalList);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در دریافت فاکتورها" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      sessionId,
      tableId,
      customerName,
      customerPhone,
      tableType,
      tableName,
      startTime,
      endTime,
      durationMinutes,
      pricePerHour,
      gamePrice,
      cafeItems,
      discountType,
      discountValue,
      paymentMethod,
      status,
      isPartial,
      notes,
      shares,
      manualTotal,
    } = body;

    // shares: [{ label, amount, paymentMethod: 'cash'|'card'|'debt'|null, status: 'paid'|'debt'|'pending',
    //            debtorId?, newDebtorName?, newDebtorPhone? }]
    const isSplit = Array.isArray(shares) && shares.length > 0;

    const cafeTotal = (cafeItems || []).reduce(
      (sum: number, item: { totalPrice: number }) => sum + Number(item.totalPrice),
      0
    );
    const subtotal = Number(gamePrice || 0) + cafeTotal;

    let discountAmount = 0;
    if (discountType === "percent") {
      discountAmount = Math.round(subtotal * (Number(discountValue || 0) / 100));
    } else if (discountType === "fixed") {
      discountAmount = Number(discountValue || 0);
    }

    // اگه فاکتور تقسیم شده باشه، مبلغ نهایی از جمع سهم‌ها محاسبه می‌شه تا حساب‌ها همیشه با هم جور باشن
    // (نه از subtotal - discount که ممکنه فرانت اشتباه فرستاده باشه).
    // اگه مبلغ به‌صورت دستی ویرایش شده باشه (manualTotal)، همون ملاک قرار می‌گیره.
    let totalAmount: number;
    if (isSplit) {
      totalAmount = shares.reduce((s: number, sh: { amount: number }) => s + Number(sh.amount || 0), 0);
    } else if (manualTotal !== undefined && manualTotal !== null && manualTotal !== "") {
      totalAmount = Math.max(0, Number(manualTotal));
    } else {
      totalAmount = Math.max(0, subtotal - discountAmount);
    }

    const invoiceNumber = generateInvoiceNumber();
    const jalaaliDate = toJalaali(new Date());

    const sessionToken = req.cookies.get("session")?.value;
    const currentUser = sessionToken ? verifySessionToken(sessionToken) : null;

    const [invoice] = await db
      .insert(invoices)
      .values({
        invoiceNumber,
        sessionId: sessionId || null,
        tableId: tableId || null,
        customerName: customerName || null,
        customerPhone: customerPhone || null,
        tableType: tableType || null,
        tableName: tableName || null,
        startTime: startTime ? new Date(startTime) : null,
        endTime: endTime ? new Date(endTime) : null,
        durationMinutes: durationMinutes || null,
        pricePerHour: pricePerHour ? pricePerHour.toString() : null,
        gamePrice: gamePrice.toString(),
        cafeTotal: cafeTotal.toString(),
        subtotal: subtotal.toString(),
        discountType: discountType || null,
        discountValue: discountValue ? discountValue.toString() : "0",
        discountAmount: discountAmount.toString(),
        totalAmount: totalAmount.toString(),
        paymentMethod: isSplit ? null : paymentMethod || null,
        status: isSplit ? "split" : status || "pending",
        isPartial: isPartial || false,
        isSplit,
        notes: notes || null,
        issuedByUsername: currentUser?.username || null,
        jalaaliDate,
        settledAt: !isSplit && status === "paid" ? new Date() : null,
      })
      .returning();

    // مستقیم بعد از ساختِ فاکتور، مشتری رو ثبت می‌کنیم (اگه شماره داره) — مستقل از اینکه پرداخت‌شده،
    // در‌انتظار، یا بدهیه؛ چون هدف اینه هیچ‌وقت یه فاکتورِ دارایِ تلفن بدون مشتریِ ثبت‌شده نمونه
    // (وگرنه امتیاز وفاداری و Smart Loyalty براش کار نمی‌کنه).
    if (!isSplit && customerPhone) {
      await ensureCustomerExists(customerPhone, customerName);
    }

    // Insert cafe items
    if (cafeItems && cafeItems.length > 0) {
      // آیتم‌های کافه ممکنه به یه cafeItemId قدیمی/حذف‌شده از منو اشاره کنن
      // (مثلاً میز از قبل سفارش داشته و بعداً اون آیتم از منو حذف شده).
      // چون cafe_item_id یه foreign key به cafe_menu هست، اگه شناسه معتبر نباشه
      // کل فاکتور با خطا شکست می‌خوره. برای همین اول شناسه‌های معتبر رو چک می‌کنیم
      // و برای هر آیتمی که دیگه تو منو نیست، فقط نام/قیمتش رو ثبت می‌کنیم (بدون لینک).
      const requestedIds = [
        ...new Set(
          cafeItems
            .map((item: { cafeItemId?: number }) => item.cafeItemId)
            .filter((id: number | undefined): id is number => !!id)
        ),
      ];
      const validIds = new Set(
        requestedIds.length > 0
          ? (
              await db
                .select({ id: cafeMenu.id })
                .from(cafeMenu)
                .where(inArray(cafeMenu.id, requestedIds as number[]))
            ).map((r) => r.id)
          : []
      );

      await db.insert(invoiceItems).values(
        cafeItems.map((item: { cafeItemId?: number; name: string; quantity: number; unitPrice: number; totalPrice: number }) => ({
          invoiceId: invoice.id,
          cafeItemId: item.cafeItemId && validIds.has(item.cafeItemId) ? item.cafeItemId : null,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice.toString(),
          totalPrice: item.totalPrice.toString(),
        }))
      );
    }

    // Handle debt transfer (فقط برای فاکتورهای غیرتقسیم؛ حالت تقسیم‌شده پایین‌تر جدا مدیریت می‌شه)
    if (!isSplit && (paymentMethod === "debt" || status === "debt")) {
      const debtorId = await findOrCreateDebtor({
        debtorId: body.debtorId,
        newDebtorName: body.newDebtorName || customerName,
        newDebtorPhone: body.newDebtorPhone || customerPhone,
        amount: totalAmount,
      });

      await db.insert(debts).values({
        debtorId,
        invoiceId: invoice.id,
        invoiceNumber,
        amount: totalAmount.toString(),
        description: `فاکتور ${invoiceNumber} - ${tableName || ""} - ${jalaaliDate}`,
        jalaaliDate,
        isPaid: false,
      });
      await recomputeDebtorTotal(debtorId);

      // Update invoice status to debt
      await db
        .update(invoices)
        .set({ status: "debt" })
        .where(eq(invoices.id, invoice.id));
    }

    // Handle split billing shares — هر سهم وضعیت پرداخت مستقل خودش رو داره
    if (isSplit) {
      for (const share of shares as Array<{
        label: string;
        phone?: string;
        amount: number;
        paymentMethod?: "cash" | "card" | "debt" | null;
        status: "paid" | "debt" | "pending";
        debtorId?: number | null;
        newDebtorName?: string;
        newDebtorPhone?: string;
      }>) {
        const shareAmount = Number(share.amount || 0);
        let shareDebtorId: number | null = null;

        if (share.phone) {
          await ensureCustomerExists(share.phone, share.label);
        }

        const [insertedShare] = await db
          .insert(invoiceShares)
          .values({
            invoiceId: invoice.id,
            label: share.label,
            phone: share.phone || null,
            amount: shareAmount.toString(),
            paymentMethod: share.status === "debt" ? "debt" : share.paymentMethod || null,
            status: share.status,
            debtorId: null,
            settledAt: share.status === "paid" ? new Date() : null,
          })
          .returning();

        if (share.status === "debt") {
          shareDebtorId = await findOrCreateDebtor({
            debtorId: share.debtorId,
            newDebtorName: share.newDebtorName || share.label,
            newDebtorPhone: share.newDebtorPhone || share.phone,
            amount: shareAmount,
          });

          await db.insert(debts).values({
            debtorId: shareDebtorId,
            invoiceId: invoice.id,
            shareId: insertedShare.id,
            invoiceNumber,
            amount: shareAmount.toString(),
            description: `سهم «${share.label}» از فاکتور ${invoiceNumber} - ${tableName || ""} - ${jalaaliDate}`,
            jalaaliDate,
            isPaid: false,
          });

          await db
            .update(invoiceShares)
            .set({ debtorId: shareDebtorId })
            .where(eq(invoiceShares.id, insertedShare.id));

          await recomputeDebtorTotal(shareDebtorId);
        }
      }
    }

    // If session is not partial and not kept open, close the session
    if (sessionId && !isPartial) {
      await db
        .update(sessions)
        .set({ status: "closed", endTime: endTime ? new Date(endTime) : new Date() })
        .where(eq(sessions.id, sessionId));
      if (tableId) {
        await db.update(tables).set({ isActive: false }).where(eq(tables.id, tableId));
      }
    }

    return NextResponse.json({ ...invoice, invoiceNumber });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در صدور فاکتور" }, { status: 500 });
  }
}
