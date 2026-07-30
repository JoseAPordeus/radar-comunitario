import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { MessageTemplate } from '../types';
import { Plus, Pencil, Trash2, Tag, Check, X, Search, AlertCircle, Info, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function TemplatesView() {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [currentTemplate, setCurrentTemplate] = useState<Partial<MessageTemplate> | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('message_templates')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (data) setTemplates(data);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!currentTemplate?.title || !currentTemplate?.content) {
      alert('Preencha o título e o conteúdo da mensagem.');
      return;
    }

    const payload = {
      title: currentTemplate.title,
      content: currentTemplate.content,
      type: currentTemplate.type || 'CAMPANHA',
      is_active: currentTemplate.is_active ?? true
    };

    let error;
    if (currentTemplate.id) {
      const { error: err } = await supabase
        .from('message_templates')
        .update(payload)
        .eq('id', currentTemplate.id);
      error = err;
    } else {
      const { error: err } = await supabase
        .from('message_templates')
        .insert(payload);
      error = err;
    }

    if (!error) {
      setIsEditing(false);
      setCurrentTemplate(null);
      fetchTemplates();
    } else {
      alert('Erro ao salvar template: ' + error.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Deseja realmente excluir este template?')) {
      const { error } = await supabase
        .from('message_templates')
        .delete()
        .eq('id', id);
      
      if (!error) fetchTemplates();
    }
  };

  const filteredTemplates = templates.filter(t => 
    t.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    t.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const [automationSettings, setAutomationSettings] = useState({ enabled: false, template_id: '' });

  useEffect(() => {
    fetchAutomationSettings();
  }, []);

  const fetchAutomationSettings = async () => {
    const { data } = await supabase
      .from('automation_settings')
      .select('value')
      .eq('key', 'birthday_automation')
      .single();
    
    if (data) {
      setAutomationSettings(data.value);
    }
  };

  const saveAutomationSettings = async (newSettings: typeof automationSettings) => {
    const { error } = await supabase
      .from('automation_settings')
      .update({ value: newSettings })
      .eq('key', 'birthday_automation');
    
    if (!error) {
      setAutomationSettings(newSettings);
    } else {
      alert('Erro ao salvar configurações de automação.');
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <header className="p-6 bg-white dark:bg-[#111b21] border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Tag className="text-wa-green" /> Mensagens Padrão
          </h2>
          <p className="text-slate-500 text-sm">Gerencie modelos de mensagens para aniversários e campanhas.</p>
        </div>

        <button 
          onClick={() => {
            setCurrentTemplate({ type: 'ANIVERSARIO', is_active: true });
            setIsEditing(true);
          }}
          className="px-4 py-2 bg-wa-green text-white rounded-lg font-bold shadow-lg flex items-center gap-2 hover:bg-wa-teal transition-all active:scale-95"
        >
          <Plus size={18} /> Novo Modelo
        </button>
      </header>

      <div className="p-6 overflow-y-auto flex-1 space-y-6">
        {/* Automation Settings Card */}
        <section className="bg-gradient-to-br from-wa-green to-wa-teal p-6 rounded-3xl shadow-xl text-white">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-1">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <CheckCircle2 className="text-white" size={24} /> Automação de Aniversários
              </h3>
              <p className="text-white/80 text-sm">Envio automático de parabéns para os aniversariantes do dia.</p>
            </div>
            
            {/* Automation settings removed per user request */}
          </div>
        </section>

        <div className="flex items-center justify-between mb-2">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Pesquisar modelos..."
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 rounded-lg outline-none border border-slate-100 dark:border-slate-700 focus:ring-2 focus:ring-wa-green transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence>
            {filteredTemplates.map(template => (
              <motion.div 
                key={template.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-white dark:bg-[#111b21] rounded-2xl p-6 shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col group"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className={cn(
                    "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                    template.type === 'ANIVERSARIO' ? "bg-pink-100 text-pink-600" : "bg-blue-100 text-blue-600"
                  )}>
                    {template.type}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => {
                        setCurrentTemplate(template);
                        setIsEditing(true);
                      }}
                      className="p-2 text-slate-400 hover:text-wa-green transition-colors"
                    >
                      <Pencil size={18} />
                    </button>
                    <button 
                      onClick={() => handleDelete(template.id)}
                      className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                <h3 className="font-bold text-lg mb-2 truncate">{template.title}</h3>
                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl text-sm text-slate-600 dark:text-slate-400 italic mb-4 flex-1 line-clamp-4">
                  "{template.content}"
                </div>

                <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-50 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400 font-mono">
                    {new Date(template.created_at).toLocaleDateString()}
                  </span>
                  <div className={cn(
                    "flex items-center gap-1 text-xs font-bold",
                    template.is_active ? "text-wa-green" : "text-slate-300"
                  )}>
                    <Check size={14} /> {template.is_active ? 'ATIVO' : 'INATIVO'}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {filteredTemplates.length === 0 && !loading && (
          <div className="text-center py-20 text-slate-400">
            <Tag size={48} className="mx-auto mb-4 opacity-20" />
            <p>Nenhum modelo de mensagem encontrado.</p>
          </div>
        )}
      </div>

      {/* Editor Modal */}
      <AnimatePresence>
        {isEditing && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-slate-800 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <header className="p-6 bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
                <h3 className="text-xl font-bold">{currentTemplate?.id ? 'Editar Modelo' : 'Novo Modelo'}</h3>
                <button onClick={() => setIsEditing(false)} className="text-slate-400 hover:text-slate-600 transition-colors"><X size={24}/></button>
              </header>

              <div className="p-8 space-y-6 overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Título do Modelo</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 rounded-xl outline-none border border-transparent focus:border-wa-green"
                      placeholder="Ex: Aniversário Vips"
                      value={currentTemplate?.title || ''}
                      onChange={(e) => setCurrentTemplate({...currentTemplate, title: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tipo</label>
                    <div className="flex gap-2">
                      {['ANIVERSARIO', 'CAMPANHA'].map(type => (
                        <button 
                          key={type}
                          onClick={() => setCurrentTemplate({...currentTemplate, type: type as any})}
                          className={cn(
                            "flex-1 py-3 rounded-xl text-xs font-bold border transition-all",
                            currentTemplate?.type === type 
                              ? "bg-wa-green text-white border-wa-green" 
                              : "bg-transparent text-slate-400 border-slate-100 dark:border-slate-700 hover:border-slate-300"
                          )}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Conteúdo da Mensagem</label>
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-wa-green bg-wa-green/10 px-2 py-0.5 rounded-full cursor-help group relative">
                      <Info size={10} /> VARIÁVEIS SUPORTADAS
                      <div className="absolute bottom-full right-0 mb-2 w-48 bg-slate-800 text-white p-3 rounded-xl text-[10px] leading-relaxed shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                        Use <span className="text-pink-400 font-mono">&#123;nome&#125;</span>, <span className="text-pink-400 font-mono">&#123;bairro&#125;</span> ou <span className="text-pink-400 font-mono">&#123;telefone&#125;</span> no texto.
                      </div>
                    </div>
                  </div>
                  <textarea 
                    className="w-full h-40 px-4 py-4 bg-slate-50 dark:bg-slate-900 rounded-xl outline-none border border-transparent focus:border-wa-green resize-none font-medium"
                    placeholder="Olá {nome}, tudo bem? Hoje é seu grande dia..."
                    value={currentTemplate?.content || ''}
                    onChange={(e) => setCurrentTemplate({...currentTemplate, content: e.target.value})}
                  />
                  <div className="flex flex-wrap gap-2 mt-2">
                    {['{nome}', '{bairro}', '{telefone}'].map(variable => (
                      <button 
                        key={variable}
                        onClick={() => setCurrentTemplate({...currentTemplate, content: (currentTemplate?.content || '') + variable})}
                        className="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-[10px] font-mono text-slate-500 hover:bg-wa-green/20 hover:text-wa-green transition-colors"
                      >
                        {variable}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3 bg-blue-50 dark:bg-blue-900/10 p-4 rounded-xl text-blue-600">
                  <AlertCircle size={20} className="shrink-0" />
                  <p className="text-xs leading-relaxed">
                    <strong>Dica:</strong> A mensagem será formatada automaticamente ao ser enviada, substituindo as tags pelos dados reais do contato.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    id="is_active"
                    className="w-4 h-4 rounded border-slate-300 text-wa-green focus:ring-wa-green"
                    checked={currentTemplate?.is_active ?? true}
                    onChange={(e) => setCurrentTemplate({...currentTemplate, is_active: e.target.checked})}
                  />
                  <label htmlFor="is_active" className="text-sm font-medium text-slate-600 dark:text-slate-300">Modelo ativo (disponível para envios)</label>
                </div>
              </div>

              <footer className="p-6 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-700 flex gap-3">
                <button 
                  onClick={() => setIsEditing(false)}
                  className="flex-1 py-4 text-slate-500 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 rounded-2xl transition-colors"
                >
                  CANCELAR
                </button>
                <button 
                  onClick={handleSave}
                  className="flex-[2] py-4 bg-wa-green hover:bg-wa-teal text-white rounded-2xl font-bold shadow-lg transition-all active:scale-[0.98]"
                >
                  {currentTemplate?.id ? 'SALVAR ALTERAÇÕES' : 'CRIAR MODELO'}
                </button>
              </footer>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
