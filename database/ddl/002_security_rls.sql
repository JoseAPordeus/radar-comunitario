-- Segurança e isolamento por usuário autenticado.
-- Este script é uma migração de preparação e deve ser validado em homologação.

ALTER TABLE neighborhoods ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE labels ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE automation_settings ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Relações dependentes herdam o proprietário do contato ou da etiqueta.
-- Não adicionar owner_id redundante a estas tabelas evita divergência de dados.

ALTER TABLE neighborhoods ENABLE ROW LEVEL SECURITY;
ALTER TABLE labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_settings ENABLE ROW LEVEL SECURITY;

-- Remove as políticas públicas do schema legado.
DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'neighborhoods', 'labels', 'contacts', 'contact_labels',
    'service_history', 'campaigns', 'reminders', 'message_templates',
    'message_logs', 'automation_settings'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Public Read" ON %I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS "Public Write" ON %I', table_name);
  END LOOP;
END $$;

DROP POLICY IF EXISTS neighborhoods_owner_policy ON neighborhoods;
DROP POLICY IF EXISTS labels_owner_policy ON labels;
DROP POLICY IF EXISTS contacts_owner_policy ON contacts;
DROP POLICY IF EXISTS contact_labels_owner_policy ON contact_labels;
DROP POLICY IF EXISTS service_history_owner_policy ON service_history;
DROP POLICY IF EXISTS reminders_owner_policy ON reminders;
DROP POLICY IF EXISTS campaigns_owner_policy ON campaigns;
DROP POLICY IF EXISTS message_templates_owner_policy ON message_templates;
DROP POLICY IF EXISTS message_logs_owner_policy ON message_logs;
DROP POLICY IF EXISTS automation_settings_owner_policy ON automation_settings;

CREATE POLICY neighborhoods_owner_policy ON neighborhoods
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE POLICY labels_owner_policy ON labels
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE POLICY contacts_owner_policy ON contacts
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE POLICY contact_labels_owner_policy ON contact_labels
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = contact_labels.contact_id AND c.owner_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM labels l
      WHERE l.id = contact_labels.label_id AND l.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = contact_labels.contact_id AND c.owner_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM labels l
      WHERE l.id = contact_labels.label_id AND l.owner_id = auth.uid()
    )
  );

CREATE POLICY service_history_owner_policy ON service_history
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM contacts c
    WHERE c.id = service_history.contact_id AND c.owner_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM contacts c
    WHERE c.id = service_history.contact_id AND c.owner_id = auth.uid()
  ));

CREATE POLICY reminders_owner_policy ON reminders
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM contacts c
    WHERE c.id = reminders.contact_id AND c.owner_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM contacts c
    WHERE c.id = reminders.contact_id AND c.owner_id = auth.uid()
  ));

CREATE POLICY campaigns_owner_policy ON campaigns
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE POLICY message_templates_owner_policy ON message_templates
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE POLICY message_logs_owner_policy ON message_logs
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM contacts c
    WHERE c.id = message_logs.contact_id AND c.owner_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM contacts c
    WHERE c.id = message_logs.contact_id AND c.owner_id = auth.uid()
  ));

CREATE POLICY automation_settings_owner_policy ON automation_settings
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE INDEX IF NOT EXISTS neighborhoods_owner_idx ON neighborhoods (owner_id);
CREATE INDEX IF NOT EXISTS labels_owner_idx ON labels (owner_id);
CREATE INDEX IF NOT EXISTS contacts_owner_idx ON contacts (owner_id);
CREATE INDEX IF NOT EXISTS campaigns_owner_idx ON campaigns (owner_id);
CREATE INDEX IF NOT EXISTS message_templates_owner_idx ON message_templates (owner_id);
CREATE INDEX IF NOT EXISTS automation_settings_owner_idx ON automation_settings (owner_id);

-- As chaves passam a ser únicas dentro do espaço do usuário, não globalmente.
ALTER TABLE neighborhoods DROP CONSTRAINT IF EXISTS neighborhoods_name_key;
ALTER TABLE automation_settings DROP CONSTRAINT IF EXISTS automation_settings_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS neighborhoods_owner_name_unique
  ON neighborhoods (owner_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS automation_settings_owner_key_unique
  ON automation_settings (owner_id, key);

-- Não é seguro concluir esta migração sem associar os registros legados.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM neighborhoods WHERE owner_id IS NULL)
    OR EXISTS (SELECT 1 FROM labels WHERE owner_id IS NULL)
    OR EXISTS (SELECT 1 FROM contacts WHERE owner_id IS NULL)
    OR EXISTS (SELECT 1 FROM campaigns WHERE owner_id IS NULL)
    OR EXISTS (SELECT 1 FROM message_templates WHERE owner_id IS NULL)
    OR EXISTS (SELECT 1 FROM automation_settings WHERE owner_id IS NULL)
  THEN
    RAISE EXCEPTION 'Migração interrompida: associe os registros legados a um usuário autenticado antes de aplicar o RLS em produção.';
  END IF;
END $$;

ALTER TABLE neighborhoods ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE labels ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE contacts ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE campaigns ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE message_templates ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE automation_settings ALTER COLUMN owner_id SET NOT NULL;
