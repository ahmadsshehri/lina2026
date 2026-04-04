'use client';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import { collection, getDocs, addDoc, deleteDoc, doc, query, where, serverTimestamp, Timestamp, getDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';

interface Property { id: string; name: string; }
interface Expense { id: string; category: string; subcategory: string; amount: number; date: any; paidBy: string; paymentMethod: string; notes: string; }

const CAT: Record<string,string> = { electricity:'كهرباء', water:'مياه', maintenance:'صيانة', salary:'راتب', cleaning:'نظافة', other:'أخرى' };
const CAT_COLOR: Record<string,{bg:string,text:string}> = {
  electricity:{bg:'#fef3c7',text:'#92400e'}, water:{bg:'#dbeafe',text:'#1e40af'},
  maintenance:{bg:'#ede9fe',text:'#5b21b6'}, salary:{bg:'#e0e7ff',text:'#3730a3'},
  cleaning:{bg:'#d1fae5',text:'#065f46'}, other:{bg:'#f3f4f6',text:'#374151'},
};

function fmtDate(ts: any) {
  if (!ts) return '—';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;
}




async function loadPropertiesForUser(uid: string) {
  const userSnap = await getDoc(doc(db, 'users', uid));
  if (!userSnap.exists()) return [];
  const userData = userSnap.data() as any;
  if (userData.role === 'owner') {
    const snap = await getDocs(query(collection(db, 'properties'), where('ownerId', '==', uid)));
    return snap.docs.map((d: any) => ({ id: d.id, name: d.data().name }));
  }
  const ids: string[] = userData.propertyIds || [];
  if (ids.length === 0) return [];
  const results: any[] = [];
  for (let i = 0; i < ids.length; i += 10) {
    const chunk = ids.slice(i, i + 10);
    const snap = await getDocs(query(collection(db, 'properties'), where('__name__', 'in', chunk)));
    snap.docs.forEach((d: any) => results.push({ id: d.id, name: d.data().name }));
  }
  return results;
}
export default function ExpensesPage() {
  const router = useRouter();
  const [properties, setProperties] = useState<Property[]>([]);
  const [propId, setPropId] = useState('');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [catFilter, setCatFilter] = useState('all');
  const [form, setForm] = useState({ category:'electricity', subcategory:'', amount:'', date:'', paidBy:'manager', paymentMethod:'transfer', notes:'' });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push('/login'); return; }
      const props = await loadPropertiesForUser(user.uid);
      setProperties(props);
      if (props.length > 0) { setPropId(props[0].id); await loadExpenses(props[0].id); }
      setLoading(false);
    });
    return unsub;
  }, []);

  const loadExpenses = async (pid: string) => {
    const snap = await getDocs(query(collection(db,'expenses'), where('propertyId','==',pid)));
    setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() } as Expense)).sort((a,b) => (b.date?.seconds||0) - (a.date?.seconds||0)));
  };

  const saveExpense = async () => {
    if (!form.amount || !form.subcategory || !propId) return;
    setSaving(true);
    try {
      await addDoc(collection(db,'expenses'), {
        ...form, propertyId: propId, amount: Number(form.amount),
        date: form.date ? Timestamp.fromDate(new Date(form.date)) : Timestamp.now(),
        recordedBy: auth.currentUser?.uid, createdAt: serverTimestamp(),
      });
      await loadExpenses(propId); setShowModal(false);
      setForm({ category:'electricity', subcategory:'', amount:'', date:'', paidBy:'manager', paymentMethod:'transfer', notes:'' });
    } catch(e) { alert('حدث خطأ'); }
    setSaving(false);
  };

  const deleteExpense = async (id: string) => {
    if (!confirm('هل أنت متأكد؟')) return;
    await deleteDoc(doc(db,'expenses',id));
    await loadExpenses(propId);
  };

  const filtered = catFilter === 'all' ? expenses : expenses.filter(e => e.category === catFilter);
  const total = filtered.reduce((s,e) => s + (e.amount||0), 0);
  const byCategory = expenses.reduce((acc: Record<string,number>, e) => { acc[e.category] = (acc[e.category]||0) + e.amount; return acc; }, {});
  const byPaidBy = { manager: expenses.filter(e=>e.paidBy==='manager').reduce((s,e)=>s+e.amount,0), owner: expenses.filter(e=>e.paidBy==='owner').reduce((s,e)=>s+e.amount,0) };

  if (loading) return <div style={{display:'flex',justifyContent:'center',alignItems:'center',height:'100vh'}}><p>جارٍ التحميل...</p></div>;

  return (
    <div dir="rtl" style={{padding:'20px',fontFamily:'sans-serif',background:'#f9fafb',minHeight:'100vh'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px'}}>
        <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
          <a href="/" style={{color:'#1B4F72',textDecoration:'none',fontSize:'13px'}}>← الرئيسية</a>
          <h1 style={{margin:0,fontSize:'18px',color:'#1B4F72'}}>المصاريف</h1>
        </div>
        <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
          {properties.length > 1 && (
            <select value={propId} onChange={e=>{setPropId(e.target.value);loadExpenses(e.target.value);}} style={selectStyle}>
              {properties.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <button onClick={()=>setShowModal(true)} style={btnPrimary}>+ مصروف جديد</button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'12px',marginBottom:'16px'}}>
        {[['إجمالي المصاريف',total.toLocaleString('ar-SA')+' ر.س','#dc2626'],['الكهرباء',(byCategory.electricity||0).toLocaleString('ar-SA')+' ر.س','#d97706'],['مسؤول العقار',byPaidBy.manager.toLocaleString('ar-SA')+' ر.س','#1B4F72'],['المالك',byPaidBy.owner.toLocaleString('ar-SA')+' ر.س','#7c3aed']].map(([l,v,c])=>(
          <div key={String(l)} style={{background:'#fff',borderRadius:'12px',padding:'16px',border:'1px solid #e5e7eb'}}>
            <div style={{fontSize:'11px',color:'#6b7280',marginBottom:'6px'}}>{l}</div>
            <div style={{fontSize:'18px',fontWeight:'600',color:String(c)}}>{v}</div>
          </div>
        ))}
      </div>

      {/* Category bars */}
      <div style={{background:'#fff',borderRadius:'12px',border:'1px solid #e5e7eb',padding:'16px',marginBottom:'16px'}}>
        <div style={{fontSize:'13px',fontWeight:'500',color:'#374151',marginBottom:'12px'}}>توزيع المصاريف حسب الفئة</div>
        {Object.entries(byCategory).sort(([,a],[,b])=>b-a).map(([cat,amt])=>{
          const pct = total > 0 ? Math.round(amt/total*100) : 0;
          const cc = CAT_COLOR[cat] || {bg:'#f3f4f6',text:'#374151'};
          return (
            <div key={cat} style={{marginBottom:'10px'}}>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:'12px',marginBottom:'4px'}}>
                <span style={{background:cc.bg,color:cc.text,padding:'2px 8px',borderRadius:'10px'}}>{CAT[cat]||cat}</span>
                <span style={{color:'#374151',fontWeight:'500'}}>{amt.toLocaleString('ar-SA')} ر.س ({pct}%)</span>
              </div>
              <div style={{height:'6px',background:'#f3f4f6',borderRadius:'3px',overflow:'hidden'}}>
                <div style={{height:'100%',background:'#1B4F72',width:`${pct}%`,borderRadius:'3px'}}/>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filter */}
      <div style={{display:'flex',gap:'8px',marginBottom:'12px'}}>
        <select value={catFilter} onChange={e=>setCatFilter(e.target.value)} style={selectStyle}>
          <option value="all">جميع الفئات</option>
          {Object.entries(CAT).map(([k,v])=><option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {/* Table */}
      <div style={{background:'#fff',borderRadius:'12px',border:'1px solid #e5e7eb',overflow:'hidden'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:'13px'}}>
          <thead><tr style={{background:'#f9fafb'}}>
            {['التاريخ','الفئة','البيان','المبلغ','دُفع بواسطة','الطريقة',''].map(h=>(
              <th key={h} style={{padding:'10px 12px',textAlign:'right',color:'#6b7280',fontWeight:'500',borderBottom:'1px solid #e5e7eb'}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {filtered.length===0 && <tr><td colSpan={7} style={{padding:'40px',textAlign:'center',color:'#9ca3af'}}>لا توجد مصاريف</td></tr>}
            {filtered.map((e,i)=>{
              const cc = CAT_COLOR[e.category] || {bg:'#f3f4f6',text:'#374151'};
              return (
                <tr key={e.id} style={{borderBottom:i<filtered.length-1?'1px solid #f3f4f6':'none'}}>
                  <td style={{padding:'10px 12px',color:'#6b7280',fontSize:'12px'}}>{fmtDate(e.date)}</td>
                  <td style={{padding:'10px 12px'}}><span style={{background:cc.bg,color:cc.text,padding:'2px 8px',borderRadius:'10px',fontSize:'11px'}}>{CAT[e.category]||e.category}</span></td>
                  <td style={{padding:'10px 12px'}}>{e.subcategory}</td>
                  <td style={{padding:'10px 12px',fontWeight:'600',color:'#dc2626'}}>{e.amount?.toLocaleString('ar-SA')} ر.س</td>
                  <td style={{padding:'10px 12px'}}><span style={{background:e.paidBy==='owner'?'#fef3c7':'#dbeafe',color:e.paidBy==='owner'?'#92400e':'#1e40af',padding:'2px 8px',borderRadius:'10px',fontSize:'11px'}}>{e.paidBy==='owner'?'المالك':'المسؤول'}</span></td>
                  <td style={{padding:'10px 12px',color:'#6b7280',fontSize:'12px'}}>{e.paymentMethod==='transfer'?'تحويل':'كاش'}</td>
                  <td style={{padding:'10px 12px'}}><button onClick={()=>deleteExpense(e.id)} style={{padding:'3px 8px',border:'1px solid #fca5a5',borderRadius:'6px',background:'#fff',cursor:'pointer',fontSize:'11px',color:'#dc2626'}}>حذف</button></td>
                </tr>
              );
            })}
          </tbody>
          {filtered.length > 0 && (
            <tfoot><tr style={{background:'#f9fafb',borderTop:'2px solid #e5e7eb'}}>
              <td colSpan={3} style={{padding:'10px 12px',fontWeight:'500',color:'#374151'}}>الإجمالي</td>
              <td style={{padding:'10px 12px',fontWeight:'600',color:'#dc2626'}}>{total.toLocaleString('ar-SA')} ر.س</td>
              <td colSpan={3}/>
            </tr></tfoot>
          )}
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{position:'fixed',inset:'0',background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}} onClick={()=>setShowModal(false)}>
          <div style={{background:'#fff',borderRadius:'16px',padding:'24px',width:'480px',maxWidth:'95vw'}} onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:'20px'}}>
              <h2 style={{margin:0,fontSize:'16px',color:'#1B4F72'}}>تسجيل مصروف جديد</h2>
              <button onClick={()=>setShowModal(false)} style={{border:'none',background:'none',fontSize:'20px',cursor:'pointer',color:'#6b7280'}}>✕</button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px'}}>
              <div>
                <label style={{display:'block',fontSize:'12px',color:'#6b7280',marginBottom:'4px'}}>الفئة</label>
                <select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))} style={{width:'100%',border:'1px solid #d1d5db',borderRadius:'8px',padding:'8px 12px',fontSize:'13px'}}>
                  {Object.entries(CAT).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label style={{display:'block',fontSize:'12px',color:'#6b7280',marginBottom:'4px'}}>التاريخ</label>
                <input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={{width:'100%',border:'1px solid #d1d5db',borderRadius:'8px',padding:'8px 12px',fontSize:'13px',boxSizing:'border-box'}}/>
              </div>
              <div style={{gridColumn:'1 / -1'}}>
                <label style={{display:'block',fontSize:'12px',color:'#6b7280',marginBottom:'4px'}}>البيان (التفاصيل)</label>
                <input value={form.subcategory} placeholder="مثال: فاتورة كهرباء مارس" onChange={e=>setForm(f=>({...f,subcategory:e.target.value}))} style={{width:'100%',border:'1px solid #d1d5db',borderRadius:'8px',padding:'8px 12px',fontSize:'13px',boxSizing:'border-box'}}/>
              </div>
              <div>
                <label style={{display:'block',fontSize:'12px',color:'#6b7280',marginBottom:'4px'}}>المبلغ (ر.س)</label>
                <input type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} style={{width:'100%',border:'1px solid #d1d5db',borderRadius:'8px',padding:'8px 12px',fontSize:'13px',boxSizing:'border-box'}}/>
              </div>
              <div>
                <label style={{display:'block',fontSize:'12px',color:'#6b7280',marginBottom:'4px'}}>دُفع بواسطة</label>
                <select value={form.paidBy} onChange={e=>setForm(f=>({...f,paidBy:e.target.value}))} style={{width:'100%',border:'1px solid #d1d5db',borderRadius:'8px',padding:'8px 12px',fontSize:'13px'}}>
                  <option value="manager">مسؤول العقار</option><option value="owner">المالك</option>
                </select>
              </div>
              <div>
                <label style={{display:'block',fontSize:'12px',color:'#6b7280',marginBottom:'4px'}}>طريقة الدفع</label>
                <select value={form.paymentMethod} onChange={e=>setForm(f=>({...f,paymentMethod:e.target.value}))} style={{width:'100%',border:'1px solid #d1d5db',borderRadius:'8px',padding:'8px 12px',fontSize:'13px'}}>
                  <option value="transfer">تحويل بنكي</option><option value="cash">كاش</option>
                </select>
              </div>
              <div>
                <label style={{display:'block',fontSize:'12px',color:'#6b7280',marginBottom:'4px'}}>ملاحظات</label>
                <input value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} style={{width:'100%',border:'1px solid #d1d5db',borderRadius:'8px',padding:'8px 12px',fontSize:'13px',boxSizing:'border-box'}}/>
              </div>
            </div>
            <div style={{display:'flex',gap:'8px',marginTop:'20px'}}>
              <button onClick={saveExpense} disabled={saving} style={btnPrimary}>{saving?'جارٍ الحفظ...':'حفظ المصروف'}</button>
              <button onClick={()=>setShowModal(false)} style={btnOutline}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const btnPrimary: React.CSSProperties = {padding:'8px 18px',background:'#1B4F72',color:'#fff',border:'none',borderRadius:'8px',cursor:'pointer',fontSize:'13px',fontFamily:'sans-serif'};
const btnOutline: React.CSSProperties = {padding:'8px 18px',background:'#fff',color:'#374151',border:'1px solid #d1d5db',borderRadius:'8px',cursor:'pointer',fontSize:'13px',fontFamily:'sans-serif'};
const selectStyle: React.CSSProperties = {border:'1px solid #d1d5db',borderRadius:'8px',padding:'7px 12px',fontSize:'13px',background:'#fff'};
