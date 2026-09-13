-- One saved item per EVM address (docs/decisions/0037).
--
-- Rows that share an owner and an address are merged into the one with an
-- enabled wallet watch, else the newest. The survivor keeps the earliest
-- createdAt, the union of notes, and becomes a token if any member was one.
-- source.network is deliberately left in place: the previous release still
-- decodes it during the pre-deploy cutover, and the new code ignores it.
-- Rollback: jsonb_set(document, '{source,network}', coalesce(document->'source'->'network', '"eip155:8453"'))
-- on wallet/token rows written by the new code.
--
-- Idempotent: a second run finds no group with more than one member.
-- Same locks, same order as the stores, so a server still running the
-- previous release waits rather than interleaving.
SELECT pg_advisory_xact_lock(hashtextextended('wallet-stream', 0));
--> statement-breakpoint
CREATE TEMP TABLE merge_plan ON COMMIT DROP AS
WITH onchain AS (
  SELECT id,
         user_id,
         document,
         lower(document->'source'->>'address')              AS address,
         coalesce((document->'walletMonitor'->>'enabled') = 'true', false) AS monitor_on,
         coalesce((document->>'updatedAt')::bigint, 0)                       AS updated_at
    FROM saved_items
   WHERE document->'source'->>'_tag' IN ('wallet', 'token')
), ranked AS (
  SELECT *,
         row_number() OVER (
           PARTITION BY user_id, address
           ORDER BY monitor_on DESC, updated_at DESC, id
         ) AS rank,
         count(*) OVER (PARTITION BY user_id, address) AS members
    FROM onchain
)
SELECT l.id       AS loser_id,
       s.id       AS survivor_id,
       l.user_id  AS user_id,
       l.document AS loser_document
  FROM ranked l
  JOIN ranked s ON s.user_id = l.user_id AND s.address = l.address AND s.rank = 1
 WHERE l.members > 1 AND l.rank > 1;
--> statement-breakpoint
DO $$
DECLARE did text;
BEGIN
  FOR did IN SELECT DISTINCT user_id FROM merge_plan LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('watchlist:' || did, 0));
    PERFORM pg_advisory_xact_lock(hashtextextended('watchlist-data:' || did, 0));
  END LOOP;
END $$;
--> statement-breakpoint
UPDATE saved_items s
   SET document = s.document || jsonb_build_object(
         'createdAt', least((s.document->>'createdAt')::bigint, m.created_at),
         'updatedAt', (extract(epoch FROM clock_timestamp()) * 1000)::bigint,
         'revision',  (s.document->>'revision')::int + 1,
         'notes',     left(concat_ws(E'\n', nullif(s.document->>'notes', ''), m.notes), 1000),
         'source',    (s.document->'source') || jsonb_build_object(
                        '_tag', CASE WHEN m.any_token THEN 'token' ELSE s.document->'source'->>'_tag' END
                      )
       )
  FROM (
    SELECT p.survivor_id,
           min((p.loser_document->>'createdAt')::bigint)            AS created_at,
           bool_or(p.loser_document->'source'->>'_tag' = 'token')  AS any_token,
           string_agg(DISTINCT nullif(p.loser_document->>'notes', ''), E'\n')
             FILTER (WHERE nullif(p.loser_document->>'notes', '')
                           IS DISTINCT FROM nullif(sv.document->>'notes', '')) AS notes
      FROM merge_plan p
      JOIN saved_items sv ON sv.id = p.survivor_id
     GROUP BY p.survivor_id
  ) m
 WHERE s.id = m.survivor_id;
--> statement-breakpoint
DELETE FROM wallet_activities a
 USING merge_plan m
 WHERE a.item_id = m.loser_id
   AND EXISTS (
     SELECT 1 FROM wallet_activities s
      WHERE s.user_id = a.user_id
        AND s.item_id = m.survivor_id
        AND s.transaction_hash = a.transaction_hash
   );
--> statement-breakpoint
UPDATE wallet_activities a
   SET item_id  = m.survivor_id,
       document = CASE WHEN a.document ? 'itemId'
                       THEN jsonb_set(a.document, '{itemId}', s.document->'id')
                       ELSE a.document END
  FROM merge_plan m
  JOIN saved_items s ON s.id = m.survivor_id
 WHERE a.item_id = m.loser_id;
--> statement-breakpoint
UPDATE wallet_alerts a
   SET item_id  = m.survivor_id,
       document = CASE WHEN a.document ? 'itemId'
                       THEN jsonb_set(a.document, '{itemId}', s.document->'id')
                       ELSE a.document END
  FROM merge_plan m
  JOIN saved_items s ON s.id = m.survivor_id
 WHERE a.item_id = m.loser_id;
--> statement-breakpoint
UPDATE wallet_price_evaluations e
   SET item_id  = m.survivor_id,
       document = CASE WHEN e.document ? 'itemId'
                       THEN jsonb_set(e.document, '{itemId}', s.document->'id')
                       ELSE e.document END
  FROM merge_plan m
  JOIN saved_items s ON s.id = m.survivor_id
 WHERE e.item_id = m.loser_id;
--> statement-breakpoint
UPDATE saved_item_data d
   SET item_id  = m.survivor_id,
       document = jsonb_set(d.document, '{itemId}', s.document->'id')
  FROM (
    SELECT DISTINCT ON (p.survivor_id) p.survivor_id, p.loser_id
      FROM merge_plan p
      JOIN saved_item_data ld ON ld.item_id = p.loser_id
     ORDER BY p.survivor_id, (ld.document->'latest'->>'at')::bigint DESC NULLS LAST
  ) m
  JOIN saved_items s ON s.id = m.survivor_id
 WHERE d.item_id = m.loser_id
   AND NOT EXISTS (SELECT 1 FROM saved_item_data sd WHERE sd.item_id = m.survivor_id);
--> statement-breakpoint
DELETE FROM saved_items WHERE id IN (SELECT loser_id FROM merge_plan);
--> statement-breakpoint
UPDATE saved_items
   SET document = jsonb_set(
         document,
         '{walletMonitor,networks}',
         jsonb_build_array(jsonb_build_object(
           'network',    document->'source'->'network',
           'startBlock', document->'walletMonitor'->'startBlock'
         ))
       )
 WHERE document ? 'walletMonitor'
   AND NOT (document->'walletMonitor' ? 'networks')
   AND document->'source'->>'network' IN ('eip155:8453', 'eip155:4663');
--> statement-breakpoint
UPDATE wallet_stream_state
   SET document = jsonb_set(document, '{generation}', to_jsonb((document->>'generation')::bigint + 1));
