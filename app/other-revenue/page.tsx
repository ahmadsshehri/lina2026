'use client';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, query, where, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { getCurrentUser, loadPropertiesForUser, AppUserBasic, PropertyBasic } from '../../lib/userHelpers';

interface OtherRevenue {
  id: string; propertyId: string; amount: number;
  reason: string; date: any; receivedBy: string;
  paymentMethod: string; notes: string;
}

function fmtDate(ts: any) {
  if (!ts) return '—';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;
}
function toInputDate(ts: any) {
  if (!ts) return '';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function currentMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

const EMPTY_FORM = {
  reason:'', amount:'',
  date: new Date().toISOString().split('T')[0],
  receivedBy:'manager', paymentMethod:'transfer', notes:'',
};

const REASONS = ['إيراد إيجار متأخر','غرامة تأخير','عقد صيانة','استرداد تأمين','إيراد خدمات','بيع معدات','مكافأة','أخرى'];

export default function OtherRevenuePage() {
  const router = useRouter();
  const [appUser,    setAppUser]    = useState<AppUserBasic | null>(null);
  const [properties, setProperties] = useState<PropertyBasic[]>([]);
  const [propId,     setPropId]     = useState('');
  const [revenues,   setRevenues]   = useState<OtherRevenue[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [showModal,  setShowModal]  = useState(false);
  const [editItem,   setEditItem]   = useState<OtherRevenue | null>(null);
  const [saving,     setSaving]     = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<OtherRevenue | null>(null);
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [form, setForm] = useState(EMPTY_FORM);

  const canEdit   = appUser?.role === 'owner' || appUser?.role === 'manager';
  const canDelete = appUser?.role === 'owner';

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) { router.push('/login'); return; }
      const user = await getCurrentUser(fbUser.uid);
      if (!user)  { router.push('/login'); return; }
      setAppUser(user);
      const props = await loadPropertiesForUser(fbUser.uid, user.role);
      setProperties(props);
    if (props.length > 0) {
  const savedId = localStorage.getItem('selectedPropertyId');
  const saved = props.find(p => p.id === savedId);
  const selected = saved || props[0];
  setPropId(selected.id);
  await loadData(selected.id);
}
      setLoading(false);
    });
    return unsub;
  }, []);

  const loadData = async (pid: string) => {
    const snap = await getDocs(query(collection(db,'otherRevenue'), where('propertyId','==',pid)));
    setRevenues(
      snap.docs.map(d => ({ id:d.id, ...d.data() } as OtherRevenue))
        .sort((a,b) => (b.date?.seconds||0) - (a.date?.seconds||0))
    );
  };

  const openAdd = () => { setEditItem(null); setForm(EMPTY_FORM); setShowModal(true); };

  const openEdit = (r: OtherRevenue) => {
    setEditItem(r);
    setForm({ reason:r.reason, amount:String(r.amount), date:toInputDate(r.date), receivedBy:r.receivedBy||'manager', paymentMethod:r.paymentMethod||'transfer', notes:r.notes||'' });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.reason || !form.amount || !propId) { alert('يرجى ملء الحقول المطلوبة'); return; }
    setSaving(true);
    try {
      const data = {
        propertyId: propId, reason: form.reason.trim(),
        amount: Number(form.amount),
        date: Timestamp.fromDate(new Date(form.date)),
        receivedBy: form.receivedBy, paymentMethod: form.paymentMethod,
        notes: form.notes.trim(),
      };
      if (editItem) await updateDoc(doc(db,'otherRevenue',editItem.id), data);
      else await addDoc(collection(db,'otherRevenue'), { ...data, createdAt:serverTimestamp() });
      await loadData(propId);
      setShowModal(false); setEditItem(null); setForm(EMPTY_FORM);
    } catch (e) { alert('حدث خطأ'); }
    setSaving(false);
  };

  const deleteRev = async () => {
    if (!deleteConfirm) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db,'otherRevenue',deleteConfirm.id));
      await loadData(propId);
      setDeleteConfirm(null);
    } catch (e) { alert('حدث خطأ'); }
    setSaving(false);
  };

  // Month filter options
  const monthOptions = Array.from({ length:13 }, (_,i) => {
    if (i === 0) return { val:'all', label:'كل الأشهر' };
    const d = new Date(); d.setMonth(d.getMonth()-(i-1));
    return { val:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, label:d.toLocaleDateString('ar-SA',{year:'numeric',month:'long'}) };
  });

  const filtered = revenues.filter(r => {
    if (selectedMonth === 'all') return true;
    const [y,m] = selectedMonth.split('-').map(Number);
    const d = r.date?.toDate ? r.date.toDate() : new Date(r.date);
    return d.getFullYear()===y && (d.getMonth()+1)===m;
  });

  const total    = filtered.reduce((s,r) => s+r.amount, 0);
  const byMgr    = filtered.filter(r => r.receivedBy!=='owner').reduce((s,r) => s+r.amount, 0);
  const byOwner  = filtered.filter(r => r.receivedBy==='owner').reduce((s,r) => s+r.amount, 0);

  if (loading) return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'100vh' }}>
      <div style={{ width:'40px', height:'40px', border:'3px solid #1B4F72', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div dir="rtl" style={{ fontFamily:'sans-serif', background:'#f9fafb', minHeight:'100vh' }}>

      {/* Top Bar */}
      <div style={{ background:'linear-gradient(135deg,#9A7D0A 0%,#D4AC0D 100%)', padding:'16px 20px', display:'flex', alignItems:'center', gap:'12px', position:'sticky', top:0, zIndex:50, boxShadow:'0 2px 12px rgba(154,125,10,0.3)' }}>
        <button onClick={() => router.push('/')} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:'8px', padding:'8px 12px', cursor:'pointer' }}>
          <span style={{ color:'#fff', fontSize:'18px' }}>←</span>
        </button>
        <div style={{ flex:1 }}>
          <h1 style={{ margin:0, fontSize:'17px', fontWeight:'600', color:'#fff' }}>الإيرادات الأخرى</h1>
          <p style={{ margin:0, fontSize:'12px', color:'rgba(255,255,255,0.6)' }}>إيرادات خارج نطاق الإيجار والحجوزات</p>
        </div>
        <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
          {properties.length>1 && (
            <select value={propId} onChange={e=>{setPropId(e.target.value);loadData(e.target.value);}}
              style={{ border:'none', borderRadius:'8px', padding:'6px 10px', fontSize:'12px', background:'rgba(255,255,255,0.15)', color:'#fff' }}>
              {properties.map(p=><option key={p.id} value={p.id} style={{ color:'#000' }}>{p.name}</option>)}
            </select>
          )}
          {canEdit && (
            <button onClick={openAdd} style={{ background:'#D4AC0D', border:'none', borderRadius:'10px', padding:'10px 14px', cursor:'pointer', color:'#fff', fontSize:'13px', fontWeight:'600', fontFamily:'sans-serif' }}>
              + إيراد
            </button>
          )}
        </div>
      </div>

      <div style={{ padding:'16px', maxWidth:'720px', margin:'0 auto' }}>

        {/* Filter */}
        <div style={{ marginBottom:'16px' }}>
          <select value={selectedMonth} onChange={e=>setSelectedMonth(e.target.value)}
            style={{ width:'100%', border:'1.5px solid #e5e7eb', borderRadius:'12px', padding:'12px 16px', fontSize:'14px', background:'#fff', fontFamily:'sans-serif' }}>
            {monthOptions.map(m=><option key={m.val} value={m.val}>{m.label}</option>)}
          </select>
        </div>

        {/* KPIs */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'10px', marginBottom:'16px' }}>
          {[
            { label:'إجمالي الإيرادات', val:total.toLocaleString('ar-SA')+' ر.س', color:'#16a34a', bg:'#d1fae5' },
            { label:'استلمه المسؤول',   val:byMgr.toLocaleString('ar-SA')+' ر.س', color:'#1e40af', bg:'#dbeafe' },
            { label:'استلمه المالك',    val:byOwner.toLocaleString('ar-SA')+' ر.س',color:'#7c3aed', bg:'#ede9fe' },
          ].map(k=>(
            <div key={k.label} style={{ background:k.bg, borderRadius:'14px', padding:'14px 12px', textAlign:'center' }}>
              <div style={{ fontSize:'18px', fontWeight:'700', color:k.color }}>{k.val}</div>
              <div style={{ fontSize:'11px', color:'#6b7280', marginTop:'3px' }}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* List */}
        {filtered.length===0 ? (
          <div style={{ background:'#fff', borderRadius:'16px', padding:'40px', textAlign:'center', border:'1px solid #e5e7eb' }}>
            <div style={{ fontSize:'48px', marginBottom:'12px' }}>💵</div>
            <p style={{ color:'#6b7280', fontSize:'14px', margin:'0 0 16px' }}>لا توجد إيرادات أخرى</p>
            {canEdit && (
              <button onClick={openAdd} style={{ padding:'10px 20px', background:'#1B4F72', color:'#fff', border:'none', borderRadius:'10px', cursor:'pointer', fontSize:'14px', fontFamily:'sans-serif' }}>
                + إضافة إيراد
              </button>
            )}
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
            {filtered.map(r => {
              const rcv = r.receivedBy==='owner'
                ? { label:'المالك',   color:'#7c3aed', bg:'#ede9fe', icon:'👑' }
                : { label:'المسؤول', color:'#1e40af', bg:'#dbeafe', icon:'👤' };
              return (
                <div key={r.id} style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e5e7eb', padding:'14px 16px', display:'flex', alignItems:'center', gap:'12px' }}>
                  <div style={{ width:'44px', height:'44px', borderRadius:'12px', background:'#d1fae5', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'22px', flexShrink:0 }}>
                    💵
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:'14px', fontWeight:'600', color:'#111827' }}>{r.reason}</div>
                    <div style={{ fontSize:'12px', color:'#9ca3af', marginTop:'2px' }}>
                      {fmtDate(r.date)}
                      {r.paymentMethod==='transfer'?' · تحويل بنكي':' · كاش'}
                      {r.notes && ` · ${r.notes}`}
                    </div>
                    <span style={{ background:rcv.bg, color:rcv.color, fontSize:'11px', fontWeight:'600', padding:'2px 8px', borderRadius:'8px', marginTop:'4px', display:'inline-block' }}>
                      {rcv.icon} استلمه {rcv.label}
                    </span>
                  </div>
                  <div style={{ fontSize:'17px', fontWeight:'700', color:'#16a34a', flexShrink:0 }}>
                    {r.amount.toLocaleString('ar-SA')} ر.س
                  </div>
                  {canEdit && (
                    <div style={{ display:'flex', gap:'6px', flexShrink:0 }}>
                      <button onClick={() => openEdit(r)} style={{ padding:'5px 10px', border:'1px solid #d1d5db', borderRadius:'8px', background:'#fff', cursor:'pointer', fontSize:'12px', fontFamily:'sans-serif' }}>✏️</button>
                      {canDelete && (
                        <button onClick={() => setDeleteConfirm(r)} style={{ padding:'5px 10px', border:'1px solid #fca5a5', borderRadius:'8px', background:'#fff', cursor:'pointer', fontSize:'12px', color:'#dc2626', fontFamily:'sans-serif' }}>🗑️</button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Footer total */}
            <div style={{ background:'#1B4F72', borderRadius:'12px', padding:'14px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ color:'rgba(255,255,255,0.7)', fontSize:'13px' }}>إجمالي الإيرادات الأخرى</span>
              <span style={{ color:'#D4AC0D', fontSize:'18px', fontWeight:'700' }}>{total.toLocaleString('ar-SA')} ر.س</span>
            </div>
          </div>
        )}
      </div>

      {/* Modal إضافة/تعديل */}
      {showModal && (
        <div style={{ position:'fixed', inset:'0', background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:1000 }}
          onClick={() => setShowModal(false)}>
          <div style={{ background:'#fff', borderRadius:'20px 20px 0 0', padding:'24px', width:'100%', maxWidth:'500px', maxHeight:'90vh', overflowY:'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
              <h2 style={{ margin:0, fontSize:'17px', color:'#1B4F72', fontWeight:'600' }}>{editItem?'تعديل الإيراد':'إضافة إيراد'}</h2>
              <button onClick={() => setShowModal(false)} style={{ border:'none', background:'#f3f4f6', borderRadius:'50%', width:'32px', height:'32px', cursor:'pointer', fontSize:'16px' }}>✕</button>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>

              {/* السبب */}
              <div>
                <label style={lbl}>سبب الإيراد <span style={{ color:'#dc2626' }}>*</span></label>
                <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', marginBottom:'8px' }}>
                  {REASONS.map(r => (
                    <button key={r} onClick={() => setForm(f=>({...f, reason:r}))}
                      style={{ padding:'5px 12px', borderRadius:'8px', border:'1.5px solid', cursor:'pointer', fontSize:'12px', fontFamily:'sans-serif', borderColor:form.reason===r?'#1B4F72':'#e5e7eb', background:form.reason===r?'#eff6ff':'#f9fafb', color:form.reason===r?'#1B4F72':'#6b7280', fontWeight:form.reason===r?'600':'400' }}>
                      {r}
                    </button>
                  ))}
                </div>
                <input value={form.reason} onChange={e=>setForm(f=>({...f,reason:e.target.value}))}
                  placeholder="أو اكتب السبب مباشرة..." style={inp}/>
              </div>

              {/* المبلغ والتاريخ */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
                <div>
                  <label style={lbl}>المبلغ (ر.س) <span style={{ color:'#dc2626' }}>*</span></label>
                  <input type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} style={inp} placeholder="0"/>
                </div>
                <div>
                  <label style={lbl}>التاريخ</label>
                  <input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={inp}/>
                </div>
              </div>

              {/* طريقة الاستلام */}
              <div>
                <label style={lbl}>طريقة الاستلام</label>
                <select value={form.paymentMethod} onChange={e=>setForm(f=>({...f,paymentMethod:e.target.value}))} style={inp}>
                  <option value="transfer">تحويل بنكي</option>
                  <option value="cash">كاش</option>
                </select>
              </div>

              {/* مستلم المبلغ */}
              <div>
                <label style={{ ...lbl, fontWeight:'600' }}>💰 من استلم المبلغ؟</label>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
                  {[
                    { val:'manager', label:'مسؤول العقار', icon:'👤', color:'#1e40af', bg:'#dbeafe' },
                    { val:'owner',   label:'المالك',        icon:'👑', color:'#7c3aed', bg:'#ede9fe' },
                  ].map(opt=>(
                    <button key={opt.val} onClick={() => setForm(f=>({...f,receivedBy:opt.val}))}
                      style={{ padding:'12px 8px', border:`2px solid ${form.receivedBy===opt.val?opt.color:'#e5e7eb'}`, borderRadius:'12px', background:form.receivedBy===opt.val?opt.bg:'#fff', cursor:'pointer', textAlign:'center', fontFamily:'sans-serif' }}>
                      <div style={{ fontSize:'22px', marginBottom:'4px' }}>{opt.icon}</div>
                      <div style={{ fontSize:'13px', fontWeight:'600', color:form.receivedBy===opt.val?opt.color:'#374151' }}>{opt.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* ملاحظات */}
              <div>
                <label style={lbl}>ملاحظات</label>
                <input value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} style={inp} placeholder="اختياري"/>
              </div>
            </div>

            <div style={{ display:'flex', gap:'10px', marginTop:'24px' }}>
              <button onClick={save} disabled={saving}
                style={{ flex:1, padding:'13px', background:saving?'#9ca3af':'#1B4F72', color:'#fff', border:'none', borderRadius:'12px', cursor:saving?'not-allowed':'pointer', fontSize:'15px', fontWeight:'600', fontFamily:'sans-serif' }}>
                {saving?'جارٍ الحفظ...':editItem?'حفظ التعديلات':'إضافة الإيراد'}
              </button>
              <button onClick={() => setShowModal(false)}
                style={{ padding:'13px 20px', background:'#f3f4f6', color:'#374151', border:'none', borderRadius:'12px', cursor:'pointer', fontSize:'15px', fontFamily:'sans-serif' }}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal حذف */}
      {deleteConfirm && (
        <div style={{ position:'fixed', inset:'0', background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
          <div style={{ background:'#fff', borderRadius:'16px', padding:'24px', width:'380px', maxWidth:'95vw', textAlign:'center' }}>
            <div style={{ fontSize:'48px', marginBottom:'12px' }}>🗑️</div>
            <h3 style={{ margin:'0 0 8px', color:'#dc2626' }}>حذف الإيراد</h3>
            <p style={{ color:'#374151', fontWeight:'600', margin:'0 0 4px' }}>{deleteConfirm.reason}</p>
            <p style={{ color:'#16a34a', fontSize:'18px', fontWeight:'700', margin:'0 0 20px' }}>{deleteConfirm.amount.toLocaleString('ar-SA')} ر.س</p>
            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={deleteRev} disabled={saving}
                style={{ flex:1, padding:'12px', background:'#dc2626', color:'#fff', border:'none', borderRadius:'10px', cursor:'pointer', fontSize:'14px', fontWeight:'600', fontFamily:'sans-serif' }}>
                {saving?'جارٍ الحذف...':'تأكيد الحذف'}
              </button>
              <button onClick={() => setDeleteConfirm(null)}
                style={{ padding:'12px 20px', background:'#f3f4f6', color:'#374151', border:'none', borderRadius:'10px', cursor:'pointer', fontFamily:'sans-serif' }}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const lbl: React.CSSProperties = { display:'block', fontSize:'13px', color:'#374151', marginBottom:'6px', fontWeight:'500' };
const inp: React.CSSProperties = { width:'100%', border:'1.5px solid #e5e7eb', borderRadius:'10px', padding:'11px 14px', fontSize:'14px', boxSizing:'border-box', background:'#fff', fontFamily:'sans-serif' };
