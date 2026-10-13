import React, { useState, useEffect } from 'react';
import { contactsApi, neighborhoodsApi } from '../lib/api';
import { Contact, Neighborhood, Label } from '../types';
import { Search, Filter, Calendar, MapPin, Tag as TagIcon, MessageSquare, Send, Phone } from 'lucide-react';
import { format, differenceInYears, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function BirthdayView() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);
  const [filterDay, setFilterDay] = useState<number | 'all'>('all');
  const [filterNeighborhood, setFilterNeighborhood] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [contactsData, neighborhoodsData] = await Promise.all([
        contactsApi.listAll(),
        neighborhoodsApi.list()
      ]);
      setContacts(contactsData);
      setNeighborhoods(neighborhoodsData);
    } catch {
      setError('Não foi possível carregar os aniversariantes.');
    } finally {
      setLoading(false);
    }
  };

  const getDayOfMonth = (dateStr?: string) => {
    if (!dateStr) return null;
    return parseInt(dateStr.split('-')[2]);
  };

  const getMonthOfDate = (dateStr?: string) => {
    if (!dateStr) return null;
    return parseInt(dateStr.split('-')[1]);
  };

  const calculateAge = (dateStr?: string) => {
    if (!dateStr) return null;
    return differenceInYears(new Date(), parseISO(dateStr));
  };

  const birthdaysOfMonth = contacts.filter(c => {
    if (!c.birth_date) return false;
    const day = getDayOfMonth(c.birth_date);
    const month = getMonthOfDate(c.birth_date);
    
    const matchesMonth = month === filterMonth;
    const matchesDay = filterDay === 'all' || day === filterDay;
    const matchesNeighborhood = filterNeighborhood === 'all' || c.neighborhood_id === filterNeighborhood;
    const matchesSearch = c.full_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         c.phone.includes(searchQuery);
    
    return matchesMonth && matchesDay && matchesNeighborhood && matchesSearch;
  }).sort((a, b) => getDayOfMonth(a.birth_date!)! - getDayOfMonth(b.birth_date!)!);

  const birthdaysToday = birthdaysOfMonth.filter(c => getDayOfMonth(c.birth_date) === new Date().getDate());

  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <header className="p-6 bg-white dark:bg-[#111b21] border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="text-wa-green" /> Aniversariantes
          </h2>
          <p className="text-slate-500 text-sm">Gerencie e envie felicitações para seus contatos.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 md:flex-none md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Pesquisar..."
              className="w-full pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg outline-none focus:ring-2 focus:ring-wa-green transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <select 
            className="px-3 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg outline-none focus:ring-2 focus:ring-wa-green text-sm"
            value={filterDay}
            onChange={(e) => setFilterDay(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
          >
            <option value="all">Todos os Dias</option>
            {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
              <option key={d} value={d}>Dia {d}</option>
            ))}
          </select>

          <select 
            className="px-3 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg outline-none focus:ring-2 focus:ring-wa-green text-sm"
            value={filterMonth}
            onChange={(e) => setFilterMonth(parseInt(e.target.value))}
          >
            {months.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>

          <select 
            className="px-3 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg outline-none focus:ring-2 focus:ring-wa-green text-sm"
            value={filterNeighborhood}
            onChange={(e) => setFilterNeighborhood(e.target.value)}
          >
            <option value="all">Todos os Bairros</option>
            {neighborhoods.map(n => (
              <option key={n.id} value={n.id}>{n.name}</option>
            ))}
          </select>
        </div>
      </header>

      <div className="flex-1 p-6 overflow-y-auto space-y-8">
        {error && (
          <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={fetchData} className="font-bold underline">Tentar novamente</button>
          </div>
        )}
        {/* Aniversariantes de Hoje */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-8 bg-wa-green rounded-full" />
            <h3 className="font-bold text-lg">Aniversariantes de Hoje ({birthdaysToday.length})</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {birthdaysToday.length > 0 ? (
              birthdaysToday.map(c => (
                <BirthdayCard key={c.id} contact={c} isToday />
              ))
            ) : (
              <p className="text-slate-400 italic text-sm p-4 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                Nenhum aniversariante hoje.
              </p>
            )}
          </div>
        </section>

        {/* Aniversariantes do Mês */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-8 bg-blue-500 rounded-full" />
            <h3 className="font-bold text-lg">Aniversariantes de {months[filterMonth - 1]} ({birthdaysOfMonth.length})</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {birthdaysOfMonth.length > 0 ? (
              birthdaysOfMonth.map(c => (
                <BirthdayCard key={c.id} contact={c} />
              ))
            ) : (
              <p className="text-slate-400 italic text-sm p-4 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                Nenhum aniversariante encontrado para este filtro.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function BirthdayCard({ contact, isToday }: { contact: Contact, isToday?: boolean, key?: any }) {
  const day = parseInt(contact.birth_date?.split('-')[2] || '0');
  const month = parseInt(contact.birth_date?.split('-')[1] || '0');
  const age = differenceInYears(new Date(), parseISO(contact.birth_date!));

  return (
    <motion.div 
      whileHover={{ y: -5 }}
      className={cn(
        "bg-white dark:bg-[#111b21] p-5 rounded-2xl shadow-sm border transition-all relative overflow-hidden group",
        isToday ? "border-wa-green/30 ring-1 ring-wa-green/10" : "border-slate-100 dark:border-slate-800"
      )}
    >
      {isToday && (
        <div className="absolute top-0 right-0 p-2">
          <div className="bg-wa-green text-white text-[10px] font-bold px-2 py-1 rounded-bl-xl uppercase tracking-wider animate-pulse">
            Hoje 🎉
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 mb-4">
        <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-xl text-wa-green shadow-inner">
          {contact.avatar_url ? (
            <img src={contact.avatar_url} alt={contact.full_name} className="w-full h-full object-cover rounded-full" />
          ) : (
            contact.full_name.charAt(0)
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="font-bold text-slate-800 dark:text-slate-100 truncate">{contact.full_name}</h4>
          <p className="text-xs text-slate-500 flex items-center gap-1">
            <Phone size={10} /> {contact.phone}
          </p>
        </div>
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400 flex items-center gap-1"><Calendar size={12} /> Data</span>
          <span className="font-bold text-slate-700 dark:text-slate-300">{day}/{month}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400 flex items-center gap-1"><MapPin size={12} /> Bairro</span>
          <span className="font-medium text-slate-600 dark:text-slate-400 truncate ml-2">
            {contact.neighborhood?.name || 'Não informado'}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400 flex items-center gap-1"><TagIcon size={12} /> Idade</span>
          <span className="font-bold text-wa-green">{age} anos</span>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto no-scrollbar pb-1 mb-4">
        {contact.labels && contact.labels.length > 0 ? (
          contact.labels.map(l => (
            <div 
              key={l.id} 
              className="w-3 h-3 rounded-full flex-shrink-0 shadow-sm"
              style={{ backgroundColor: l.color }}
              title={l.name}
            />
          ))
        ) : (
          <span className="text-[10px] text-slate-300 italic opacity-50">Sem etiquetas</span>
        )}
      </div>

      <a 
        href={`https://wa.me/${contact.phone}`}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "w-full py-2 rounded-xl flex items-center justify-center gap-2 text-sm font-bold transition-all active:scale-95",
          isToday ? "bg-wa-green text-white shadow-md hover:bg-wa-teal" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-wa-green/10 hover:text-wa-green"
        )}
      >
        <Send size={14} /> Enviar Parabéns
      </a>
    </motion.div>
  );
}
