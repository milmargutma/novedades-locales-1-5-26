import React, { useState, useEffect, useRef } from 'react';
import { format, isWithinInterval, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import * as XLSX from 'xlsx';
import { Bell, BellOff, Edit, Trash2, Plus, Download, Store, Shield, Paperclip, ChevronRight, LayoutDashboard, LogOut, FileText } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from './lib/firebase';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, getDocs } from 'firebase/firestore';

type Priority = 'verde' | 'amarilla' | 'roja';
type TargetLocal = 'local 4' | 'local 9' | 'administracion' | 'todos';

interface News {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  priority: Priority;
  target: TargetLocal;
  attachmentUrl?: string;
  attachmentName?: string;
  createdAt: string;
}

const ROLES: TargetLocal[] = ['local 4', 'local 9', 'administracion'];

export default function App() {
  const [role, setRole] = useState<TargetLocal | null>(null);
  const [news, setNews] = useState<News[]>([]);
  const [isEditing, setIsEditing] = useState<News | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [viewingNews, setViewingNews] = useState<News | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [adminFilter, setAdminFilter] = useState<TargetLocal | 'all'>('all');
  const lastNewsCount = useRef<number>(0);

  // Read from Firebase in real-time
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'news'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as News[];
      setNews(data);
      
      if (data.length > lastNewsCount.current && lastNewsCount.current !== 0) {
        if (Notification.permission === 'granted' && role) {
          const newItems = data.slice(lastNewsCount.current);
          const activeNewItems = newItems.filter(n => isActiveAndForRole(n, role));
          activeNewItems.forEach(item => {
            new Notification(`Nueva novedad: ${item.title}`, {
              body: item.description,
              icon: '/favicon.ico'
            });
          });
        }
      }
      lastNewsCount.current = data.length;
    }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'news');
    });

    return () => unsubscribe();
  }, [role]);

  const requestNotificationPermission = () => {
    if ('Notification' in window) {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          setPushEnabled(true);
        }
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('¿Eliminar novedad permanentemente?')) {
      try {
        await deleteDoc(doc(db, 'news', id));
      } catch (err) {
        alert('Error al eliminar la novedad.');
        handleFirestoreError(err, OperationType.DELETE, `news/${id}`);
      }
    }
  };

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'granted') {
      setPushEnabled(true);
    }
  }, []);

  const exportToExcel = () => {
    const dataToExport = news.map(n => ({
      Título: n.title,
      Descripción: n.description,
      'Fecha Inicio': format(parseISO(n.startDate), 'dd/MM/yyyy'),
      'Fecha Fin': format(parseISO(n.endDate), 'dd/MM/yyyy'),
      Prioridad: n.priority,
      Destino: n.target,
      Adjunto: n.attachmentUrl ? window.location.origin + n.attachmentUrl : ''
    }));
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Novedades');
    XLSX.writeFile(workbook, 'novedades_backup.xlsx');
  };

  if (!role) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 font-sans text-slate-900">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-8">
          <div className="text-center flex flex-col items-center">
            <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-4">
              <Store className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">RetailHub</h1>
            <p className="mt-2 text-sm text-slate-500">Seleccione su perfil para ingresar</p>
          </div>
          <div className="space-y-3">
            {ROLES.map(r => (
              <button
                key={r}
                onClick={() => {
                  setRole(r);
                  requestNotificationPermission();
                }}
                className="w-full flex items-center justify-between px-6 py-4 border border-slate-200 rounded-xl hover:border-indigo-500 hover:bg-indigo-50 transition-all group"
              >
                <div className="flex items-center gap-3">
                  {r === 'administracion' ? <Shield className="w-5 h-5 text-indigo-500" /> : <Store className="w-5 h-5 text-slate-400 group-hover:text-indigo-500" />}
                  <span className="font-medium text-slate-700 group-hover:text-indigo-700 capitalize">{r}</span>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-500" />
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const isActiveAndForRole = (n: News, userRole: TargetLocal) => {
    const now = new Date();
    const start = parseISO(n.startDate);
    const end = parseISO(n.endDate);
    const inRange = now >= start && now <= end;
    const targetsRole = n.target === 'todos' || n.target === userRole;
    return inRange && targetsRole;
  };

  const filteredNews = news.filter(n => {
    const matchesSearch = n.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          n.description.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (!matchesSearch) return false;

    if (role === 'administracion') {
      if (adminFilter === 'all') return true;
      return n.target === adminFilter || n.target === 'todos';
    }

    return true;
  });

  return (
    <div className="h-screen w-full bg-slate-50 text-slate-900 font-sans flex overflow-hidden">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0">
        <div className="p-6 border-b border-slate-100 flex items-center gap-2 text-indigo-600 font-bold text-xl">
          <Store className="w-8 h-8" />
          <span>RetailHub</span>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <div className="flex items-center gap-3 px-4 py-3 bg-indigo-50 text-indigo-700 rounded-lg font-medium">
            <LayoutDashboard className="w-5 h-5" />
            <span className="capitalize">{role === 'administracion' ? 'Gestión' : 'Panel Principal'}</span>
          </div>

          <button
            onClick={requestNotificationPermission}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
              pushEnabled ? 'text-emerald-700 bg-emerald-50' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {pushEnabled ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
            <span className="text-sm font-medium">{pushEnabled ? 'Notificaciones Activas' : 'Activar Alertas'}</span>
          </button>
        </nav>

        <div className="p-4 border-t border-slate-100 space-y-4">
          <div className="p-4 bg-slate-900 rounded-xl text-white">
            <p className="text-xs text-slate-400 mb-1">Sesión iniciada</p>
            <p className="text-sm font-medium capitalize">{role}</p>
          </div>
          <button 
            onClick={() => setRole(null)} 
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg font-medium transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0 gap-8">
          <div className="shrink-0">
            <h1 className="text-xl font-semibold text-slate-900">
              {role === 'administracion' ? 'Panel de Administración' : 'Novedades Activas'}
            </h1>
            <p className="text-sm text-slate-500 tracking-wide mt-0.5">
              {role === 'administracion' ? 'Monitoreo de locales 4, 9 y Administración' : `Visualizando novedades para ${role}`}
            </p>
          </div>
          
          <div className="flex-1 max-w-md ml-auto">
            <div className="relative">
              <input 
                type="text" 
                placeholder="Buscar novedad..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              />
              <svg className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </div>
          </div>
          
          <div className="flex items-center gap-3 shrink-0">
            {role === 'administracion' && (
              <>
                <button
                  onClick={exportToExcel}
                  className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 font-medium transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>Respaldar Excel</span>
                </button>
                <button
                  onClick={() => setIsCreating(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium shadow-sm transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Nueva Novedad</span>
                </button>
              </>
            )}
          </div>
        </header>

        {/* Content Area */}
        <div className="p-8 flex-1 overflow-y-auto">
          {role === 'administracion' && (
            <>
              {/* Quick Stats */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <p className="text-slate-500 text-sm font-medium">Novedades Totales</p>
                  <p className="text-3xl font-bold text-slate-900 mt-1">{news.length}</p>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <p className="text-slate-500 text-sm font-medium">Locales 4</p>
                  <p className="text-3xl font-bold text-slate-900 mt-1">{news.filter(n => n.target === 'local 4' || n.target === 'todos').length}</p>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <p className="text-slate-500 text-sm font-medium">Local 9</p>
                  <p className="text-3xl font-bold text-slate-900 mt-1">{news.filter(n => n.target === 'local 9' || n.target === 'todos').length}</p>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <p className="text-slate-500 text-sm font-medium">Prioridad Roja</p>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-3xl font-bold text-rose-600">{news.filter(n => n.priority === 'roja').length}</p>
                    <span className="text-[10px] uppercase tracking-wider bg-rose-50 text-rose-600 px-2 py-0.5 rounded-full font-bold">Urgente</span>
                  </div>
                </div>
              </div>

              {/* Table Container */}
              <div className="bg-white rounded-2xl border border-slate-200 flex flex-col overflow-hidden shadow-sm mb-12">
                <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-white">
                  <h3 className="font-semibold text-slate-800">Listado Maestro de Novedades</h3>
                  <select 
                    value={adminFilter}
                    onChange={(e) => setAdminFilter(e.target.value as TargetLocal | 'all')}
                    className="border border-slate-200 rounded-lg px-3 py-1.5 bg-slate-50 text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="all">Todos los locales</option>
                    <option value="local 4">Local 4</option>
                    <option value="local 9">Local 9</option>
                    <option value="administracion">Administración</option>
                  </select>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-left whitespace-nowrap">
                    <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                      <tr>
                        <th className="px-6 py-4 font-semibold">Prioridad</th>
                        <th className="px-6 py-4 font-semibold">Título / Descripción</th>
                        <th className="px-6 py-4 font-semibold">Alcance</th>
                        <th className="px-6 py-4 font-semibold">Vigencia</th>
                        <th className="px-6 py-4 font-semibold">Adjunto</th>
                        <th className="px-6 py-4 font-semibold text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm bg-white">
                      {filteredNews.map((item) => (
                        <tr key={item.id} onDoubleClick={() => setViewingNews(item)} className="hover:bg-slate-50/50 transition-colors cursor-pointer">
                          <td className="px-6 py-4">
                            {item.priority === 'roja' && (
                              <span className="flex items-center gap-1.5 text-rose-600 font-medium">
                                <span className="w-2 h-2 rounded-full bg-rose-600"></span> Alta
                              </span>
                            )}
                            {item.priority === 'amarilla' && (
                              <span className="flex items-center gap-1.5 text-amber-500 font-medium">
                                <span className="w-2 h-2 rounded-full bg-amber-500"></span> Media
                              </span>
                            )}
                            {item.priority === 'verde' && (
                              <span className="flex items-center gap-1.5 text-emerald-600 font-medium">
                                <span className="w-2 h-2 rounded-full bg-emerald-600"></span> Baja
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-medium text-slate-900">{item.title}</div>
                            <div className="text-xs text-slate-500 truncate w-64 mt-0.5">{item.description}</div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-[11px] font-medium uppercase tracking-wider">
                              {item.target}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-slate-500 font-mono text-xs">
                            {format(parseISO(item.startDate), 'dd/MM')} — {format(parseISO(item.endDate), 'dd/MM')}
                          </td>
                          <td className="px-6 py-4">
                            {item.attachmentUrl && (
                              <a href={item.attachmentUrl} download={item.attachmentName || 'adjunto'} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg transition-colors">
                                <Paperclip className="w-3.5 h-3.5" />
                                <span>Adjunto</span>
                              </a>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button onClick={() => setIsEditing(item)} className="text-slate-400 hover:text-indigo-600 mx-2 transition-colors">
                              <Edit className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDelete(item.id)} className="text-slate-400 hover:text-rose-600 mx-2 transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {filteredNews.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-500">
                            {searchQuery ? "No se encontraron resultados para la búsqueda." : "No hay novedades registradas en el sistema."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* User Cards View */}
          {role !== 'administracion' && (
            <div className="flex flex-col gap-4">
              {filteredNews.filter(n => isActiveAndForRole(n, role)).map(item => (
                <div key={item.id} onDoubleClick={() => setViewingNews(item)} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col md:flex-row md:items-center justify-between group hover:border-indigo-200 hover:shadow-md transition-all cursor-pointer gap-4">
                  <div className="flex items-start gap-4 flex-1">
                    <div className="shrink-0 pt-1.5">
                      {item.priority === 'roja' && <span className="w-2.5 h-2.5 rounded-full bg-rose-500 block ring-4 ring-rose-50"></span>}
                      {item.priority === 'amarilla' && <span className="w-2.5 h-2.5 rounded-full bg-amber-500 block ring-4 ring-amber-50"></span>}
                      {item.priority === 'verde' && <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 block ring-4 ring-emerald-50"></span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-semibold text-slate-900 truncate mb-1">{item.title}</h3>
                      <p className="text-slate-500 text-sm line-clamp-2 leading-relaxed">
                        {item.description}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-6 shrink-0 md:pl-6 md:border-l border-slate-100 mt-2 md:mt-0">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Vence</span>
                      <span className="text-xs text-slate-700 font-medium mt-0.5">
                        {format(parseISO(item.endDate), "d MMM", { locale: es })}
                      </span>
                    </div>
                    {item.attachmentUrl && (
                      <a href={item.attachmentUrl} download={item.attachmentName || 'adjunto'} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 rounded-lg text-xs font-medium transition-colors border border-slate-100">
                        <Paperclip className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Adjunto</span>
                      </a>
                    )}
                  </div>
                </div>
              ))}
              {filteredNews.filter(n => isActiveAndForRole(n, role)).length === 0 && (
                <div className="col-span-full py-16 flex flex-col items-center justify-center text-center bg-white rounded-2xl border border-slate-200 border-dashed">
                  <FileText className="w-12 h-12 text-slate-300 mb-4" />
                  <p className="text-slate-500 font-medium">{searchQuery ? "Sin resultados" : "Todo está al día"}</p>
                  <p className="text-slate-400 text-sm mt-1">{searchQuery ? "No hay novedades que coincidan con la búsqueda." : "No tienes novedades asignadas vigentes."}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Editor Modal */}
      {(isCreating || isEditing) && (
        <NewsFormModal
          news={isEditing}
          onClose={() => { setIsCreating(false); setIsEditing(null); }}
          onSaved={() => { setIsCreating(false); setIsEditing(null); }}
        />
      )}

      {viewingNews && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setViewingNews(null)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100 flex justify-between items-start gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900 mb-2">{viewingNews.title}</h2>
                <div className="flex flex-wrap gap-2 text-sm text-slate-500">
                  <span className="flex items-center gap-1">
                    <Store className="w-4 h-4" />
                    Target: <span className="font-medium text-slate-700 capitalize">{viewingNews.target}</span>
                  </span>
                  <span>•</span>
                  <span>
                    Del {format(new Date(viewingNews.startDate), "d MMM", { locale: es })}
                    {' '}al {format(new Date(viewingNews.endDate), "d MMM yyyy", { locale: es })}
                  </span>
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                 {viewingNews.priority === 'roja' && <span className="px-2.5 py-1 bg-rose-100 text-rose-700 rounded-md text-xs font-medium uppercase tracking-wider">Alta</span>}
                 {viewingNews.priority === 'amarilla' && <span className="px-2.5 py-1 bg-amber-100 text-amber-700 rounded-md text-xs font-medium uppercase tracking-wider">Media</span>}
                 {viewingNews.priority === 'verde' && <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-md text-xs font-medium uppercase tracking-wider">Baja</span>}
              </div>
            </div>
            
            <div className="p-6 overflow-y-auto">
              <div className="prose prose-slate max-w-none mb-8">
                <p className="whitespace-pre-wrap text-slate-600 leading-relaxed text-base">{viewingNews.description}</p>
              </div>

              {viewingNews.attachmentUrl && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mt-6">
                  <p className="text-sm font-medium text-slate-900 mb-2">Archivos Adjuntos</p>
                  <a 
                    href={viewingNews.attachmentUrl} 
                    download={viewingNews.attachmentName || 'adjunto'}
                    className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-lg hover:border-indigo-300 hover:shadow-sm transition-all group w-fit"
                  >
                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-md group-hover:bg-indigo-100 transition-colors">
                      <Paperclip className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-medium text-slate-700 group-hover:text-indigo-600 transition-colors">
                      {viewingNews.attachmentName || 'Descargar Adjunto'}
                    </span>
                    <Download className="w-4 h-4 text-slate-400 ml-2 group-hover:text-indigo-500" />
                  </a>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end rounded-b-2xl">
              <button
                onClick={() => setViewingNews(null)}
                className="px-6 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors focus:ring-2 focus:ring-slate-200 focus:outline-none"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NewsFormModal({ news, onClose, onSaved }: { news: News | null, onClose: () => void, onSaved: () => void }) {
  const [formData, setFormData] = useState<Partial<News>>(news || {
    title: '',
    description: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0],
    priority: 'verde',
    target: 'todos'
  });
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      let attachmentUrl = formData.attachmentUrl;
      let attachmentName = formData.attachmentName;

      if (file) {
        if (file.size > 500000) {
            alert('El archivo es demasiado grande. El máximo permitido es 500KB.');
            setLoading(false);
            return;
        }
        const toBase64 = (f: File) => new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(f);
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = error => reject(error);
        });
        attachmentUrl = await toBase64(file);
        attachmentName = file.name;
      }

      const body: any = {
        ...formData,
        startDate: format(new Date(formData.startDate!), "yyyy-MM-dd'T'00:00:00.000'Z'"),
        endDate: format(new Date(formData.endDate!), "yyyy-MM-dd'T'23:59:59.999'Z'"),
        createdAt: formData.createdAt || new Date().toISOString()
      };
      
      if (attachmentUrl) body.attachmentUrl = attachmentUrl;
      if (attachmentName) body.attachmentName = attachmentName;
      delete body.id;

      if (news) {
        await updateDoc(doc(db, 'news', news.id), body);
      } else {
        await addDoc(collection(db, 'news'), body);
      }
      onSaved();
    } catch (err) {
      alert('Error guardando la novedad. Revisa la consola para más detalles.');
      handleFirestoreError(err, news ? OperationType.UPDATE : OperationType.CREATE, news ? `news/${news.id}` : `news`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto w-full h-full bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white max-w-2xl w-full rounded-2xl border border-slate-200 shadow-xl p-6 sm:p-8">
        <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
          <h2 className="text-xl font-bold text-slate-900">{news ? 'Editar Novedad' : 'Detalles de la Novedad'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Título</label>
            <input 
              required
              type="text" 
              placeholder="Ej: Cierre de caja - Error sistema POS"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
              value={formData.title} 
              onChange={e => setFormData({...formData, title: e.target.value})} 
            />
          </div>
          
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Descripción</label>
            <textarea 
              required
              rows={4}
              placeholder="Describe los detalles..."
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              value={formData.description} 
              onChange={e => setFormData({...formData, description: e.target.value})} 
            />
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Fecha Inicio</label>
              <input 
                required
                type="date"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-mono"
                value={formData.startDate?.split('T')[0]} 
                onChange={e => setFormData({...formData, startDate: e.target.value})} 
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Fecha Fin</label>
              <input 
                required
                type="date"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-mono"
                value={formData.endDate?.split('T')[0]} 
                onChange={e => setFormData({...formData, endDate: e.target.value})} 
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Prioridad</label>
              <select
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                value={formData.priority}
                onChange={e => setFormData({...formData, priority: e.target.value as Priority})}
              >
                <option value="verde">Verde (Baja)</option>
                <option value="amarilla">Amarilla (Media)</option>
                <option value="roja">Roja (Alta)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Alcance</label>
              <select
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                value={formData.target}
                onChange={e => setFormData({...formData, target: e.target.value as TargetLocal})}
              >
                <option value="todos">Todos los Locales</option>
                <option value="local 4">Local 4 (Abasto)</option>
                <option value="local 9">Local 9 (Palermo)</option>
                <option value="administracion">Solo Adm.</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Archivo Adjunto</label>
            <div className="flex items-center gap-4">
              <input 
                type="file" 
                onChange={e => setFile(e.target.files ? e.target.files[0] : null)}
                className="block w-full text-sm text-slate-500
                  file:mr-4 file:py-2.5 file:px-4
                  file:rounded-lg file:border-0
                  file:text-sm file:font-semibold
                  file:bg-indigo-50 file:text-indigo-600
                  hover:file:bg-indigo-100 cursor-pointer transition-colors"
              />
              {!file && formData.attachmentUrl && (
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg whitespace-nowrap">
                  Adjunto Actual
                </span>
              )}
            </div>
          </div>

          <div className="mt-8 flex justify-end gap-3 pt-6 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 bg-white hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 border border-transparent rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 flex items-center gap-2 shadow-sm transition-colors"
            >
              {loading && <div className="w-4 h-4 border-2 border-white/20 border-t-white/100 rounded-full animate-spin"></div>}
              <span>{loading ? 'Guardando...' : 'Guardar y Publicar'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
