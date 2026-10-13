import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

type NeighborhoodMetric = { name: string; total: number };
type LabelMetric = { id: string; name: string; color: string; total: number; value: number };
type ActivityMetric = { date: string; total: number };
type ConversationStatus = { status: 'OPEN' | 'PENDING' | 'CLOSED'; total: number };

type DashboardChartsProps = {
  neighborhoods: NeighborhoodMetric[];
  labels: LabelMetric[];
  activitySeries: ActivityMetric[];
  conversationStatuses: ConversationStatus[];
};

export default function DashboardCharts({ neighborhoods, labels, activitySeries, conversationStatuses }: DashboardChartsProps) {
  return <>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm min-h-[400px]"><h3 className="font-bold mb-6 text-slate-500 uppercase text-xs tracking-widest">Contatos por Bairro</h3><div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={neighborhoods}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#88888820" /><XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={12} /><YAxis axisLine={false} tickLine={false} fontSize={12} /><Tooltip /><Bar dataKey="total" fill="#25d366" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></div>
      <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm min-h-[400px]"><h3 className="font-bold mb-6 text-slate-500 uppercase text-xs tracking-widest">Segmentacao por Etiquetas</h3><div className="h-64 flex items-center"><ResponsiveContainer width="100%" height={250}><PieChart><Pie data={labels} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">{labels.map((entry, index) => <Cell key={`dashboard-label-${index}`} fill={entry.color} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div><div className="flex flex-wrap gap-3">{labels.map(item => <span key={item.id} className="text-xs font-bold text-slate-500">{item.name}: {item.value}%</span>)}</div></div>
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm min-h-[360px]"><h3 className="font-bold mb-6 text-slate-500 uppercase text-xs tracking-widest">Atividade por Dia</h3><div className="h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={activitySeries}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#88888820" /><XAxis dataKey="date" axisLine={false} tickLine={false} fontSize={11} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} fontSize={12} /><Tooltip /><Line type="monotone" dataKey="total" stroke="#128c7e" strokeWidth={3} dot={{ r: 3 }} /></LineChart></ResponsiveContainer></div></div>
      <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm min-h-[360px]"><h3 className="font-bold mb-6 text-slate-500 uppercase text-xs tracking-widest">Status das Conversas</h3><div className="space-y-4 pt-3">{conversationStatuses.length === 0 ? <p className="text-sm text-slate-500">Nenhuma conversa no filtro atual.</p> : conversationStatuses.map(item => <div key={item.status} className="flex items-center gap-3"><span className={`h-3 w-3 rounded-full ${item.status === 'OPEN' ? 'bg-wa-green' : item.status === 'PENDING' ? 'bg-amber-400' : 'bg-slate-400'}`} /><span className="flex-1 text-sm font-semibold">{item.status === 'OPEN' ? 'Abertas' : item.status === 'PENDING' ? 'Pendentes' : 'Encerradas'}</span><strong>{item.total}</strong></div>)}</div></div>
    </div>
  </>;
}
