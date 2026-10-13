-- Associa contatos a uma cidade e reforça a consistência cidade/bairro.
-- Registros antigos permanecem compatíveis com city_id nulo.

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS city_id UUID REFERENCES cities(id) ON DELETE RESTRICT;

ALTER TABLE neighborhoods
  DROP CONSTRAINT IF EXISTS neighborhoods_id_city_unique;

ALTER TABLE neighborhoods
  ADD CONSTRAINT neighborhoods_id_city_unique UNIQUE (id, city_id);

ALTER TABLE contacts
  DROP CONSTRAINT IF EXISTS contacts_neighborhood_city_fkey;

ALTER TABLE contacts
  ADD CONSTRAINT contacts_neighborhood_city_fkey
  FOREIGN KEY (neighborhood_id, city_id)
  REFERENCES neighborhoods (id, city_id)
  DEFERRABLE INITIALLY IMMEDIATE;

CREATE INDEX IF NOT EXISTS contacts_city_idx ON contacts (city_id);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
