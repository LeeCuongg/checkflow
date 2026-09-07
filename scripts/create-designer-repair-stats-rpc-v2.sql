-- =====================================================================
-- RPC: get_designer_repair_stats_v2
--
-- Khác v1 ở ĐƠN VỊ ĐO. v1 đo theo "đơn CONFIRMED" và quy toàn bộ đơn về
-- designer ĐẦU TIÊN trong history → sai khi đơn qua nhiều vòng đời hoặc
-- được designer khác sửa hộ.
--
-- v2 đo theo LƯỢT CHẤM: mỗi row order_history có status CONFIRMED hoặc
-- NEED REPAIR là một lần reviewer chấm bài của designer ĐANG GIỮ ĐƠN tại
-- thời điểm đó (snapshot order_history.designer). Tử số và mẫu số dùng
-- CÙNG một quy gán nên tỉ lệ luôn nhất quán và không bao giờ vượt 100%.
--
-- Workflow thực tế:
--   A dựng  → NEED REPAIR (row designer = A)   → lỗi tính cho A
--   B nhận  → REPAIRED    (row designer = B)   → B là người sửa hộ
--   B chốt  → CONFIRMED   (row designer = B)   → B +1 lượt đạt
--
-- Time range lọc theo created_at của CHÍNH row chấm → cùng hệ thời gian
-- với phần summary event-based trong /api/need-repair/stats (v1 lọc theo
-- lần CONFIRMED gần nhất nên hai khối số không cộng khớp nhau).
--
-- v1 (get_designer_repair_stats) được GIỮ NGUYÊN để đối chiếu số.
-- =====================================================================

CREATE OR REPLACE FUNCTION get_designer_repair_stats_v2(
  p_time_from     timestamptz DEFAULT NULL,   -- NULL = all time
  p_time_to       timestamptz DEFAULT NULL,
  p_sheet_ids     text[]      DEFAULT NULL,   -- NULL/empty = tất cả sheet
  p_include_sheet boolean     DEFAULT TRUE,
  p_include_mera  boolean     DEFAULT TRUE
)
RETURNS TABLE(
  designer                text,    -- normalized lowercase
  designer_display        text,    -- tên hiển thị phổ biến nhất trong group
  total_rounds            bigint,  -- MẪU SỐ: số lượt được chấm (CONFIRMED + NEED REPAIR)
  distinct_orders         bigint,  -- số đơn distinct designer có mặt trong kỳ
  nr_times                bigint,  -- số lượt bị NEED REPAIR
  de_times                bigint,  -- số lượt NR do design_error
  cc_times                bigint,  -- số lượt NR do customer_change
  orders_nr               bigint,  -- số ĐƠN distinct bị NR
  orders_de               bigint,  -- số ĐƠN distinct bị NR do design_error
  orders_cc               bigint,  -- số ĐƠN distinct bị NR do customer_change
  confirmed_after_repair  bigint,  -- số ĐƠN distinct được CONFIRMED trong kỳ sau khi đã từng bị NR
  repaired_for_others     bigint   -- số lần đứng ra sửa đơn do designer KHÁC gây lỗi
)
LANGUAGE sql
STABLE
AS $$
  WITH
  -- Lọc theo source (Sheet / Mera) + sheetIds. Khi cả 2 đều tắt, trả rỗng.
  src AS (
    SELECT id, item_id, google_sheet_id, designer, status, change_type, created_at
    FROM order_history
    WHERE item_id IS NOT NULL
      AND (
        (p_include_sheet AND google_sheet_id <> '__mera__')
        OR (p_include_mera AND google_sheet_id = '__mera__')
      )
      AND (
        p_sheet_ids IS NULL
        OR cardinality(p_sheet_ids) = 0
        OR google_sheet_id = ANY(p_sheet_ids)
        OR (p_include_mera AND google_sheet_id = '__mera__')
      )
  ),
  -- Chia history của mỗi đơn thành các "chặng sửa": nr_grp tăng 1 tại mỗi
  -- row NEED REPAIR. Row NR tự nằm ở đầu chặng của chính nó.
  -- nr_grp = 0 là giai đoạn trước khi đơn bị NR lần nào.
  graded AS (
    SELECT
      s.*,
      COUNT(*) FILTER (WHERE s.status = 'NEED REPAIR')
        OVER (PARTITION BY s.item_id, s.google_sheet_id ORDER BY s.created_at, s.id) AS nr_grp
    FROM src s
  ),
  -- nr_designer = designer trên row NR mở đầu chặng = người gây lỗi của chặng đó.
  with_owner AS (
    SELECT
      g.*,
      FIRST_VALUE(LOWER(BTRIM(g.designer)))
        OVER (PARTITION BY g.item_id, g.google_sheet_id, g.nr_grp ORDER BY g.created_at, g.id) AS nr_designer
    FROM graded g
  ),
  -- MẪU SỐ + tử số: các lượt chấm nằm trong khoảng thời gian lọc.
  rounds AS (
    SELECT
      LOWER(BTRIM(designer)) AS designer_norm,
      designer               AS designer_display,
      item_id, google_sheet_id, status, change_type, nr_grp
    FROM with_owner
    WHERE status IN ('CONFIRMED', 'NEED REPAIR')
      AND designer IS NOT NULL AND BTRIM(designer) <> ''
      AND (p_time_from IS NULL OR created_at >= p_time_from)
      AND (p_time_to   IS NULL OR created_at <  p_time_to)
  ),
  agg AS (
    SELECT
      designer_norm,
      MODE() WITHIN GROUP (ORDER BY designer_display)                          AS designer_display,
      COUNT(*)                                                                 AS total_rounds,
      COUNT(DISTINCT (item_id, google_sheet_id))                               AS distinct_orders,
      COUNT(*) FILTER (WHERE status = 'NEED REPAIR')                           AS nr_times,
      COUNT(*) FILTER (WHERE status = 'NEED REPAIR' AND change_type = 'design_error')    AS de_times,
      COUNT(*) FILTER (WHERE status = 'NEED REPAIR' AND change_type = 'customer_change') AS cc_times,
      COUNT(DISTINCT (item_id, google_sheet_id))
        FILTER (WHERE status = 'NEED REPAIR')                                  AS orders_nr,
      COUNT(DISTINCT (item_id, google_sheet_id))
        FILTER (WHERE status = 'NEED REPAIR' AND change_type = 'design_error') AS orders_de,
      COUNT(DISTINCT (item_id, google_sheet_id))
        FILTER (WHERE status = 'NEED REPAIR' AND change_type = 'customer_change') AS orders_cc,
      -- Đơn được chốt trong kỳ SAU khi đã từng bị NR (nr_grp > 0).
      COUNT(DISTINCT (item_id, google_sheet_id))
        FILTER (WHERE status = 'CONFIRMED' AND nr_grp > 0)                     AS confirmed_after_repair
    FROM rounds
    GROUP BY designer_norm
  ),
  -- Người sửa của mỗi chặng = row ĐẦU TIÊN có status REPAIRED hoặc CONFIRMED
  -- sau row NR mở chặng. Lấy DISTINCT ON nên:
  --   - designer đổi status qua CheckFlow  → bắt được row REPAIRED
  --   - designer chỉ sửa trên Google Sheet → bắt được row CONFIRMED kế tiếp
  --   - có cả hai                          → vẫn chỉ đếm 1 lần
  repair_owner AS (
    SELECT DISTINCT ON (item_id, google_sheet_id, nr_grp)
      item_id, google_sheet_id, nr_grp,
      LOWER(BTRIM(designer)) AS designer_norm,
      nr_designer,
      created_at
    FROM with_owner
    WHERE nr_grp > 0
      AND status IN ('REPAIRED', 'CONFIRMED')
      AND designer IS NOT NULL AND BTRIM(designer) <> ''
    ORDER BY item_id, google_sheet_id, nr_grp, created_at, id
  ),
  handovers AS (
    SELECT designer_norm, COUNT(*) AS repaired_for_others
    FROM repair_owner
    WHERE designer_norm IS DISTINCT FROM nr_designer
      AND (p_time_from IS NULL OR created_at >= p_time_from)
      AND (p_time_to   IS NULL OR created_at <  p_time_to)
    GROUP BY designer_norm
  )
  SELECT
    a.designer_norm            AS designer,
    a.designer_display,
    a.total_rounds,
    a.distinct_orders,
    a.nr_times,
    a.de_times,
    a.cc_times,
    a.orders_nr,
    a.orders_de,
    a.orders_cc,
    a.confirmed_after_repair,
    COALESCE(h.repaired_for_others, 0) AS repaired_for_others
  FROM agg a
  LEFT JOIN handovers h USING (designer_norm)
  ORDER BY a.total_rounds DESC;
