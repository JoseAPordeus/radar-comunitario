-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- TABLE: neighborhoods
CREATE TABLE neighborhoods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- TABLE: labels
CREATE TABLE labels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  color TEXT NOT NULL, -- Hex code
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- TABLE: contacts
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  whatsapp TEXT,
  instagram TEXT,
  neighborhood_id UUID REFERENCES neighborhoods(id),
  address TEXT,
  birth_date DATE,
  notes TEXT,
  additional_info JSONB DEFAULT '{}',
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_contact_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- TABLE: contact_labels (Many-to-Many)
CREATE TABLE contact_labels (
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  label_id UUID REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (contact_id, label_id)
);

-- TABLE: service_history
CREATE TABLE service_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  demand TEXT,
  status TEXT CHECK (status IN ('pending', 'resolved')),
  type TEXT DEFAULT 'observation', -- observation, demand, service, note
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- TABLE: campaigns
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'draft', -- draft, scheduled, sent, cancelled
  scheduled_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- TABLE: reminders
CREATE TABLE reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_at TIMESTAMP WITH TIME ZONE,
  is_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- TABLE: message_templates
CREATE TABLE message_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('ANIVERSARIO', 'CAMPANHA')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- TABLE: message_logs
CREATE TABLE message_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  template_id UUID REFERENCES message_templates(id),
  message_content TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ENVIADO', 'ERRO', 'PENDENTE')),
  type TEXT NOT NULL DEFAULT 'ANIVERSARIO',
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- TABLE: automation_settings
CREATE TABLE automation_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default automation setting
INSERT INTO automation_settings (key, value) VALUES ('birthday_automation', '{"enabled": false, "template_id": null}');

-- Enable Row Level Security (RLS) - simplified for preview
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

-- Polices (Allow all for now to facilitate demo/setup)
CREATE POLICY "Public Read" ON neighborhoods FOR SELECT USING (true);
CREATE POLICY "Public Write" ON neighborhoods FOR ALL USING (true);
CREATE POLICY "Public Read" ON labels FOR SELECT USING (true);
CREATE POLICY "Public Write" ON labels FOR ALL USING (true);
CREATE POLICY "Public Read" ON contacts FOR SELECT USING (true);
CREATE POLICY "Public Write" ON contacts FOR ALL USING (true);
CREATE POLICY "Public Read" ON contact_labels FOR SELECT USING (true);
CREATE POLICY "Public Write" ON contact_labels FOR ALL USING (true);
CREATE POLICY "Public Read" ON service_history FOR SELECT USING (true);
CREATE POLICY "Public Write" ON service_history FOR ALL USING (true);
CREATE POLICY "Public Read" ON campaigns FOR SELECT USING (true);
CREATE POLICY "Public Write" ON campaigns FOR ALL USING (true);
CREATE POLICY "Public Read" ON reminders FOR SELECT USING (true);
CREATE POLICY "Public Write" ON reminders FOR ALL USING (true);
CREATE POLICY "Public Read" ON message_templates FOR SELECT USING (true);
CREATE POLICY "Public Write" ON message_templates FOR ALL USING (true);
CREATE POLICY "Public Read" ON message_logs FOR SELECT USING (true);
CREATE POLICY "Public Write" ON message_logs FOR ALL USING (true);
CREATE POLICY "Public Read" ON automation_settings FOR SELECT USING (true);
CREATE POLICY "Public Write" ON automation_settings FOR ALL USING (true);

-- DEFAULT MESSAGE TEMPLATES
INSERT INTO message_templates (title, content, type, is_active) VALUES 
('Aniversário - Amigável', 'Olá {nome}, passando para te desejar um feliz aniversário! Muita saúde, paz e alegria no seu dia. Parabéns! 🎂🎉', 'ANIVERSARIO', true),
('Aniversário - Equipe', 'Oi {nome}, parabéns pelo seu dia! Desejamos muitas felicidades e um ano repleto de conquistas. Um grande abraço de toda a nossa equipe! 🎈✨', 'ANIVERSARIO', true),
('Aniversário - Comunidade', '{nome}, hoje o dia é todo seu! Feliz aniversário! Que sua caminhada aqui no {bairro} seja sempre iluminada. Aproveite seu dia! 🥳🎊', 'ANIVERSARIO', true);
