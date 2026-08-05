import React, { useState, useEffect } from 'react';
import { collection, addDoc, onSnapshot, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { OperationType, handleFirestoreError } from '../utils/firestoreErrorHandler';
import { exportToDrive } from '../utils/drive';
import { format, differenceInMinutes, parse, isSameMonth } from 'date-fns';
import { RefreshCw, Trash2, Send, Tractor, FileSpreadsheet, Pencil, Calendar, Maximize, Minimize, Clock, FileText, MapPin, Timer, Search } from 'lucide-react';
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid, LabelList } from 'recharts';

export interface Timesheet {
  id?: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  area: string;
  unitNo: string;
  operatorName: string;
  totalHours: number;
  remarks?: string;
  createdAt?: any;
  createdBy: string;
}


export const TimesheetApp = () => {
  const { user, isAdmin, login, logout, getDriveToken } = useAuth();
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<'month' | 'date'>('month');
  const [filterValue, setFilterValue] = useState(format(new Date(), 'yyyy-MM'));
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLogsFullscreen, setIsLogsFullscreen] = useState(false);
  const [selectedAreaDetails, setSelectedAreaDetails] = useState<string | null>(null);
  const [dashboardSearchArea, setDashboardSearchArea] = useState('');

  const filteredTimesheets = React.useMemo(() => {
    if (!filterValue) return timesheets;
    
    return timesheets.filter(sheet => {
      try {
        if (!sheet.startDate) return false;
        
        if (filterMode === 'month') {
          if (filterValue.length !== 7) return true;
          const [year, month] = filterValue.split('-').map(Number);
          const selectedMonthDate = new Date(year, month - 1, 1);
          const sheetDate = parse(sheet.startDate, 'yyyy-MM-dd', new Date());
          return isSameMonth(sheetDate, selectedMonthDate);
        } else {
          return sheet.startDate === filterValue;
        }
      } catch(e) {
        return false;
      }
    });
  }, [timesheets, filterValue, filterMode]);
  
  const [form, setForm] = useState({
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
    area: '',
    unitNo: '',
    operatorName: '',
    remarks: ''
  });

  const [totalHoursCalc, setTotalHoursCalc] = useState(0);

  // Auto calculate total hours whenever inputs change
  useEffect(() => {
    if (form.startDate && form.startTime && form.endDate && form.endTime) {
      try {
        const startString = `${form.startDate} ${form.startTime}`;
        const endString = `${form.endDate} ${form.endTime}`;
        const startDateObj = parse(startString, 'yyyy-MM-dd HH:mm', new Date());
        const endDateObj = parse(endString, 'yyyy-MM-dd HH:mm', new Date());
        
        const minutes = differenceInMinutes(endDateObj, startDateObj);
        if (minutes > 0) {
          setTotalHoursCalc(Number((minutes / 60).toFixed(2)));
        } else {
          setTotalHoursCalc(0);
        }
      } catch (e) {
        setTotalHoursCalc(0);
      }
    } else {
      setTotalHoursCalc(0);
    }
  }, [form]);

  // Fetch / Sync Data
  const fetchTimesheets = () => {
    const unsub = onSnapshot(collection(db, 'timesheets'), (snapshot) => {
      const data: Timesheet[] = [];
      snapshot.forEach(doc => {
        data.push({ id: doc.id, ...doc.data() } as Timesheet);
      });
      // sorting locally (could also orderBy in firestore but requires index if combined)
      data.sort((a, b) => {
        const timeA = typeof a.createdAt === 'string' ? new Date(a.createdAt).getTime() : (a.createdAt?.toDate?.()?.getTime() || Date.now());
        const timeB = typeof b.createdAt === 'string' ? new Date(b.createdAt).getTime() : (b.createdAt?.toDate?.()?.getTime() || Date.now());
        return timeB - timeA;
      });
      setTimesheets(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'timesheets', user);
    });
    return unsub;
  };

  useEffect(() => {
    if (user) {
      const unsub = fetchTimesheets();
      return () => unsub();
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      alert("Please sign in to submit a timesheet.");
      return;
    }
    if (totalHoursCalc <= 0) {
      alert("Invalid date/time range. End time must be after start time.");
      return;
    }

    try {
      const payload = {
        ...form,
        totalHours: totalHoursCalc,
        createdBy: user.uid
      };
      
      if (editingId) {
        const docRef = doc(db, 'timesheets', editingId);
        await updateDoc(docRef, {
          ...payload,
          updatedAt: serverTimestamp()
        });
        setEditingId(null);
      } else {
        await addDoc(collection(db, 'timesheets'), {
          ...payload,
          createdAt: serverTimestamp()
        });
      }
      
      // Reset form
      setForm({
        ...form,
        startTime: '',
        endTime: '',
        unitNo: '',
        operatorName: '',
        remarks: ''
      });
    } catch (error) {
      handleFirestoreError(error, editingId ? OperationType.UPDATE : OperationType.CREATE, 'timesheets', user);
    }
  };

  const handleDelete = async (id: string) => {
    if (!isAdmin) return;

    try {
      await deleteDoc(doc(db, 'timesheets', id));
    } catch (error: any) {
      alert("Failed to delete timesheet: " + error.message);
      handleFirestoreError(error, OperationType.DELETE, `timesheets/${id}`, user);
    }
  };

  const handleEdit = (sheet: Timesheet) => {
    setForm({
      startDate: sheet.startDate,
      startTime: sheet.startTime,
      endDate: sheet.endDate,
      endTime: sheet.endTime,
      area: sheet.area || '',
      unitNo: sheet.unitNo || '',
      operatorName: sheet.operatorName || '',
      remarks: sheet.remarks || ''
    });
    setEditingId(sheet.id || null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleExport = async () => {
    const token = getDriveToken();
    if (!token) {
      alert("Missing Drive access token. Please re-login to authorize Google Drive (click logout then login again).");
      return;
    }

    const confirm = window.confirm(`Export ${filteredTimesheets.length} records to Google Drive as CSV?`);
    if (!confirm) return;

    setIsExporting(true);
    try {
      const cleanData = filteredTimesheets.map(t => ({
        "Start Date": t.startDate,
        "Start Time": t.startTime,
        "End Date": t.endDate,
        "End Time": t.endTime,
        "Location Area": t.area,
        "Unit Number": t.unitNo,
        "Operator": t.operatorName,
        "Remarks": t.remarks || "",
        "Total Hours": t.totalHours
      }));
      const fileName = `Timesheets_Export_${format(new Date(), 'yyyy-MM-dd_HH-mm-ss')}.csv`;
      await exportToDrive(cleanData, fileName, token);
      alert("Export successful! Check your Google Drive.");
    } catch (e: any) {
      console.error(e);
      alert("Export failed: " + e.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleLogin = async () => {
    try {
      await login();
    } catch (e: any) {
      if (e.code === 'auth/popup-blocked') {
        alert("Popup blocked by browser. Please allow popups or open this app in a new tab.");
      } else {
        alert(e.message || "Failed to login. Please try again.");
      }
    }
  };

  // Summary Stats mapping to filtered timesheets
  const summaryStats = React.useMemo(() => {
    let totalHours = 0;
    let totalEntries = filteredTimesheets.length;
    let areas = new Set<string>();

    filteredTimesheets.forEach(sheet => {
      totalHours += sheet.totalHours || 0;
      if (sheet.area && sheet.area.trim() !== '') {
        areas.add(sheet.area.trim());
      }
    });

    const avgDuration = totalEntries > 0 ? (totalHours / totalEntries).toFixed(2) : '0.00';

    return {
      totalHours: Number(totalHours.toFixed(2)),
      totalEntries,
      areasCount: areas.size,
      avgDuration
    };
  }, [filteredTimesheets]);

  // Dashboard Aggregation (Total Hours per Area) - Pareto
  const dashboardStats = React.useMemo(() => {
    const stats: Record<string, number> = {};
    const originalNames: Record<string, string> = {};
    
    filteredTimesheets.forEach(sheet => {
      if (sheet.area && sheet.totalHours) {
        const normalizedArea = sheet.area.trim().toLowerCase();
        stats[normalizedArea] = (stats[normalizedArea] || 0) + sheet.totalHours;
        if (!originalNames[normalizedArea]) {
          originalNames[normalizedArea] = sheet.area.trim();
        }
      }
    });
    
    // Sort highest to lowest
    const sortedData = Object.entries(stats).map(([normalizedArea, total]) => ({
      area: originalNames[normalizedArea],
      total: Number(total.toFixed(2))
    })).sort((a, b) => b.total - a.total);

    // Calculate cumulative percentage for Pareto line
    let cumulative = 0;
    const totalHoursAll = sortedData.reduce((sum, item) => sum + item.total, 0);
    
    return sortedData.map(item => {
      cumulative += item.total;
      return {
        ...item,
        cumulativePercent: totalHoursAll > 0 ? Number(((cumulative / totalHoursAll) * 100).toFixed(1)) : 0
      };
    });
  }, [filteredTimesheets]);

  const searchedDashboardStats = React.useMemo(() => {
    if (!dashboardSearchArea) return dashboardStats;
    const lowerSearch = dashboardSearchArea.toLowerCase();
    return dashboardStats.filter(stat => stat.area.toLowerCase().includes(lowerSearch));
  }, [dashboardStats, dashboardSearchArea]);

  const getDashboardTitle = () => {
    if (!filterValue) return 'Overview Dashboard (All Data)';
    try {
      if (filterMode === 'month') {
        return `Overview Dashboard - ${format(parse(filterValue, 'yyyy-MM', new Date()), 'MMMM yyyy')}`;
      } else {
        return `Overview Dashboard - ${format(parse(filterValue, 'yyyy-MM-dd', new Date()), 'dd MMMM yyyy')}`;
      }
    } catch (e) {
      return 'Overview Dashboard';
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-slate-50 text-slate-800 pb-20 font-sans">
      
      {/* Liquid Mesh Gradient Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-blue-300/50 rounded-full mix-blend-multiply filter blur-[100px] animate-[spin_20s_linear_infinite] pointer-events-none"></div>
      <div className="absolute top-[20%] right-[-10%] w-[50%] h-[50%] bg-pink-300/40 rounded-full mix-blend-multiply filter blur-[100px] animate-[spin_25s_linear_infinite_reverse] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] left-[20%] w-[60%] h-[60%] bg-purple-300/50 rounded-full mix-blend-multiply filter blur-[100px] animate-[spin_30s_linear_infinite] pointer-events-none"></div>
      <div className="absolute bottom-[10%] right-[10%] w-[40%] h-[40%] bg-cyan-200/40 rounded-full mix-blend-multiply filter blur-[100px] animate-[spin_35s_linear_infinite] pointer-events-none"></div>
      
      {/* Grain Texture Overlay */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-0 opacity-40 mix-blend-overlay">
        <filter id="noiseFilter">
          <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="3" stitchTiles="stitch"/>
        </filter>
        <rect width="100%" height="100%" filter="url(#noiseFilter)"></rect>
      </svg>

      <div className="relative z-10 w-full h-full">
      <header className="bg-white/30 backdrop-blur-[40px] border-b border-white/40 shadow-[0_4px_24px_rgba(31,38,135,0.05),inset_0_1px_1px_rgba(255,255,255,0.6)] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/40 rounded-xl shadow-[inset_0_2px_4px_rgba(255,255,255,0.6)] border border-white/80">
              <Tractor className="w-6 h-6 text-indigo-700" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center">
                <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-800 to-pink-700">Timesheet Excavator Online Record</h1>
                <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 ml-3 bg-emerald-500/10 border border-emerald-500/20 rounded-full shadow-[inset_0_1px_2px_rgba(255,255,255,0.5)]">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Live Sync</span>
                </div>
              </div>
              <p className="text-xs font-semibold text-indigo-900/60 mt-0.5">Sistem Pengisian Timesheet Operator Berbasis Online</p>
            </div>
          </div>
          <div className="flex gap-4 items-center">
            {user ? (
              <>
                {isAdmin && <span className="bg-red-100/80 backdrop-blur-sm text-red-900 border border-red-200/50 shadow-sm text-xs font-bold px-3 py-1 rounded-full">Admin</span>}
                <div className="text-sm font-semibold text-indigo-900/60 hidden sm:block bg-white/40 backdrop-blur-md px-3 py-1 rounded-full border border-white/50">{user.email}</div>
                <button onClick={logout} className="text-sm font-bold text-indigo-900/60 hover:text-indigo-900 px-3 py-1 bg-white/30 backdrop-blur-sm rounded-full transition-colors border border-transparent hover:border-white/60">Sign out</button>
              </>
            ) : (
              <button 
                onClick={handleLogin}
                className="flex items-center gap-2 px-4 py-2 bg-white/70 backdrop-blur-md border border-white/80 rounded-full text-indigo-900 hover:bg-white/90 hover:scale-[1.02] shadow-[0_4px_12px_rgba(0,0,0,0.05)] transition-all font-semibold active:scale-95 text-sm"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Sign in with Google
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Col: Form */}
        <div className="lg:col-span-1">
          <div className="bg-white/20 backdrop-blur-[40px] p-6 rounded-[2rem] shadow-[0_8px_32px_0_rgba(31,38,135,0.07),inset_0_1px_1px_rgba(255,255,255,0.8)] border border-white/40">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-indigo-950">
              <FileSpreadsheet className="w-6 h-6 text-indigo-500" />
              {editingId ? 'Edit Entry' : 'Form Input Operator'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-indigo-900/80 mb-1.5 ml-1">Start Date</label>
                  <input type="date" required className="w-full rounded-xl bg-white/40 backdrop-blur-[20px] border-[1.5px] border-indigo-200/60 p-3 shadow-[inset_0_2px_8px_rgba(31,38,135,0.08),0_1px_2px_rgba(255,255,255,0.9)] text-sm focus:bg-white/80 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-400/20 outline-none transition-all text-indigo-950" value={form.startDate} onChange={e => setForm({...form, startDate: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-indigo-900/80 mb-1.5 ml-1">Start Time</label>
                  <input type="time" required className="w-full rounded-xl bg-white/40 backdrop-blur-[20px] border-[1.5px] border-indigo-200/60 p-3 shadow-[inset_0_2px_8px_rgba(31,38,135,0.08),0_1px_2px_rgba(255,255,255,0.9)] text-sm focus:bg-white/80 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-400/20 outline-none transition-all text-indigo-950" value={form.startTime} onChange={e => setForm({...form, startTime: e.target.value})} />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-indigo-900/80 mb-1.5 ml-1">End Date</label>
                  <input type="date" required className="w-full rounded-xl bg-white/40 backdrop-blur-[20px] border-[1.5px] border-indigo-200/60 p-3 shadow-[inset_0_2px_8px_rgba(31,38,135,0.08),0_1px_2px_rgba(255,255,255,0.9)] text-sm focus:bg-white/80 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-400/20 outline-none transition-all text-indigo-950" value={form.endDate} onChange={e => setForm({...form, endDate: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-indigo-900/80 mb-1.5 ml-1">End Time</label>
                  <input type="time" required className="w-full rounded-xl bg-white/40 backdrop-blur-[20px] border-[1.5px] border-indigo-200/60 p-3 shadow-[inset_0_2px_8px_rgba(31,38,135,0.08),0_1px_2px_rgba(255,255,255,0.9)] text-sm focus:bg-white/80 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-400/20 outline-none transition-all text-indigo-950" value={form.endTime} onChange={e => setForm({...form, endTime: e.target.value})} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-indigo-900/80 mb-1.5 ml-1">Loading Area</label>
                <input type="text" required placeholder="e.g. Pit 1" className="w-full rounded-xl bg-white/40 backdrop-blur-[20px] border-[1.5px] border-indigo-200/60 p-3 shadow-[inset_0_2px_8px_rgba(31,38,135,0.08),0_1px_2px_rgba(255,255,255,0.9)] text-sm focus:bg-white/80 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-400/20 outline-none transition-all text-indigo-950 placeholder-indigo-900/30" value={form.area} onChange={e => setForm({...form, area: e.target.value})} />
              </div>

              <div>
                <label className="block text-xs font-semibold text-indigo-900/80 mb-1.5 ml-1">Excavator Unit No.</label>
                <input type="text" required placeholder="e.g. EX-201" className="w-full rounded-xl bg-white/40 backdrop-blur-[20px] border-[1.5px] border-indigo-200/60 p-3 shadow-[inset_0_2px_8px_rgba(31,38,135,0.08),0_1px_2px_rgba(255,255,255,0.9)] text-sm focus:bg-white/80 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-400/20 outline-none transition-all text-indigo-950 placeholder-indigo-900/30" value={form.unitNo} onChange={e => setForm({...form, unitNo: e.target.value})} />
              </div>

              <div>
                <label className="block text-xs font-semibold text-indigo-900/80 mb-1.5 ml-1">Operator Name</label>
                <input type="text" required placeholder="e.g. John Doe" className="w-full rounded-xl bg-white/40 backdrop-blur-[20px] border-[1.5px] border-indigo-200/60 p-3 shadow-[inset_0_2px_8px_rgba(31,38,135,0.08),0_1px_2px_rgba(255,255,255,0.9)] text-sm focus:bg-white/80 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-400/20 outline-none transition-all text-indigo-950 placeholder-indigo-900/30" value={form.operatorName} onChange={e => setForm({...form, operatorName: e.target.value})} />
              </div>

              <div>
                <label className="block text-xs font-semibold text-indigo-900/80 mb-1.5 ml-1">Remarks (Optional)</label>
                <textarea rows={2} placeholder="Add detailed work description here..." className="w-full rounded-xl bg-white/40 backdrop-blur-[20px] border-[1.5px] border-indigo-200/60 p-3 shadow-[inset_0_2px_8px_rgba(31,38,135,0.08),0_1px_2px_rgba(255,255,255,0.9)] text-sm focus:bg-white/80 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-400/20 outline-none transition-all text-indigo-950 placeholder-indigo-900/30 resize-none" value={form.remarks || ''} onChange={e => setForm({...form, remarks: e.target.value})}></textarea>
              </div>

              <div className="bg-white/40 backdrop-blur-md rounded-2xl p-4 flex justify-between items-center text-indigo-900 border border-white/80 shadow-[inset_0_2px_8px_rgba(0,0,0,0.02)]">
                <span className="text-sm font-bold">Calculated Hours:</span>
                <span className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-700 to-pink-600">{totalHoursCalc} h</span>
              </div>

              <button type="submit" disabled={totalHoursCalc <= 0 || !user} className="w-full mt-2 bg-gradient-to-r from-indigo-600 to-pink-500 hover:from-indigo-500 hover:to-pink-400 disabled:opacity-50 disabled:from-indigo-300 disabled:to-pink-300 text-white font-bold tracking-wide py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-[0_4px_16px_rgba(99,102,241,0.2)] active:scale-95 text-[15px]">
                <Send className="w-4 h-4" /> {!user ? 'Please Sign In' : (editingId ? 'Update Timesheet' : 'Save Timesheet')}
              </button>
              
              {editingId && (
                <button type="button" onClick={() => { setEditingId(null); setForm({startDate: '', startTime: '', endDate: '', endTime: '', area: '', unitNo: '', operatorName: '', remarks: ''}); }} className="w-full mt-2 bg-white/30 hover:bg-white/80 text-indigo-900 border border-indigo-900/10 font-bold py-2.5 rounded-xl transition-all">
                  Cancel Edit
                </button>
              )}
            </form>
          </div>
        </div>

        {/* Right Col: Dashboard & Data */}
        <div className="lg:col-span-2 space-y-6">

          {/* Data Filter */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-white/20 backdrop-blur-[40px] p-4 sm:p-5 rounded-[2rem] shadow-[0_8px_32px_0_rgba(31,38,135,0.07),inset_0_1px_1px_rgba(255,255,255,0.8)] border border-white/40 gap-4">
             <div className="flex items-center gap-3 text-indigo-950 font-bold">
                <span className="bg-indigo-100/50 p-2.5 rounded-xl text-indigo-700">
                  <Calendar className="w-5 h-5" />
                </span>
                Data Filter
             </div>
             <div className="flex flex-wrap items-center gap-3">
               <select
                 value={filterMode}
                 onChange={e => {
                   setFilterMode(e.target.value as 'month' | 'date');
                   setFilterValue(e.target.value === 'month' ? format(new Date(), 'yyyy-MM') : format(new Date(), 'yyyy-MM-dd'));
                 }}
                 className="rounded-xl bg-white/40 backdrop-blur-md border border-white/80 px-3 py-2 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-400 outline-none transition-all font-semibold text-indigo-950"
               >
                 <option value="month">By Month</option>
                 <option value="date">By Date</option>
               </select>
               <input 
                 type={filterMode}
                 value={filterValue} 
                 onChange={e => setFilterValue(e.target.value)}
                 className="rounded-xl bg-white/40 backdrop-blur-md border border-white/80 px-4 py-2 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-400 outline-none shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] transition-all font-semibold text-indigo-950"
               />
               <button type="button" title="View All Data" onClick={() => setFilterValue('')} className="p-2 py-2 px-3 bg-white/30 text-indigo-900/70 hover:text-indigo-900 rounded-xl hover:bg-white/80 border border-transparent hover:border-white/80 transition-all text-xs font-bold active:scale-95 shadow-sm">
                 All Log
               </button>
             </div>
          </div>

          {/* KPI Dashboard */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="group relative overflow-hidden bg-white/20 backdrop-blur-[40px] border border-white/40 p-5 rounded-2xl shadow-[0_4px_16px_0_rgba(31,38,135,0.05),inset_0_1px_1px_rgba(255,255,255,0.8)] flex flex-col justify-center transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_12px_32px_0_rgba(31,38,135,0.1)] hover:bg-white/40 hover:border-white/80 cursor-pointer">
              <div className="absolute -right-4 -top-4 opacity-[0.03] group-hover:opacity-10 group-hover:scale-110 group-hover:-rotate-12 transition-all duration-500 ease-out">
                <Clock className="w-24 h-24 text-pink-600" strokeWidth={1.5} />
              </div>
              <div className="flex items-center gap-2 text-indigo-900/60 font-bold mb-2 text-sm z-10 transition-colors group-hover:text-pink-600">
                <div className="bg-pink-100/50 p-1.5 rounded-lg text-pink-500 group-hover:bg-pink-100 group-hover:scale-110 group-hover:rotate-6 transition-all duration-300 shadow-[inset_0_1px_2px_rgba(255,255,255,0.5)]">
                  <Clock className="w-3.5 h-3.5" />
                </div>
                Total Jam Kerja
              </div>
              <div className="text-3xl font-extrabold text-indigo-950 z-10 group-hover:translate-x-1 transition-transform duration-300">
                {summaryStats.totalHours} <span className="text-lg font-medium text-indigo-900/40 group-hover:text-pink-500/50 transition-colors duration-300">h</span>
              </div>
            </div>
            
            <div className="group relative overflow-hidden bg-white/20 backdrop-blur-[40px] border border-white/40 p-5 rounded-2xl shadow-[0_4px_16px_0_rgba(31,38,135,0.05),inset_0_1px_1px_rgba(255,255,255,0.8)] flex flex-col justify-center transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_12px_32px_0_rgba(31,38,135,0.1)] hover:bg-white/40 hover:border-white/80 cursor-pointer">
              <div className="absolute -right-4 -top-4 opacity-[0.03] group-hover:opacity-10 group-hover:scale-110 group-hover:-rotate-12 transition-all duration-500 ease-out">
                <FileText className="w-24 h-24 text-emerald-600" strokeWidth={1.5} />
              </div>
              <div className="flex items-center gap-2 text-indigo-900/60 font-bold mb-2 text-sm z-10 transition-colors group-hover:text-emerald-600">
                <div className="bg-emerald-100/50 p-1.5 rounded-lg text-emerald-500 group-hover:bg-emerald-100 group-hover:scale-110 group-hover:rotate-6 transition-all duration-300 shadow-[inset_0_1px_2px_rgba(255,255,255,0.5)]">
                  <FileText className="w-3.5 h-3.5" />
                </div>
                Total Entri
              </div>
              <div className="text-3xl font-extrabold text-indigo-950 z-10 group-hover:translate-x-1 transition-transform duration-300">
                {summaryStats.totalEntries}
              </div>
            </div>

            <div className="group relative overflow-hidden bg-white/20 backdrop-blur-[40px] border border-white/40 p-5 rounded-2xl shadow-[0_4px_16px_0_rgba(31,38,135,0.05),inset_0_1px_1px_rgba(255,255,255,0.8)] flex flex-col justify-center transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_12px_32px_0_rgba(31,38,135,0.1)] hover:bg-white/40 hover:border-white/80 cursor-pointer">
              <div className="absolute -right-4 -top-4 opacity-[0.03] group-hover:opacity-10 group-hover:scale-110 group-hover:-rotate-12 transition-all duration-500 ease-out">
                <MapPin className="w-24 h-24 text-amber-600" strokeWidth={1.5} />
              </div>
              <div className="flex items-center gap-2 text-indigo-900/60 font-bold mb-2 text-sm z-10 transition-colors group-hover:text-amber-600">
                <div className="bg-amber-100/50 p-1.5 rounded-lg text-amber-500 group-hover:bg-amber-100 group-hover:scale-110 group-hover:rotate-6 transition-all duration-300 shadow-[inset_0_1px_2px_rgba(255,255,255,0.5)]">
                  <MapPin className="w-3.5 h-3.5" />
                </div>
                Area Terdaftar
              </div>
              <div className="text-3xl font-extrabold text-indigo-950 z-10 group-hover:translate-x-1 transition-transform duration-300">
                {summaryStats.areasCount}
              </div>
            </div>

            <div className="group relative overflow-hidden bg-white/20 backdrop-blur-[40px] border border-white/40 p-5 rounded-2xl shadow-[0_4px_16px_0_rgba(31,38,135,0.05),inset_0_1px_1px_rgba(255,255,255,0.8)] flex flex-col justify-center transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_12px_32px_0_rgba(31,38,135,0.1)] hover:bg-white/40 hover:border-white/80 cursor-pointer">
              <div className="absolute -right-4 -top-4 opacity-[0.03] group-hover:opacity-10 group-hover:scale-110 group-hover:-rotate-12 transition-all duration-500 ease-out">
                <Timer className="w-24 h-24 text-blue-600" strokeWidth={1.5} />
              </div>
              <div className="flex items-center gap-2 text-indigo-900/60 font-bold mb-2 text-sm z-10 transition-colors group-hover:text-blue-600">
                <div className="bg-blue-100/50 p-1.5 rounded-lg text-blue-500 group-hover:bg-blue-100 group-hover:scale-110 group-hover:rotate-6 transition-all duration-300 shadow-[inset_0_1px_2px_rgba(255,255,255,0.5)]">
                  <Timer className="w-3.5 h-3.5" />
                </div>
                Rata-rata Durasi
              </div>
              <div className="text-3xl font-extrabold text-indigo-950 z-10 group-hover:translate-x-1 transition-transform duration-300">
                {summaryStats.avgDuration} <span className="text-lg font-medium text-indigo-900/40 group-hover:text-blue-500/50 transition-colors duration-300">h</span>
              </div>
            </div>
          </div>
          
          <div className={`${isFullscreen ? 'fixed inset-0 z-[100] bg-indigo-50/95 backdrop-blur-3xl overflow-y-auto p-4 sm:p-8' : 'bg-white/20 backdrop-blur-[40px] p-6 rounded-[2rem] shadow-[0_8px_32px_0_rgba(31,38,135,0.07),inset_0_1px_1px_rgba(255,255,255,0.8)] border border-white/40'} transition-all`}>
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-xl font-bold flex items-center text-indigo-950">
                {getDashboardTitle()}
              </h2>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-indigo-400" />
                  </div>
                  <input
                    type="text"
                    placeholder="Search Loading Area..."
                    value={dashboardSearchArea}
                    onChange={(e) => setDashboardSearchArea(e.target.value)}
                    className="pl-9 pr-4 py-2 w-48 sm:w-64 rounded-xl bg-white/40 backdrop-blur-[20px] border-[1.5px] border-indigo-200/60 shadow-[inset_0_2px_8px_rgba(31,38,135,0.08),0_1px_2px_rgba(255,255,255,0.9)] text-sm focus:bg-white/80 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-400/20 outline-none transition-all text-indigo-950 placeholder-indigo-900/40"
                  />
                </div>
                <button 
                  onClick={() => setIsFullscreen(!isFullscreen)} 
                  className="p-2.5 bg-white/30 text-indigo-900/70 hover:text-indigo-900 rounded-xl hover:bg-white/80 border border-transparent hover:border-white/80 transition-all text-xs font-bold active:scale-95 shadow-sm flex items-center gap-2"
                  title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                >
                  {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                </button>
              </div>
            </div>
            {!user ? (
              <div className="bg-white/30 backdrop-blur-sm border border-white/40 p-8 rounded-2xl text-center">
                <p className="text-indigo-900/50 font-semibold">Please sign in to view dashboard data.</p>
              </div>
            ) : searchedDashboardStats.length === 0 ? (
              <div className="bg-white/30 backdrop-blur-sm border border-white/40 p-8 rounded-2xl text-center">
                <p className="text-indigo-900/50 font-semibold">{filterValue ? "No data available for this selection." : "No data available."}</p>
              </div>
            ) : (
              <div className="space-y-8">
                <div className={`w-full pt-4 overflow-x-auto custom-scrollbar ${isFullscreen ? 'h-[50vh] min-h-[400px]' : 'h-72'}`}>
                  <div style={{ minWidth: `max(100%, ${searchedDashboardStats.length * 60}px)`, height: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={searchedDashboardStats} margin={{ top: 25, right: 0, bottom: 20, left: -20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(99,102,241,0.1)" />
                        <XAxis dataKey="area" tick={{ fontSize: 11, fill: '#4f46e5', fontWeight: 600 }} axisLine={false} tickLine={false} interval={0} angle={-30} textAnchor="end" height={50} />
                        <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#6366f1' }} axisLine={false} tickLine={false} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#ec4899' }} axisLine={false} tickLine={false} domain={[0, 100]} />
                        <Tooltip 
                          contentStyle={{ borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(8px)', boxShadow: '0 8px 32px rgba(31,38,135,0.1)' }}
                          cursor={{ fill: 'rgba(99, 102, 241, 0.05)' }}
                        />
                        <defs>
                          <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.9}/>
                            <stop offset="100%" stopColor="#ec4899" stopOpacity={0.9}/>
                          </linearGradient>
                          <linearGradient id="colorGradientHover" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#6366f1" stopOpacity={1}/>
                            <stop offset="100%" stopColor="#d946ef" stopOpacity={1}/>
                          </linearGradient>
                        </defs>
                        <Bar 
                          yAxisId="left" 
                          dataKey="total" 
                          name="Total Hours" 
                          radius={[6, 6, 0, 0]}
                          onClick={(data: any) => {
                            if (data && data.area) {
                              setSelectedAreaDetails(data.area);
                            } else if (data && data.payload && data.payload.area) {
                              setSelectedAreaDetails(data.payload.area);
                            }
                          }}
                          style={{ cursor: 'pointer', transition: 'all 0.3s ease' }}
                          activeBar={{ fill: 'url(#colorGradientHover)', stroke: '#4f46e5', strokeWidth: 2 }}
                        >
                          <LabelList dataKey="total" position="top" fill="#4f46e5" fontSize={11} fontWeight={600} />
                          {searchedDashboardStats.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={`url(#colorGradient)`} />
                          ))}
                        </Bar>
                        <Line yAxisId="right" type="monotone" dataKey="cumulativePercent" name="Cumulative %" stroke="#ec4899" strokeWidth={3} dot={{ r: 4, fill: '#ec4899', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-h-72 overflow-y-auto custom-scrollbar pr-2 pb-2">
                  {searchedDashboardStats.map(stat => (
                    <div 
                      key={stat.area} 
                      className="bg-white/30 backdrop-blur-lg border border-white/80 p-5 rounded-2xl shadow-[0_4px_16px_0_rgba(31,38,135,0.03)] hover:scale-[1.02] transition-transform flex flex-col justify-between cursor-pointer"
                      onClick={() => setSelectedAreaDetails(stat.area)}
                    >
                      <div className="text-sm text-indigo-900/60 font-bold mb-1 truncate" title={stat.area}>{stat.area}</div>
                      <div className="text-3xl font-extrabold text-indigo-950 tracking-tight">{stat.total} <span className="text-lg text-indigo-900/40">h</span></div>
                      <div className="text-xs text-pink-600 font-semibold mt-1 bg-pink-50 self-start px-2 py-0.5 rounded-full border border-pink-100">{stat.cumulativePercent}% Cuml</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className={`${isLogsFullscreen ? 'fixed inset-0 z-[100] bg-indigo-50/95 backdrop-blur-3xl overflow-y-auto p-4 sm:p-8 flex flex-col' : 'bg-white/20 backdrop-blur-[40px] p-6 rounded-[2rem] shadow-[0_8px_32px_0_rgba(31,38,135,0.07),inset_0_1px_1px_rgba(255,255,255,0.8)] border border-white/40'} transition-all`}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold flex items-center text-indigo-950">Recent Logs</h2>
              <div className="flex gap-2">
                <button 
                  onClick={() => setIsLogsFullscreen(!isLogsFullscreen)} 
                  className="p-2.5 bg-white/40 text-indigo-700 hover:text-indigo-900 rounded-xl hover:bg-white/90 border border-transparent hover:border-white/80 transition-all text-xs font-bold active:scale-95 shadow-sm flex items-center gap-2"
                  title={isLogsFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                >
                  {isLogsFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                </button>
                <button title="Refresh Data" onClick={() => fetchTimesheets()} className="p-2.5 bg-white/40 text-indigo-700 border border-white/80 hover:bg-white/90 rounded-xl transition-colors shadow-sm active:scale-95">
                  <RefreshCw className="w-5 h-5" />
                </button>
                {isAdmin && (
                  <button title="Export to Google Drive" onClick={handleExport} disabled={isExporting || filteredTimesheets.length === 0} className="px-4 py-2 bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-300 hover:to-teal-400 text-white font-bold rounded-xl transition-all shadow-[0_4px_16px_rgba(16,185,129,0.2)] disabled:opacity-50 active:scale-95 text-sm flex items-center gap-2">
                    {isExporting ? 'Exporting...' : 'Export to Drive (CSV)'}
                  </button>
                )}
              </div>
            </div>

            <div className={`border border-white/40 rounded-2xl overflow-hidden bg-white/20 backdrop-blur-[40px] shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] ${isLogsFullscreen ? 'flex-1 overflow-y-auto custom-scrollbar' : 'max-h-96 overflow-y-auto custom-scrollbar'}`}>
              <div className="overflow-x-auto custom-scrollbar">
                <table className="min-w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-white/20 backdrop-blur-[20px] border-b border-white/40 text-indigo-900/80 font-bold text-[13px] uppercase tracking-wider">
                    <tr>
                      <th className="px-5 py-4">Area</th>
                      <th className="px-5 py-4">Unit</th>
                      <th className="px-5 py-4">Operator</th>
                      <th className="px-5 py-4">Time Range</th>
                      <th className="px-5 py-4 text-right">Hours</th>
                      <th className="px-5 py-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/30">
                    {!user ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-10 text-center text-indigo-900/50 font-semibold">
                          Please sign in to view recent logs.
                        </td>
                      </tr>
                    ) : filteredTimesheets.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-10 text-center text-indigo-900/50 font-semibold">
                          {timesheets.length === 0 ? "No timesheets recorded." : "No records found for the selected month."}
                        </td>
                      </tr>
                    ) : (
                      filteredTimesheets.map(sheet => (
                        <tr key={sheet.id} className="hover:bg-white/30 transition-colors">
                          <td className="px-5 py-4 text-indigo-950 font-medium">{sheet.area}</td>
                          <td className="px-5 py-4 font-bold text-indigo-900">{sheet.unitNo}</td>
                          <td className="px-5 py-4 text-indigo-950">
                            {sheet.operatorName}
                            {sheet.remarks && (
                              <div className="text-xs text-indigo-900/50 mt-1 max-w-[150px] truncate" title={sheet.remarks}>
                                {sheet.remarks}
                              </div>
                            )}
                          </td>
                          <td className="px-5 py-4 text-xs font-medium text-indigo-900/70">
                            {sheet.startDate} <span className="font-bold">{sheet.startTime}</span> <br className="hidden md:block"/>- {sheet.endDate} <span className="font-bold">{sheet.endTime}</span>
                          </td>
                          <td className="px-5 py-4 text-right font-extrabold text-indigo-600">{sheet.totalHours}</td>
                          <td className="px-5 py-4 text-center">
                            <div className="flex justify-center gap-2">
                              <button onClick={() => handleEdit(sheet)} className="text-blue-500 hover:text-blue-700 p-2 rounded-lg bg-blue-50/50 hover:bg-blue-100 border border-transparent hover:border-blue-200 transition-colors active:scale-95">
                                <Pencil className="w-4 h-4" />
                              </button>
                              {isAdmin && (
                                <button onClick={() => sheet.id && handleDelete(sheet.id)} className="text-red-500 hover:text-red-700 p-2 rounded-lg bg-red-50/50 hover:bg-red-100 border border-transparent hover:border-red-200 transition-colors active:scale-95">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          {/* Selected Area Details Modal */}
          {selectedAreaDetails && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
              <div 
                className="absolute inset-0 bg-indigo-900/40 backdrop-blur-sm transition-opacity"
                onClick={() => setSelectedAreaDetails(null)}
              ></div>
              <div className="relative bg-white/90 backdrop-blur-xl border border-white/60 rounded-[2rem] p-6 shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center mb-6 pb-4 border-b border-indigo-100/50">
                  <h3 className="text-xl font-bold text-indigo-950 flex items-center gap-3">
                    <div className="p-2 bg-indigo-100/50 text-indigo-700 rounded-xl">
                      <MapPin className="w-5 h-5" />
                    </div>
                    Location Details: {selectedAreaDetails}
                  </h3>
                  <button 
                    onClick={() => setSelectedAreaDetails(null)}
                    className="p-2 rounded-xl hover:bg-indigo-50 text-indigo-400 hover:text-indigo-600 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                  </button>
                </div>
                <div className="overflow-y-auto flex-1 pr-2 custom-scrollbar">
                  <div className="space-y-4">
                    {filteredTimesheets.filter(t => t.area?.trim().toLowerCase() === selectedAreaDetails.trim().toLowerCase()).map((sheet, index) => (
                      <div key={sheet.id || index} className="bg-white/40 border border-white p-5 rounded-2xl shadow-[0_4px_16px_0_rgba(31,38,135,0.03)] hover:shadow-md transition-shadow flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                        <div className="flex-1">
                          <div className="font-bold text-indigo-950 mb-2 text-lg">{sheet.operatorName}</div>
                          <div className="text-sm font-semibold text-indigo-700 bg-indigo-50 inline-block px-2.5 py-1 rounded-lg border border-indigo-100 mb-3">Unit: {sheet.unitNo}</div>
                          <div className="flex flex-wrap gap-4 text-sm font-medium text-indigo-900/70">
                            <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4 text-indigo-400" /> {format(parse(sheet.startDate, 'yyyy-MM-dd', new Date()), 'dd MMM yyyy')}</span>
                            <span className="flex items-center gap-1.5"><Clock className="w-4 h-4 text-indigo-400" /> {sheet.startTime} - {sheet.endTime}</span>
                          </div>
                        </div>
                        <div className="bg-gradient-to-br from-indigo-50 to-pink-50 border border-white/80 shadow-sm px-6 py-4 rounded-xl text-center min-w-[120px]">
                          <div className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mb-1">Duration</div>
                          <div className="text-2xl font-black text-indigo-950">{sheet.totalHours}<span className="text-sm text-indigo-400 font-bold">h</span></div>
                        </div>
                      </div>
                    ))}
                    {filteredTimesheets.filter(t => t.area?.trim().toLowerCase() === selectedAreaDetails.trim().toLowerCase()).length === 0 && (
                      <div className="text-center p-8 text-indigo-900/50 font-semibold">
                        No entries found for this location.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>
      </div>
    </div>
  );
};