$$;


-- =====================================================================
-- ĐỐI CHIẾU v1 vs v2 — chạy trước khi cắt sang v2.
-- Chênh lệch tập trung ở designer có đơn bị chuyển tay.
-- =====================================================================
-- SELECT
--   COALESCE(v1.designer, v2.designer)  AS designer,
--   v1.confirmed_orders                 AS v1_tong_don,
--   v2.total_rounds                     AS v2_tong_luot,
--   v1.orders_design_error              AS v1_don_loi,
--   v2.orders_de                        AS v2_don_loi,
--   ROUND(100.0 * v1.orders_design_error / NULLIF(v1.confirmed_orders,0), 1) AS v1_ti_le,
--   ROUND(100.0 * v2.de_times           / NULLIF(v2.total_rounds,0),      1) AS v2_ti_le,
--   v2.repaired_for_others              AS sua_ho
-- FROM get_designer_repair_stats()         v1
-- FULL JOIN get_designer_repair_stats_v2() v2 USING (designer)
-- ORDER BY COALESCE(v2.total_rounds, 0) DESC;

-- Soi các chặng bị chuyển tay (ai gây lỗi → ai sửa):
-- WITH src AS (
--   SELECT id, item_id, google_sheet_id, designer, status, created_at
--   FROM order_history WHERE item_id IS NOT NULL
-- ), graded AS (
--   SELECT s.*, COUNT(*) FILTER (WHERE s.status = 'NEED REPAIR')
--     OVER (PARTITION BY s.item_id, s.google_sheet_id ORDER BY s.created_at, s.id) AS nr_grp
--   FROM src s
-- ), with_owner AS (
--   SELECT g.*, FIRST_VALUE(LOWER(BTRIM(g.designer)))
--     OVER (PARTITION BY g.item_id, g.google_sheet_id, g.nr_grp ORDER BY g.created_at, g.id) AS nr_designer
--   FROM graded g
-- )
-- SELECT DISTINCT ON (item_id, google_sheet_id, nr_grp)
--   item_id, nr_grp, nr_designer AS nguoi_gay_loi,
--   LOWER(BTRIM(designer)) AS nguoi_sua, status, created_at
-- FROM with_owner
-- WHERE nr_grp > 0 AND status IN ('REPAIRED', 'CONFIRMED')
--   AND LOWER(BTRIM(designer)) IS DISTINCT FROM nr_designer
-- ORDER BY item_id, google_sheet_id, nr_grp, created_at, id;
