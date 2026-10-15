-- Phase 9a (ADR 0023): an order total now subtracts the UZGO promo discount.
-- "Order_total_formula" (previous migration) already enforces
-- total = items + delivery − discount; the original check without the
-- discount is replaced by its non-negativity part. Shipment totals stay at
-- full price (the seller is paid on them), so "SellerOrder_money_check" stays.
ALTER TABLE "Order" DROP CONSTRAINT "Order_money_check";
ALTER TABLE "Order" ADD CONSTRAINT "Order_money_check"
  CHECK ("itemsTotalTiyin" >= 0 AND "deliveryTotalTiyin" >= 0 AND "totalTiyin" >= 0);
