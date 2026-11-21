/* =====================================================================
   ذخیره و فهرست برنامه‌ها در گوگل درایو
   - هر کاربر با حساب گوگل خودش وارد می‌شود و فایل‌ها در درایو خودش می‌ماند.
   - دسترسی فقط به فایل‌هایی است که همین صفحه ساخته (drive.file)؛ بقیه‌ی درایو دیده نمی‌شود.
   - ساختار: «برنامه‌های تغذیه» / نام مراجع / برنامه‌ها
   ===================================================================== */

// شناسه‌ی ورود گوگل (OAuth Client ID) را این‌جا بگذار
const GOOGLE_CLIENT_ID = '';

(() => {
  const ROOT_NAME = 'برنامه‌های تغذیه';
  const FOLDER = 'application/vnd.google-apps.folder';
  const API = 'https://www.googleapis.com/drive/v3/files';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

  let token = null, tokenExp = 0, tokenClient = null, pending = null;
  let rootId = null;
  let current = null;              // { id, client, planNo } برنامه‌ی باز فعلی در درایو

  const $ = id => document.getElementById(id);
  const toFa = n => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
  const q = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const faDate = iso => new Date(iso).toLocaleDateString('fa-IR-u-ca-persian', { year: 'numeric', month: 'long', day: 'numeric' });
  const faTime = iso => new Date(iso).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const status = t => { $('driveStatus').textContent = t; };

  // ---------------- ورود ----------------
  function getToken(interactive) {
    if (token && Date.now() < tokenExp - 60000) return Promise.resolve(token);
    if (!GOOGLE_CLIENT_ID) return Promise.reject(new Error('کلید ورود گوگل هنوز تنظیم نشده است'));
    if (!window.google || !google.accounts || !google.accounts.oauth2) return Promise.reject(new Error('اتصال به گوگل برقرار نشد؛ اینترنت را بررسی کن'));
    if (!tokenClient) {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: r => {
          const p = pending; pending = null;
          if (r.error) return p && p.reject(new Error('ورود انجام نشد'));
          token = r.access_token; tokenExp = Date.now() + r.expires_in * 1000;
          try { localStorage.setItem('drive-connected', '1'); } catch (e) {}
          setConnected(true);
          p && p.resolve(token);
        },
        error_callback: () => { const p = pending; pending = null; p && p.reject(new Error('پنجره‌ی ورود بسته شد')); }
      });
    }
    return new Promise((resolve, reject) => {
      pending = { resolve, reject };
      tokenClient.requestAccessToken({ prompt: interactive ? 'select_account' : '' });
    });
  }

  async function api(url, opt = {}) {
    const t = await getToken(false);
    const res = await fetch(url, { ...opt, headers: { ...(opt.headers || {}), Authorization: 'Bearer ' + t } });
    if (res.status === 401) { token = null; return api(url, opt); }
    if (!res.ok) throw new Error('خطای درایو (' + res.status + ')');
    return res;
  }
  const list = async query => (await (await api(`${API}?q=${encodeURIComponent(query)}&fields=files(id,name,modifiedTime,appProperties)&orderBy=modifiedTime desc&pageSize=1000&spaces=drive`)).json()).files || [];

  async function folder(name, parent) {
    const p = parent ? ` and '${parent}' in parents` : '';
    const found = await list(`name='${q(name)}' and mimeType='${FOLDER}' and trashed=false${p}`);
    if (found.length) return found[0].id;
    const res = await api(API + '?fields=id', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER, parents: parent ? [parent] : undefined })
    });
    return (await res.json()).id;
  }
  const root = async () => rootId || (rootId = await folder(ROOT_NAME));

  async function upload(meta, data, id) {
    const boundary = 'b' + Math.random().toString(36).slice(2);
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`
               + `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(data, null, 2)}\r\n--${boundary}--`;
    const res = await api(`${UPLOAD}${id ? '/' + id : ''}?uploadType=multipart&fields=id,name,modifiedTime`, {
      method: id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body
    });
    return res.json();
  }

  // ---------------- ذخیره ----------------
  async function saveToDrive() {
    const data = window.collect();
    const client = (data.fields.name || '').trim();
    const planNo = (data.fields.planNo || '').trim();
    if (!client) { alert('اول نام مراجع را بنویس؛ برنامه‌ها با نام مراجع دسته‌بندی می‌شوند.'); return; }
    try {
      await getToken(!token);
      status('در حال ذخیره…');
      const folderId = await folder(client, await root());
      let id = null;
      if (current && current.client === client && current.planNo === planNo) id = current.id;
      else if (planNo) {
        const same = await list(`'${folderId}' in parents and trashed=false and appProperties has { key='planNo' and value='${q(planNo)}' }`);
        if (same.length) {
          if (!confirm(`برنامه‌ی شماره‌ی ${planNo} برای «${client}» قبلاً در درایو هست. به‌روزرسانی شود؟\n(برای ساختن برنامه‌ی تازه، شماره‌ی برنامه را عوض کن.)`)) { status(''); return; }
          id = same[0].id;
        }
      }
      const name = `برنامه ${planNo || 'بی‌شماره'} - ${faDate(new Date().toISOString())}.json`;
      const meta = { name, mimeType: 'application/json', appProperties: { planNo, client } };
      if (!id) meta.parents = [folderId];
      const f = await upload(meta, data, id);
      current = { id: f.id, client, planNo };
      status(`در درایو ذخیره شد ✓ ${toFa(faTime(f.modifiedTime))}`);
    } catch (e) { status(e.message); }
  }

  // ---------------- فهرست ----------------
  async function openList() {
    $('driveModal').hidden = false;
    $('dmClients').innerHTML = '<p class="dm-muted">در حال خواندن از درایو…</p>';
    $('dmPlans').innerHTML = '';
    try {
      await getToken(!token);
      const clients = await list(`'${await root()}' in parents and mimeType='${FOLDER}' and trashed=false`);
      clients.sort((a, b) => a.name.localeCompare(b.name, 'fa'));
      renderClients(clients);
    } catch (e) { $('dmClients').innerHTML = `<p class="dm-muted">${esc(e.message)}</p>`; }
  }

  function renderClients(clients) {
    const term = $('dmSearch').value.trim();
    const shown = clients.filter(c => !term || c.name.includes(term));
    $('dmClients').innerHTML = shown.length
      ? shown.map(c => `<button type="button" class="dm-client" data-id="${c.id}">${esc(c.name)}</button>`).join('')
      : '<p class="dm-muted">هنوز برنامه‌ای در درایو ذخیره نشده.</p>';
    $('dmSearch').oninput = () => renderClients(clients);
    $('dmClients').querySelectorAll('.dm-client').forEach(b => b.onclick = () => {
      $('dmClients').querySelectorAll('.dm-client').forEach(x => x.classList.toggle('active', x === b));
      showPlans(b.dataset.id, b.textContent);
    });
  }

  async function showPlans(folderId, client) {
    $('dmPlans').innerHTML = '<p class="dm-muted">…</p>';
    try {
      const plans = await list(`'${folderId}' in parents and trashed=false and mimeType='application/json'`);
      $('dmPlans').innerHTML = `<h3>${esc(client)}</h3>` + (plans.length ? plans.map(p => {
        const no = p.appProperties && p.appProperties.planNo;
        return `<div class="dm-plan">
          <div><b>${no ? 'برنامه‌ی ' + esc(no) : 'بدون شماره'}</b>
          <span class="dm-muted">آخرین تغییر: ${faDate(p.modifiedTime)}، ساعت ${toFa(faTime(p.modifiedTime))}</span></div>
          <button type="button" data-id="${p.id}">باز کردن</button></div>`;
      }).join('') : '<p class="dm-muted">برنامه‌ای در این پوشه نیست.</p>');
      $('dmPlans').querySelectorAll('button[data-id]').forEach(b => b.onclick = () => openPlan(b.dataset.id, client));
    } catch (e) { $('dmPlans').innerHTML = `<p class="dm-muted">${esc(e.message)}</p>`; }
  }

  async function openPlan(id, client) {
    try {
      status('در حال باز کردن…');
      const data = await (await api(`${API}/${id}?alt=media`)).json();
      window.fill(data); window.save();
      current = { id, client, planNo: ((data.fields && data.fields.planNo) || '').trim() };
      $('driveModal').hidden = true;
      status('برنامه از درایو باز شد ✓');
    } catch (e) { status(e.message); }
  }

  // ---------------- اتصال به دکمه‌ها ----------------
  function setConnected(on) {
    $('btnDriveLogin').textContent = on ? 'وصل به گوگل درایو ✓' : 'ورود به گوگل درایو';
  }
  $('btnDriveLogin').onclick = () => { token = null; getToken(true).then(() => status('وصل شد ✓')).catch(e => status(e.message)); };
  $('btnDriveSave').onclick = saveToDrive;
  $('btnDriveList').onclick = openList;
  $('dmClose').onclick = () => { $('driveModal').hidden = true; };
  $('driveModal').addEventListener('mousedown', e => { if (e.target.id === 'driveModal') $('driveModal').hidden = true; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') $('driveModal').hidden = true; });
  // «برنامه‌ی جدید» یعنی ذخیره‌ی بعدی فایل تازه می‌سازد
  window.onPlanCleared = () => { current = null; };
  $('importFile').addEventListener('change', () => { current = null; });

  if (!GOOGLE_CLIENT_ID) status('ذخیره در درایو هنوز فعال نشده');
})();
