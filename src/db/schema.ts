import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  numeric,
  jsonb,
  varchar,
} from "drizzle-orm/pg-core";

// ─── Users (کاربران سیستم) ─────────────────────────────────────────────────
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull(), // 'admin' | 'employee'
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Tables (میزها) ───────────────────────────────────────────────────────────
export const tables = pgTable("tables", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(), // 'snooker' | 'eightball' | 'playstation'
  isActive: boolean("is_active").notNull().default(false),
  isArchived: boolean("is_archived").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Sessions (سشن‌های فعال) ───────────────────────────────────────────────────
export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  tableId: integer("table_id").notNull().references(() => tables.id),
  customerName: text("customer_name"),
  customerPhone: text("customer_phone"),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time"),
  pricePerHour: numeric("price_per_hour", { precision: 12, scale: 2 }).notNull(),
  status: text("status").notNull().default("active"), // 'active' | 'closed'
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Cafe Menu (منوی کافه) ────────────────────────────────────────────────────
export const cafeMenu = pgTable("cafe_menu", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  price: numeric("price", { precision: 12, scale: 2 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Invoices (فاکتورها) ──────────────────────────────────────────────────────
export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  invoiceNumber: text("invoice_number").notNull().unique(),
  sessionId: integer("session_id").references(() => sessions.id),
  tableId: integer("table_id").references(() => tables.id),
  customerName: text("customer_name"),
  customerPhone: text("customer_phone"),
  tableType: text("table_type"), // 'snooker' | 'eightball' | 'playstation'
  tableName: text("table_name"),
  startTime: timestamp("start_time"),
  endTime: timestamp("end_time"),
  durationMinutes: integer("duration_minutes"),
  pricePerHour: numeric("price_per_hour", { precision: 12, scale: 2 }),
  gamePrice: numeric("game_price", { precision: 12, scale: 2 }).notNull().default("0"),
  cafeTotal: numeric("cafe_total", { precision: 12, scale: 2 }).notNull().default("0"),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
  discountType: text("discount_type"), // 'percent' | 'fixed'
  discountValue: numeric("discount_value", { precision: 12, scale: 2 }).default("0"),
  discountAmount: numeric("discount_amount", { precision: 12, scale: 2 }).default("0"),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  paymentMethod: text("payment_method"), // 'cash' | 'card' | 'debt'
  status: text("status").notNull().default("pending"), // 'paid' | 'debt' | 'pending' | 'split'
  isPartial: boolean("is_partial").notNull().default(false),
  isSplit: boolean("is_split").notNull().default(false),
  notes: text("notes"),
  issuedByUsername: text("issued_by_username"),
  issuedAt: timestamp("issued_at").notNull().defaultNow(),
  settledAt: timestamp("settled_at"),
  jalaaliDate: text("jalaali_date"),
});

// ─── Invoice Items (آیتم‌های فاکتور) ──────────────────────────────────────────
export const invoiceItems = pgTable("invoice_items", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull().references(() => invoices.id),
  cafeItemId: integer("cafe_item_id").references(() => cafeMenu.id),
  name: text("name").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  totalPrice: numeric("total_price", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Session Cafe Orders (سفارشات کافه روی میز فعال) ─────────────────────────
export const sessionCafeOrders = pgTable("session_cafe_orders", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => sessions.id),
  cafeItemId: integer("cafe_item_id").references(() => cafeMenu.id),
  name: text("name").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  totalPrice: numeric("total_price", { precision: 12, scale: 2 }).notNull(),
  customerName: text("customer_name"), // for partial billing
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Debtors (بدهکاران) ───────────────────────────────────────────────────────
export const debtors = pgTable("debtors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: varchar("phone", { length: 20 }),
  notes: text("notes"),
  totalDebt: numeric("total_debt", { precision: 12, scale: 2 }).notNull().default("0"),
  customerId: integer("customer_id").references(() => customers.id), // اگه این بدهکار به یک رکورد باشگاه مشتریان وصل/ادغام شده باشه
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Invoice Shares (سهم‌های تقسیم فاکتور) ────────────────────────────────────
export const invoiceShares = pgTable("invoice_shares", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull().references(() => invoices.id),
  label: text("label").notNull(), // نام شخصی که این سهم مال اونه (مثلاً "علی")
  phone: varchar("phone", { length: 20 }), // اختیاری، برای تشخیص دقیق‌تر مشتری
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  paymentMethod: text("payment_method"), // 'cash' | 'card' | 'debt' | null
  status: text("status").notNull().default("pending"), // 'paid' | 'debt' | 'pending'
  debtorId: integer("debtor_id").references(() => debtors.id),
  settledAt: timestamp("settled_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Debts (ردیف‌های بدهی) ────────────────────────────────────────────────────
export const debts = pgTable("debts", {
  id: serial("id").primaryKey(),
  debtorId: integer("debtor_id").notNull().references(() => debtors.id),
  invoiceId: integer("invoice_id").references(() => invoices.id),
  shareId: integer("share_id").references(() => invoiceShares.id), // اگه این بدهی از یک سهمِ فاکتور تقسیم‌شده اومده باشه
  invoiceNumber: text("invoice_number"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  description: text("description"),
  isPaid: boolean("is_paid").notNull().default(false),
  paidAt: timestamp("paid_at"),
  jalaaliDate: text("jalaali_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// پرداخت‌های دستیِ جزئی روی حساب یک بدهکار (مثلاً از ۷٬۵۰۰٬۰۰۰ فقط ۱٬۰۰۰٬۰۰۰ پرداخت کرده)
// این جدا از جدول «debts» (که هر ردیفش یک فاکتور/بدهیه) نگه داشته می‌شه چون پرداخت جزئی لزوماً مال یک فاکتور خاص نیست.
export const debtorPayments = pgTable("debtor_payments", {
  id: serial("id").primaryKey(),
  debtorId: integer("debtor_id").notNull().references(() => debtors.id),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  note: text("note"),
  jalaaliDate: text("jalaali_date"),
  byUsername: text("by_username"),
  // اگه این پرداخت دقیقاً بابتِ تسویه‌ی کاملِ یک ردیفِ بدهیِ مشخص بوده (از طریق settleDebtRow)، اینجا
  // به همون debt وصل می‌شه. این تمایز خیلی مهمه: چون اون بدهی دیگه isPaid=true شده و از «بدهیِ باز»
  // کنار گذاشته می‌شه، این پرداخت نباید *دوباره* از بدهی‌های بازِ دیگه کم بشه — وگرنه یه پرداختِ قدیمی
  // برای یه بدهیِ قبلاً‌تسویه‌شده، باعث می‌شه بدهیِ جدیدِ دیگه‌ای که ربطی بهش نداره هم اشتباهاً کم نشون داده بشه.
  // پرداخت‌های دستیِ عادی (partial payment از بخش بدهکاران) این ستون رو خالی می‌ذارن — چون به بدهیِ
  // خاصی وصل نیستن، بلکه یه اعتبارِ کلی روی حساب بدهکارن.
  debtId: integer("debt_id").references(() => debts.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Reservations (رزروها) ────────────────────────────────────────────────────
export const reservations = pgTable("reservations", {
  id: serial("id").primaryKey(),
  customerName: text("customer_name").notNull(),
  customerPhone: varchar("customer_phone", { length: 20 }),
  tableId: integer("table_id").references(() => tables.id),
  tableType: text("table_type").notNull(), // 'snooker' | 'eightball' | 'playstation'
  reservationDate: text("reservation_date").notNull(), // jalaali date string
  startTime: text("start_time").notNull(), // HH:mm
  durationMinutes: integer("duration_minutes"),
  playerCount: integer("player_count"),
  notes: text("notes"),
  status: text("status").notNull().default("registered"), // 'registered' | 'done' | 'cancelled' | 'expired'
  sessionId: integer("session_id").references(() => sessions.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Settings (تنظیمات) ───────────────────────────────────────────────────────
export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Activity Logs (لاگ فعالیت) ──────────────────────────────────────────────
export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(),
  entityType: text("entity_type"),
  entityId: integer("entity_id"),
  details: jsonb("details"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
// ─── انبار / موجودی (Inventory) ───────────────────────────────────────────────
export const inventoryItems = pgTable("inventory_items", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category"), // مثلاً «کافه»، «نظافت»، «یخچال» — اختیاری، برای دسته‌بندی
  unit: text("unit").notNull().default("عدد"), // عدد، کیلوگرم، بسته، لیتر...
  currentQuantity: numeric("current_quantity", { precision: 12, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("ok"), // 'ok' | 'low' | 'out' — با یک ضربه دستی تنظیم می‌شه، عدد و آستانه لازم نیست
  notes: text("notes"),
  lastUpdatedAt: timestamp("last_updated_at").notNull().defaultNow(),
  lastUpdatedByUsername: text("last_updated_by_username"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const inventoryLogs = pgTable("inventory_logs", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull().references(() => inventoryItems.id),
  previousQuantity: numeric("previous_quantity", { precision: 12, scale: 2 }).notNull(),
  newQuantity: numeric("new_quantity", { precision: 12, scale: 2 }).notNull(),
  note: text("note"),
  byUsername: text("by_username"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Customers (باشگاه مشتریان) ───────────────────────────────────────────────
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(),
  notes: text("notes"),
  isVip: boolean("is_vip").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// امتیاز وفاداری هیچ‌وقت مستقیم ذخیره نمی‌شه — همیشه از رویِ «مجموع واقعاً پرداخت‌شده ÷ ارزش هر امتیاز»
// محاسبه می‌شه (مثل بدهکارها) تا با ویرایش فاکتورهای قدیمی هم همیشه درست بمونه.
// این جدول فقط استفاده‌های امتیاز (redemption) رو نگه می‌داره؛ باقی‌مونده = امتیازِ محاسبه‌شده منهای جمعِ این جدول.
// valueApplied و invoiceId برای Smart Loyalty V1 اضافه شدن: چون تشخیص «این تخفیف مال کدوم فاکتوره و چقدر ارزش واقعی داشته»
// از روی discountType/discountValue عمومیِ فاکتور مبهم و شکننده بود، این دو ستون صریح این رابطه رو ثبت می‌کنن
// (به‌جای حدس زدن) — هر دو nullable هستن تا رکوردهای قدیمی/redemption های بدون فاکتور مشکلی پیش نیارن.
export const customerPointRedemptions = pgTable("customer_point_redemptions", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customers.id),
  points: integer("points").notNull(),
  note: text("note"),
  byUsername: text("by_username"),
  jalaaliDate: text("jalaali_date"),
  valueApplied: numeric("value_applied", { precision: 12, scale: 2 }), // مبلغ تومانیِ واقعیِ اعمال‌شده (points × effectivePointValue وقتِ ثبت)
  invoiceId: integer("invoice_id").references(() => invoices.id), // اگه این استفاده از امتیاز مالِ یک فاکتور مشخص بوده
  kind: text("kind"), // 'redeem' (پیش‌فرض، یعنی null هم همینه) | 'adjustment' (هدیه/تنظیم دستیِ مدیر، مقدارِ points می‌تونه منفی باشه)
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
