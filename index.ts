import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const SUPERVISOR_EMAIL = 'mo.i.kafrana@gmail.com';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json' },
});
function temporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
}
const clean = (v: unknown) => String(v ?? '').trim();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization') || '';
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user || user.email?.toLowerCase() !== SUPERVISOR_EMAIL)
      return json({ error: 'Supervisor access required' }, 403);

    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const body = await req.json();
    if (!Array.isArray(body.employees) || body.employees.length === 0 || body.employees.length > 1500)
      return json({ error: 'Upload between 1 and 1500 employee rows.' }, 400);

    // Read the existing EHS profile directory first so existing Auth accounts are reused, not duplicated.
    const { data: legacyProfiles, error: legacyError } = await admin.from('ehs_profiles').select('*');
    if (legacyError) throw new Error('Could not read existing ehs_profiles; import stopped to prevent duplicate accounts: ' + legacyError.message);
    const legacyByEmployee = new Map<string, any>((legacyProfiles || []).map((p: any) => [clean(p.employee_id).toUpperCase(), p]));

    const seen = new Set<string>();
    const credentials: Array<Record<string,string>> = [];
    const errors: Array<{ row: number; employee_id: string; error: string }> = [];
    let created = 0, updated = 0;

    for (let i = 0; i < body.employees.length; i++) {
      const row = body.employees[i] || {};
      const employee_id = clean(row.employee_id).toUpperCase();
      const full_name = clean(row.full_name);
      const department = clean(row.department);
      if (!employee_id || !full_name || !department) { errors.push({ row:i+2, employee_id, error:'Missing employee ID, full name, or department' }); continue; }
      if (seen.has(employee_id)) { errors.push({ row:i+2, employee_id, error:'Duplicate employee ID in uploaded file' }); continue; }
      seen.add(employee_id);

      const email = `${employee_id.toLowerCase()}@employees.oppoegypt.com`;
      const { data: existing, error: lookupError } = await admin.from('ehs_game_employees').select('user_id').eq('employee_id', employee_id).maybeSingle();
      if (lookupError) { errors.push({ row:i+2, employee_id, error:lookupError.message }); continue; }

      let userId = existing?.user_id as string | undefined;
      const legacy = legacyByEmployee.get(employee_id);
      if (legacy && String(legacy.role || '').toLowerCase() === 'admin') {
        errors.push({ row:i+2, employee_id, error:'Protected administrator account; skipped without changes' });
        continue;
      }
      if (!userId && legacy) {
        userId = (legacy.user_id || legacy.auth_user_id || legacy.id || legacy.profile_id) as string | undefined;
        if (!userId) { errors.push({ row:i+2, employee_id, error:'Existing EHS profile found but its Auth user ID could not be identified; skipped to prevent duplicate account creation' }); continue; }
      }
      if (!userId) {
        // Reuse an Auth user with this employee login alias if one already exists.
        let existingAuthUser: any = null;
        for (let page = 1; page <= 10 && !existingAuthUser; page++) {
          const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
          if (error) throw error;
          existingAuthUser = data.users.find((u: any) => u.email?.toLowerCase() === email || String(u.user_metadata?.employee_id || u.app_metadata?.employee_id || '').toUpperCase() === employee_id) || null;
          if (data.users.length < 1000) break;
        }
        if (existingAuthUser) userId = existingAuthUser.id;
        else {
          const password = temporaryPassword();
          const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { employee_id, full_name, department, account_type:'ehs_employee' } });
          if (error) { errors.push({ row:i+2, employee_id, error:error.message }); continue; }
          userId = data.user.id;
          credentials.push({ employee_id, full_name, department, temporary_password: password });
          created++;
        }
      } else updated++;

      const { error: upsertError } = await admin.from('ehs_game_employees').upsert({ user_id:userId, employee_id, full_name, department, updated_at:new Date().toISOString() }, { onConflict:'employee_id' });
      if (upsertError) errors.push({ row:i+2, employee_id, error:upsertError.message });
    }
    return json({ created, updated, errors, credentials });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unexpected import error' }, 500);
  }
});
