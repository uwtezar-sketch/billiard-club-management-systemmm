import { sql } from "drizzle-orm";
import { tables, debtors, invoices, invoiceShares } from "../db/schema";

// Only aggregate counts leave the database; badges do not need financial histories.
export const navigationSummaryQuery = sql`
  SELECT
    (SELECT count(*)::int FROM ${tables}
      WHERE ${tables.isActive} = true AND ${tables.isArchived} = false) AS "activeTablesCount",
    (SELECT count(*)::int FROM ${debtors}
      WHERE ${debtors.totalDebt} > 0) AS "unpaidDebtorsCount",
    (SELECT count(*)::int FROM ${invoices}
      WHERE ${invoices.status} IN ('pending', 'split') AND (
        (${invoices.isSplit} = false AND ${invoices.status} = 'pending') OR
        (${invoices.isSplit} = true AND EXISTS (
          SELECT 1 FROM ${invoiceShares}
          WHERE ${invoiceShares.invoiceId} = ${invoices.id}
            AND ${invoiceShares.status} = 'pending'
        ))
      )) AS "pendingInvoicesCount"
`;
