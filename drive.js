/* =====================================================================
   ذخیره و فهرست برنامه‌ها در گوگل درایو علی
   صفحه با یک Apps Script حرف می‌زند که با حساب صاحب درایو اجرا می‌شود
   و فقط داخل پوشه‌ی «برنامه‌های تغذیه» کار می‌کند. ورود با رمز است.
   ساختار: برنامه‌های تغذیه / نام مراجع / برنامه‌ها
   ===================================================================== */

// آدرس Web App اسکریپت (Deploy ← Web app) را این‌جا بگذار
const DRIVE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx9aC64qGHWMIMUA7C1Eu-3kVurSOb06nyRhY2UeWyBySXsmrcxuUHGydBGNK3ucwam/exec';

(() => {
  const PASS_KEY = 'drive-pass';
  let current = null;              // { id, client, planNo } برنامه‌ی باز فعلی در درایو

  const $ = id => document.getElementById(id);
  const toFa = n => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
  const faDate = iso => new Date(iso).toLocaleDateString('fa-IR-u-ca-persian', { year: 'numeric', month: 'long', day: 'numeric' });
  const faTime = iso => new Date(iso).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const status = t => { $('driveStatus').textContent = t; };

  const getPass = () => { try { return localStorage.getItem(PASS_KEY) || ''; } catch (e) { return ''; } };
  const setPass = v => { try { v ? localStorage.setItem(PASS_KEY, v) : localStorage.removeItem(PASS_KEY); } catch (e) {} };

  function askPass() {
    const v = prompt('رمز ذخیره در درایو را وارد کن:');
    if (v === null) return '';
    setPass(v.trim()); updateLoginBtn();
    return v.trim();
  }

  async function call(action, payload = {}, retried) {
    if (!DRIVE_SCRIPT_URL) throw new Error('ذخیره در درایو هنوز راه‌اندازی نشده');
    const pass = getPass() || askPass();
    if (!pass) throw new Error('رمز وارد نشد');
    let res;
    try {
      // بدنه‌ی متنی ساده: بدون درخواست پیش‌پرواز CORS
      res = await fetch(DRIVE_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action, pass, ...payload }) });
    } catch (e) { throw new Error('اتصال به درایو برقرار نشد؛ اینترنت را بررسی کن'); }
    const out = await res.json();
    if (!out.ok) {
      if (/رمز/.test(out.error) && !retried) { setPass(''); updateLoginBtn(); if (askPass()) return call(action, payload, true); }
      throw new Error(out.error);
    }
    return out.result;
  }

  // ---------------- ذخیره ----------------
  async function saveToDrive() {
    const data = window.collect();
    const client = (data.fields.name || '').trim();
    const planNo = (data.fields.planNo || '').trim();
    if (!client) { alert('اول نام مراجع را بنویس؛ برنامه‌ها با نام مراجع دسته‌بندی می‌شوند.'); return; }
    const fileName = `برنامه ${planNo || 'بی‌شماره'} - ${faDate(new Date().toISOString())}.json`;
    try {
      status('در حال ذخیره…');
      const req = { client, planNo, data, fileName };
      if (current && current.client === client && current.planNo === planNo) req.id = current.id;
      let r = await call('save', req);
      if (r.exists) {
        if (!confirm(`برنامه‌ی شماره‌ی ${planNo} برای «${client}» قبلاً در درایو هست. به‌روزرسانی شود؟\n(برای ساختن برنامه‌ی تازه، شماره‌ی برنامه را عوض کن.)`)) { status(''); return; }
        r = await call('save', { ...req, id: r.id });
      }
      current = { id: r.id, client, planNo };
      status(`در درایو ذخیره شد ✓ ${toFa(faTime(r.modified))}`);
    } catch (e) { status(e.message); }
  }

  // ---------------- فهرست ----------------
  async function openList() {
    $('driveModal').hidden = false;
    $('dmClients').innerHTML = '<p class="dm-muted">در حال خواندن از درایو…</p>';
    $('dmPlans').innerHTML = '';
    try {
      const clients = await call('clients');
      clients.sort((a, b) => a.name.localeCompare(b.name, 'fa'));
      renderClients(clients);
    } catch (e) { $('dmClients').innerHTML = `<p class="dm-muted">${esc(e.message)}</p>`; }
  }

  function renderClients(clients) {
    const term = $('dmSearch').value.trim();
    const shown = clients.filter(c => !term || c.name.includes(term));
    $('dmClients').innerHTML = shown.length
      ? shown.map(c => `<button type="button" class="dm-client">${esc(c.name)}</button>`).join('')
      : '<p class="dm-muted">هنوز برنامه‌ای در درایو ذخیره نشده.</p>';
    $('dmSearch').oninput = () => renderClients(clients);
    $('dmClients').querySelectorAll('.dm-client').forEach(b => b.onclick = () => {
      $('dmClients').querySelectorAll('.dm-client').forEach(x => x.classList.toggle('active', x === b));
      showPlans(b.textContent);
    });
  }

  async function showPlans(client) {
    $('dmPlans').innerHTML = '<p class="dm-muted">…</p>';
    try {
      const plans = await call('plans', { client });
      $('dmPlans').innerHTML = `<h3>${esc(client)}</h3>` + (plans.length ? plans.map(p => `
        <div class="dm-plan">
          <div><b>${p.planNo ? 'برنامه‌ی ' + esc(p.planNo) : 'بدون شماره'}</b>
          <span class="dm-muted">آخرین تغییر: ${faDate(p.modified)}، ساعت ${toFa(faTime(p.modified))}</span></div>
          <button type="button" data-id="${esc(p.id)}">باز کردن</button>
        </div>`).join('') : '<p class="dm-muted">برنامه‌ای در این پوشه نیست.</p>');
      $('dmPlans').querySelectorAll('button[data-id]').forEach(b => b.onclick = () => openPlan(b.dataset.id, client));
    } catch (e) { $('dmPlans').innerHTML = `<p class="dm-muted">${esc(e.message)}</p>`; }
  }

  async function openPlan(id, client) {
    try {
      status('در حال باز کردن…');
      const data = await call('load', { id });
      window.fill(data); window.save();
      current = { id, client, planNo: ((data.fields && data.fields.planNo) || '').trim() };
      $('driveModal').hidden = true;
      status('برنامه از درایو باز شد ✓');
    } catch (e) { status(e.message); }
  }

  // ---------------- دکمه‌ها ----------------
  function updateLoginBtn() { $('btnDriveLogin').textContent = getPass() ? 'رمز درایو ✓' : 'وارد کردن رمز درایو'; }
  $('btnDriveLogin').onclick = async () => {
    if (!askPass()) return;
    try { await call('ping'); status('اتصال برقرار است ✓'); } catch (e) { status(e.message); }
  };
  $('btnDriveSave').onclick = saveToDrive;
  $('btnDriveList').onclick = openList;
  $('dmClose').onclick = () => { $('driveModal').hidden = true; };
  $('driveModal').addEventListener('mousedown', e => { if (e.target.id === 'driveModal') $('driveModal').hidden = true; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') $('driveModal').hidden = true; });
  window.onPlanCleared = () => { current = null; };

  updateLoginBtn();
  if (!DRIVE_SCRIPT_URL) status('ذخیره در درایو هنوز راه‌اندازی نشده');
})();
