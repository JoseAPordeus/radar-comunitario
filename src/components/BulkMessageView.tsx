import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Contact, Label, Neighborhood, MessageTemplate } from '../types';
import { 
  Users, 
  Search, 
  Filter, 
  CheckCircle2, 
  X, 
  Send, 
  ChevronRight, 
  LayoutDashboard,
  MessageSquare,
  AlertCircle,
  Tag as TagIcon,
  MapPin,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function BulkMessageView() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [allLabels, setAllLabels] = useState<Label[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Selection & Filters
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterNeighborhood, setFilterNeighborhood] = useState<string>('all');
  const [filterLabels, setFilterLabels] = useState<string[]>([]);
  
  // Message Sending
  const [step, setStep] = useState<'selection' | 'message' | 'sending'>('selection');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [customMessage, setCustomMessage] = useState('');
  const [sendingProgress, setSendingProgress] = useState(0);
  const [sendingStatus, setSendingStatus] = useState<string>('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data: cData } = await supabase.from('contacts').select('*, neighborhood:neighborhood_id(*), labels:labels(*)');
    const { data: nData } = await supabase.from('neighborhoods').select('*');
    const { data: lData } = await supabase.from('labels').select('*');
    const { data: tData } = await supabase.from('message_templates').select('*').eq('is_active', true);
    
    if (cData) setContacts(cData);
    if (nData) setNeighborhoods(nData);
    if (lData) setAllLabels(lData);
    if (tData) setTemplates(tData);
    setLoading(false);
  };

  const filteredContacts = contacts.filter(c => {
    const matchesSearch = c.full_name.toLowerCase().includes(searchQuery.toLowerCase()) || c.phone.includes(searchQuery);
    const matchesNeighborhood = filterNeighborhood === 'all' || c.neighborhood_id === filterNeighborhood;
    const matchesLabels = filterLabels.length === 0 || c.labels?.some(l => filterLabels.includes(l.id));
    return matchesSearch && matchesNeighborhood && matchesLabels;
  });

  const toggleSelectAll = () => {
    if (selectedContactIds.size === filteredContacts.length) {
      setSelectedContactIds(new Set());
    } else {
      setSelectedContactIds(new Set(filteredContacts.map(c => c.id)));
    }
  };

  const toggleContact = (id: string) => {
    const newSelection = new Set(selectedContactIds);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedContactIds(newSelection);
  };

  const replaceVariables = (text: string, contact: Contact) => {
    return text
      .replace(/{nome}/g, contact.full_name)
      .replace(/{bairro}/g, contact.neighborhood?.name || contact.address || 'Seu bairro')
      .replace(/{telefone}/g, contact.phone);
  };

  const startSending = async () => {
    const total = selectedContactIds.size;
    if (total === 0) return;
    
    let messageText = customMessage;
    const template = templates.find(t => t.id === selectedTemplateId);
    if (template) messageText = template.content;

    if (!messageText.trim()) {
      alert('Escreva uma mensagem ou selecione um modelo.');
      return;
    }

    setStep('sending');
    setSendingProgress(0);
    setSendingStatus('Iniciando disparos...');

    const selectedContacts = contacts.filter(c => selectedContactIds.has(c.id));
    
    for (let i = 0; i < selectedContacts.length; i++) {
       const contact = selectedContacts[i];
       const finalMessage = replaceVariables(messageText, contact);
       
       setSendingStatus(`Enviando para ${contact.full_name}...`);
       
       try {
         // Mocking sending
         await new Promise(resolve => setTimeout(resolve, 800));
         
         // Log the message
         await supabase.from('message_logs').insert({
           contact_id: contact.id,
           template_id: template?.id,
           message_content: finalMessage,
           status: 'ENVIADO',
           type: 'CAMPANHA'
         });
         
       } catch (err) {
         console.error('Error sending message:', err);
       }
       
       setSendingProgress(Math.round(((i + 1) / total) * 100));
    }

    setSendingStatus('Envio concluído com sucesso!');
    setTimeout(() => {
      setStep('selection');
      setSelectedContactIds(new Set());
      setSendingProgress(0);
      setCustomMessage('');
      setSelectedTemplateId('');
    }, 3000);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-900 overflow-hidden">
      {/* Selection Step */}
      <AnimatePresence mode="wait">
        {step === 'selection' && (
          <motion.div 
            key="selection"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="flex-1 flex flex-col h-full overflow-hidden"
          >
            <header className="p-6 bg-white dark:bg-[#111b21] border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  <Users className="text-wa-green" /> Envio em Massa
                </h2>
                <p className="text-slate-500 text-sm">Selecione os contatos e envie mensagens personalizadas.</p>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right mr-2 hidden md:block">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Selecionados</p>
                  <p className="text-lg font-bold text-wa-green">{selectedContactIds.size} contatos</p>
                </div>
                <button 
                  onClick={() => selectedContactIds.size > 0 && setStep('message')}
                  disabled={selectedContactIds.size === 0}
                  className="px-6 py-3 bg-wa-green text-white rounded-xl font-bold shadow-lg flex items-center gap-2 hover:bg-wa-teal transition-all active:scale-95 disabled:opacity-50 disabled:grayscale"
                >
                  Prosseguir <ChevronRight size={18} />
                </button>
              </div>
            </header>

            <div className="p-4 bg-white dark:bg-[#111b21] border-b border-slate-100 dark:border-slate-800 flex flex-wrap gap-4 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text" 
                  placeholder="Pesquisar por nome ou telefone..."
                  className="w-full pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg outline-none border border-transparent focus:border-wa-green transition-all"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <select 
                className="px-3 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg outline-none border border-transparent focus:border-wa-green text-sm"
                value={filterNeighborhood}
                onChange={(e) => setFilterNeighborhood(e.target.value)}
              >
                <option value="all">Todos os Bairros</option>
                {neighborhoods.map(n => (
                  <option key={n.id} value={n.id}>{n.name}</option>
                ))}
              </select>

              <div className="flex gap-2 max-w-full overflow-x-auto no-scrollbar">
                <button 
                  onClick={() => {
                    setFilterLabels([]);
                    setFilterNeighborhood('all');
                    setSearchQuery('');
                  }}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all border shrink-0",
                    filterLabels.length === 0 && filterNeighborhood === 'all' && searchQuery === ''
                      ? "bg-wa-green/10 border-wa-green text-wa-green" 
                      : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 hover:border-slate-400"
                  )}
                >
                  Todas
                </button>
                {allLabels.map(l => (
                  <button 
                    key={l.id}
                    onClick={() => {
                      setFilterLabels(prev => 
                        prev.includes(l.id) ? prev.filter(id => id !== l.id) : [...prev, l.id]
                      );
                    }}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all border",
                      filterLabels.includes(l.id) 
                        ? "bg-wa-green/10 border-wa-green text-wa-green" 
                        : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400"
                    )}
                  >
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: l.color }} />
                    {l.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-900 px-6 py-2 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <span className="text-xs font-bold text-slate-400 uppercase">{filteredContacts.length} contatos filtrados</span>
              <button 
                onClick={toggleSelectAll}
                className="text-xs font-bold text-wa-green hover:underline flex items-center gap-1"
              >
                {selectedContactIds.size === filteredContacts.length ? <><X size={14} /> Desmarcar Todos</> : <><Check size={14} /> Selecionar Todos</>}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredContacts.map(contact => {
                  const isSelected = selectedContactIds.has(contact.id);
                  return (
                    <button 
                      key={contact.id}
                      onClick={() => toggleContact(contact.id)}
                      className={cn(
                        "p-4 rounded-xl border text-left transition-all flex items-center gap-4 group",
                        isSelected 
                          ? "bg-wa-green/5 border-wa-green ring-1 ring-wa-green/20" 
                          : "bg-white dark:bg-[#111b21] border-slate-100 dark:border-slate-800 hover:border-wa-green/30"
                      )}
                    >
                      <div className={cn(
                        "w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-lg shadow-inner",
                        isSelected ? "bg-wa-green text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-400"
                      )}>
                        {isSelected ? <CheckCircle2 size={24} /> : contact.full_name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-sm truncate">{contact.full_name}</h4>
                        <div className="flex items-center gap-2 mt-0.5">
                           <p className="text-[10px] text-slate-400 font-medium">{contact.phone}</p>
                           {contact.neighborhood?.name && (
                             <span className="text-[9px] px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded font-bold text-slate-400">
                               {contact.neighborhood.name}
                             </span>
                           )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              
              {filteredContacts.length === 0 && (
                <div className="text-center py-20 text-slate-400">
                  <Search size={48} className="mx-auto mb-4 opacity-20" />
                  <p>Nenhum contato corresponde aos filtros.</p>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {step === 'message' && (
          <motion.div 
            key="message"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-900"
          >
            <header className="p-6 bg-white dark:bg-[#111b21] border-b border-slate-200 dark:border-slate-800 flex items-center gap-4">
              <button 
                onClick={() => setStep('selection')}
                className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={24} />
              </button>
              <div>
                <h2 className="text-2xl font-bold">Compor Mensagem</h2>
                <p className="text-slate-500 text-sm">Destinatários: {selectedContactIds.size} contatos selecionados</p>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 md:p-8">
              <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Templates Selection */}
                <div className="space-y-6">
                   <div className="flex items-center gap-2 mb-2">
                     <LayoutDashboard className="text-wa-green" size={20} />
                     <h3 className="font-bold uppercase text-xs text-slate-400 tracking-wider">Modelos Disponíveis</h3>
                   </div>
                   
                   <div className="grid grid-cols-1 gap-3">
                     <button 
                       onClick={() => { setSelectedTemplateId(''); setCustomMessage(''); }}
                       className={cn(
                         "p-4 rounded-2xl border text-left transition-all",
                         selectedTemplateId === '' ? "bg-wa-green/10 border-wa-green shadow-sm" : "bg-white dark:bg-[#111b21] border-slate-100 dark:border-slate-800 hover:bg-slate-50"
                       )}
                     >
                       <div className="flex justify-between items-center mb-1">
                         <h4 className="font-bold text-sm">Mensagem Manual</h4>
                         {selectedTemplateId === '' && <CheckCircle2 size={16} className="text-wa-green" />}
                       </div>
                       <p className="text-xs text-slate-500">Escreva uma mensagem personalizada do zero.</p>
                     </button>

                     {templates.map(t => (
                       <button 
                         key={t.id}
                         onClick={() => { setSelectedTemplateId(t.id); setCustomMessage(t.content); }}
                         className={cn(
                           "p-4 rounded-2xl border text-left transition-all",
                           selectedTemplateId === t.id ? "bg-wa-green/10 border-wa-green shadow-sm" : "bg-white dark:bg-[#111b21] border-slate-100 dark:border-slate-800 hover:bg-slate-50"
                         )}
                       >
                         <div className="flex justify-between items-center mb-1">
                           <h4 className="font-bold text-sm truncate pr-4">{t.title}</h4>
                           {selectedTemplateId === t.id && <CheckCircle2 size={16} className="text-wa-green" />}
                         </div>
                         <p className="text-xs text-slate-400 line-clamp-2 italic">"{t.content}"</p>
                       </button>
                     ))}
                   </div>
                </div>

                {/* Editor & Preview */}
                <div className="space-y-6">
                   <div className="flex items-center gap-2 mb-2">
                     <MessageSquare className="text-wa-green" size={20} />
                     <h3 className="font-bold uppercase text-xs text-slate-400 tracking-wider">Editor de Mensagem</h3>
                   </div>

                   <div className="space-y-4">
                     <textarea 
                       className="w-full h-64 p-6 bg-white dark:bg-slate-800 rounded-3xl outline-none shadow-xl border border-transparent focus:border-wa-green transition-all font-medium text-slate-700 dark:text-slate-100 resize-none"
                       placeholder="Escreva sua mensagem aqui..."
                       value={customMessage}
                       onChange={(e) => setCustomMessage(e.target.value)}
                     />
                     
                     <div className="flex flex-wrap gap-2">
                        {['{nome}', '{bairro}', '{telefone}'].map(v => (
                          <button 
                            key={v}
                            onClick={() => setCustomMessage(prev => prev + v)}
                            className="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-[10px] font-mono text-slate-500 hover:bg-wa-green/20 hover:text-wa-green transition-colors"
                          >
                            {v}
                          </button>
                        ))}
                     </div>
                   </div>

                   <div className="bg-amber-50 dark:bg-amber-900/10 p-5 rounded-2xl border border-amber-100 dark:border-amber-900/30">
                     <div className="flex items-center gap-2 mb-2 text-amber-600">
                        <AlertCircle size={18} />
                        <h4 className="font-bold text-xs uppercase tracking-wider">Atenção ao Envio</h4>
                     </div>
                     <p className="text-xs text-amber-700 dark:text-amber-500/80 leading-relaxed font-medium">
                       O envio em massa pode ser detectado pelo WhatsApp. Recomendamos enviar em pequenos grupos e manter intervalos entre cada mensagem.
                     </p>
                   </div>
                </div>
              </div>
            </div>

            <footer className="p-6 bg-white dark:bg-[#111b21] border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button 
                onClick={startSending}
                disabled={!customMessage.trim()}
                className="px-10 py-4 bg-wa-green hover:bg-wa-teal text-white rounded-2xl font-bold shadow-xl transition-all active:scale-[0.98] flex items-center gap-3 disabled:opacity-50"
              >
                Inicar Envio <Send size={20} />
              </button>
            </footer>
          </motion.div>
        )}

        {step === 'sending' && (
          <motion.div 
            key="sending"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex-1 flex flex-col items-center justify-center p-8 bg-white dark:bg-slate-900"
          >
            <div className="w-full max-w-md space-y-8 text-center">
              <div className="relative w-48 h-48 mx-auto">
                {/* Circular Progress */}
                <svg className="w-full h-full" viewBox="0 0 100 100">
                  <circle 
                    className="text-slate-100 dark:text-slate-800 stroke-current" 
                    strokeWidth="8" 
                    cx="50" cy="50" r="40" 
                    fill="transparent" 
                  />
                  <circle 
                    className="text-wa-green stroke-current transition-all duration-500" 
                    strokeWidth="8" 
                    strokeLinecap="round" 
                    cx="50" cy="50" r="40" 
                    fill="transparent" 
                    strokeDasharray={251.2} 
                    strokeDashoffset={251.2 - (251.2 * sendingProgress) / 100} 
                    transform="rotate(-90 50 50)"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-4xl font-black text-wa-green">{sendingProgress}%</span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Concluído</span>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{sendingStatus}</h3>
                <p className="text-slate-500 font-medium">Não feche esta tela enquanto o processo está ativo.</p>
              </div>

              <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                <div className="w-2 h-2 rounded-full bg-wa-green animate-ping" />
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Aguardando resposta do servidor...</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
