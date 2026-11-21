/**
 * پل بین فرم برنامه‌ی غذایی و گوگل درایو علی
 * این اسکریپت با حساب صاحب درایو اجرا می‌شود و فقط داخل پوشه‌ی «برنامه‌های تغذیه» کار می‌کند.
 * رمز دسترسی در Project Settings ← Script Properties با کلید PASSCODE نگه داشته می‌شود.
 */
const FOLDER_ID = '1iKIa2uXWAH0Wj71UVhO-ClI_Yd1glu3w';

function doPost(e) {
  let out;
  try {
    const req = JSON.parse(e.postData.contents);
    const pass = PropertiesService.getScriptProperties().getProperty('PASSCODE');
    if (!pass || req.pass !== pass) throw new Error('رمز درست نیست');
    out = { ok: true, result: ACTIONS[req.action](req) };
  } catch (err) {
    out = { ok: false, error: String(err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService.createTextOutput('ok');
}

const root = () => DriveApp.getFolderById(FOLDER_ID);

function clientFolder(name, create) {
  const it = root().getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return create ? root().createFolder(name) : null;
}

function checkInRoot(f) {
  const p = f.getParents();
  const gp = p.hasNext() ? p.next().getParents() : null;
  if (!gp || !gp.hasNext() || gp.next().getId() !== FOLDER_ID) throw new Error('دسترسی مجاز نیست');
}

const planNoOf = f => { try { return JSON.parse(f.getDescription() || '{}').planNo || ''; } catch (e) { return ''; } };

const ACTIONS = {
  ping: () => 'ok',

  clients: () => {
    const list = [], it = root().getFolders();
    while (it.hasNext()) { const f = it.next(); list.push({ id: f.getId(), name: f.getName() }); }
    return list;
  },

  plans: req => {
    const folder = clientFolder(req.client, false);
    if (!folder) return [];
    const list = [], it = folder.getFilesByType('application/json');
    while (it.hasNext()) {
      const f = it.next();
      list.push({ id: f.getId(), name: f.getName(), planNo: planNoOf(f), modified: f.getLastUpdated().toISOString() });
    }
    return list.sort((a, b) => b.modified.localeCompare(a.modified));
  },

  load: req => {
    const f = DriveApp.getFileById(req.id);
    checkInRoot(f);
    return JSON.parse(f.getBlob().getDataAsString('UTF-8'));
  },

  save: req => {
    const folder = clientFolder(req.client, true);
    const body = JSON.stringify(req.data, null, 2);
    let file = null;
    if (req.id) {
      file = DriveApp.getFileById(req.id);
      checkInRoot(file);
    } else if (req.planNo) {
      const it = folder.getFilesByType('application/json');
      while (it.hasNext()) { const f = it.next(); if (planNoOf(f) === req.planNo) { file = f; break; } }
      if (file && !req.overwrite) return { exists: true, id: file.getId() };
    }
    if (file) {
      file.setContent(body);
      file.setName(req.fileName);
    } else {
      file = folder.createFile(req.fileName, body, 'application/json');
    }
    file.setDescription(JSON.stringify({ planNo: req.planNo || '' }));
    return { id: file.getId(), modified: file.getLastUpdated().toISOString() };
  }
};
