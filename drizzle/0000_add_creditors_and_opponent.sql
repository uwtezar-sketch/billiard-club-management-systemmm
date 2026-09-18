ALTER TABLE "invoices" ADD COLUMN "opponent_name" text;

CREATE TABLE "creditors" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" varchar(20),
	"notes" text,
	"total_credit" numeric(12, 2) DEFAULT '0',
	"created_at" timestamp DEFAULT now()
);

CREATE TABLE "creditor_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"creditor_id" integer NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"description" text,
	"jalaali_date" text,
	"by_username" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "creditor_transactions_creditor_id_fk"
		FOREIGN KEY ("creditor_id")
		REFERENCES "creditors"("id")
		ON DELETE no action
		ON UPDATE no action
);
