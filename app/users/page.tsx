'use client';
import { useEffect, useState } from 'react';
import { onAuthStateChanged, createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import { collection, getDocs, setDoc, updateDoc, doc, query, where, serverTimestamp, getDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';

interface AppUser {
  uid: string; name: string; email: string; phone: string;
  role: string; isActive: boolean; propertyIds: string[];
}
interface Property { id: string; name: string; }

const ROLES: Record<string,{label:string,color:string,bg:string,desc:string}> = {
  owner:       { label:'مالك',   color:'#5b21b6', bg:'#ede9fe', desc:'صلاحيات كاملة' },
  manager:     { label:'مدير',   color:'#1e40af', bg:'#dbeafe', desc:'إدارة الإيجارات والمصاريف' },
  accountant:  { label:'محاسب',  color:'#065f46', bg:'#d1fae5', desc:'عرض التقارير فقط' },
  maintenance: { label:'صيانة',  color:'#92400e', bg:'#fef3c7', desc:'طلبات الصيانة فقط' },
};

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState('');
  const [form, setForm] = useState({ name:'', email:'', phone:'', password:'', role:'manager', propertyIds:[] as string[] });
  const [error, setError] = useState('');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push('/login'); return; }
      // Load current user role
      const myDoc = await getDocs(query(collection(db,'users'), where('__name__','==',user.uid)));
      if (!myDoc.empty) setCurrentUserRole((myDoc.docs[0].data() as any).role || '');
      // Load all users
      const [usersSnap, propsSnap] = await Promise.all([
        getDocs(collection(db,'users')),
        getDocs(query(collection(db,'properties'), where('ownerId','==',user.uid))),
      ]);
      setUsers(usersSnap.docs.map(d => ({ uid: d.id, ...d.data() } as AppUser)));
      setProperties(propsSnap.docs.map(d => ({ id: d.id, name: (d.data() as any).name })));
      setLoading(false);
    });
    return unsub;
  }, []);

  const createUser = async () => {
    setError('');
    if (!form.name || !form.email || !form.password) { setError('يرجى ملء جميع الحقول المطلوبة'); return; }
    if (form.password.length < 6) { setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل'); return; }
    setSaving(true);
    try {
      const { user } = await createUserWithEmailAndPassword(auth, form.email.trim(), form.password);
      await setDoc(doc(db,'users',user.uid), {
        name: form.name, email: form.email.trim(), phone: form.phone,
        role: form.role, propertyIds: form.propertyIds, isActive: true,
        createdAt: serverTimestamp(),
      });
      const newUser: AppUser = { uid: user.uid, name: form.name, email: form.email, phone: form.phone, role: form.role, isActive: true, propertyIds: form.propertyIds };
      setUsers(u => [...u, newUser]);
      setShowModal(false);
      setForm({ name:'', email:'', phone:'', password:'', role:'manager', propertyIds:[] });
    } catch(e: any) {
      if (e.code === 'auth/email-already-in-use') setError('البريد الإلكتروني مستخدم بالفعل');
      else setError('حدث خطأ: ' + e.message);
    }
    setSaving(false);
  };

  const toggleActive = async (u: AppUser) => {
    await updateDoc(doc(db,'users',u.uid), { isActive: !u.isActive });
    setUsers(users.map(x => x.uid === u.uid ? { ...x, isActive: !u.isActive } : x));
  };

  const toggleProperty = (pid: string) => {
    setForm(f => ({
      ...f,
      propertyIds: f.propertyIds.includes(pid)
        ? f.propertyIds.filter(x => x !== pid)
        : [...f.propertyIds, pid]
    }));
  };

  if (loading) return (
    <div style={{display:'flex',justifyContent:'center',alignItems:'center',height:'100vh',background:'#f9fafb'}}>
      <div style={{textAlign:'center'}}>
        <div style={{width:'40px',height:'40px',border:'3px solid #1B4F72',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 12px'}}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <p style={{color:'#6b7280',fontFamily:'sans-serif',fontSize:'14px'}}>جارٍ التحميل...</p>
      </div>
    </div>
  );

  return (
    <div dir="rtl" style={{fontFamily:'sans-serif',background:'#f9fafb',minHeight:'100vh'}}>
      {/* Top bar */}
      <div style={{background:'#1B4F72',padding:'16px 20px',display:'flex',alignItems:'center',gap:'12px',position:'sticky',top:0,zIndex:50}}>
        <button onClick={()=>router.push('/')} style={{background:'rgba(255,255,255,0.15)',border:'none',borderRadius:'8px',padding:'8px',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <span style={{color:'#fff',fontSize:'18px'}}>←</span>
        </button>
        <div style={{flex:1}}>
          <h1 style={{margin:0,fontSize:'17px',fontWeight:'600',color:'#fff'}}>المستخدمون والصلاحيات</h1>
          <p style={{margin:0,fontSize:'12px',color:'rgba(255,255,255,0.6)'}}>{users.length} مستخدم مسجل</p>
        </div>
        <button onClick={()=>setShowModal(true)} style={{background:'#D4AC0D',border:'none',borderRadius:'10px',padding:'10px 16px',cursor:'pointer',color:'#fff',fontSize:'13px',fontWeight:'600'}}>
          + إضافة
        </button>
      </div>

      <div style={{padding:'16px',maxWidth:'600px',margin:'0 auto'}}>

        {/* Role reference cards */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'20px'}}>
          {Object.entries(ROLES).map(([k,v]) => (
            <div key={k} style={{background:v.bg,borderRadius:'12px',padding:'14px',border:`1px solid ${v.color}30`}}>
              <div style={{fontSize:'13px',fontWeight:'600',color:v.color,marginBottom:'4px'}}>{v.label}</div>
              <div style={{fontSize:'11px',color:'#6b7280'}}>{v.desc}</div>
            </div>
          ))}
        </div>

        {/* Users list */}
        {users.length === 0 ? (
          <div style={{background:'#fff',borderRadius:'16px',padding:'40px',textAlign:'center',border:'1px solid #e5e7eb'}}>
            <div style={{fontSize:'48px',marginBottom:'12px'}}>👥</div>
            <p style={{color:'#6b7280',fontSize:'14px',margin:0}}>لا يوجد مستخدمون — أضف مستخدماً جديداً</p>
            <button onClick={()=>setShowModal(true)} style={{...btnPrimary,marginTop:'16px'}}>+ إضافة مستخدم</button>
          </div>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
            {users.map(u => {
              const role = ROLES[u.role] || { label:u.role, color:'#374151', bg:'#f3f4f6', desc:'' };
              return (
                <div key={u.uid} style={{background:'#fff',borderRadius:'16px',padding:'16px',border:'1px solid #e5e7eb',boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'12px'}}>
                    {/* Avatar */}
                    <div style={{width:'44px',height:'44px',borderRadius:'50%',background:'#1B4F72',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                      <span style={{color:'#fff',fontSize:'16px',fontWeight:'600'}}>{u.name?.charAt(0) || '?'}</span>
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:'15px',fontWeight:'600',color:'#111827',marginBottom:'2px'}}>{u.name}</div>
                      <div style={{fontSize:'12px',color:'#6b7280',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{u.email}</div>
                    </div>
                    <span style={{background:role.bg,color:role.color,padding:'4px 10px',borderRadius:'20px',fontSize:'12px',fontWeight:'500',flexShrink:0}}>
                      {role.label}
                    </span>
                  </div>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',paddingTop:'12px',borderTop:'1px solid #f3f4f6'}}>
                    <div style={{fontSize:'12px',color:'#6b7280'}}>
                      {u.phone && <span style={{marginLeft:'12px'}}>📞 {u.phone}</span>}
                      <span style={{background:u.isActive?'#d1fae5':'#fee2e2',color:u.isActive?'#065f46':'#991b1b',padding:'2px 8px',borderRadius:'10px',fontSize:'11px',marginRight:'4px'}}>
                        {u.isActive ? 'نشط' : 'معطّل'}
                      </span>
                    </div>
                    {currentUserRole === 'owner' && u.role !== 'owner' && (
                      <button onClick={()=>toggleActive(u)} style={{padding:'6px 12px',border:`1px solid ${u.isActive?'#fca5a5':'#6ee7b7'}`,borderRadius:'8px',background:'#fff',cursor:'pointer',fontSize:'12px',color:u.isActive?'#dc2626':'#16a34a'}}>
                        {u.isActive ? 'تعطيل' : 'تفعيل'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add User Modal */}
      {showModal && (
        <div style={{position:'fixed',inset:'0',background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:1000}} onClick={()=>setShowModal(false)}>
          <div style={{background:'#fff',borderRadius:'20px 20px 0 0',padding:'24px',width:'100%',maxWidth:'500px',maxHeight:'90vh',overflowY:'auto'}} onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'20px'}}>
              <h2 style={{margin:0,fontSize:'17px',color:'#1B4F72',fontWeight:'600'}}>إضافة مستخدم جديد</h2>
              <button onClick={()=>setShowModal(false)} style={{border:'none',background:'#f3f4f6',borderRadius:'50%',width:'32px',height:'32px',cursor:'pointer',fontSize:'16px',display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button>
            </div>

            {error && <div style={{background:'#fee2e2',color:'#dc2626',padding:'10px 14px',borderRadius:'10px',fontSize:'13px',marginBottom:'16px'}}>{error}</div>}

            <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>
              {[['الاسم الكامل','name','text',''],['البريد الإلكتروني','email','email',''],['رقم الجوال','phone','tel',''],['كلمة المرور','password','password','6 أحرف على الأقل']].map(([l,k,t,p])=>(
                <div key={k}>
                  <label style={{display:'block',fontSize:'13px',color:'#374151',marginBottom:'6px',fontWeight:'500'}}>{l}</label>
                  <input type={t} value={(form as any)[k]} placeholder={p} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}
                    style={{width:'100%',border:'1.5px solid #e5e7eb',borderRadius:'10px',padding:'11px 14px',fontSize:'14px',boxSizing:'border-box',outline:'none'}}
                    dir={k==='email'?'ltr':'rtl'}
                    onFocus={e=>(e.target.style.borderColor='#1B4F72')}
                    onBlur={e=>(e.target.style.borderColor='#e5e7eb')}
                  />
                </div>
              ))}

              <div>
                <label style={{display:'block',fontSize:'13px',color:'#374151',marginBottom:'6px',fontWeight:'500'}}>الدور</label>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}}>
                  {Object.entries(ROLES).map(([k,v])=>(
                    <button key={k} onClick={()=>setForm(f=>({...f,role:k}))}
                      style={{padding:'10px',border:`2px solid ${form.role===k?v.color:'#e5e7eb'}`,borderRadius:'10px',background:form.role===k?v.bg:'#fff',cursor:'pointer',textAlign:'center'}}>
                      <div style={{fontSize:'13px',fontWeight:'600',color:v.color}}>{v.label}</div>
                      <div style={{fontSize:'11px',color:'#6b7280',marginTop:'2px'}}>{v.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {form.role !== 'owner' && properties.length > 0 && (
                <div>
                  <label style={{display:'block',fontSize:'13px',color:'#374151',marginBottom:'8px',fontWeight:'500'}}>العقارات المصرح بها</label>
                  <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
                    {properties.map(p=>(
                      <label key={p.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'10px 14px',border:'1.5px solid',borderColor:form.propertyIds.includes(p.id)?'#1B4F72':'#e5e7eb',borderRadius:'10px',cursor:'pointer',background:form.propertyIds.includes(p.id)?'#f0f9ff':'#fff'}}>
                        <input type="checkbox" checked={form.propertyIds.includes(p.id)} onChange={()=>toggleProperty(p.id)} style={{width:'18px',height:'18px',accentColor:'#1B4F72'}}/>
                        <span style={{fontSize:'14px',color:'#374151'}}>{p.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div style={{display:'flex',gap:'10px',marginTop:'24px'}}>
              <button onClick={createUser} disabled={saving}
                style={{flex:1,padding:'13px',background:'#1B4F72',color:'#fff',border:'none',borderRadius:'12px',cursor:'pointer',fontSize:'15px',fontWeight:'600',opacity:saving?0.7:1}}>
                {saving ? 'جارٍ الإنشاء...' : 'إنشاء المستخدم'}
              </button>
              <button onClick={()=>setShowModal(false)}
                style={{padding:'13px 20px',background:'#f3f4f6',color:'#374151',border:'none',borderRadius:'12px',cursor:'pointer',fontSize:'15px'}}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const btnPrimary: React.CSSProperties = {padding:'10px 20px',background:'#1B4F72',color:'#fff',border:'none',borderRadius:'10px',cursor:'pointer',fontSize:'14px',fontFamily:'sans-serif',fontWeight:'500'};
