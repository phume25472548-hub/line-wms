# Shopee document import

Admins use **นำเข้าเอกสาร** to select Shopee `.xlsx` exports, choose a Shopee channel, review server matches, select rows, and explicitly commit. Parsing happens locally using the vendored SheetJS 0.20.3 library. Up to 500 entries can be reviewed per batch; each file is limited to 10 MB.

- `orders`: groups item rows by order number and sums `ราคาขายสุทธิ`. Uses the order date.
- `Income`: reads `จำนวนเงินทั้งหมดที่โอนแล้ว (฿)` once per order and the transfer date. Named commission/service/payment fee columns are displayed separately and never deducted from the net receipt again.
- `Adjustment`: imports each adjustment separately using the adjustment transfer date, order number, description and amount as its duplicate key.

Files with the same order and report type are rejected when selected together. The database prevents repeated imports across batches. A review is persisted before any financial changes and can be reopened from history. A commit is atomic and replaying the same batch returns the prior result.

Matching uses the selected channel and external order number. A tracking number found in the existing order-number field is a candidate only; correcting it requires an explicit confirmation. Ambiguous, cancelled, conflicting tracking, existing finance and overlapping historical monthly-summary rows are blocked. Missing orders require confirmation as unlinked historical figures. Stock and order items are never created or moved by an import.

Imported figures are stored in a dedicated ledger, linked to an existing internal order where available. The annual report includes imported sales on order dates, receipts on transfer dates, and adjustments separately from order counts; imported channels retain their channel names. The manual finance flow is blocked for orders already represented by the import ledger to prevent double counting. Resolving an existing manual finance conflict or replacing an import is a separate reconciliation operation; this release never silently overwrites it.

History stores the parsed financial values, source filename, SHA-256 of the selected file, match review, author and commit timestamp. Original workbooks and customer addresses are not uploaded. Keep original exported files for independent reconciliation. A source filename alone is not treated as a duplicate key.

Authorization uses the existing server-verified LINE token and ADMIN role. New tables have RLS enabled and grant access only to the service role. The transaction function is security-invoker, callable only by the service role. Tests used the four supplied exports, a local browser with mocked APIs, and rolled-back SQL fixtures for correction, replay, duplicate rejection, financial overlap and stock invariance. No supplied financial entries were committed during development.
