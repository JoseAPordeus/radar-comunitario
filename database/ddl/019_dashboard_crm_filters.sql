-- Fase 2/3: metadados de atendimento e filtros avançados do dashboard.

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS subject TEXT;

CREATE INDEX IF NOT EXISTS conversations_owner_subject_idx
  ON public.conversations (owner_id, subject)
  WHERE subject IS NOT NULL;

CREATE INDEX IF NOT EXISTS conversations_owner_assigned_status_idx
  ON public.conversations (owner_id, assigned_to, status);

DROP FUNCTION IF EXISTS public.dashboard_metrics(UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID, UUID);

CREATE OR REPLACE FUNCTION public.dashboard_metrics(
  p_owner_id UUID,
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to TIMESTAMPTZ DEFAULT NULL,
  p_city_id UUID DEFAULT NULL,
  p_neighborhood_id UUID DEFAULT NULL,
  p_assigned_to UUID DEFAULT NULL,
  p_label_id UUID DEFAULT NULL,
  p_subject TEXT DEFAULT NULL,
  p_conversation_status TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
WITH filtered_contacts AS (
  SELECT c.*
  FROM contacts c
  WHERE c.owner_id = p_owner_id
    AND (p_from IS NULL OR c.created_at >= p_from)
    AND (p_to IS NULL OR c.created_at < p_to)
    AND (p_city_id IS NULL OR c.city_id = p_city_id)
    AND (p_neighborhood_id IS NULL OR c.neighborhood_id = p_neighborhood_id)
    AND (
      p_label_id IS NULL
      OR EXISTS (
        SELECT 1 FROM contact_labels cl
        WHERE cl.contact_id = c.id AND cl.label_id = p_label_id
      )
    )
    AND (
      p_assigned_to IS NULL
      OR EXISTS (
        SELECT 1 FROM conversations cv
        WHERE cv.owner_id = c.owner_id
          AND cv.contact_id = c.id
          AND cv.assigned_to = p_assigned_to
      )
    )
    AND (
      NULLIF(TRIM(p_subject), '') IS NULL
      OR EXISTS (
        SELECT 1 FROM conversations cv
        WHERE cv.owner_id = c.owner_id
          AND cv.contact_id = c.id
          AND cv.subject ILIKE '%' || TRIM(p_subject) || '%'
      )
    )
    AND (
      p_conversation_status IS NULL
      OR EXISTS (
        SELECT 1 FROM conversations cv
        WHERE cv.owner_id = c.owner_id
          AND cv.contact_id = c.id
          AND cv.status = p_conversation_status
      )
    )
),
neighborhood_counts AS (
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('id', n.id, 'name', n.name, 'total', x.total) ORDER BY x.total DESC),
    '[]'::jsonb
  ) value
  FROM (
    SELECT neighborhood_id, COUNT(*)::INTEGER total
    FROM filtered_contacts
    WHERE neighborhood_id IS NOT NULL
    GROUP BY neighborhood_id
  ) x
  JOIN neighborhoods n ON n.id = x.neighborhood_id
),
label_counts AS (
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'color', l.color, 'total', x.total) ORDER BY x.total DESC),
    '[]'::jsonb
  ) value
  FROM (
    SELECT cl.label_id, COUNT(*)::INTEGER total
    FROM contact_labels cl
    JOIN filtered_contacts c ON c.id = cl.contact_id
    GROUP BY cl.label_id
  ) x
  JOIN labels l ON l.id = x.label_id
),
history_counts AS (
  SELECT
    COUNT(*) FILTER (WHERE h.status = 'pending')::INTEGER pending,
    COUNT(*) FILTER (WHERE h.status = 'resolved')::INTEGER resolved
  FROM service_history h
  JOIN filtered_contacts c ON c.id = h.contact_id
  WHERE (p_from IS NULL OR h.created_at >= p_from)
    AND (p_to IS NULL OR h.created_at < p_to)
),
birthday_count AS (
  SELECT COUNT(*)::INTEGER total
  FROM filtered_contacts
  WHERE birth_date IS NOT NULL
    AND EXTRACT(MONTH FROM birth_date) = EXTRACT(MONTH FROM CURRENT_DATE)
)
SELECT jsonb_build_object(
  'totalContacts', (SELECT COUNT(*)::INTEGER FROM filtered_contacts),
  'pendingDemands', (SELECT pending FROM history_counts),
  'resolvedThisPeriod', (SELECT resolved FROM history_counts),
  'birthdaysThisMonth', (SELECT total FROM birthday_count),
  'neighborhoods', (SELECT value FROM neighborhood_counts),
  'labels', (SELECT value FROM label_counts)
);
$$;

REVOKE ALL ON FUNCTION public.dashboard_metrics(UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID, UUID, UUID, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dashboard_metrics(UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID, UUID, UUID, UUID, TEXT, TEXT) TO service_role;
