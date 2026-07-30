export interface Neighborhood {
  id: string;
  name: string;
  created_at: string;
}

export interface Label {
  id: string;
  name: string;
  color: string;
}

export interface Contact {
  id: string;
  full_name: string;
  phone: string;
  whatsapp?: string;
  instagram?: string;
  neighborhood_id?: string;
  address?: string;
  birth_date?: string;
  notes?: string;
  additional_info?: any;
  avatar_url?: string;
  created_at: string;
  last_contact_at: string;
  
  // Joined fields
  neighborhood?: Neighborhood;
  labels?: Label[];
}

export interface HistoryItem {
  id: string;
  contact_id: string;
  description: string;
  demand?: string;
  status?: 'pending' | 'resolved';
  type: 'observation' | 'demand' | 'service' | 'note';
  created_at: string;
}

export interface Campaign {
  id: string;
  name: string;
  message: string;
  status: 'draft' | 'scheduled' | 'sent' | 'cancelled';
  scheduled_at?: string;
  created_at: string;
}

export interface Reminder {
  id: string;
  contact_id: string;
  title: string;
  description?: string;
  due_at?: string;
  is_completed: boolean;
  created_at: string;
}

export interface MessageTemplate {
  id: string;
  title: string;
  content: string;
  type: 'ANIVERSARIO' | 'CAMPANHA';
  is_active: boolean;
  created_at: string;
}

export interface MessageLog {
  id: string;
  contact_id: string;
  template_id?: string;
  message_content: string;
  status: 'ENVIADO' | 'ERRO' | 'PENDENTE';
  type: 'ANIVERSARIO' | 'CAMPANHA';
  error_message?: string;
  sent_at: string;
  
  // Joined field
  contact?: Contact;
}

export interface AutomationSettings {
  enabled: boolean;
  template_id: string | null;
}
