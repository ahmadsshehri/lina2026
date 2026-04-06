'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../../../lib/firebase';
import {
  doc, getDoc, getDocs, updateDoc, addDoc, deleteDoc,
  collection, query, where, serverTimestamp, Timestamp
} from 'firebase/firestore';
import { getCurrentUser, AppUserBasic } from '../../../lib/userHelpers';

interface Tenant {
  id: string; propertyId: string; unitId: string; unitNumber: string;
  name: string; phone: string; idNumber: string; contractNumber: string;
  contractStart: any; contractEnd: any; paymentCycle: string;
  rentAmount: number; status: string; notes?: string;
}
interface Payment {
  id: string; amountDue: number; amountPaid: number; balance: number;
  paidDate: any; paymentMethod: string; referenceNumber: string;
  receivedBy: string; deleteRequested?: boolean;
}

const CYCLE: Record<string,string> = { monthly:'شهري', quarterly:'ربع سنوي', semi:'نصف سنوي', annual:'سنوي' };
const METHOD: Record<string,string> = { transfer:'تحويل بنكي', cash:'كاش', ejar:'إيجار', stc_pay:'STC Pay' };

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
function monthLabel(d: Date) {
  return d.toLocaleDateString('ar-SA', { month:'long', year:'numeric' });
}

