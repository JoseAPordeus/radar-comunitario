import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Plus, 
  MoreVertical, 
  MessageSquare, 
  Filter, 
  Star, 
  Users, 
  Tag as TagIcon,
  Sun,
  Moon,
  Instagram,
  Phone,
  LayoutDashboard,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Send,
  X,
  History,
  MapPin,
  Clock,
  Pencil
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, formatDistanceToNow, isSameDay, parseISO as parseDateFNSIso } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { supabase } from './lib/supabase';
import { Contact, Neighborhood, Label as LabelType, HistoryItem, Reminder } from './types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import BirthdayView from './components/BirthdayView';
import TemplatesView from './components/TemplatesView';
import BulkMessageView from './components/BulkMessageView';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Helper for dates without timezone shifts
const safeParseDate = (dateStr: string) => {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

// Mock Data for initial load if DB is empty
const MOCK_NEIGHBORHOODS: string[] = ['Palmeira', 'Jeremias', 'Jardim Menezes', 'Centro', 'Bodocó'];
const MOCK_LABELS = [
  { name: 'Apoiador', color: '#25d366' },
  { name: 'Liderança', color: '#128c7e' },
  { name: 'Demanda Pendente', color: '#f3da35' },
  { name: 'Prioridade', color: '#ea4335' }
];

export default function App() {
  return (
    <ThemeProvider>
      <MainLayout />
    </ThemeProvider>
  );
}

function MainLayout() {
  const { theme, toggleTheme } = useTheme();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [view, setView] = useState<'conversas' | 'dashboard' | 'campaigns' | 'birthdays' | 'templates' | 'bulk_message'>('conversas');
  const [isAddingContact, setIsAddingContact] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [showSidebarMenu, setShowSidebarMenu] = useState(false);
  const [allLabels, setAllLabels] = useState<LabelType[]>([]);
  
  // Tag Manager States
  const [showLabelsManager, setShowLabelsManager] = useState(false);
  const [isAddingNewLabel, setIsAddingNewLabel] = useState(false);
  const [editingLabel, setEditingLabel] = useState<LabelType | null>(null);
  const [isLabelEditMode, setIsLabelEditMode] = useState(false);
  
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState('#3b82f6'); // Default blue

  const isSupabaseConfigured = 
    import.meta.env.VITE_SUPABASE_URL && 
    import.meta.env.VITE_SUPABASE_URL.startsWith('http') &&
    import.meta.env.VITE_SUPABASE_ANON_KEY;

  // Load Data
  useEffect(() => {
    if (isSupabaseConfigured) {
      fetchContacts();
      fetchLabels();
      checkBirthdayAutomation();
    }
  }, [isSupabaseConfigured]);

  const checkBirthdayAutomation = async () => {
    try {
      // 1. Check if automation is enabled
      const { data: settingsData } = await supabase
        .from('automation_settings')
        .select('value')
        .eq('key', 'birthday_automation')
        .single();
      
      const settings = settingsData?.value as { enabled: boolean; template_id: string | null };
      if (!settings || !settings.enabled || !settings.template_id) return;

      // 2. Fetch today's birthdays
      const today = new Date();
      const monthDay = `${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;
      
      const { data: birthdays } = await supabase
        .from('contacts')
        .select('*')
        // We use like to match --MM-DD since birth_date is YYYY-MM-DD
        .ilike('birth_date', `%-${monthDay}`);
      
      if (!birthdays || birthdays.length === 0) return;

      // 3. Fetch template
      const { data: template } = await supabase
        .from('message_templates')
        .select('*')
        .eq('id', settings.template_id)
        .single();
      
      if (!template) return;

      // 4. Send messages to those who haven't received yet today
      for (const contact of birthdays) {
        // Check if already sent today
        const startOfDay = new Date();
        startOfDay.setHours(0,0,0,0);
        
        const { count } = await supabase
          .from('message_logs')
          .select('*', { count: 'exact', head: true })
          .eq('contact_id', contact.id)
          .eq('type', 'ANIVERSARIO')
          .gte('sent_at', startOfDay.toISOString());
        
        if (count === 0) {
          const finalMessage = template.content
            .replace(/{nome}/g, contact.full_name)
            .replace(/{bairro}/g, contact.address || '')
            .replace(/{telefone}/g, contact.phone);
          
          // Log as sent (Mock sending)
          await supabase.from('message_logs').insert({
            contact_id: contact.id,
            template_id: template.id,
            message_content: finalMessage,
            status: 'ENVIADO',
            type: 'ANIVERSARIO'
          });
          
          console.log(`Mensagem de aniversário enviada automaticamente para ${contact.full_name}`);
        }
      }
    } catch (err) {
      console.error('Erro na automação de aniversários:', err);
    }
  };

  const fetchLabels = async () => {
    const { data } = await supabase.from('labels').select('*');
    if (data) setAllLabels(data);
  };

  const createLabel = async () => {
    if (!newLabelName.trim()) return;
    
    // Validar se já existe etiqueta com este nome (ignorando maiúsculas/minúsculas)
    const normalizedNewName = newLabelName.trim().toLowerCase();
    const duplicate = allLabels.find(l => 
      l.name.toLowerCase() === normalizedNewName && 
      (!editingLabel || l.id !== editingLabel.id)
    );

    if (duplicate) {
      alert(`Já existe uma etiqueta com o nome "${newLabelName}". Escolha um nome diferente.`);
      return;
    }
    
    const payload = { 
      name: newLabelName.trim(), 
      color: newLabelColor 
    };

    let error;
    if (editingLabel) {
      const { error: err } = await supabase.from('labels').update(payload).eq('id', editingLabel.id);
      error = err;
    } else {
      const { error: err } = await supabase.from('labels').insert(payload);
      error = err;
    }

    if (!error) {
      setNewLabelName('');
      setIsAddingNewLabel(false);
      setEditingLabel(null);
      fetchLabels();
    } else {
      console.error("Erro ao salvar etiqueta:", error);
      alert("Erro ao salvar etiqueta. Tente novamente.");
    }
  };

  const deleteLabel = async (id: string) => {
    if (window.confirm('Excluir esta etiqueta removerá ela de todos os contatos. Esta ação não pode ser desfeita. Continuar?')) {
      try {
        // Primeiro removemos as associações nos contatos para evitar erros de chave estrangeira
        // se o banco não tiver cascade configurado.
        await supabase.from('contact_labels').delete().eq('label_id', id);
        
        const { error } = await supabase.from('labels').delete().eq('id', id);
        if (!error) {
          fetchLabels();
          // Também atualizamos os contatos locais se necessário, ou apenas forçamos refresh
          fetchContacts();
        } else {
          console.error("Erro ao excluir etiqueta:", error);
          alert("Não foi possível excluir a etiqueta: " + error.message);
        }
      } catch (err) {
        console.error("Exceção ao excluir etiqueta:", err);
      }
    }
  };

  const fetchContacts = async () => {
    const { data, error } = await supabase
      .from('contacts')
      .select('*, neighborhood:neighborhood_id(*), labels:labels(*)')
      .order('last_contact_at', { ascending: false });

    if (!error && data) {
      setContacts(data as any);
    }
  };

  if (!isSupabaseConfigured) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center p-8 bg-slate-50 dark:bg-slate-900 text-center gap-6">
        <div className="p-6 bg-amber-100 dark:bg-amber-900/30 rounded-full text-amber-600">
          <AlertCircle size={64} />
        </div>
        <div className="max-w-md space-y-2">
          <h1 className="text-2xl font-bold">Configuração Necessária</h1>
          <p className="text-slate-500">
            Você selecionou o Supabase como banco de dados. Para que o Radar Comunitário funcione, 
            você precisa configurar as chaves de API.
          </p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 w-full max-w-lg text-left space-y-4">
          <p className="font-bold text-sm uppercase tracking-wider text-slate-400">Passos para configurar:</p>
          <ol className="list-decimal list-inside space-y-2 text-sm text-slate-600 dark:text-slate-300">
            <li>Crie um projeto no <strong>Supabase</strong>.</li>
            <li>Execute o script SQL do arquivo <code>supabase_schema.sql</code> no seu projeto.</li>
            <li>Vá em <strong>Settings &gt; API</strong> e copie a URL e a Anon Key.</li>
            <li>No painel de <strong>Secrets</strong> do AI Studio, adicione:
              <ul className="mt-2 space-y-1 ml-6 font-mono text-[11px] bg-slate-50 dark:bg-slate-900 p-2 rounded border border-slate-100 dark:border-slate-800">
                <li className="text-pink-600">VITE_SUPABASE_URL</li>
                <li className="text-pink-600">VITE_SUPABASE_ANON_KEY</li>
              </ul>
            </li>
          </ol>
        </div>
      </div>
    );
  }

  const filteredContacts = contacts.filter(c => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = 
      c.full_name.toLowerCase().includes(query) ||
      c.phone.includes(query) ||
      c.neighborhood?.name.toLowerCase().includes(query) ||
      c.notes?.toLowerCase().includes(query) ||
      c.labels?.some(l => l.name.toLowerCase().includes(query));
    
    if (!matchesSearch) return false;
    
    if (selectedLabelIds.length === 0) return true;
    
    return c.labels?.some(l => selectedLabelIds.includes(l.id));
  });

  const selectedContact = contacts.find(c => c.id === selectedId) || null;

  return (
    <div className={cn(
      "flex h-screen overflow-hidden text-slate-900 dark:text-slate-100 font-sans transition-colors duration-300",
      theme,
      theme === 'dark' ? "bg-[#0b141a]" : "bg-[#f0f2f5]"
    )}>
      {/* Sidebar - Contacts List */}
      <aside className={cn(
        "w-full md:w-[450px] border-r border-slate-200 dark:border-slate-800 flex flex-col bg-white dark:bg-[#111b21] transition-all duration-300",
        selectedId && "hidden md:flex"
      )}>
        {/* Sidebar Header */}
        <header className="p-4 flex items-center justify-between bg-white dark:bg-[#111b21] border-b border-slate-100 dark:border-slate-800 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-wa-green flex items-center justify-center text-white font-bold text-lg shadow-sm">
              R
            </div>
            <h1 className="font-bold text-xl tracking-tight hidden md:block text-slate-800 dark:text-white">Radar</h1>
          </div>
          <div className="flex items-center gap-2 text-slate-500">
            <button 
              onClick={toggleTheme}
              className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-all active:scale-95"
              title={theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}
            >
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button onClick={() => setIsAddingContact(true)} className="p-2 bg-wa-green text-white rounded-full hover:bg-wa-teal transition-all shadow-md active:scale-95">
              <Plus size={20} />
            </button>
            <div className="relative">
              <button 
                onClick={() => setShowSidebarMenu(!showSidebarMenu)}
                className={cn(
                  "p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors",
                  showSidebarMenu && "bg-slate-200 dark:bg-slate-800 text-wa-green"
                )}
              >
                <MoreVertical size={20} />
              </button>
              
              <AnimatePresence>
                {showSidebarMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowSidebarMenu(false)} />
                    <motion.div 
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 mt-2 w-52 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-100 dark:border-slate-700 z-50 overflow-hidden"
                    >
                      <button 
                        onClick={() => { setView('conversas'); setShowSidebarMenu(false); }}
                        className="w-full p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-3 transition-colors border-b border-slate-50 dark:border-slate-700"
                      >
                        <MessageSquare size={18} className="text-slate-400" />
                        <span className="text-sm font-medium">Conversas</span>
                      </button>
                      <button 
                        onClick={() => { setView('dashboard'); setShowSidebarMenu(false); }}
                        className="w-full p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-3 transition-colors border-b border-slate-50 dark:border-slate-700"
                      >
                        <LayoutDashboard size={18} className="text-slate-400" />
                        <span className="text-sm font-medium">Dashboard</span>
                      </button>
                      <button 
                        onClick={() => { setView('campaigns'); setShowSidebarMenu(false); }}
                        className="w-full p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-3 transition-colors border-b border-slate-50 dark:border-slate-700"
                      >
                        <Send size={18} className="text-slate-400" />
                        <span className="text-sm font-medium">Campanhas</span>
                      </button>
                      <button 
                        onClick={() => { setView('birthdays'); setShowSidebarMenu(false); }}
                        className="w-full p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-3 transition-colors border-b border-slate-50 dark:border-slate-700"
                      >
                        <Calendar size={18} className="text-slate-400" />
                        <span className="text-sm font-medium">Aniversariantes</span>
                      </button>
                      <button 
                        onClick={() => { setView('templates'); setShowSidebarMenu(false); }}
                        className="w-full p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-3 transition-colors border-b border-slate-50 dark:border-slate-700"
                      >
                        <TagIcon size={18} className="text-slate-400" />
                        <span className="text-sm font-medium">Modelos de Mensagem</span>
                      </button>
                      <button 
                        onClick={() => { setView('bulk_message'); setShowSidebarMenu(false); }}
                        className="w-full p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-3 transition-colors border-b border-slate-50 dark:border-slate-700"
                      >
                        <Users size={18} className="text-slate-400" />
                        <span className="text-sm font-medium">Envio em Massa</span>
                      </button>
                      <button 
                        onClick={() => { setShowLabelsManager(true); setShowSidebarMenu(false); }}
                        className="w-full p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-3 transition-colors"
                      >
                        <TagIcon size={18} className="text-slate-400" />
                        <span className="text-sm font-medium">Gerenciar Etiquetas</span>
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Search & Filters */}
        <div className="p-3 space-y-3">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Pesquisar contatos, bairros ou etiquetas..."
              className="w-full pl-12 pr-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg outline-none focus:ring-2 focus:ring-wa-green transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex gap-2 items-center overflow-x-auto pb-2 no-scrollbar">
            <button 
              className={cn(
                "px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all",
                selectedLabelIds.length === 0 ? "bg-wa-green text-white shadow-sm" : "bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
              )}
              onClick={() => setSelectedLabelIds([])}
            >
              Todas
            </button>

            {Array.from(new Map<string, LabelType>(allLabels.map(l => [l.id, l])).values()).map((l) => {
              const isSelected = selectedLabelIds.includes(l.id);
              return (
                <button 
                  key={`label-filter-${l.id}`}
                  className={cn(
                    "px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all flex items-center gap-2",
                    isSelected ? "text-white shadow-sm" : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                  )}
                  style={isSelected ? { backgroundColor: l.color } : {}}
                  onClick={() => {
                    setSelectedLabelIds(prev => 
                      prev.includes(l.id) 
                        ? prev.filter(id => id !== l.id) 
                        : [...prev, l.id]
                    );
                  }}
                >
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: isSelected ? 'white' : l.color }} />
                  {l.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Contacts List Scroll Area */}
        <div className="flex-1 overflow-y-auto">
          {filteredContacts.length > 0 ? (
            Array.from(new Map<string, Contact>(filteredContacts.map(c => [c.id, c])).values()).map(contact => (
              <ContactListItem 
                key={`contact-item-${contact.id}`} 
                contact={contact} 
                isSelected={selectedId === contact.id}
                onClick={() => {
                  setSelectedId(contact.id);
                  setView('conversas');
                }}
              />
            ))
          ) : (
            <div className="p-10 text-center text-slate-400 space-y-4">
              <Search className="mx-auto opacity-20" size={48} />
              <p>Nenhum contato encontrado</p>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className={cn(
        "flex-1 relative flex flex-col h-full bg-slate-50 dark:bg-slate-900 transition-all duration-300",
        !selectedId && view === 'conversas' && "hidden md:flex"
      )}>
        <AnimatePresence mode="wait">
          {view === 'dashboard' ? (
            <Dashboard key="dashboard" contacts={contacts} />
          ) : view === 'campaigns' ? (
            <CampaignsView key="campaigns" />
          ) : view === 'birthdays' ? (
            <BirthdayView key="birthdays" />
          ) : view === 'templates' ? (
            <TemplatesView key="templates" />
          ) : view === 'bulk_message' ? (
            <BulkMessageView key="bulk_message" />
          ) : selectedContact ? (
            <ContactDetailView 
              key={selectedContact.id} 
              contact={selectedContact} 
              onClose={() => setSelectedId(null)}
              refreshContacts={fetchContacts}
              onEdit={(c) => {
                setEditingContact(c);
                setIsAddingContact(true);
              }}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-400">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6 max-w-md"
              >
                <div className="w-24 h-24 mx-auto bg-slate-200 dark:bg-slate-800 rounded-full flex items-center justify-center">
                  <MessageSquare size={48} className="text-wa-green opacity-50" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-600 dark:text-slate-300">Radar Comunitário</h2>
                  <p className="mt-2">Selecione um contato para visualizar a ficha detalhada e gerenciar as demandas da comunidade.</p>
                </div>
                <button 
                  onClick={() => setIsAddingContact(true)}
                  className="px-6 py-3 bg-wa-green hover:bg-wa-teal text-white rounded-lg font-bold shadow-lg transition-all active:scale-95 flex items-center gap-2 mx-auto"
                >
                  <Plus size={20} /> Cadastrar Novo Contato
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>

      {/* Modals Area */}
      <AnimatePresence>
        {isAddingContact && (
          <ContactModal 
            initialData={editingContact || undefined}
            onClose={() => {
              setIsAddingContact(false);
              setEditingContact(null);
            }} 
            onSuccess={() => {
              setIsAddingContact(false);
              setEditingContact(null);
              fetchContacts();
            }}
          />
        )}

        {showLabelsManager && (
          <LabelsManagerModal 
            labels={allLabels}
            contacts={contacts}
            onClose={() => {
              setShowLabelsManager(false);
              setIsLabelEditMode(false);
            }}
            onAddNew={() => {
              setEditingLabel(null);
              setNewLabelName('');
              setNewLabelColor('#3b82f6');
              setIsAddingNewLabel(true);
            }}
            onEditLabel={(label) => {
              setEditingLabel(label);
              setNewLabelName(label.name);
              setNewLabelColor(label.color);
              setIsAddingNewLabel(true);
            }}
            onDeleteLabel={deleteLabel}
            isEditMode={isLabelEditMode}
            setIsEditMode={setIsLabelEditMode}
          />
        )}

        {isAddingNewLabel && (
          <NewLabelModal 
            editingLabel={editingLabel}
            name={newLabelName}
            setName={setNewLabelName}
            color={newLabelColor}
            setColor={setNewLabelColor}
            onClose={() => setIsAddingNewLabel(false)}
            onSave={createLabel}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ContactListItem({ contact, isSelected, onClick }: { contact: Contact, isSelected: boolean, onClick: () => void, key?: any }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full p-4 flex items-center gap-4 transition-all hover:bg-slate-50 dark:hover:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800/50",
        isSelected && "bg-slate-100 dark:bg-slate-800"
      )}
    >
      <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700 flex-shrink-0 flex items-center justify-center font-bold text-lg text-slate-500 shadow-inner">
        {contact.avatar_url ? (
          <img src={contact.avatar_url} alt={contact.full_name} className="w-full h-full object-cover" />
        ) : (
          contact.full_name.charAt(0)
        )}
      </div>
      <div className="flex-1 text-left min-w-0">
        <div className="flex justify-between items-start mb-0.5">
          <h3 className="font-bold text-slate-800 dark:text-slate-100 truncate">{contact.full_name}</h3>
          <span className="text-[10px] text-slate-400 font-mono">
            {formatDistanceToNow(new Date(contact.last_contact_at), { addSuffix: true, locale: ptBR })}
          </span>
        </div>
        <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mb-1 flex items-center gap-1">
          <MapPin size={10} className="text-slate-400" /> {contact.address || 'Endereço não informado'}
        </p>
        <div className="flex flex-nowrap items-center gap-1 mt-2 overflow-x-auto no-scrollbar pb-1 -mx-0.5 px-1">
          {contact.labels && contact.labels.length > 0 ? (
            Array.from(new Map<string, LabelType>(contact.labels.map(l => [l.id, l])).values()).map(l => (
              <TagShape key={`list-tag-${l.id}`} color={l.color} size={18} className="flex-shrink-0" />
            ))
          ) : (
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest opacity-40 italic">Sem etiquetas</span>
          )}
        </div>
      </div>
    </button>
  );
}

function ContactDetailView({ contact, onClose, refreshContacts, onEdit }: { contact: Contact, onClose: () => void, refreshContacts: () => void, onEdit: (c: Contact) => void, key?: any }) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [newNote, setNewNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showLabelManager, setShowLabelManager] = useState(false);
  const [showContactMenu, setShowContactMenu] = useState(false);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState(contact.notes || '');
  const [allLabels, setAllLabels] = useState<LabelType[]>([]);
  
  // History editing states
  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null);
  const [historyEditDraft, setHistoryEditDraft] = useState('');

  useEffect(() => {
    fetchHistory();
    fetchAllLabels();
    setNotesDraft(contact.notes || '');
  }, [contact.id, contact.notes]);

  const fetchAllLabels = async () => {
    const { data } = await supabase.from('labels').select('*');
    if (data) setAllLabels(data);
  };

  const saveNotes = async () => {
    const { error } = await supabase
      .from('contacts')
      .update({ notes: notesDraft })
      .eq('id', contact.id);
    
    if (!error) {
      setIsEditingNotes(false);
      refreshContacts();
    }
  };

  const fetchHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('service_history')
        .select('*')
        .eq('contact_id', contact.id)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Erro ao buscar histórico:', error);
      }

      if (data) {
        console.log('Histórico buscado para o contato:', contact.id, 'Itens:', data.length);
        if (data.length > 0) {
          console.log('Exemplo de ID de item de histórico (do DB):', data[0].id);
        }
        setHistory(data as HistoryItem[]);
      }
    } catch (err) {
      console.error('Erro ao buscar histórico (exceção):', err);
    }
  };

  const saveNote = async () => {
    if (!newNote.trim()) return;
    setIsSaving(true);
    const { error } = await supabase
      .from('service_history')
      .insert({
        contact_id: contact.id,
        description: newNote,
        type: 'note'
      });
    
    if (!error) {
      setNewNote('');
      fetchHistory();
      // Update last_contact_at
      await supabase
        .from('contacts')
        .update({ last_contact_at: new Date().toISOString() })
        .eq('id', contact.id);
      refreshContacts();
    }
    setIsSaving(false);
  };

  const toggleLabel = async (labelId: string, isAssigned: boolean) => {
    if (isAssigned) {
      await supabase.from('contact_labels').delete().match({ contact_id: contact.id, label_id: labelId });
    } else {
      await supabase.from('contact_labels').insert({ contact_id: contact.id, label_id: labelId });
    }
    refreshContacts();
  };

  const deleteHistoryItem = async (id: string) => {
    try {
      if (!id) {
        console.error('ID do item de histórico é inválido ou ausente.');
        alert('Erro: ID do item é inválido.');
        return;
      }

      const confirmed = window.confirm(
        'Tem certeza que deseja excluir esta nota do histórico?'
      );

      if (!confirmed) return;

      console.log('--- INICIANDO EXCLUSÃO DE HISTÓRICO ---');
      console.log('ID do item alvo:', id);
      console.log('Tipo do ID:', typeof id);
      console.log('Estado atual do history (local):', history);
      
      const existsInLocalState = history.find(h => h.id === id);
      console.log('Item existe no estado local?', !!existsInLocalState);
      if (existsInLocalState) {
        console.log('Dados do item no estado local:', existsInLocalState);
      }

      // Verificação final antes de tentar deletar
      const { data: beforeCheck } = await supabase
        .from('service_history')
        .select('*')
        .eq('id', id)
        .single();
      
      console.log('ID encontrado no banco antes do DELETE?', !!beforeCheck);

      const { data, error, status, statusText } = await supabase
        .from('service_history')
        .delete()
        .eq('id', id)
        .select('*');

      console.log('Supabase Delete Response:', { data, error, status, statusText });

      if (error) {
        console.error('Erro retornado pelo Supabase no DELETE:', error);

        alert(
          'Não foi possível excluir o item do histórico.\n\n' +
          error.message + 
          (error.hint ? '\n\nHint: ' + error.hint : '')
        );

        return;
      }

      if (!data || data.length === 0) {
        console.warn('Nenhum registro foi excluído pelo DELETE. Verificando RLS/Existência...');
        
        const { count } = await supabase
          .from('service_history')
          .select('*', { count: 'exact', head: true })
          .eq('id', id);
        
        if (count === 0) {
          console.log('O item já não existe no banco. Sincronizando estado local...');
          await fetchHistory();
        } else {
          alert('O registro ainda existe no banco, mas a exclusão falhou (provavelmente por permissões de RLS).');
        }
      } else {
        console.log('Item excluído com sucesso do banco de dados:', data[0]);
        await fetchHistory();
      }

      console.log('--- FIM DA OPERAÇÃO DE EXCLUSÃO ---');

    } catch (err) {
      console.error('Exceção no deleteHistoryItem:', err);
      alert('Erro inesperado: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const startEditingHistory = (item: HistoryItem) => {
    setEditingHistoryId(item.id);
    setHistoryEditDraft(item.description);
  };

  const saveHistoryEdit = async () => {
    if (!editingHistoryId || !historyEditDraft.trim()) return;
    const { error } = await supabase
      .from('service_history')
      .update({ description: historyEditDraft })
      .eq('id', editingHistoryId);
    
    if (!error) {
      setEditingHistoryId(null);
      fetchHistory();
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1 flex flex-col h-full bg-white dark:bg-slate-900"
    >
      {/* Contact Header */}
      <header className="p-4 bg-white dark:bg-[#111b21] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between z-10 shadow-sm transition-colors">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="md:hidden p-2 text-slate-500 hover:text-wa-green transition-colors"><X size={24}/></button>
          <div className="w-12 h-12 rounded-full overflow-hidden bg-wa-green flex items-center justify-center text-white font-bold text-xl shadow-inner cursor-pointer hover:scale-105 transition-transform">
            {contact.avatar_url ? (
              <img src={contact.avatar_url} alt={contact.full_name} className="w-full h-full object-cover" />
            ) : (
              contact.full_name.charAt(0)
            )}
          </div>
          <div>
            <h2 className="font-bold text-lg text-slate-900 dark:text-white">{contact.full_name}</h2>
            <p className="text-xs text-wa-green font-medium flex items-center gap-1">
              <MapPin size={10} /> {contact.neighborhood?.name || 'Local não definido'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a href={`https://wa.me/${contact.phone}`} target="_blank" rel="noopener noreferrer" className="p-2.5 rounded-full hover:bg-wa-green/10 text-wa-green transition-all" title="WhatsApp">
            <Phone size={20} />
          </a>
          <a href={`https://instagram.com/${contact.instagram}`} target="_blank" rel="noopener noreferrer" className="p-2.5 rounded-full hover:bg-pink-500/10 text-pink-500 transition-all" title="Instagram">
            <Instagram size={20} />
          </a>
          <div className="relative">
            <button 
              onClick={() => setShowLabelManager(!showLabelManager)}
              className={cn(
                "p-2.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-all",
                showLabelManager && "bg-wa-green/10 text-wa-green"
              )}
              title="Adicionar Etiqueta"
            >
              <TagIcon size={20} />
            </button>
            <AnimatePresence>
              {showLabelManager && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-700 z-50 p-4"
                >
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="text-xs font-bold uppercase text-slate-400">Etiquetas</h4>
                    <button onClick={() => setShowLabelManager(false)}><X size={14}/></button>
                  </div>
                        <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                    {allLabels.length > 0 ? (
                      Array.from(new Map<string, LabelType>(allLabels.map(l => [l.id, l])).values()).map(label => {
                        const isAssigned = contact.labels?.some(l => l.id === label.id);
                        return (
                          <button 
                            key={`selector-item-${label.id}`}
                            onClick={() => toggleLabel(label.id, !!isAssigned)}
                            className={cn(
                              "w-full flex items-center justify-between p-2.5 rounded-lg text-sm transition-colors",
                              isAssigned ? "bg-wa-green/10 text-wa-green font-medium" : "hover:bg-slate-50 dark:hover:bg-slate-700/50"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <TagShape color={label.color} size={20} />
                              <span>{label.name}</span>
                            </div>
                            {isAssigned && <CheckCircle2 size={14} />}
                          </button>
                        );
                      })
                    ) : (
                      <p className="text-center py-4 text-xs text-slate-400">Cadastre etiquetas no menu lateral</p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          <div className="relative">
            <button 
              onClick={() => setShowContactMenu(!showContactMenu)}
              className={cn(
                "p-2.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-all",
                showContactMenu && "bg-slate-200 dark:bg-slate-800"
              )}
            >
              <MoreVertical size={20} />
            </button>

            <AnimatePresence>
              {showContactMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowContactMenu(false)} />
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-100 dark:border-slate-700 z-50 overflow-hidden"
                  >
                    <button 
                      onClick={() => { onEdit(contact); setShowContactMenu(false); }}
                      className="w-full p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center gap-3 transition-colors border-b border-slate-50 dark:border-slate-700"
                    >
                      <Plus size={18} className="text-blue-500" />
                      <span className="text-sm font-medium">Editar Contato</span>
                    </button>
                    <button 
                      onClick={() => { 
                        setNotesDraft(contact.notes || '');
                        setIsEditingNotes(true); 
                        setShowContactMenu(false); 
                      }}
                      className="w-full p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center gap-3 transition-colors border-b border-slate-50 dark:border-slate-700"
                    >
                      <Pencil size={18} className="text-slate-400" />
                      <span className="text-sm font-medium">Bloco de Notas</span>
                    </button>
                    <button
                      className="w-full p-4 text-left hover:bg-red-50 dark:hover:bg-red-900/10 flex items-center gap-3 transition-colors text-red-500"
                      onClick={async () => {
                        try {
                          const contactId = contact.id;

                          const confirmed = window.confirm(
                            'CONFIRMAR EXCLUSÃO:\n\nEsta ação excluirá permanentemente o contato e todos os dados vinculados.'
                          );

                          if (!confirmed) return;

                          console.log('Excluindo contato:', contactId);

                          const { error } = await supabase
                            .from('contacts')
                            .delete()
                            .eq('id', contactId);

                          if (error) {
                            console.error('Erro ao excluir contato:', error);

                            alert(
                              'Não foi possível excluir o contato.\n\n' +
                              error.message
                            );

                            return;
                          }

                          console.log('Contato excluído com sucesso.');

                          refreshContacts();
                          onClose();

                        } catch (err) {
                          console.error('Erro inesperado:', err);

                          alert(
                            'Erro inesperado ao excluir contato.\nVerifique o console.'
                          );
                        }
                      }}
                    >
                      <X size={18} />
                      <span className="text-sm font-medium">
                        Excluir Contato
                      </span>
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* Notes Modal */}
      <AnimatePresence>
        {isEditingNotes && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white dark:bg-slate-800 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden"
            >
              <header className="p-6 bg-slate-50 dark:bg-slate-900 flex justify-between items-center border-b border-slate-100 dark:border-slate-800">
                <h2 className="font-bold text-lg flex items-center gap-2 text-slate-600 dark:text-slate-300">
                  <History size={20} /> Bloco de Notas: {contact.full_name}
                </h2>
                <button onClick={() => setIsEditingNotes(false)}><X size={24}/></button>
              </header>
              <div className="p-6">
                <textarea 
                  className="w-full h-64 p-4 rounded-2xl bg-slate-100 dark:bg-slate-900 border-none outline-none focus:ring-2 focus:ring-wa-green transition-all resize-none font-medium text-slate-700 dark:text-slate-100"
                  placeholder="Escreva algo importante sobre este contato..."
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                />
                <button 
                  onClick={saveNotes}
                  className="w-full mt-6 py-4 bg-wa-green hover:bg-wa-teal text-white rounded-2xl font-bold shadow-lg transition-all active:scale-[0.98]"
                >
                  SALVAR ALTERAÇÕES
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Contact Body - Scrollable */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 bg-[#fdfdfd] dark:bg-[#0c141a]">
        {/* Info Grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <InfoCard label="Telefone" value={contact.phone} icon={<Phone size={14}/>} />
          <InfoCard label="Endereço" value={contact.address || 'Não informado'} icon={<MapPin size={14}/>} />
          <InfoCard label="Aniversário" value={contact.birth_date ? format(safeParseDate(contact.birth_date)!, 'dd/MM/yyyy') : 'Não informado'} icon={<Calendar size={14}/>} />
        </section>

        {/* Labels Section */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-sm text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <TagIcon size={14}/> Etiquetas
            </h3>
          </div>
          <div className="flex flex-wrap gap-4">
            {contact.labels && contact.labels.length > 0 ? (
              Array.from(new Map<string, LabelType>(contact.labels.map(l => [l.id, l])).values()).map(l => (
                <div key={`detail-tag-${l.id}`} className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                  <TagShape color={l.color} size={24} />
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">{l.name}</span>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400 italic font-medium">Nenhuma etiqueta atribuída</p>
            )}
          </div>
        </section>

        {/* History / Messages List */}
        <section className="space-y-4">
           <h3 className="font-bold text-sm text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-4">
            <History size={14}/> Histórico de Atendimento
          </h3>
          <div className="space-y-4">
            {history.length > 0 ? (
              Array.from(new Map<string, HistoryItem>(history.map(h => [h.id, h])).values()).map(item => (
                <HistoryCard 
                  key={`history-item-${item.id}`} 
                  item={item} 
                  isEditing={editingHistoryId === item.id}
                  editDraft={historyEditDraft}
                  onEditDraftChange={setHistoryEditDraft}
                  onEdit={() => startEditingHistory(item)}
                  onDelete={() => deleteHistoryItem(item.id)}
                  onSaveEdit={saveHistoryEdit}
                  onCancelEdit={() => setEditingHistoryId(null)}
                />
              ))
            ) : (
              <div className="text-center py-12 text-slate-400 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                <Clock size={32} className="mx-auto mb-2 opacity-20" />
                <p>Nenhum registro ainda</p>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Input Footer */}
      <footer className="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center gap-4">
        <button className="p-2 text-slate-400 hover:text-wa-green transition-colors">
          <Plus size={24} />
        </button>
        <div className="flex-1 bg-white dark:bg-slate-800 rounded-xl px-4 py-3 flex items-center gap-3 shadow-inner border border-slate-200 dark:border-slate-700">
          <input 
            type="text" 
            placeholder="Digite uma anotação sobre este contato..."
            className="flex-1 bg-transparent outline-none text-slate-700 dark:text-slate-100"
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveNote()}
          />
          <button 
            onClick={saveNote}
            disabled={!newNote.trim() || isSaving}
            className={cn(
              "text-wa-green p-1 transition-all disabled:opacity-30",
              newNote.trim() ? "scale-110" : "scale-100"
            )}
          >
            <Send size={20} />
          </button>
        </div>
      </footer>
    </motion.div>
  );
}

function InfoCard({ label, value, icon }: { label: string, value: string, icon?: React.ReactNode }) {
  return (
    <div className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-800/40 hover:shadow-md transition-shadow">
      <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 mb-1">
        {icon}
        <span className="text-[10px] uppercase tracking-widest font-bold">{label}</span>
      </div>
      <p className="font-bold text-slate-800 dark:text-slate-100">{value}</p>
    </div>
  );
}

function HistoryCard({ 
  item, 
  isEditing, 
  editDraft, 
  onEditDraftChange, 
  onEdit, 
  onDelete, 
  onSaveEdit, 
  onCancelEdit 
}: { 
  item: HistoryItem, 
  isEditing?: boolean,
  editDraft?: string,
  onEditDraftChange?: (val: string) => void,
  onEdit?: () => void,
  onDelete?: () => void,
  onSaveEdit?: () => void,
  onCancelEdit?: () => void,
  key?: any
}) {
  const isDemand = item.type === 'demand';
  const isService = item.type === 'service';

  return (
    <div className={cn(
      "group relative p-4 rounded-2xl border max-w-[90%] md:max-w-[85%] animate-in fade-in slide-in-from-bottom-2 transition-all hover:shadow-sm",
      isDemand ? "bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/30 self-start" :
      isService ? "bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800/30" :
      "bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700"
    )}>
      <div className="flex justify-between items-start gap-4 mb-2">
        <div className="flex items-center gap-2">
          <span className={cn(
            "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
            isDemand ? "bg-amber-200 text-amber-800" :
            isService ? "bg-green-200 text-green-800" :
            "bg-slate-200 text-slate-600"
          )}>
            {item.type}
          </span>
          {!isEditing && (
            <div className="flex items-center gap-1.5 transition-opacity">
              <button 
                onClick={(e) => { e.stopPropagation(); onEdit?.(); }}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-400 hover:text-wa-green transition-colors"
                title="Editar"
              >
                <Pencil size={14} />
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
                className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-slate-400 hover:text-red-500 transition-colors"
                title="Excluir"
              >
                <X size={14} />
              </button>
            </div>
          )}
        </div>
        <span className="text-[10px] text-slate-400 font-mono">
          {format(new Date(item.created_at), "HH:mm ' - ' dd/MM", { locale: ptBR })}
        </span>
      </div>

      {isEditing ? (
        <div className="space-y-3">
          <textarea 
            autoFocus
            className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm outline-none focus:ring-2 focus:ring-wa-green resize-none"
            rows={3}
            value={editDraft}
            onChange={(e) => onEditDraftChange?.(e.target.value)}
          />
          <div className="flex gap-2 justify-end">
            <button 
              onClick={onCancelEdit}
              className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
            >
              Cancelar
            </button>
            <button 
              onClick={onSaveEdit}
              className="px-4 py-1.5 bg-wa-green text-white text-xs font-bold rounded-lg hover:bg-wa-teal transition-colors shadow-sm"
            >
              Salvar
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200">{item.description}</p>
      )}

      {item.status && !isEditing && (
        <div className="mt-3 flex items-center gap-2 text-xs font-bold">
          {item.status === 'resolved' ? (
            <span className="text-green-600 flex items-center gap-1"><CheckCircle2 size={12}/> Resolvido</span>
          ) : (
            <span className="text-amber-600 flex items-center gap-1"><AlertCircle size={12}/> Pendente</span>
          )}
        </div>
      )}
    </div>
  );
}

function ContactModal({ onClose, onSuccess, initialData }: { onClose: () => void, onSuccess: () => void, initialData?: Contact }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    full_name: initialData?.full_name || '',
    phone: initialData?.phone || '',
    whatsapp: initialData?.whatsapp || '',
    instagram: initialData?.instagram || '',
    neighborhood_id: initialData?.neighborhood_id || '',
    address: initialData?.address || '',
    birth_date: initialData?.birth_date || '',
    avatar_url: initialData?.avatar_url || ''
  });
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);

  useEffect(() => {
    supabase.from('neighborhoods').select('*').then(({ data }) => {
      if (data) setNeighborhoods(data);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Solo incluir avatar_url si tiene valor para evitar errores antes de la migración SQL
    const submissionData: any = {
      ...formData,
      neighborhood_id: formData.neighborhood_id || null,
      birth_date: formData.birth_date || null,
      whatsapp: formData.whatsapp || formData.phone,
    };

    if (!formData.avatar_url) {
      delete submissionData.avatar_url;
    }

    const action = initialData 
      ? supabase.from('contacts').update(submissionData).eq('id', initialData.id)
      : supabase.from('contacts').insert([submissionData]);

    const { error } = await action;
    
    if (!error) {
      onSuccess();
    } else {
      console.error('Erro ao salvar contato:', error);
      alert('Erro ao salvar contato: ' + error.message);
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <header className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-wa-green text-white">
          <h2 className="text-xl font-bold">{initialData ? 'Editar Contato' : 'Cadastrar Novo Contato'}</h2>
          <button onClick={onClose} className="p-1 hover:rotate-90 transition-transform"><X size={24}/></button>
        </header>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">Nome Completo *</label>
              <input required className="w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-800 border-none outline-none focus:ring-2 focus:ring-wa-green transition-all" value={formData.full_name} onChange={e => setFormData({...formData, full_name: e.target.value})} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">Telefone / WhatsApp *</label>
              <input required className="w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-800 border-none outline-none focus:ring-2 focus:ring-wa-green transition-all" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">Instagram</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">@</span>
                <input className="w-full pl-8 pr-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 border-none outline-none focus:ring-2 focus:ring-wa-green transition-all" value={formData.instagram} onChange={e => setFormData({...formData, instagram: e.target.value})} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">Bairro</label>
              <select className="w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-800 border-none outline-none focus:ring-2 focus:ring-wa-green transition-all" value={formData.neighborhood_id} onChange={e => setFormData({...formData, neighborhood_id: e.target.value})}>
                <option value="">Selecione um bairro</option>
                {neighborhoods.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase">Endereço</label>
            <input className="w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-800 border-none outline-none focus:ring-2 focus:ring-wa-green transition-all" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-slate-500 uppercase">Foto do Perfil (URL)</label>
              {formData.avatar_url && (
                <div className="w-6 h-6 rounded-full overflow-hidden border border-wa-green/30">
                  <img src={formData.avatar_url} className="w-full h-full object-cover" />
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <input 
                className="flex-1 p-3 rounded-xl bg-slate-100 dark:bg-slate-800 border-none outline-none focus:ring-2 focus:ring-wa-green transition-all" 
                placeholder="Cole o link da foto aqui..." 
                value={formData.avatar_url} 
                onChange={e => setFormData({...formData, avatar_url: e.target.value})} 
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">Data de Nascimento</label>
              <input type="date" className="w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-800 border-none outline-none focus:ring-2 focus:ring-wa-green transition-all" value={formData.birth_date} onChange={e => setFormData({...formData, birth_date: e.target.value})} />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-4 bg-wa-green hover:bg-wa-teal text-white rounded-2xl font-bold shadow-lg transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? 'Salvando...' : initialData ? 'Atualizar Contato' : 'Salvar Contato'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

// --- New Components for Labels Management ---

function TagShape({ color, className, size = 18 }: { color: string, className?: string, size?: number, key?: any }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      className={className} 
      xmlns="http://www.w3.org/2000/svg"
    >
      <path 
        d="M4 6C4 4.89543 4.89543 4 6 4H14.5858C15.1162 4 15.6249 4.21071 16 4.58579L20.4142 9C21.1953 9.78105 21.1953 11.0474 20.4142 11.8284L16 16.2426C15.6249 16.6177 15.1162 16.8284 14.5858 16.8284H6C4.89543 16.8284 4 15.933 4 14.8284V6Z" 
        fill={color} 
      />
    </svg>
  );
}

interface LabelsManagerModalProps {
  labels: LabelType[];
  contacts: Contact[];
  onClose: () => void;
  onAddNew: () => void;
  onEditLabel: (label: LabelType) => void;
  onDeleteLabel: (id: string) => void;
  isEditMode: boolean;
  setIsEditMode: (val: boolean) => void;
}

function LabelsManagerModal({ 
  labels, 
  contacts, 
  onClose, 
  onAddNew, 
  onEditLabel, 
  onDeleteLabel,
  isEditMode,
  setIsEditMode
}: LabelsManagerModalProps) {
  const getContactCount = (labelId: string) => {
    return contacts.filter(c => c.labels?.some(l => l.id === labelId)).length;
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="bg-[#1c2c33] w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col h-[600px] border border-white/5"
      >
        <header className="p-6 flex items-center justify-between text-[#d1d7db]">
          <div className="flex items-center gap-4">
            <button onClick={onClose} className="p-1 hover:bg-white/5 rounded-full transition-colors rotate-45">
              <Plus size={24} />
            </button>
            <span className="text-xl font-medium">Etiquetas</span>
          </div>
          <button 
            onClick={() => setIsEditMode(!isEditMode)}
            className="text-[#00a884] font-medium hover:opacity-80 transition-opacity"
          >
            {isEditMode ? 'Pronto' : 'Editar'}
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-2">
          <div className="bg-[#111b21] rounded-2xl overflow-hidden border border-white/5">
            {labels.length > 0 ? (
              Array.from(new Map<string, LabelType>(labels.map(l => [l.id, l])).values()).map((label, idx, arr) => (
                <div 
                  key={`manager-row-${label.id}`}
                  className={cn(
                    "group flex items-center justify-between p-4 transition-colors hover:bg-white/5",
                    idx !== arr.length - 1 && "border-b border-white/5"
                  )}
                >
                  <div className="flex items-center gap-4 flex-1">
                    {isEditMode && (
                      <button 
                        onClick={() => onDeleteLabel(label.id)}
                        className="text-red-500 p-1 hover:bg-red-500/10 rounded-full transition-colors"
                      >
                        <X size={18} />
                      </button>
                    )}
                    <TagShape color={label.color} size={28} />
                    <span className="text-[#e9edef] text-lg font-medium">{label.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[#8696a0] text-sm font-medium">{getContactCount(label.id)}</span>
                    <button 
                      onClick={() => onEditLabel(label)}
                      className="text-[#8696a0] p-1 rounded-full hover:bg-white/5 transition-colors"
                    >
                      <Pencil size={18} className="rotate-0" />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-12 text-center text-[#8696a0]">
                Nenhuma etiqueta cadastrada
              </div>
            )}
          </div>

          <button 
            onClick={onAddNew}
            className="mt-6 flex items-center gap-4 text-[#00a884] font-medium p-2 hover:bg-white/5 rounded-xl transition-colors w-full"
          >
            <Plus size={24} />
            <span className="text-lg">Nova etiqueta</span>
          </button>
        </div>

        <footer className="p-8 text-center bg-[#1c2c33]">
          <p className="text-[#8696a0] text-sm leading-relaxed max-w-[280px] mx-auto">
            Use etiquetas para organizar seus clientes e conversas. <span className="text-[#00a884] cursor-pointer hover:underline">Saiba mais</span>
          </p>
        </footer>
      </motion.div>
    </div>
  );
}

interface NewLabelModalProps {
  editingLabel: LabelType | null;
  name: string;
  setName: (val: string) => void;
  color: string;
  setColor: (val: string) => void;
  onClose: () => void;
  onSave: () => void;
}

function NewLabelModal({ 
  editingLabel, 
  name, 
  setName, 
  color, 
  setColor, 
  onClose, 
  onSave 
}: NewLabelModalProps) {
  const COLORS = [
    '#3b82f6', '#22c55e', '#eab308', '#f97316', '#ef4444', 
    '#a855f7', '#334155', '#14b8a6', '#9a3412', '#64748b'
  ];

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        className="bg-[#2a3942] w-full max-w-sm rounded-[2.5rem] shadow-2xl border border-white/10 overflow-hidden"
      >
        <header className="px-6 py-4 flex items-center justify-between border-b border-white/10 overflow-hidden">
          <button onClick={onClose} className="p-1 hover:bg-white/5 rounded-full transition-colors text-[#d1d7db]">
            <X size={24} />
          </button>
          <span className="text-[#e9edef] font-bold text-lg">{editingLabel ? 'Editar Etiqueta' : 'Nova Etiqueta'}</span>
          <button 
            onClick={onSave}
            disabled={!name.trim()}
            className="px-6 py-1.5 bg-[#8696a0] text-[#111b21] rounded-full font-bold text-sm hover:bg-[#d1d7db] transition-colors disabled:opacity-50"
          >
            Salvar
          </button>
        </header>

        <div className="p-8 space-y-8">
          <div className="space-y-3">
            <label className="text-[10px] font-bold text-[#8696a0] uppercase tracking-wider">NOME DA ETIQUETA</label>
            <div className="bg-[#1c2c33] rounded-2xl p-4 border border-transparent focus-within:border-[#00a884] transition-colors shadow-inner">
              <input 
                autoFocus
                type="text" 
                placeholder="Ex: Urgente, Contato Novo..."
                className="w-full bg-transparent outline-none text-[#e9edef] text-lg"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onSave()}
              />
            </div>
          </div>

          <div className="space-y-4">
            <label className="text-[10px] font-bold text-[#8696a0] uppercase tracking-wider">ESCOLHA UMA COR</label>
            <div className="grid grid-cols-5 gap-y-6 gap-x-4">
              {COLORS.map(c => (
                <button 
                  key={c}
                  onClick={() => setColor(c)}
                  className={cn(
                    "relative flex items-center justify-center p-2 rounded-2xl transition-all",
                    color === c ? "bg-[#1c2c33] ring-2 ring-[#00a884]" : "hover:scale-110"
                  )}
                >
                  <TagShape color={c} size={36} />
                  {color === c && (
                    <div className="absolute top-2 right-2 w-4 h-4 bg-[#00a884] rounded-full flex items-center justify-center border-2 border-[#1c2c33] shadow-sm">
                      <CheckCircle2 size={10} className="text-[#1c2c33] stroke-[3px]" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// Simple Dashboard placeholder
function CampaignsView() {
  return (
    <div className="flex-1 p-8 space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold">Campanhas</h2>
          <p className="text-slate-500">Envio de mensagens segmentadas para a comunidade.</p>
        </div>
        <button className="px-6 py-2 bg-wa-green text-white rounded-lg font-bold shadow-md hover:bg-wa-teal transition-all">
          Criar Nova Campanha
        </button>
      </header>
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-8 text-center text-slate-400 space-y-4">
        <Send size={48} className="mx-auto opacity-20" />
        <p>Ainda não há campanhas registradas.</p>
      </div>
    </div>
  );
}

function Dashboard({ contacts }: { contacts: Contact[], key?: any }) {
  const neighborhoodData = Array.from(new Set(contacts.map(c => c.neighborhood?.name || 'Sem Bairro'))).map(name => ({
    name,
    total: contacts.filter(c => (c.neighborhood?.name || 'Sem Bairro') === name).length
  }));

  const labelData = [
    { name: 'Apoiador', value: 40, color: '#25d366' },
    { name: 'Liderança', value: 15, color: '#128c7e' },
    { name: 'Pendente', value: 25, color: '#f3da35' },
    { name: 'Prioridade', value: 20, color: '#ea4335' },
  ];

  const stats = [
    { label: 'Total de Contatos', value: contacts.length, icon: <Users className="text-blue-500" /> },
    { label: 'Demandas Pendentes', value: 12, icon: <AlertCircle className="text-amber-500" /> },
    { label: 'Resolvidas este Mês', value: 45, icon: <CheckCircle2 className="text-wa-green" /> },
    { label: 'Aniversariantes (Mês)', value: 8, icon: <Calendar className="text-pink-500" /> },
  ];

  return (
    <div className="flex-1 p-8 overflow-y-auto space-y-8 bg-[#f0f2f5] dark:bg-[#0b141a]">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold bg-gradient-to-r from-wa-green to-blue-500 bg-clip-text text-transparent">Visão Estratégica</h2>
          <p className="text-slate-500">Indicadores de engajamento e atendimento comunitário.</p>
        </div>
        <button className="px-4 py-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm font-bold flex items-center gap-2 border border-slate-100 dark:border-slate-700">
          <Calendar size={18} /> Hoje: {format(new Date(), 'dd/MM/yyyy')}
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map(s => (
          <div key={s.label} className="p-6 bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 space-y-4">
            <div className="flex justify-between items-start">
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800">
                {s.icon}
              </div>
              <span className="p-1 px-2 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] font-bold">+12%</span>
            </div>
            <div>
              <p className="text-3xl font-black">{s.value}</p>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col min-h-[400px]">
          <h3 className="font-bold mb-6 text-slate-500 uppercase text-xs tracking-widest">Contatos por Bairro</h3>
          <div className="h-64 mt-auto">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={neighborhoodData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#88888820" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={12} tick={{ fill: '#888' }} />
                <YAxis axisLine={false} tickLine={false} fontSize={12} tick={{ fill: '#888' }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  cursor={{ fill: 'transparent' }}
                />
                <Bar dataKey="total" fill="#25d366" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col min-h-[400px]">
          <h3 className="font-bold mb-6 text-slate-500 uppercase text-xs tracking-widest">Segmentação por Etiquetas</h3>
          <div className="h-64 mt-auto flex flex-col md:flex-row items-center justify-between gap-6">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={labelData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {labelData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col justify-center gap-3 pr-8 min-w-[150px]">
              {labelData.map((l, idx) => (
                <div key={`label-stat-${l.name}-${idx}`} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: l.color }} />
                  <span className="text-xs font-bold text-slate-500">{l.name}: {l.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
