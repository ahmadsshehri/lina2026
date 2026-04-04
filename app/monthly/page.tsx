'use client';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import { collection, getDocs, addDoc, updateDoc, doc, query, where, orderBy, serverTimestamp, Timestamp, getDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';

interface Property { id: string; name: string; }
interface Tenant {
  id: string; propertyId: string; unitId: string; unitNumber: string;
  name: string; phone: string; idNumber: string; contractNumber: string;
  contractStart: any; contractEnd: any; paymentCycle: string;
  rentAmount: number; status: string; ejarLinked: boolean;
}
interface Payment {
  id: string; tenantId: string; unitNumber: string; tenantName: string;
  amountDue: number; amountPaid: number; balance: number;
  paidDate: any; paymentMethod: string; referenceNumber: string;
}

const CYCLE: Record<string,string> = { monthly:'شهري', quarterly:'ربع سنوي', semi:'نصف سنوي', annual:'سنوي' };
const METHOD: Record<string,string> = { transfer:'تحويل', cash:'كاش', ejar:'إيجار', stc_pay:'STC Pay' };

function fmtDate(ts: any) {
  if (!ts) return '—';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;
}

export default function MonthlyPage() {
  const router = useRouter();
  const [properties, setProperties] = useState<Property[]>([]);
  const [propId, setPropId] = useState('');
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'tenants'|'payments'|'arrears'>('tenants');
  const [showTenant, setShowTenant] = useState(false);
  const [showPay, setShowPay] = useState<Tenant|null>(null);
  const [editTenant, setEditTenant] = useState<Tenant|null>(null);
  const [saving, setSaving] = useState(false);
  const [tf, setTf] = useState({ unitNumber:'', name:'', phone:'', idNumber:'', contractNumber:'', rentAmount:'', contractStart:'', contractEnd:'', paymentCycle:'monthly', ejarLinked:'false', status:'active' });
  const [pf, setPf] = useState({ amountDue:'', amountPaid:'', paidDate:'', paymentMethod:'transfer', referenceNumber:'' });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push('/login'); return; }
      const snap = await getPropertiesForUserLocal(user.uid);
      const props = snap.docs.map(d => ({ id: d.id, name: (d.data() as any).name }));
      setProperties(props);
      if (props.length > 0) { setPropId(props[0].id); await loadData(props[0].id); }
      setLoading(false);
    });
    return unsub;
  }, []);

  const loadData = async (pid: string) => {
    const [ts, ps] = await Promise.all([
      getDocs(query(collection(db,'tenants'), where('propertyId','==',pid))),
      getDocs(query(collection(db,'rentPayments'), where('propertyId','==',pid))),
    ]);
    setTenants(ts.docs.map(d => ({ id: d.id, ...d.data() } as Tenant)));
    setPayments(ps.docs.map(d => ({ id: d.id, ...d.data() } as Payment)));
  };

  const saveTenant = async () => {
    if (!tf.unitNumber || !tf.name || !propId) return;
    setSaving(true);
    try {
      const data = { ...tf, propertyId: propId, unitId: tf.unitNumber, rentAmount: Number(tf.rentAmount),
        ejarLinked: tf.ejarLinked === 'true',
        contractStart: tf.contractStart ? Timestamp.fromDate(new Date(tf.contractStart)) : null,
        contractEnd: tf.contractEnd ? Timestamp.fromDate(new Date(tf.contractEnd)) : null };
      if (editTenant) { await updateDoc(doc(db,'tenants',editTenant.id), data); }
      else { await addDoc(collection(db,'tenants'), { ...data, createdAt: serverTimestamp() }); }
      await loadData(propId); setShowTenant(false);
    } catch(e) { alert('حدث خطأ'); }
    setSaving(false);
  };

  const savePayment = async () => {
    if (!showPay || !pf.amountPaid) return;
    setSaving(true);
    try {
      await addDoc(collection(db,'rentPayments'), {
        propertyId: propId, tenantId: showPay.id, unitId: showPay.unitId,
        unitNumber: showPay.unitNumber, tenantName: showPay.name,
        amountDue: Number(pf.amountDue || showPay.rentAmount),
        amountPaid: Number(pf.amountPaid),
        balance: Number(pf.amountDue || showPay.rentAmount) - Number(pf.amountPaid),
        paymentMethod: pf.paymentMethod, referenceNumber: pf.referenceNumber,
        paidDate: pf.paidDate ? Timestamp.fromDate(new Date(pf.paidDate)) : Timestamp.now(),
        receivedBy: auth.currentUser?.uid, createdAt: serverTimestamp(),
      });
      await loadData(propId); setShowPay(null);
    } catch(e) { alert('حدث خطأ'); }
    setSaving(false);
  };

  const arrears = tenants.filter(t => {
    if (t.status !== 'active') return false;
    const bal = payments.filter(p => p.tenantId === t.id).reduce((s,p) => s + (p.balance||0), 0);
    return bal > 0;
  });

  if (loading) return <div style={{display:'flex',justifyContent:'center',alignItems:'center',height:'100vh'}}><p>جارٍ التحميل...</p></div>;

  return (
    <div dir="rtl" style={{padding:'20px',fontFamily:'sans-serif',background:'#f9fafb',minHeight:'100vh'}}>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px'}}>
        <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
          <a href="/" style={{color:'#1B4F72',textDecoration:'none',fontSize:'13px'}}>← الرئيسية</a>
          <h1 style={{margin:0,fontSize:'18px',color:'#1B4F72'}}>الإيجار الشهري</h1>
        </div>
        <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
          {properties.length > 1 && (
            <select value={propId} onChange={e=>{setPropId(e.target.value);loadData(e.target.value);}} style={selectStyle}>
              {properties.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <button onClick={()=>{setEditTenant(null);setTf({unitNumber:'',name:'',phone:'',idNumber:'',contractNumber:'',rentAmount:'',contractStart:'',contractEnd:'',paymentCycle:'monthly',ejarLinked:'false',status:'active'});setShowTenant(true);}} style={btnPrimary}>+ مستأجر جديد</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',borderBottom:'2px solid #e5e7eb',marginBottom:'16px',gap:'4px'}}>
        {([['tenants','المستأجرون'],['payments','الدفعات'],['arrears',`المتأخرات (${arrears.length})`]] as [string,string][]).map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id as any)} style={{padding:'8px 16px',border:'none',background:'none',cursor:'pointer',fontSize:'13px',borderBottom:`2px solid ${tab===id?'#1B4F72':'transparent'}`,color:tab===id?'#1B4F72':'#6b7280',marginBottom:'-2px'}}>
            {label}
          </button>
        ))}
      </div>

      {/* Tenants */}
      {tab==='tenants' && (
        <div style={{background:'#fff',borderRadius:'12px',border:'1px solid #e5e7eb',overflow:'hidden'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'13px'}}>
            <thead><tr style={{background:'#f9fafb'}}>
              {['ش','المستأجر','الجوال','بداية العقد','نهاية العقد','دورة الدفع','الإيجار','الحالة',''].map(h=>(
                <th key={h} style={{padding:'10px 12px',textAlign:'right',color:'#6b7280',fontWeight:'500',borderBottom:'1px solid #e5e7eb',whiteSpace:'nowrap'}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {tenants.length===0 && <tr><td colSpan={9} style={{padding:'40px',textAlign:'center',color:'#9ca3af'}}>لا يوجد مستأجرون — أضف مستأجراً جديداً</td></tr>}
              {tenants.map((t,i)=>(
                <tr key={t.id} style={{borderBottom:i<tenants.length-1?'1px solid #f3f4f6':'none'}}>
                  <td style={{padding:'10px 12px',fontWeight:'600',color:'#1B4F72'}}>{t.unitNumber}</td>
                  <td style={{padding:'10px 12px',fontWeight:'500'}}>{t.name}</td>
                  <td style={{padding:'10px 12px',color:'#6b7280'}}>{t.phone}</td>
                  <td style={{padding:'10px 12px',color:'#6b7280',fontSize:'12px'}}>{fmtDate(t.contractStart)}</td>
                  <td style={{padding:'10px 12px',color:'#6b7280',fontSize:'12px'}}>{fmtDate(t.contractEnd)}</td>
                  <td style={{padding:'10px 12px'}}><span style={{background:'#dbeafe',color:'#1d4ed8',padding:'2px 8px',borderRadius:'10px',fontSize:'11px'}}>{CYCLE[t.paymentCycle]||t.paymentCycle}</span></td>
                  <td style={{padding:'10px 12px',fontWeight:'500'}}>{t.rentAmount?.toLocaleString('ar-SA')} ر.س</td>
                  <td style={{padding:'10px 12px'}}><span style={{background:t.status==='active'?'#d1fae5':'#fee2e2',color:t.status==='active'?'#065f46':'#991b1b',padding:'2px 8px',borderRadius:'10px',fontSize:'11px'}}>{t.status==='active'?'نشط':'منتهي'}</span></td>
                  <td style={{padding:'10px 12px'}}>
                    <div style={{display:'flex',gap:'6px'}}>
                      <button onClick={()=>setShowPay(t)} style={{padding:'4px 10px',background:'#1B4F72',color:'#fff',border:'none',borderRadius:'6px',cursor:'pointer',fontSize:'12px'}}>دفعة</button>
                      <button onClick={()=>{setEditTenant(t);setTf({unitNumber:t.unitNumber,name:t.name,phone:t.phone||'',idNumber:t.idNumber||'',contractNumber:t.contractNumber||'',rentAmount:String(t.rentAmount),contractStart:'',contractEnd:'',paymentCycle:t.paymentCycle,ejarLinked:String(t.ejarLinked),status:t.status});setShowTenant(true);}} style={{padding:'4px 10px',border:'1px solid #d1d5db',borderRadius:'6px',background:'#fff',cursor:'pointer',fontSize:'12px'}}>تعديل</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Payments */}
      {tab==='payments' && (
        <div style={{background:'#fff',borderRadius:'12px',border:'1px solid #e5e7eb',overflow:'hidden'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'13px'}}>
            <thead><tr style={{background:'#f9fafb'}}>
              {['تاريخ الدفع','الشقة','المستأجر','المطلوب','المدفوع','الرصيد','الطريقة','مرجع'].map(h=>(
                <th key={h} style={{padding:'10px 12px',textAlign:'right',color:'#6b7280',fontWeight:'500',borderBottom:'1px solid #e5e7eb'}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {payments.length===0 && <tr><td colSpan={8} style={{padding:'40px',textAlign:'center',color:'#9ca3af'}}>لا توجد دفعات مسجلة</td></tr>}
              {payments.map((p,i)=>(
                <tr key={p.id} style={{borderBottom:i<payments.length-1?'1px solid #f3f4f6':'none'}}>
                  <td style={{padding:'10px 12px',color:'#6b7280',fontSize:'12px'}}>{fmtDate(p.paidDate)}</td>
                  <td style={{padding:'10px 12px',fontWeight:'600',color:'#1B4F72'}}>{p.unitNumber}</td>
                  <td style={{padding:'10px 12px'}}>{p.tenantName}</td>
                  <td style={{padding:'10px 12px'}}>{p.amountDue?.toLocaleString('ar-SA')}</td>
                  <td style={{padding:'10px 12px',color:'#16a34a',fontWeight:'500'}}>{p.amountPaid?.toLocaleString('ar-SA')}</td>
                  <td style={{padding:'10px 12px',color:p.balance>0?'#dc2626':'#16a34a'}}>{p.balance>0?p.balance?.toLocaleString('ar-SA'):'✓'}</td>
                  <td style={{padding:'10px 12px'}}><span style={{background:'#dbeafe',color:'#1d4ed8',padding:'2px 8px',borderRadius:'10px',fontSize:'11px'}}>{METHOD[p.paymentMethod]||p.paymentMethod}</span></td>
                  <td style={{padding:'10px 12px',color:'#9ca3af',fontSize:'12px'}}>{p.referenceNumber||'—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Arrears */}
      {tab==='arrears' && (
        <div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'12px',marginBottom:'16px'}}>
            {[['إجمالي المتأخرات',arrears.reduce((s,t)=>s+payments.filter(p=>p.tenantId===t.id).reduce((x,p)=>x+(p.balance||0),0),0).toLocaleString('ar-SA')+' ر.س','#dc2626'],['عدد المتأخرين',arrears.length,'#d97706'],['من المستأجرين النشطين',tenants.filter(t=>t.status==='active').length,'#1B4F72']].map(([l,v,c])=>(
              <div key={String(l)} style={{background:'#fff',borderRadius:'12px',padding:'16px',border:'1px solid #e5e7eb',textAlign:'center'}}>
                <div style={{fontSize:'20px',fontWeight:'600',color:String(c)}}>{v}</div>
                <div style={{fontSize:'12px',color:'#6b7280',marginTop:'4px'}}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{background:'#fff',borderRadius:'12px',border:'1px solid #e5e7eb',overflow:'hidden'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:'13px'}}>
              <thead><tr style={{background:'#f9fafb'}}>
                {['الشقة','المستأجر','الجوال','المبلغ المتأخر','دورة الدفع','إجراء'].map(h=>(
                  <th key={h} style={{padding:'10px 12px',textAlign:'right',color:'#6b7280',fontWeight:'500',borderBottom:'1px solid #e5e7eb'}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {arrears.length===0 && <tr><td colSpan={6} style={{padding:'40px',textAlign:'center',color:'#9ca3af'}}>لا توجد متأخرات ✓</td></tr>}
                {arrears.map((t,i)=>{
                  const bal=payments.filter(p=>p.tenantId===t.id).reduce((s,p)=>s+(p.balance||0),0);
                  return (
                    <tr key={t.id} style={{borderBottom:i<arrears.length-1?'1px solid #f3f4f6':'none',background:'#fff9f9'}}>
                      <td style={{padding:'10px 12px',fontWeight:'600',color:'#1B4F72'}}>{t.unitNumber}</td>
                      <td style={{padding:'10px 12px',fontWeight:'500'}}>{t.name}</td>
                      <td style={{padding:'10px 12px',color:'#6b7280'}}>{t.phone}</td>
                      <td style={{padding:'10px 12px',fontWeight:'600',color:'#dc2626'}}>{bal.toLocaleString('ar-SA')} ر.س</td>
                      <td style={{padding:'10px 12px'}}><span style={{background:'#dbeafe',color:'#1d4ed8',padding:'2px 8px',borderRadius:'10px',fontSize:'11px'}}>{CYCLE[t.paymentCycle]}</span></td>
                      <td style={{padding:'10px 12px'}}><button onClick={()=>setShowPay(t)} style={{padding:'5px 12px',background:'#1B4F72',color:'#fff',border:'none',borderRadius:'6px',cursor:'pointer',fontSize:'12px'}}>تسجيل دفعة</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tenant Modal */}
      {showTenant && (
        <div style={{position:'fixed',inset:'0',background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}} onClick={()=>setShowTenant(false)}>
          <div style={{background:'#fff',borderRadius:'16px',padding:'24px',width:'520px',maxWidth:'95vw',maxHeight:'90vh',overflowY:'auto'}} onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:'20px'}}>
              <h2 style={{margin:0,fontSize:'16px',color:'#1B4F72'}}>{editTenant?'تعديل المستأجر':'إضافة مستأجر جديد'}</h2>
              <button onClick={()=>setShowTenant(false)} style={{border:'none',background:'none',fontSize:'20px',cursor:'pointer',color:'#6b7280'}}>✕</button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px'}}>
              {[['unitNumber','رقم الشقة','05'],['name','اسم المستأجر',''],['phone','رقم الجوال','05xxxxxxxx'],['idNumber','رقم الهوية',''],['contractNumber','رقم العقد',''],['rentAmount','قيمة الإيجار (ر.س)','2000'],['contractStart','بداية العقد','date'],['contractEnd','نهاية العقد','date']].map(([k,l,p])=>(
                <div key={k}>
                  <label style={{display:'block',fontSize:'12px',color:'#6b7280',marginBottom:'4px'}}>{l}</label>
                  <input type={p==='date'?'date':'text'} value={(tf as any)[k]} placeholder={p!=='date'?p:''} onChange={e=>setTf(f=>({...f,[k]:e.target.value}))}
                    style={{width:'100%',border:'1px solid #d1d5db',borderRadius:'8px',padding:'8px 12px',fontSize:'13px',boxSizing:'border-box'}}/>
                </div>
              ))}
              <div>
                <label style={{display:'block',fontSize:'12px',color:'#6b7280',marginBottom:'4px'}}>دورة الدفع</label>
                <select value={tf.paymentCycle} onChange={e=>setTf(f=>({...f,paymentCycle:e.target.value}))} style={{width:'100%',border:'1px solid #d1d5db',borderRadius:'8px',padding:'8px 12px',fontSize:'13px'}}>
                  <option value="monthly">شهري</option><option value="quarterly">ربع سنوي</option><option value="semi">نصف سنوي</option><option value="annual">سنوي</option>
                </select>
              </div>
              <div>
                <label style={{display:'block',fontSize:'12px',color:'#6b7280',marginBottom:'4px'}}>ربط إيجار</label>
                <select value={tf.ejarLinked} onChange={e=>setTf(f=>({...f,ejarLinked:e.target.value}))} style={{width:'100%',border:'1px solid #d1d5db',borderRadius:'8px',padding:'8px 12px',fontSize:'13px'}}>
                  <option value="false">لا</option><option value="true">نعم</option>
                </select>
              </div>
            </div>
            <div style={{display:'flex',gap:'8px',marginTop:'20px'}}>
              <button onClick={saveTenant} disabled={saving} style={btnPrimary}>{saving?'جارٍ الحفظ...':editTenant?'حفظ التعديلات':'إضافة المستأجر'}</button>
              <button onClick={()=>setShowTenant(false)} style={btnOutline}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPay && (
        <div style={{position:'fixed',inset:'0',background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}} onClick={()=>setShowPay(null)}>
          <div style={{background:'#fff',borderRadius:'16px',padding:'24px',width:'420px',maxWidth:'95vw'}} onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:'16px'}}>
              <h2 style={{margin:0,fontSize:'16px',color:'#1B4F72'}}>دفعة — شقة {showPay.unitNumber} ({showPay.name})</h2>
              <button onClick={()=>setShowPay(null)} style={{border:'none',background:'none',fontSize:'20px',cursor:'pointer',color:'#6b7280'}}>✕</button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px'}}>
              {[['amountDue','المبلغ المطلوب',String(showPay.rentAmount)],['amountPaid','المبلغ المدفوع',''],['referenceNumber','رقم المرجع','']].map(([k,l,p])=>(
                <div key={k} style={{gridColumn:k==='referenceNumber'?'1 / -1':'auto'}}>
                  <label style={{display:'block',fontSize:'12px',color:'#6b7280',marginBottom:'4px'}}>{l}</label>
                  <input type="number" value={(pf as any)[k]} placeholder={p} onChange={e=>setPf(f=>({...f,[k]:e.target.value}))}
                    style={{width:'100%',border:'1px solid #d1d5db',borderRadius:'8px',padding:'8px 12px',fontSize:'13px',boxSizing:'border-box'}}/>
                </div>
              ))}
              <div>
                <label style={{display:'block',fontSize:'12px',color:'#6b7280',marginBottom:'4px'}}>تاريخ الدفع</label>
                <input type="date" value={pf.paidDate} onChange={e=>setPf(f=>({...f,paidDate:e.target.value}))} style={{width:'100%',border:'1px solid #d1d5db',borderRadius:'8px',padding:'8px 12px',fontSize:'13px',boxSizing:'border-box'}}/>
              </div>
              <div>
                <label style={{display:'block',fontSize:'12px',color:'#6b7280',marginBottom:'4px'}}>طريقة الدفع</label>
                <select value={pf.paymentMethod} onChange={e=>setPf(f=>({...f,paymentMethod:e.target.value}))} style={{width:'100%',border:'1px solid #d1d5db',borderRadius:'8px',padding:'8px 12px',fontSize:'13px'}}>
                  <option value="transfer">تحويل بنكي</option><option value="cash">كاش</option><option value="ejar">منصة إيجار</option><option value="stc_pay">STC Pay</option>
                </select>
              </div>
            </div>
            <div style={{display:'flex',gap:'8px',marginTop:'20px'}}>
              <button onClick={savePayment} disabled={saving} style={btnPrimary}>{saving?'جارٍ الحفظ...':'تسجيل الدفعة'}</button>
              <button onClick={()=>setShowPay(null)} style={btnOutline}>إلغاء</button>
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