export default function TenantDetailPage() {
  const params = useParams();
  const router = useRouter();
  const tenantId = params.id as string;

  const [appUser, setAppUser] = useState<AppUserBasic | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile'|'payments'|'schedule'>('profile');
  const [editMode, setEditMode] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [editPayment, setEditPayment] = useState<Payment | null>(null);
  const [deletePayConfirm, setDeletePayConfirm] = useState<Payment | null>(null);

  const [form, setForm] = useState({
    name:'', phone:'', idNumber:'', contractNumber:'',
    rentAmount:'', contractStart:'', contractEnd:'',
    paymentCycle:'monthly', status:'active', notes:'',
  });
  const [pf, setPf] = useState({
    amountDue:'', amountPaid:'', paidDate:'',
    paymentMethod:'transfer', referenceNumber:'',
    receivedBy:'manager',
  });

  const canDelete = appUser?.role === 'owner';
  const canEdit   = appUser?.role === 'owner' || appUser?.role === 'manager';

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) { router.push('/login'); return; }
      const user = await getCurrentUser(fbUser.uid);
      if (!user) { router.push('/login'); return; }
      setAppUser(user);
      await loadTenant();
      setLoading(false);
    });
    return unsub;
  }, [tenantId]);

  const loadTenant = async () => {
    const tSnap = await getDoc(doc(db, 'tenants', tenantId));
    if (!tSnap.exists()) { router.push('/monthly'); return; }
    const t = { id: tSnap.id, ...tSnap.data() } as Tenant;
    setTenant(t);
    setForm({
      name: t.name, phone: t.phone||'', idNumber: t.idNumber||'',
      contractNumber: t.contractNumber||'', rentAmount: String(t.rentAmount||0),
      contractStart: toInputDate(t.contractStart), contractEnd: toInputDate(t.contractEnd),
      paymentCycle: t.paymentCycle||'monthly', status: t.status||'active', notes: t.notes||'',
    });

    const pSnap = await getDocs(query(collection(db,'rentPayments'), where('tenantId','==',tenantId)));
    setPayments(pSnap.docs.map(d=>({id:d.id,...d.data()} as Payment)).sort((a,b)=>(b.paidDate?.seconds||0)-(a.paidDate?.seconds||0)));
  };

  const saveTenant = async () => {
    if (!tenant || !canEdit) return;
    setSaving(true);
    try {
      await updateDoc(doc(db,'tenants',tenant.id), {
        name: form.name, phone: form.phone, idNumber: form.idNumber,
        contractNumber: form.contractNumber, rentAmount: Number(form.rentAmount),
        contractStart: form.contractStart ? Timestamp.fromDate(new Date(form.contractStart)) : null,
        contractEnd: form.contractEnd ? Timestamp.fromDate(new Date(form.contractEnd)) : null,
        paymentCycle: form.paymentCycle, status: form.status, notes: form.notes,
      });
      await loadTenant();
      setEditMode(false);
    } catch (e) { alert('حدث خطأ'); }
    setSaving(false);
  };

  const savePayment = async () => {
    if (!tenant || !pf.amountPaid) return;
    setSaving(true);
    try {
      const data = {
        propertyId: tenant.propertyId, tenantId: tenant.id,
        unitId: tenant.unitId, unitNumber: tenant.unitNumber, tenantName: tenant.name,
        amountDue: Number(pf.amountDue || tenant.rentAmount),
        amountPaid: Number(pf.amountPaid),
        balance: Number(pf.amountDue || tenant.rentAmount) - Number(pf.amountPaid),
        paymentMethod: pf.paymentMethod, referenceNumber: pf.referenceNumber,
        receivedBy: pf.receivedBy,
        paidDate: pf.paidDate ? Timestamp.fromDate(new Date(pf.paidDate)) : Timestamp.now(),
        recordedBy: auth.currentUser?.uid,
      };
      if (editPayment) {
        await updateDoc(doc(db,'rentPayments',editPayment.id), data);
      } else {
        await addDoc(collection(db,'rentPayments'), { ...data, createdAt: serverTimestamp() });
      }
      await loadTenant();
      setShowPayModal(false);
      setEditPayment(null);
      setPf({ amountDue:'', amountPaid:'', paidDate:'', paymentMethod:'transfer', referenceNumber:'', receivedBy:'manager' });
    } catch (e) { alert('حدث خطأ'); }
    setSaving(false);
  };

  const deletePayment = async () => {
    if (!deletePayConfirm || !canDelete) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db,'rentPayments',deletePayConfirm.id));
      await loadTenant();
      setDeletePayConfirm(null);
    } catch (e) { alert('حدث خطأ'); }
    setSaving(false);
  };

  const openEditPayment = (p: Payment) => {
    setEditPayment(p);
    setPf({
      amountDue: String(p.amountDue), amountPaid: String(p.amountPaid),
      paidDate: toInputDate(p.paidDate), paymentMethod: p.paymentMethod,
      referenceNumber: p.referenceNumber||'', receivedBy: p.receivedBy||'manager',
    });
    setShowPayModal(true);
  };

  // ─── جدول السداد المتوقع ───────────────────────────────────
  const buildSchedule = () => {
    if (!tenant) return [];
    const start = tenant.contractStart?.toDate ? tenant.contractStart.toDate() : tenant.contractStart ? new Date(tenant.contractStart) : null;
    const end   = tenant.contractEnd?.toDate   ? tenant.contractEnd.toDate()   : tenant.contractEnd   ? new Date(tenant.contractEnd)   : null;
    if (!start || !end) return [];

    const schedule = [];
    const cycleMonths: Record<string,number> = { monthly:1, quarterly:3, semi:6, annual:12 };
    const step = cycleMonths[tenant.paymentCycle] || 1;
    let cur = new Date(start.getFullYear(), start.getMonth(), 1);
    const endDate = new Date(end.getFullYear(), end.getMonth(), 1);

    while (cur <= endDate) {
      const periodStart = new Date(cur);
      const periodEnd   = new Date(cur.getFullYear(), cur.getMonth() + step - 1, 28);

      // هل هناك دفعة لهذه الفترة؟
      const periodPaid = payments.filter(p => {
        const d = p.paidDate?.toDate ? p.paidDate.toDate() : new Date(p.paidDate);
        return d >= periodStart && d <= new Date(periodEnd.getFullYear(), periodEnd.getMonth()+1, 0);
      });
      const totalPaid = periodPaid.reduce((s,p) => s+(p.amountPaid||0), 0);
      const due = tenant.rentAmount * step;
      const balance = Math.max(0, due - totalPaid);

      schedule.push({
        label: step === 1 ? monthLabel(cur) : `${monthLabel(cur)} — ${monthLabel(new Date(periodEnd))}`,
        due,
        paid: totalPaid,
        balance,
        status: totalPaid >= due ? 'paid' : totalPaid > 0 ? 'partial' : new Date() > periodEnd ? 'late' : 'upcoming',
      });

      cur = new Date(cur.getFullYear(), cur.getMonth() + step, 1);
    }
    return schedule;
  };

  const schedule = buildSchedule();
  const totalPaid    = payments.reduce((s,p)=>s+(p.amountPaid||0),0);
  const totalBalance = payments.reduce((s,p)=>s+(p.balance||0),0);
  const totalExpected = schedule.reduce((s,r)=>s+r.due,0);

  if (loading) return (
    <div style={{display:'flex',justifyContent:'center',alignItems:'center',height:'100vh'}}>
      <div style={{width:'40px',height:'40px',border:'3px solid #1B4F72',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (!tenant) return null;

  const statusInfo = tenant.status === 'active'
    ? { label:'نشط', color:'#065f46', bg:'#d1fae5' }
    : { label:'منتهي', color:'#991b1b', bg:'#fee2e2' };

  return (
    <div dir="rtl" style={{fontFamily:'sans-serif',background:'#f9fafb',minHeight:'100vh'}}>

      {/* Top bar */}
      <div style={{background:'#1B4F72',padding:'16px 20px',display:'flex',alignItems:'center',gap:'12px',position:'sticky',top:0,zIndex:50}}>
        <button onClick={()=>router.push('/monthly')} style={{background:'rgba(255,255,255,0.15)',border:'none',borderRadius:'8px',padding:'8px 12px',cursor:'pointer'}}>
          <span style={{color:'#fff',fontSize:'18px'}}>←</span>
        </button>
        <div style={{flex:1}}>
          <h1 style={{margin:0,fontSize:'17px',fontWeight:'600',color:'#fff'}}>{tenant.name}</h1>
          <p style={{margin:0,fontSize:'12px',color:'rgba(255,255,255,0.6)'}}>شقة {tenant.unitNumber} · {CYCLE[tenant.paymentCycle]}</p>
        </div>
        <span style={{background:statusInfo.bg,color:statusInfo.color,padding:'4px 12px',borderRadius:'20px',fontSize:'12px',fontWeight:'600'}}>
          {statusInfo.label}
        </span>
      </div>

      <div style={{padding:'16px',maxWidth:'700px',margin:'0 auto'}}>

        {/* KPIs */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'10px',marginBottom:'16px'}}>
          {[
            {label:'إجمالي المدفوع',val:totalPaid.toLocaleString('ar-SA')+' ر.س',color:'#16a34a',bg:'#d1fae5'},
            {label:'المتأخرات',val:totalBalance.toLocaleString('ar-SA')+' ر.س',color:totalBalance>0?'#dc2626':'#16a34a',bg:totalBalance>0?'#fee2e2':'#d1fae5'},
            {label:'الإيجار الشهري',val:tenant.rentAmount.toLocaleString('ar-SA')+' ر.س',color:'#1B4F72',bg:'#dbeafe'},
          ].map(k=>(
            <div key={k.label} style={{background:k.bg,borderRadius:'14px',padding:'14px 12px',textAlign:'center'}}>
              <div style={{fontSize:'16px',fontWeight:'700',color:k.color}}>{k.val}</div>
              <div style={{fontSize:'11px',color:'#6b7280',marginTop:'3px'}}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{display:'flex',background:'#fff',borderRadius:'12px',padding:'4px',marginBottom:'16px',border:'1px solid #e5e7eb',gap:'2px'}}>
          {([['profile','👤 الملف الشخصي'],['payments','💳 الدفعات'],['schedule','📅 جدول السداد']] as const).map(([id,label])=>(
            <button key={id} onClick={()=>setActiveTab(id)}
              style={{flex:1,padding:'9px 4px',border:'none',borderRadius:'10px',cursor:'pointer',fontSize:'12px',fontWeight:activeTab===id?'600':'400',background:activeTab===id?'#1B4F72':'transparent',color:activeTab===id?'#fff':'#6b7280',transition:'all 0.15s'}}>
              {label}
            </button>
          ))}
        </div>

        {/* ══ TAB: الملف الشخصي ══ */}
        {activeTab==='profile'&&(
          <div style={{background:'#fff',borderRadius:'16px',border:'1px solid #e5e7eb',overflow:'hidden'}}>
            <div style={{padding:'16px',borderBottom:'1px solid #f3f4f6',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{fontSize:'14px',fontWeight:'600',color:'#374151'}}>بيانات المستأجر</span>
              {canEdit&&(
                <button onClick={()=>setEditMode(!editMode)}
                  style={{padding:'7px 16px',background:editMode?'#f3f4f6':'#1B4F72',color:editMode?'#374151':'#fff',border:'none',borderRadius:'8px',cursor:'pointer',fontSize:'13px'}}>
                  {editMode?'إلغاء':'✏️ تعديل'}
                </button>
              )}
            </div>
            <div style={{padding:'16px'}}>
              {editMode?(
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px'}}>
                  {[
                    ['name','اسم المستأجر','text'],
                    ['phone','رقم الجوال','tel'],
                    ['idNumber','رقم الهوية','text'],
                    ['contractNumber','رقم العقد','text'],
                    ['rentAmount','الإيجار (ر.س)','number'],
                    ['unitNumber','رقم الشقة','text'],
                    ['contractStart','بداية العقد','date'],
                    ['contractEnd','نهاية العقد','date'],
                  ].map(([k,l,t])=>(
                    <div key={k}>
                      <label style={lbl}>{l}</label>
                      <input type={t} value={(form as any)[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} style={inp}
                        disabled={k==='unitNumber'}/>
                    </div>
                  ))}
                  <div>
                    <label style={lbl}>دورة الدفع</label>
                    <select value={form.paymentCycle} onChange={e=>setForm(f=>({...f,paymentCycle:e.target.value}))} style={inp}>
                      <option value="monthly">شهري</option>
                      <option value="quarterly">ربع سنوي</option>
                      <option value="semi">نصف سنوي</option>
                      <option value="annual">سنوي</option>
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>حالة العقد</label>
                    <select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))} style={inp}>
                      <option value="active">نشط</option>
                      <option value="expired">منتهي</option>
                      <option value="terminated">مُنهى</option>
                    </select>
                  </div>
                  <div style={{gridColumn:'1 / -1'}}>
                    <label style={lbl}>ملاحظات</label>
                    <textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={3}
                      style={{...inp,resize:'none'}}/>
                  </div>
                  <div style={{gridColumn:'1 / -1',display:'flex',gap:'10px',marginTop:'4px'}}>
                    <button onClick={saveTenant} disabled={saving}
                      style={{flex:1,padding:'12px',background:saving?'#9ca3af':'#1B4F72',color:'#fff',border:'none',borderRadius:'10px',cursor:'pointer',fontSize:'14px',fontWeight:'600'}}>
                      {saving?'جارٍ الحفظ...':'💾 حفظ التعديلات'}
                    </button>
                    <button onClick={()=>setEditMode(false)} style={{padding:'12px 20px',background:'#f3f4f6',color:'#374151',border:'none',borderRadius:'10px',cursor:'pointer',fontSize:'14px'}}>إلغاء</button>
                  </div>
                </div>
              ):(
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0'}}>
                  {[
                    ['👤 الاسم', tenant.name],
                    ['📞 الجوال', tenant.phone||'—'],
                    ['🪪 رقم الهوية', tenant.idNumber||'—'],
                    ['📄 رقم العقد', tenant.contractNumber||'—'],
                    ['🏠 رقم الشقة', tenant.unitNumber],
                    ['💰 الإيجار', tenant.rentAmount.toLocaleString('ar-SA')+' ر.س'],
                    ['🔄 دورة الدفع', CYCLE[tenant.paymentCycle]||tenant.paymentCycle],
                    ['📅 بداية العقد', fmtDate(tenant.contractStart)],
                    ['📅 نهاية العقد', fmtDate(tenant.contractEnd)],
                    ['📊 الحالة', tenant.status==='active'?'نشط':'منتهي'],
                  ].map(([l,v],i)=>(
                    <div key={String(l)} style={{padding:'12px 14px',borderBottom:'1px solid #f3f4f6',background:i%4<2?'#fafafa':'#fff'}}>
                      <div style={{fontSize:'11px',color:'#9ca3af',marginBottom:'3px'}}>{l}</div>
                      <div style={{fontSize:'14px',fontWeight:'600',color:'#111827'}}>{v}</div>
                    </div>
                  ))}
                  {tenant.notes&&(
                    <div style={{gridColumn:'1 / -1',padding:'12px 14px',borderBottom:'1px solid #f3f4f6'}}>
                      <div style={{fontSize:'11px',color:'#9ca3af',marginBottom:'3px'}}>📝 ملاحظات</div>
                      <div style={{fontSize:'13px',color:'#374151'}}>{tenant.notes}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ TAB: الدفعات ══ */}
        {activeTab==='payments'&&(
          <div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'12px'}}>
              <span style={{fontSize:'14px',fontWeight:'600',color:'#374151'}}>سجل الدفعات ({payments.length})</span>
              <button onClick={()=>{setEditPayment(null);setPf({amountDue:String(tenant.rentAmount),amountPaid:'',paidDate:'',paymentMethod:'transfer',referenceNumber:'',receivedBy:'manager'});setShowPayModal(true);}}
                style={{padding:'9px 16px',background:'#1B4F72',color:'#fff',border:'none',borderRadius:'10px',cursor:'pointer',fontSize:'13px',fontWeight:'600'}}>
                + تسجيل دفعة
              </button>
            </div>

            {payments.length===0?(
              <div style={{background:'#fff',borderRadius:'16px',padding:'40px',textAlign:'center',border:'1px solid #e5e7eb'}}>
                <div style={{fontSize:'48px',marginBottom:'12px'}}>💳</div>
                <p style={{color:'#6b7280',margin:'0 0 16px'}}>لا توجد دفعات مسجلة</p>
              </div>
            ):(
              <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
                {payments.map(p=>(
                  <div key={p.id} style={{background:'#fff',borderRadius:'14px',border:'1px solid #e5e7eb',overflow:'hidden'}}>
                    <div style={{padding:'14px 16px',display:'flex',alignItems:'center',gap:'12px'}}>
                      {/* مؤشر السداد */}
                      <div style={{width:'4px',height:'48px',borderRadius:'2px',background:p.balance===0?'#16a34a':p.balance<p.amountDue?'#d97706':'#dc2626',flexShrink:0}}/>
                      <div style={{flex:1}}>
                        <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'4px'}}>
                          <span style={{fontSize:'14px',fontWeight:'700',color:'#16a34a'}}>{p.amountPaid?.toLocaleString('ar-SA')} ر.س</span>
                          {p.balance>0&&<span style={{fontSize:'12px',color:'#dc2626'}}>متبقي: {p.balance?.toLocaleString('ar-SA')} ر.س</span>}
                        </div>
                        <div style={{display:'flex',gap:'10px',fontSize:'11px',color:'#9ca3af',flexWrap:'wrap'}}>
                          <span>{fmtDate(p.paidDate)}</span>
                          <span>· {METHOD[p.paymentMethod]||p.paymentMethod}</span>
                          <span style={{background:p.receivedBy==='owner'?'#ede9fe':'#dbeafe',color:p.receivedBy==='owner'?'#7c3aed':'#1e40af',padding:'0 6px',borderRadius:'6px'}}>
                            {p.receivedBy==='owner'?'👑 المالك':'👤 المسؤول'}
                          </span>
                          {p.referenceNumber&&<span>· #{p.referenceNumber}</span>}
                        </div>
                      </div>
                      {/* إجراءات */}
                      {canEdit&&(
                        <div style={{display:'flex',gap:'6px'}}>
                          <button onClick={()=>openEditPayment(p)}
                            style={{padding:'5px 10px',border:'1px solid #d1d5db',borderRadius:'8px',background:'#fff',cursor:'pointer',fontSize:'12px'}}>
                            ✏️
                          </button>
                          {canDelete&&(
                            <button onClick={()=>setDeletePayConfirm(p)}
                              style={{padding:'5px 10px',border:'1px solid #fca5a5',borderRadius:'8px',background:'#fff',cursor:'pointer',fontSize:'12px',color:'#dc2626'}}>
                              🗑️
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ملخص */}
            {payments.length>0&&(
              <div style={{background:'#fff',borderRadius:'14px',border:'1px solid #e5e7eb',padding:'16px',marginTop:'16px'}}>
                <div style={{fontSize:'13px',fontWeight:'600',color:'#374151',marginBottom:'12px'}}>ملخص مالي</div>
                {[
                  ['إجمالي المدفوع',totalPaid.toLocaleString('ar-SA')+' ر.س','#16a34a'],
                  ['إجمالي المتأخرات',totalBalance.toLocaleString('ar-SA')+' ر.س',totalBalance>0?'#dc2626':'#16a34a'],
                  ['عدد الدفعات',payments.length+' دفعة','#1B4F72'],
                ].map(([l,v,c])=>(
                  <div key={String(l)} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid #f3f4f6'}}>
                    <span style={{fontSize:'13px',color:'#6b7280'}}>{l}</span>
                    <span style={{fontSize:'14px',fontWeight:'600',color:String(c)}}>{v}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══ TAB: جدول السداد ══ */}
        {activeTab==='schedule'&&(
          <div>
            <div style={{background:'#fff',borderRadius:'14px',border:'1px solid #e5e7eb',padding:'16px',marginBottom:'14px'}}>
              <div style={{fontSize:'13px',fontWeight:'600',color:'#374151',marginBottom:'12px'}}>ملخص جدول السداد</div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'10px'}}>
                {[
                  {label:'إجمالي المطلوب',val:totalExpected.toLocaleString('ar-SA')+' ر.س',color:'#1B4F72',bg:'#dbeafe'},
                  {label:'إجمالي المدفوع',val:totalPaid.toLocaleString('ar-SA')+' ر.س',color:'#16a34a',bg:'#d1fae5'},
                  {label:'المتأخرات',val:Math.max(0,totalExpected-totalPaid).toLocaleString('ar-SA')+' ر.س',color:(totalExpected-totalPaid)>0?'#dc2626':'#16a34a',bg:(totalExpected-totalPaid)>0?'#fee2e2':'#d1fae5'},
                ].map(k=>(
                  <div key={k.label} style={{background:k.bg,borderRadius:'10px',padding:'12px',textAlign:'center'}}>
                    <div style={{fontSize:'14px',fontWeight:'700',color:k.color}}>{k.val}</div>
                    <div style={{fontSize:'10px',color:'#6b7280',marginTop:'2px'}}>{k.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* مفتاح الألوان */}
            <div style={{display:'flex',gap:'12px',marginBottom:'12px',flexWrap:'wrap',fontSize:'11px',color:'#6b7280'}}>
              {[['#d1fae5','#065f46','مسدد'],['#fef3c7','#92400e','جزئي'],['#fee2e2','#dc2626','متأخر'],['#f0f9ff','#1e40af','قادم']].map(([bg,color,label])=>(
                <div key={label as string} style={{display:'flex',alignItems:'center',gap:'5px'}}>
                  <div style={{width:'12px',height:'12px',borderRadius:'3px',background:bg as string}}/>
                  {label}
                </div>
              ))}
            </div>

            {schedule.length===0?(
              <div style={{background:'#fff',borderRadius:'16px',padding:'40px',textAlign:'center',border:'1px solid #e5e7eb'}}>
                <div style={{fontSize:'48px',marginBottom:'12px'}}>📅</div>
                <p style={{color:'#6b7280'}}>أضف تواريخ العقد لعرض جدول السداد</p>
              </div>
            ):(
              <div style={{background:'#fff',borderRadius:'14px',border:'1px solid #e5e7eb',overflow:'hidden'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:'13px'}}>
                  <thead style={{background:'#1B4F72'}}>
                    <tr>
                      {['الفترة','المطلوب','المدفوع','المتأخر','الحالة'].map(h=>(
                        <th key={h} style={{padding:'10px 12px',textAlign:'right',color:'#fff',fontWeight:'500'}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.map((row,i)=>{
                      const colors = {
                        paid:    {bg:'#d1fae5',color:'#065f46',label:'✅ مسدد'},
                        partial: {bg:'#fef3c7',color:'#92400e',label:'⚠️ جزئي'},
                        late:    {bg:'#fee2e2',color:'#dc2626',label:'🔴 متأخر'},
                        upcoming:{bg:'#f0f9ff',color:'#1e40af',label:'📅 قادم'},
                      }[row.status]||{bg:'#f3f4f6',color:'#374151',label:row.status};
                      return (
                        <tr key={i} style={{borderBottom:'1px solid #f3f4f6',background:i%2===0?'#fafafa':'#fff'}}>
                          <td style={{padding:'11px 12px',fontWeight:'500',color:'#374151'}}>{row.label}</td>
                          <td style={{padding:'11px 12px',color:'#1B4F72',fontWeight:'600'}}>{row.due.toLocaleString('ar-SA')} ر.س</td>
                          <td style={{padding:'11px 12px',color:'#16a34a',fontWeight:'600'}}>{row.paid>0?row.paid.toLocaleString('ar-SA')+' ر.س':'—'}</td>
                          <td style={{padding:'11px 12px',color:row.balance>0?'#dc2626':'#16a34a',fontWeight:'600'}}>
                            {row.balance>0?row.balance.toLocaleString('ar-SA')+' ر.س':'✓'}
                          </td>
                          <td style={{padding:'11px 12px'}}>
                            <span style={{background:colors.bg,color:colors.color,padding:'3px 10px',borderRadius:'8px',fontSize:'11px',fontWeight:'600'}}>
                              {colors.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal دفعة */}
      {showPayModal&&(
        <div style={{position:'fixed',inset:'0',background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:1000}}
          onClick={()=>setShowPayModal(false)}>
          <div style={{background:'#fff',borderRadius:'20px 20px 0 0',padding:'24px',width:'100%',maxWidth:'500px',maxHeight:'90vh',overflowY:'auto'}}
            onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'20px'}}>
              <h2 style={{margin:0,fontSize:'17px',color:'#1B4F72',fontWeight:'600'}}>
                {editPayment?'تعديل دفعة':'تسجيل دفعة — '+tenant.name}
              </h2>
              <button onClick={()=>setShowPayModal(false)} style={{border:'none',background:'#f3f4f6',borderRadius:'50%',width:'32px',height:'32px',cursor:'pointer',fontSize:'16px'}}>✕</button>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px'}}>
                <div>
                  <label style={lbl}>المبلغ المطلوب (ر.س)</label>
                  <input type="number" value={pf.amountDue||tenant.rentAmount} onChange={e=>setPf(f=>({...f,amountDue:e.target.value}))} style={inp}/>
                </div>
                <div>
                  <label style={lbl}>المبلغ المدفوع (ر.س)</label>
                  <input type="number" value={pf.amountPaid} onChange={e=>setPf(f=>({...f,amountPaid:e.target.value}))} style={inp}/>
                </div>
                <div>
                  <label style={lbl}>تاريخ الدفع</label>
                  <input type="date" value={pf.paidDate} onChange={e=>setPf(f=>({...f,paidDate:e.target.value}))} style={inp}/>
                </div>
                <div>
                  <label style={lbl}>طريقة الدفع</label>
                  <select value={pf.paymentMethod} onChange={e=>setPf(f=>({...f,paymentMethod:e.target.value}))} style={inp}>
                    <option value="transfer">تحويل بنكي</option>
                    <option value="cash">كاش</option>
                    <option value="ejar">منصة إيجار</option>
                    <option value="stc_pay">STC Pay</option>
                  </select>
                </div>
              </div>
              {/* مستلم المبلغ */}
              <div>
                <label style={{...lbl,marginBottom:'8px'}}>💰 مستلم المبلغ</label>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}}>
                  {[{val:'manager',label:'مسؤول العقار',icon:'👤',color:'#1e40af',bg:'#dbeafe'},{val:'owner',label:'المالك',icon:'👑',color:'#7c3aed',bg:'#ede9fe'}].map(opt=>(
                    <button key={opt.val} onClick={()=>setPf(f=>({...f,receivedBy:opt.val}))}
                      style={{padding:'10px',border:`2px solid ${pf.receivedBy===opt.val?opt.color:'#e5e7eb'}`,borderRadius:'10px',background:pf.receivedBy===opt.val?opt.bg:'#fff',cursor:'pointer',textAlign:'center'}}>
                      <div style={{fontSize:'18px'}}>{opt.icon}</div>
                      <div style={{fontSize:'12px',fontWeight:'600',color:pf.receivedBy===opt.val?opt.color:'#374151'}}>{opt.label}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={lbl}>رقم المرجع</label>
                <input value={pf.referenceNumber} onChange={e=>setPf(f=>({...f,referenceNumber:e.target.value}))} style={inp}/>
              </div>
            </div>
            <div style={{display:'flex',gap:'10px',marginTop:'20px'}}>
              <button onClick={savePayment} disabled={saving}
                style={{flex:1,padding:'13px',background:saving?'#9ca3af':'#1B4F72',color:'#fff',border:'none',borderRadius:'12px',cursor:'pointer',fontSize:'15px',fontWeight:'600'}}>
                {saving?'جارٍ الحفظ...':editPayment?'حفظ التعديلات':'تسجيل الدفعة'}
              </button>
              <button onClick={()=>setShowPayModal(false)} style={{padding:'13px 20px',background:'#f3f4f6',color:'#374151',border:'none',borderRadius:'12px',cursor:'pointer',fontSize:'15px'}}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal تأكيد حذف الدفعة */}
      {deletePayConfirm&&(
        <div style={{position:'fixed',inset:'0',background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}}>
          <div style={{background:'#fff',borderRadius:'16px',padding:'24px',width:'360px',maxWidth:'95vw',textAlign:'center'}}>
            <div style={{fontSize:'48px',marginBottom:'12px'}}>🗑️</div>
            <h3 style={{margin:'0 0 8px',color:'#1B4F72'}}>حذف الدفعة</h3>
            <p style={{color:'#111827',fontSize:'18px',fontWeight:'700',margin:'0 0 20px'}}>
              {deletePayConfirm.amountPaid?.toLocaleString('ar-SA')} ر.س
            </p>
            <div style={{display:'flex',gap:'10px'}}>
              <button onClick={deletePayment} disabled={saving}
                style={{flex:1,padding:'12px',background:'#dc2626',color:'#fff',border:'none',borderRadius:'10px',cursor:'pointer',fontSize:'14px',fontWeight:'600'}}>
                {saving?'جارٍ الحذف...':'تأكيد الحذف'}
              </button>
              <button onClick={()=>setDeletePayConfirm(null)} style={{padding:'12px 20px',background:'#f3f4f6',color:'#374151',border:'none',borderRadius:'10px',cursor:'pointer'}}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
{/* ══ Modal تأكيد حذف المستأجر ══ */}
      {deleteTenantConfirm && (
        <div style={{ position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', width: '380px', maxWidth: '95vw', textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>🗑️</div>
            <h3 style={{ margin: '0 0 8px', color: '#dc2626' }}>حذف مستأجر</h3>
            <p style={{ color: '#111827', fontSize: '16px', fontWeight: '600', margin: '0 0 4px' }}>
              {deleteTenantConfirm.name}
            </p>
            <p style={{ color: '#6b7280', fontSize: '13px', marginBottom: '20px' }}>
              شقة {deleteTenantConfirm.unitNumber} · سيتم حذف المستأجر نهائياً وإعادة الشقة لشاغرة
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => deleteTenant(deleteTenantConfirm)} disabled={saving}
                style={{ flex: 1, padding: '12px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>
                {saving ? 'جارٍ الحذف...' : 'تأكيد الحذف'}
              </button>
              <button onClick={() => setDeleteTenantConfirm(null)}
                style={{ padding: '12px 20px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '10px', cursor: 'pointer' }}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

const lbl: React.CSSProperties = {display:'block',fontSize:'13px',color:'#374151',marginBottom:'6px',fontWeight:'500'};
const inp: React.CSSProperties = {width:'100%',border:'1.5px solid #e5e7eb',borderRadius:'10px',padding:'10px 12px',fontSize:'14px',boxSizing:'border-box',background:'#fff'};
