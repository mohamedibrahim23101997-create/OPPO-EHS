const { createClient } = require('@supabase/supabase-js');

const SUPERVISOR_EMAIL = 'mo.i.kafrana@gmail.com';
const SUPERVISOR_EMPLOYEE_ID = 'EG800218';
const EMAIL_DOMAIN = '@employees.oppoegypt.com';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://moeqybgkljihzkighajt.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_fbQU44FBUqbntzEUpjxFIA_qIVlpnmn';

function send(res, status, body) { return res.status(status).json(body); }
function clean(value) { return String(value ?? '').trim(); }

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, apikey, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

  try {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_ANON_KEY || !serviceKey) {
      return send(res, 500, { error: 'إعدادات Supabase غير مكتملة على Vercel. يلزم ضبط SUPABASE_SERVICE_ROLE_KEY كمتغير سري.' });
    }

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return send(res, 401, { error: 'يجب تسجيل دخول المشرف أولاً.' });

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    const supervisor = authData?.user;
    if (authError || !supervisor || String(supervisor.email || '').toLowerCase() !== SUPERVISOR_EMAIL) {
      return send(res, 403, { error: 'هذا الإجراء متاح لحساب مشرف EHS المعتمد فقط.' });
    }

    const employees = req.body?.employees;
    if (!Array.isArray(employees) || employees.length < 1 || employees.length > 1500) {
      return send(res, 400, { error: 'يجب إرسال من موظف واحد إلى 1500 موظف.' });
    }

    const admin = createClient(SUPABASE_URL, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    let legacyProfiles = [];
    const { data: legacyData, error: legacyError } = await admin.from('ehs_profiles').select('*');
    if (legacyError) {
      if (legacyError.code !== '42P01' && legacyError.code !== 'PGRST205') {
        throw new Error('تعذر قراءة سجلات الموظفين القديمة؛ تم إيقاف الاستيراد لمنع التكرار: ' + legacyError.message);
      }
    } else legacyProfiles = legacyData || [];

    const legacyByEmployee = new Map(legacyProfiles.map(p => [clean(p.employee_id).toUpperCase(), p]));
    const { data: gameProfiles, error: gameError } = await admin.from('ehs_game_employees').select('employee_id,user_id');
    if (gameError) throw new Error('تعذر قراءة دليل الموظفين: ' + gameError.message);
    const gameByEmployee = new Map((gameProfiles || []).map(p => [clean(p.employee_id).toUpperCase(), p]));

    const seen = new Set();
    const credentials = [];
    const errors = [];
    let created = 0, updated = 0, passwordsSet = 0;
    const authUsersByEmail = new Map();
    const authUsersByEmployee = new Map();

    for (let page = 1; page <= 20; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw new Error('تعذرت مراجعة حسابات الدخول الحالية: ' + error.message);
      for (const user of data.users || []) {
        if (user.email) authUsersByEmail.set(user.email.toLowerCase(), user);
        const id = clean(user.user_metadata?.employee_id || user.app_metadata?.employee_id).toUpperCase();
        if (id) authUsersByEmployee.set(id, user);
      }
      if (!data.users || data.users.length < 1000) break;
    }

    for (let i = 0; i < employees.length; i++) {
      const row = employees[i] || {};
      const employee_id = clean(row.employee_id).toUpperCase();
      const full_name = clean(row.full_name);
      const department = clean(row.department);
      const password = String(row.temporary_password ?? '');

      if (!employee_id || !full_name || !department) {
        errors.push({ row: i + 2, employee_id, error: 'الرقم الوظيفي والاسم والقسم مطلوبة.' });
        continue;
      }
      if (seen.has(employee_id)) {
        errors.push({ row: i + 2, employee_id, error: 'الرقم الوظيفي مكرر داخل الملف.' });
        continue;
      }
      seen.add(employee_id);

      // Protect the supervisor identity independently of the spreadsheet contents.
      if (employee_id === SUPERVISOR_EMPLOYEE_ID) {
        errors.push({ row: i + 2, employee_id, error: 'تم استثناء حساب المشرف EG800218 من الاستيراد وتغيير كلمة المرور.' });
        continue;
      }
      if (!password.trim()) {
        errors.push({ row: i + 2, employee_id, error: 'عمود temporary_password فارغ؛ لم يتم إنشاء الحساب أو تغيير كلمة مروره.' });
        continue;
      }

      const legacy = legacyByEmployee.get(employee_id);
      if (legacy && String(legacy.role || '').toLowerCase() === 'admin') {
        errors.push({ row: i + 2, employee_id, error: 'تم تخطي حساب إداري محمي دون تعديل.' });
        continue;
      }

      const current = gameByEmployee.get(employee_id);
      let userId = current?.user_id;
      if (!userId && legacy) {
        userId = legacy.user_id || legacy.auth_user_id || legacy.id || legacy.profile_id;
        if (!userId) {
          errors.push({ row: i + 2, employee_id, error: 'يوجد سجل قديم لكن تعذر تحديد Auth user ID؛ تم التخطي لمنع التكرار.' });
          continue;
        }
      }

      const email = employee_id.toLowerCase() + EMAIL_DOMAIN;
      const authUser = authUsersByEmail.get(email) || authUsersByEmployee.get(employee_id);
      if (!userId && authUser) userId = authUser.id;

      let createdNow = false;
      if (!userId) {
        const { data: newUser, error: createError } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { employee_id, full_name, department, account_type: 'ehs_employee' }
        });
        if (createError) {
          errors.push({ row: i + 2, employee_id, error: createError.message });
          continue;
        }
        userId = newUser.user.id;
        createdNow = true;
      }

      // Save the employee directory first. No participation, score, or session tables are touched.
      const { error: upsertError } = await admin.from('ehs_game_employees').upsert({
        user_id: userId, employee_id, full_name, department, updated_at: new Date().toISOString()
      }, { onConflict: 'employee_id' });

      if (upsertError) {
        let cleanupNote = '';
        if (createdNow) {
          const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
          if (deleteError) cleanupNote = ' كما تعذر حذف حساب الدخول الجديد غير المرتبط: ' + deleteError.message;
        }
        errors.push({ row: i + 2, employee_id, error: 'فشل حفظ بيانات الموظف: ' + upsertError.message + cleanupNote });
        continue;
      }

      // Reset existing users, or confirm the spreadsheet password for newly-created users.
      if (!createdNow) {
        const { error: passwordError } = await admin.auth.admin.updateUserById(userId, {
          password,
          user_metadata: { employee_id, full_name, department, account_type: 'ehs_employee' }
        });
        if (passwordError) {
          errors.push({ row: i + 2, employee_id, error: 'تم حفظ بيانات الموظف لكن تعذر تعيين كلمة المرور: ' + passwordError.message });
          continue;
        }
      }

      credentials.push({ employee_id, full_name, department, temporary_password: password });
      passwordsSet++;
      if (createdNow) created++; else updated++;
    }

    return send(res, 200, { created, updated, passwordsSet, errors, credentials });
  } catch (error) {
    console.error('Employee import failed:', error);
    return send(res, 500, { error: error instanceof Error ? error.message : 'حدث خطأ غير متوقع أثناء الاستيراد.' });
  }
};
