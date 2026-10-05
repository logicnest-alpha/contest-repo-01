-- =====================================================================
-- Restaurant Order Management System : "Reset demo data" (optional)
-- Wipes all orders, bills, payments and customers, restores opening
-- stock and regenerates fresh demo data.  Used by the manager's
-- "Reset demo data" button.  Contains TRUNCATE, so apply it consciously.
-- =====================================================================
SET search_path TO rms;

CREATE FUNCTION fn_seed_demo(p_days INT DEFAULT 30) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = rms, pg_catalog AS $$
BEGIN
    TRUNCATE payment, bill, order_item, orders, customer RESTART IDENTITY;
    UPDATE ingredient SET stock_qty = par_qty WHERE stock_qty <> par_qty;
    UPDATE menu_item  SET is_available = true WHERE NOT is_available;
    RETURN fn_generate_demo(p_days);
END $$;

GRANT EXECUTE ON FUNCTION fn_seed_demo(INT) TO rms_app;
