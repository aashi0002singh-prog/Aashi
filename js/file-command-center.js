import {MODEL_ORDER, RECORD_ORDER, createDefaultData} from "../data/models.js";
import {getRepositoryDocuments, getFileVersion, getAuditLogs, addAudit} from "./database.js";
import {downloadBlob, formatBytes, escapeHtml, fileExtension, mimeForFilename, normalizeFileBlob} from "./ui.js";

/*
  Isolated File Command Center.
  This module intentionally does not modify app.js, record rendering, model selection,
  upload handlers, or existing click handlers. It only owns its own modal and button.
*/

const DATA_KEY = "MOBILE_RND_DB_DATA_V10";
let rows = [];
let objectUrl = null;

function loadData() {
  try { return JSON.parse(localStorage.getItem(DATA_KEY)) || createDefaultData(); }
  catch { return createDefaultData(); }
}

async function collectRecords(){
  const versions=await getRepositoryDocuments();
  return versions.map(v=>({model:v.modelCode,key:v.recordCode,subpart:v.slotName||'',title:v.recordCode,category:'Engineering Record',filename:v.filename||'Uploaded file',size:v.size?formatBytes(v.size):'—',versionId:v.versionId,revision:v.revision||'',modelId:v.modelId||null,recordId:v.recordId||null,slotId:v.slotId||null}));
}
function iconFor(filename = "") {
  const ext = filename.split(".").pop().toLowerCase();
  if (ext === "pdf") return "fa-file-pdf";
  if (["xls", "xlsx", "csv"].includes(ext)) return "fa-file-excel";
  if (["doc", "docx"].includes(ext)) return "fa-file-word";
  if (["ppt", "pptx"].includes(ext)) return "fa-file-powerpoint";
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return "fa-file-image";
  if (["zip", "bin"].includes(ext)) return "fa-file-zipper";
  return "fa-file-lines";
}

function extOf(filename = "") { return filename.split(".").pop().toLowerCase(); }

function modal() { return document.getElementById("fileCenterModal"); }
function close() { modal()?.classList.add("hidden"); document.getElementById("filePreviewModal")?.classList.add("hidden"); clearPreview(); }
function open() { clearPreview(); document.getElementById("filePreviewModal")?.classList.add("hidden"); modal()?.classList.remove("hidden"); refresh(); }

function renderModelOptions() {
  const select = document.getElementById("fileCenterModel");
  if (!select || select.options.length > 1) return;
  const data = loadData();
  select.innerHTML = `<option value="">All models</option>` + Object.keys(data).filter(Boolean).sort().map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
}

function filtered() {
  const q = (document.getElementById("fileCenterSearch")?.value || "").trim().toLowerCase();
  const model = document.getElementById("fileCenterModel")?.value || "";
  return rows.filter(r => (!model || r.model === model) && (!q || `${r.model} ${r.key} ${r.subpart || ""} ${r.title} ${r.category} ${r.filename}`.toLowerCase().includes(q)));
}

function render() {
  const list = document.getElementById("fileCenterList");
  const count = document.getElementById("fileCenterCount");
  if (!list) return;
  const items = filtered();
  if (count) count.textContent = `${items.length} file${items.length === 1 ? "" : "s"}`;
  if (!items.length) {
    list.innerHTML = `<div class="file-center-empty"><i class="fa-solid fa-folder-open"></i><strong>No uploaded files found</strong><span>Use Upload from the Admin controls to add an engineering file.</span></div>`;
    return;
  }
  list.innerHTML = items.map((r, i) => `
    <div class="file-center-row" data-index="${i}">
      <div class="file-center-icon"><i class="fa-solid ${iconFor(r.filename)}"></i></div>
      <div class="file-center-main">
        <strong title="${escapeHtml(r.filename)}">${escapeHtml(r.filename)}</strong>
        <span>${escapeHtml(r.model)} · ${escapeHtml(r.key)}${r.subpart ? ` / ${escapeHtml(r.subpart)}` : ""} · ${escapeHtml(r.category)} · ${escapeHtml(r.size)}</span>
      </div>
      <div class="file-center-actions">
        <button type="button" class="fc-action" data-action="preview" title="Preview"><i class="fa-solid fa-eye"></i></button>
        <button type="button" class="fc-action" data-action="download" title="Download"><i class="fa-solid fa-download"></i></button>
      </div>
    </div>`).join("");
}

async function recentUploads() {
  const el = document.getElementById("fileCenterRecent");
  if (!el) return;
  try {
    const logs = await getAuditLogs(30);
    const uploads = (logs || []).filter(x => x.action === "UPLOAD").slice(0, 5);
    el.innerHTML = uploads.length ? uploads.map(x => {
      const d = (x.at || x.timestamp) ? new Date(x.at || x.timestamp).toLocaleString() : "";
      const p = x.details || {};
      return `<div class="file-center-recent-item"><i class="fa-solid fa-cloud-arrow-up"></i><span><strong>${escapeHtml(p.filename || "Engineering file")}</strong><small>${escapeHtml(p.model || "")} · ${escapeHtml(p.key || "")}${p.subpart ? ` / ${escapeHtml(p.subpart)}` : ""} · ${escapeHtml(d)}</small></span></div>`;
    }).join("") : `<div class="file-center-recent-empty">No recent uploads recorded.</div>`;
  } catch {
    el.innerHTML = `<div class="file-center-recent-empty">Recent upload history is unavailable.</div>`;
  }
}

