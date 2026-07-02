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
  status: text("status").notNull().default("pending"), // 'paid' | 'debt' | 'pending'
  isPartial: boolean("is_partial").notNull().default(false),
  notes: text("notes"),
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
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Debts (ردیف‌های بدهی) ────────────────────────────────────────────────────
export const debts = pgTable("debts", {
  id: serial("id").primaryKey(),
  debtorId: integer("debtor_id").notNull().references(() => debtors.id),
  invoiceId: integer("invoice_id").references(() => invoices.id),
  invoiceNumber: text("invoice_number"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  description: text("description"),
  isPaid: boolean("is_paid").notNull().default(false),
  paidAt: timestamp("paid_at"),
  jalaaliDate: text("jalaali_date"),
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
