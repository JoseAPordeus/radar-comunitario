-- Canonicaliza telefones já existentes para 55 + DDD + número, sem máscara.
-- Novos cadastros e edições são validados pela API.
WITH normalized AS (
  SELECT
    id,
    CASE
      WHEN regexp_replace(phone, '\D', '', 'g') LIKE '55%'
        THEN regexp_replace(phone, '\D', '', 'g')
      ELSE '55' || ltrim(regexp_replace(phone, '\D', '', 'g'), '0')
    END AS phone_normalized,
    CASE
      WHEN whatsapp IS NULL OR btrim(whatsapp) = '' THEN NULL
      WHEN regexp_replace(whatsapp, '\D', '', 'g') LIKE '55%'
        THEN regexp_replace(whatsapp, '\D', '', 'g')
      ELSE '55' || ltrim(regexp_replace(whatsapp, '\D', '', 'g'), '0')
    END AS whatsapp_normalized
  FROM public.contacts
)
UPDATE public.contacts AS c
SET
  phone = n.phone_normalized,
  whatsapp = COALESCE(n.whatsapp_normalized, n.phone_normalized)
FROM normalized AS n
WHERE c.id = n.id
  AND n.phone_normalized ~ '^55[1-9][0-9]{9,10}$';