function clearPreview() {
  if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
  const body = document.getElementById("filePreviewBody");
  if (body) body.innerHTML = "";
}

async function getSelected(row) {
  return getFileVersion(row.versionId);
}

async function downloadRow(row) {
  const record = await getSelected(row);
  if (!record?.blob) throw new Error("File is not present in local storage.");
  const filename=record.filename || row.filename;
  const ok = downloadBlob(record.blob, filename);
  if (!ok) throw new Error("Browser blocked the download.");
  await addAudit("DOWNLOAD",{model:row.model,key:row.key,subpart:row.subpart || "",filename,modelId:row.modelId||null,recordId:row.recordId||null,slotId:row.slotId||null,versionId:row.versionId||null});
}

async function previewRow(row) {
  const record = await getSelected(row);
  if (!record?.blob) throw new Error("File is not present in local storage.");
  clearPreview();
  const filename=record.filename || row.filename || "engineering-file";
  const ext=fileExtension(filename);
  const blob=normalizeFileBlob(record.blob,filename);
  objectUrl = URL.createObjectURL(blob);
  const body = document.getElementById("filePreviewBody");
  const title = document.getElementById("filePreviewTitle");
  const meta = document.getElementById("filePreviewMeta");
  if (title) title.textContent = filename;
  if (meta) meta.textContent = `${row.model} · ${row.key} · ${formatBytes(blob.size)} · ${blob.type || mimeForFilename(filename)}`;
  if (!body) return;
  const type=blob.type || mimeForFilename(filename);
  if (type.startsWith("image/") || ["png","jpg","jpeg","webp","gif"].includes(ext)) {
    body.innerHTML = `<img class="file-preview-image" src="${objectUrl}" alt="${escapeHtml(filename)}">`;
  } else if (type === "application/pdf" || ext === "pdf") {
    body.innerHTML = `<iframe class="file-preview-frame" src="${objectUrl}#view=FitH" title="PDF preview"></iframe>`;
  } else if (type.startsWith("text/") || ["csv","txt","json","xml","log"].includes(ext)) {
    const text = await blob.text();
    body.innerHTML = `<pre class="file-preview-text">${escapeHtml(text.slice(0, 200000))}</pre>`;
  } else {
    body.innerHTML = `<div class="file-preview-unsupported"><i class="fa-solid fa-file-circle-check"></i><strong>File uploaded successfully.</strong><span>This format is stored safely but your browser does not provide an inline viewer for it.</span><div class="preview-action-row"><button type="button" class="btn btn-dark" id="openUploadedFile"><i class="fa-solid fa-arrow-up-right-from-square"></i> Open File</button><button type="button" class="btn btn-dark" id="previewDownloadBtn"><i class="fa-solid fa-download"></i> Download</button></div></div>`;
    document.getElementById("openUploadedFile")?.addEventListener("click",()=>{const w=window.open(objectUrl,"_blank","noopener,noreferrer");if(!w)downloadRow(row).catch(e=>window.alert(e.message));});
    document.getElementById("previewDownloadBtn")?.addEventListener("click", () => downloadRow(row).catch(e => window.alert(e.message)));
  }
  document.getElementById("filePreviewModal")?.classList.remove("hidden");
}

async function refresh() {
  rows = await collectRecords();
  renderModelOptions();
  render();
  recentUploads();
}

function bind() {
  const btn = document.getElementById("fileCenterBtn");
  if (!btn) return;
  btn.addEventListener("click", open);
  document.getElementById("fileCenterRefresh")?.addEventListener("click", () => refresh());
  document.getElementById("fileCenterSearch")?.addEventListener("input", render);
  document.getElementById("fileCenterModel")?.addEventListener("change", render);
  document.querySelectorAll("[data-close-file-center]").forEach(b => b.addEventListener("click", () => close()));
  document.getElementById("fileCenterModal")?.addEventListener("click", async e => {
    if (e.target.classList.contains("modal-backdrop")) { close(); return; }
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (!action) return;
    const rowEl = e.target.closest(".file-center-row");
    const row = rowEl ? filtered()[Number(rowEl.dataset.index)] : null;
    if (!row) return;
    try {
      if (action === "download") await downloadRow(row);
      if (action === "preview") await previewRow(row);
    } catch (err) {
      window.alert(err?.message || "File operation failed.");
    }
  });
  document.getElementById("filePreviewModal")?.addEventListener("click", e => { if (e.target.classList.contains("modal-backdrop")) document.getElementById("filePreviewModal").classList.add("hidden"); });
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    document.getElementById("filePreviewModal")?.classList.add("hidden");
    close();
  });
}

document.addEventListener("DOMContentLoaded", bind);
