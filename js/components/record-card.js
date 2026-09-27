export function renderRecordCard({key,item,currentModel,isFavorite,entries,expanded,groupView,isAdmin,color,escapeHtml}){
  const presentCount=entries.filter(x=>x.present).length;
  const totalSlots=entries.length;
  const versionTotal=entries.reduce((sum,x)=>sum+(x.versionCount||0),0);
  const statusClass=presentCount===0?"all-missing":presentCount===totalSlots?"all-present":"partial";
  const statusText=presentCount===0?"MISSING":presentCount===totalSlots?"PRESENT":"PARTIAL";
  const latest=entries.find(x=>x.present);
  const summary=entries.length===1
    ? `${presentCount?"1":"0"} document${presentCount===1?"":"s"} • ${versionTotal} version${versionTotal===1?"":"s"}`
    : `${presentCount}/${totalSlots} documents • ${versionTotal} version${versionTotal===1?"":"s"}`;
  const fileLine=latest?`${latest.filename||"Uploaded document"}${latest.size&&latest.size!=="—"?` • ${latest.size}`:""}`:"No uploaded document";
  const expandedPanel=expanded?`<div class="record-expanded-panel">
    <div class="expanded-summary">
      <span class="summary-status ${statusClass}"><span class="status-dot ${presentCount?"present":"missing"}"></span>${escapeHtml(statusText)}</span>
      <span><i class="fa-solid fa-file-lines"></i> ${escapeHtml(summary)}</span>
      <span><i class="fa-solid fa-folder-open"></i> ${entries.length} document slot${entries.length===1?"":"s"}</span>
    </div>
    <div class="expanded-record-grid">
      <div class="expanded-record-main">
        <div class="expanded-label">LATEST FILE</div>
        <div class="expanded-file-name" title="${escapeHtml(fileLine)}">${escapeHtml(fileLine)}</div>
        <div class="expanded-tags">${(item.tags||[]).slice(0,4).map(t=>`<span class="tag-chip">${escapeHtml(t)}</span>`).join("")}</div>
      </div>
      <div class="expanded-slot-list">
        ${entries.slice(0,4).map(entry=>`<div class="expanded-slot-row ${entry.present?"is-present":"is-missing"}">
          <span class="slot-state"><i class="fa-solid ${entry.present?"fa-circle-check":"fa-circle-xmark"}"></i></span>
          <span class="slot-name" title="${escapeHtml(entry.name||"")}">${escapeHtml(entry.name||"Document")}</span>
          <span class="slot-count">${entry.present?`${entry.versionCount} ver.`:"Missing"}</span>
        </div>`).join("")}
        ${entries.length>4?`<span class="more-slots">+${entries.length-4} more in Preview</span>`:""}
      </div>
    </div>
    <div class="expanded-footer">
      <button class="card-action primary" data-preview-record="${escapeHtml(key)}"><i class="fa-solid fa-eye"></i> Preview</button>
      ${latest?`<button class="card-action secondary" data-download="${escapeHtml(latest.storageKey)}" data-filename="${escapeHtml(latest.filename||"")}"><i class="fa-solid fa-download"></i> Download</button>`:""}
      ${isAdmin?`<button class="card-action secondary" data-open-upload="${escapeHtml(key)}" data-subpart-index="${escapeHtml(latest?.selectorValue??latest?.sourceKey??"")}"><i class="fa-solid fa-plus"></i> New Version</button>`:""}
      <button class="card-action ghost" data-copy-record="${escapeHtml(key)}">Copy details</button>
      <button class="card-action ghost" data-link-record="${escapeHtml(key)}">Copy link</button>
    </div>
  </div>`:"";
  return `<article id="record-${escapeHtml(key)}" class="record-card ${expanded?"is-expanded":""} ${groupView?"is-group-view":"is-all-view"} ${isFavorite?"is-favorite":""}" style="--record-accent:${color}" data-record="${escapeHtml(key)}" tabindex="0" aria-expanded="${expanded}">
    <div class="record-stripe" style="background:${color}"></div>
    <div class="record-collapsed-face">
      <div class="record-icon" style="background:${color}"><i class="fa-solid ${escapeHtml(item.icon)}"></i></div>
      <div class="record-primary">
        <div class="record-title-only" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
        <div class="record-subline"><span class="record-status ${statusClass}"><span class="status-dot ${presentCount?"present":"missing"}"></span>${escapeHtml(statusText)}</span><span class="record-summary">${escapeHtml(summary)}</span></div>
      </div>
      <button class="card-inline-action preview" data-preview-record="${escapeHtml(key)}" title="Preview" aria-label="Preview ${escapeHtml(item.title)}"><i class="fa-solid fa-eye"></i></button>
      ${latest?`<button class="card-inline-action download" data-download="${escapeHtml(latest.storageKey)}" data-filename="${escapeHtml(latest.filename||"")}" title="Download latest" aria-label="Download latest ${escapeHtml(item.title)}"><i class="fa-solid fa-download"></i></button>`:"<span class="card-inline-spacer"></span>"}
      <button class="favorite-btn ${isFavorite?"active":""}" data-favorite="${escapeHtml(`${currentModel}:${key}`)}" title="Favorite" aria-label="Favorite"><i class="fa-${isFavorite?"solid":"regular"} fa-star"></i></button>
      <span class="expand-cue" aria-hidden="true"><i class="fa-solid fa-chevron-down"></i></span>
    </div>
    ${expandedPanel}
  </article>`;
}
