BEGIN;

-- Compensa las victorias de cartas con apuesta mínima que quedaron sin ganancia
-- por el redondeo hacia abajo del multiplicador 1.90.
WITH compensation AS (
  SELECT account_id, currency, count(*)::integer AS amount
  FROM casino_plays
  WHERE game='cartas-mayab'
    AND net=0
    AND payout=bet
    AND outcome::jsonb->>'result'='victoria'
  GROUP BY account_id,currency
)
UPDATE player_wallets wallet
SET jade=wallet.jade+CASE WHEN compensation.currency='jade' THEN compensation.amount ELSE 0 END,
    obsidian=wallet.obsidian+CASE WHEN compensation.currency='obsidian' THEN compensation.amount ELSE 0 END,
    gold=wallet.gold+CASE WHEN compensation.currency='gold' THEN compensation.amount ELSE 0 END,
    updated_at=now()
FROM compensation
WHERE wallet.account_id=compensation.account_id;

UPDATE casino_plays
SET payout=bet+1,net=1
WHERE game='cartas-mayab'
  AND net=0
  AND payout=bet
  AND outcome::jsonb->>'result'='victoria';

COMMIT;
