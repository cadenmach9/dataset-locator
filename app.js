const STORAGE_KEY = "dataset-locator-cards-v1";
const CUSTOM_TAGS_KEY = "dataset-locator-custom-tags-v1";
const MAX_IMAGE_DIM = 1280;
const JPEG_QUALITY = 0.85;

const CUSTOM_TAG_PALETTE = [
  "#5b8def", "#3ec48f", "#e26a6a", "#a06ee2", "#56c8d4",
  "#e26ab8", "#e0a447", "#6fa86a", "#a87a4a", "#d4a44a", "#b86fc4",
];

// Screenshots live in IndexedDB rather than localStorage. localStorage caps
// at ~5MB per origin, which a few base64 screenshots exhaust; IndexedDB's
// quota scales with available disk, so card metadata stays small and safe.
const DB_NAME = "dataset-locator";
const DB_VERSION = 1;
const SHOT_STORE = "screenshots";
let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SHOT_STORE)) {
        db.createObjectStore(SHOT_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function idbPutScreenshot(id, dataUrl) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(SHOT_STORE, "readwrite");
        tx.objectStore(SHOT_STORE).put(dataUrl, id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

function idbGetScreenshot(id) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(SHOT_STORE, "readonly");
        const req = tx.objectStore(SHOT_STORE).get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      })
  );
}

function idbDeleteScreenshot(id) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(SHOT_STORE, "readwrite");
        tx.objectStore(SHOT_STORE).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

const TAG_GROUPS = [
  {
    id: "location",
    title: "Location",
    chips: [
      { id: "prod", label: "Prod", color: "#e26a6a" },
      { id: "develop", label: "Develop", color: "#8a98a8" },
      { id: "staging", label: "Staging", color: "#e8c547" },
    ],
  },
  {
    id: "tags",
    title: "Tags",
    chips: [
      { id: "marketing", label: "Cleared for Marketing", color: "#3ec48f" },
      { id: "fun", label: "Fun", color: "#e26ab8" },
      { id: "survey", label: "Survey", color: "#5b8def" },
      { id: "telecom", label: "Telecom", color: "#a06ee2" },
      { id: "transportation", label: "Transportation", color: "#e0a447" },
      { id: "utilities", label: "Utilities", color: "#56c8d4" },
      { id: "city", label: "City", color: "#6f6fc4" },
      { id: "suburban", label: "Suburban", color: "#6fa86a" },
      { id: "highway", label: "Highway", color: "#a87a4a" },
      { id: "poles", label: "Poles", color: "#b86fc4" },
      { id: "wires", label: "Wires", color: "#d4a44a" },
    ],
  },
];

let TAGS = TAG_GROUPS.flatMap((g) => g.chips);
let TAG_BY_ID = Object.fromEntries(TAGS.map((t) => [t.id, t]));

const state = {
  cards: [],
  customTags: [],
  search: "",
  activeFilters: new Set(),
  draftTags: new Set(),
  editingId: null,
  pendingScreenshot: null,
};

function currentTagGroups() {
  const groups = TAG_GROUPS.slice();
  if (state.customTags.length > 0) {
    groups.push({ id: "custom", title: "Custom", chips: state.customTags.slice() });
  }
  return groups;
}

function rebuildTagIndex() {
  TAGS = currentTagGroups().flatMap((g) => g.chips);
  TAG_BY_ID = Object.fromEntries(TAGS.map((t) => [t.id, t]));
}

function loadCustomTags() {
  try {
    const raw = localStorage.getItem(CUSTOM_TAGS_KEY);
    state.customTags = raw ? JSON.parse(raw) : [];
  } catch {
    state.customTags = [];
  }
  rebuildTagIndex();
}

function persistCustomTags() {
  localStorage.setItem(CUSTOM_TAGS_KEY, JSON.stringify(state.customTags));
}

function slugifyTagLabel(label) {
  const base = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return base || "tag";
}

function uniqueTagId(label) {
  const base = slugifyTagLabel(label);
  const existing = new Set(TAGS.map((t) => t.id));
  if (!existing.has(base)) return base;
  let i = 2;
  while (existing.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

function pickCustomTagColor() {
  return CUSTOM_TAG_PALETTE[state.customTags.length % CUSTOM_TAG_PALETTE.length];
}

function createCustomTag(label) {
  const lower = label.toLowerCase();
  const existing = TAGS.find((t) => t.label.toLowerCase() === lower);
  if (existing) return existing;
  const id = uniqueTagId(label);
  const color = pickCustomTagColor();
  const tag = { id, label, color };
  state.customTags.push(tag);
  persistCustomTags();
  rebuildTagIndex();
  return tag;
}

const els = {
  cards: document.getElementById("cards"),
  emptyState: document.getElementById("empty-state"),
  search: document.getElementById("search"),
  filterChipGroups: document.getElementById("filter-chip-groups"),
  clearFilters: document.getElementById("clear-filters"),
  newBtn: document.getElementById("new-card-btn"),
  modalBackdrop: document.getElementById("modal-backdrop"),
  modalTitle: document.getElementById("modal-title"),
  modalClose: document.getElementById("modal-close"),
  cancelBtn: document.getElementById("cancel-btn"),
  form: document.getElementById("card-form"),
  cardId: document.getElementById("card-id"),
  name: document.getElementById("card-name"),
  link: document.getElementById("card-link"),
  modalChipGroups: document.getElementById("modal-chip-groups"),
  notes: document.getElementById("card-notes"),
  screenshotInput: document.getElementById("card-screenshot"),
  previewWrap: document.getElementById("screenshot-preview-wrap"),
  preview: document.getElementById("screenshot-preview"),
  removeScreenshot: document.getElementById("remove-screenshot"),
  lightbox: document.getElementById("lightbox"),
  lightboxImg: document.getElementById("lightbox-img"),
  detailBackdrop: document.getElementById("detail-backdrop"),
  detailBackBtn: document.getElementById("detail-back-btn"),
  detailScreenshotWrap: document.getElementById("detail-screenshot-wrap"),
  detailScreenshot: document.getElementById("detail-screenshot"),
  detailTitle: document.getElementById("detail-title"),
  detailLink: document.getElementById("detail-link"),
  detailPath: document.getElementById("detail-path"),
  detailTags: document.getElementById("detail-tags"),
  detailNotes: document.getElementById("detail-notes"),
  detailEditBtn: document.getElementById("detail-edit-btn"),
  detailDeleteBtn: document.getElementById("detail-delete-btn"),
  addTagBackdrop: document.getElementById("add-tag-backdrop"),
  addTagInput: document.getElementById("add-tag-modal-input"),
  addTagConfirm: document.getElementById("add-tag-modal-confirm"),
  addTagCancel: document.getElementById("add-tag-modal-cancel"),
};

let viewingId = null;

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state.cards = raw ? JSON.parse(raw) : [];
  } catch {
    state.cards = [];
  }
  // Migrate older shape: { cleared: bool } -> { tags: ["marketing"] }
  let migrated = false;
  state.cards.forEach((c) => {
    if (!Array.isArray(c.tags)) {
      c.tags = c.cleared ? ["marketing"] : [];
      delete c.cleared;
      migrated = true;
    }
    const derived = derivePathFromLink(c.link);
    if (c.path !== derived) {
      c.path = derived;
      migrated = true;
    }
  });
  // persist() is called once during init() after screenshots migrate to IDB.
}

function persist() {
  // Screenshots are kept out of localStorage and stored in IndexedDB; only
  // lightweight metadata is written here so the ~5MB quota is never an issue.
  const slim = state.cards.map((c) => {
    const { screenshot, ...rest } = c;
    return rest;
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
}

// One-time move of any inline base64 screenshots (from the old localStorage
// format) into IndexedDB. The in-memory data URL is preserved for rendering.
async function migrateScreenshotsToIdb() {
  for (const c of state.cards) {
    if (typeof c.screenshot === "string" && c.screenshot) {
      try {
        await idbPutScreenshot(c.id, c.screenshot);
        c.hasScreenshot = true;
      } catch {
        // Leave the screenshot inline if IndexedDB is unavailable.
      }
    }
  }
}

// Pull screenshots out of IndexedDB into memory so render() can use them.
async function hydrateScreenshots() {
  await Promise.all(
    state.cards.map(async (c) => {
      if (c.hasScreenshot && !c.screenshot) {
        try {
          c.screenshot = await idbGetScreenshot(c.id);
        } catch {
          /* ignore */
        }
      }
    })
  );
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function derivePathFromLink(link) {
  if (!link) return "";
  const marker = "mach9.io/";
  const idx = link.indexOf(marker);
  if (idx === -1) return "";
  return link.slice(idx + marker.length);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function chipHtml(tag, { active, interactive, action, dataAttr }) {
  const cls = interactive ? "chip" : "chip chip-static";
  const role = interactive ? `type="button" aria-pressed="${active}"` : "";
  const data = `data-active="${active}"` + (dataAttr ? ` ${dataAttr}` : "");
  const actionAttr = action ? ` data-action="${action}" data-tag-id="${tag.id}"` : "";
  return `<button ${role} class="${cls}" style="--chip-color:${tag.color}" ${data}${actionAttr}>${escapeHtml(tag.label)}</button>`;
}

function renderModalChips() {
  const groupsHtml = currentTagGroups().map((group) => {
    const chips = group.chips
      .map((t) =>
        chipHtml(t, {
          active: state.draftTags.has(t.id),
          interactive: true,
          action: "toggle-draft",
        })
      )
      .join("");
    return `
      <div class="chip-field">
        <span class="chip-field-label">${escapeHtml(group.title)}</span>
        <div class="chip-row">${chips}</div>
      </div>
    `;
  }).join("");
  const addTagHtml = `
    <div class="chip-field add-tag-field">
      <div class="add-tag-control" id="add-tag-control">
        <button type="button" class="add-tag-trigger" data-action="open-add-tag">+ New tag</button>
      </div>
    </div>
  `;
  els.modalChipGroups.innerHTML = groupsHtml + addTagHtml;
}

function renderFilterChips() {
  const groups = currentTagGroups();
  els.filterChipGroups.innerHTML = groups.map((group, i) => {
    const isLast = i === groups.length - 1;
    const chips = group.chips
      .map((t) =>
        chipHtml(t, {
          active: state.activeFilters.has(t.id),
          interactive: true,
          action: "toggle-filter",
        })
      )
      .join("");
    const addChip = isLast
      ? `<button type="button" class="chip add-tag-chip" data-action="filter-add-tag" title="Add a new tag" aria-label="Add a new tag">+</button>`
      : "";
    return `
      <div class="filter-group">
        <span class="filter-group-label">${escapeHtml(group.title)}</span>
        <div class="chip-row">${chips}${addChip}</div>
      </div>
    `;
  }).join("");
  els.clearFilters.classList.toggle("hidden", state.activeFilters.size === 0);
}

function render() {
  renderFilterChips();

  const q = state.search.trim().toLowerCase();
  const filtered = state.cards.filter((c) => {
    if (state.activeFilters.size > 0) {
      const cardTags = new Set(c.tags);
      for (const id of state.activeFilters) {
        if (!cardTags.has(id)) return false;
      }
    }
    if (q) {
      const hay = `${c.name} ${c.link} ${c.notes || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  els.emptyState.classList.toggle("hidden", state.cards.length > 0);
  if (state.cards.length === 0) {
    els.cards.innerHTML = "";
    return;
  }

  if (filtered.length === 0) {
    els.cards.innerHTML = `<div class="empty-state" style="grid-column:1/-1">No matches.</div>`;
    return;
  }

  els.cards.innerHTML = filtered
    .map((c) => {
      const thumb = c.screenshot
        ? `<img src="${c.screenshot}" alt="${escapeHtml(c.name)} screenshot" />`
        : c.hasScreenshot
          ? ""
          : `<span class="card-thumb-placeholder">No screenshot</span>`;
      const tagChips = c.tags
        .map((id) => TAG_BY_ID[id])
        .filter(Boolean)
        .map((t) => chipHtml(t, { active: true, interactive: false }))
        .join("");
      const tagsBlock = tagChips ? `<div class="card-tags">${tagChips}</div>` : `<div class="card-tags"></div>`;
      const notes = c.notes ? `<p class="card-notes">${escapeHtml(c.notes)}</p>` : "";
      const copyPath = c.path
        ? `<button class="copy-path-btn" data-action="copy-path" data-id="${c.id}" title="${escapeHtml(c.path)}">Copy Path</button>`
        : "";
      return `
        <article class="card" data-id="${c.id}">
          <div class="card-thumb" data-action="zoom" data-id="${c.id}">${thumb}</div>
          <div class="card-body">
            <h3 class="card-title">${escapeHtml(c.name)}</h3>
            <a class="card-link" href="${escapeHtml(c.link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(c.link)}</a>
            ${notes}
            <div class="card-footer">
              ${tagsBlock}
              <div class="card-actions">
                <button class="edit-link" data-action="edit" data-id="${c.id}">Edit</button>
                <button class="danger-link" data-action="delete" data-id="${c.id}">Delete</button>
              </div>
            </div>
            ${copyPath}
          </div>
        </article>
      `;
    })
    .join("");
}

function openModal(card) {
  state.editingId = card ? card.id : null;
  state.pendingScreenshot = card ? card.screenshot || null : null;
  state.draftTags = new Set(card ? card.tags || [] : []);
  els.modalTitle.textContent = card ? "Edit dataset" : "New dataset";
  els.cardId.value = card ? card.id : "";
  els.name.value = card ? card.name : "";
  els.link.value = card ? card.link : "";
  els.notes.value = card ? card.notes || "" : "";
  els.screenshotInput.value = "";
  renderModalChips();
  updatePreview();
  els.modalBackdrop.classList.remove("hidden");
  setTimeout(() => els.name.focus(), 50);
}

function closeModal() {
  state.editingId = null;
  state.pendingScreenshot = null;
  state.draftTags = new Set();
  els.modalBackdrop.classList.add("hidden");
  els.form.reset();
}

function updatePreview() {
  if (state.pendingScreenshot) {
    els.preview.src = state.pendingScreenshot;
    els.previewWrap.classList.remove("hidden");
  } else {
    els.preview.removeAttribute("src");
    els.previewWrap.classList.add("hidden");
  }
}

async function fileToCompressedDataUrl(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });

  let { width, height } = img;
  if (width > MAX_IMAGE_DIM || height > MAX_IMAGE_DIM) {
    const scale = Math.min(MAX_IMAGE_DIM / width, MAX_IMAGE_DIM / height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

async function handleScreenshotFile(file) {
  if (!file || !file.type.startsWith("image/")) return;
  try {
    state.pendingScreenshot = await fileToCompressedDataUrl(file);
    updatePreview();
  } catch (err) {
    alert("Could not process image: " + err.message);
  }
}

async function saveCard(e) {
  e.preventDefault();
  const id = state.editingId || uid();
  const card = {
    id,
    name: els.name.value.trim(),
    link: els.link.value.trim(),
    path: derivePathFromLink(els.link.value.trim()),
    tags: TAGS.filter((t) => state.draftTags.has(t.id)).map((t) => t.id),
    notes: els.notes.value.trim(),
    screenshot: state.pendingScreenshot || null,
    hasScreenshot: !!state.pendingScreenshot,
    updatedAt: Date.now(),
  };
  if (!card.name || !card.link) return;

  // Store the screenshot in IndexedDB (large quota), not localStorage.
  try {
    if (state.pendingScreenshot) {
      await idbPutScreenshot(id, state.pendingScreenshot);
    } else {
      await idbDeleteScreenshot(id);
    }
  } catch (err) {
    alert("Could not save the screenshot.\n\n" + err.message);
    return;
  }

  if (state.editingId) {
    const idx = state.cards.findIndex((c) => c.id === state.editingId);
    if (idx >= 0) {
      card.createdAt = state.cards[idx].createdAt;
      state.cards[idx] = card;
    }
  } else {
    card.createdAt = Date.now();
    state.cards.unshift(card);
  }

  try {
    persist();
  } catch (err) {
    alert("Could not save the card details.\n\n" + err.message);
    return;
  }
  closeModal();
  render();
}

function deleteCard(id) {
  const card = state.cards.find((c) => c.id === id);
  if (!card) return;
  if (!confirm(`Delete "${card.name}"?`)) return;
  state.cards = state.cards.filter((c) => c.id !== id);
  idbDeleteScreenshot(id).catch(() => {});
  persist();
  render();
}

function openDetailModal(card) {
  viewingId = card.id;
  els.detailTitle.textContent = card.name;
  els.detailLink.textContent = card.link;
  els.detailLink.href = card.link;

  if (card.path) {
    els.detailPath.textContent = card.path;
    els.detailPath.classList.remove("hidden");
  } else {
    els.detailPath.textContent = "";
    els.detailPath.classList.add("hidden");
  }

  if (card.screenshot) {
    els.detailScreenshot.src = card.screenshot;
    els.detailScreenshotWrap.classList.remove("hidden");
  } else {
    els.detailScreenshot.removeAttribute("src");
    els.detailScreenshotWrap.classList.add("hidden");
  }

  els.detailTags.innerHTML = card.tags
    .map((id) => TAG_BY_ID[id])
    .filter(Boolean)
    .map((t) => chipHtml(t, { active: true, interactive: false }))
    .join("");

  if (card.notes) {
    els.detailNotes.textContent = card.notes;
    els.detailNotes.classList.remove("hidden");
  } else {
    els.detailNotes.textContent = "";
    els.detailNotes.classList.add("hidden");
  }

  els.detailBackdrop.classList.remove("hidden");
}

function closeDetailModal() {
  viewingId = null;
  els.detailBackdrop.classList.add("hidden");
  if (detailModalEl) detailModalEl.style.transform = "";
}

async function copyPathToClipboard(path, btn) {
  try {
    await navigator.clipboard.writeText(path);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = path;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch {}
    document.body.removeChild(ta);
  }
  if (!btn) return;
  const original = btn.textContent;
  btn.textContent = "Copied!";
  btn.classList.add("copied");
  setTimeout(() => {
    btn.textContent = original;
    btn.classList.remove("copied");
  }, 1200);
}

function openLightbox(src) {
  els.lightboxImg.src = src;
  els.lightbox.classList.remove("hidden");
}

function closeLightbox() {
  els.lightbox.classList.add("hidden");
  els.lightboxImg.removeAttribute("src");
}

// Event wiring
els.newBtn.addEventListener("click", () => openModal(null));
els.modalClose.addEventListener("click", closeModal);
els.cancelBtn.addEventListener("click", closeModal);
els.modalBackdrop.addEventListener("click", (e) => {
  if (e.target === els.modalBackdrop) closeModal();
});

els.form.addEventListener("submit", saveCard);

function showAddTagForm() {
  const ctrl = document.getElementById("add-tag-control");
  if (!ctrl) return;
  ctrl.innerHTML = `
    <input id="add-tag-input" type="text" maxlength="40" placeholder="New tag name" />
    <button type="button" class="add-tag-confirm" data-action="confirm-add-tag">Add</button>
    <button type="button" class="add-tag-cancel" data-action="cancel-add-tag">Cancel</button>
  `;
  const input = document.getElementById("add-tag-input");
  input.focus();
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submitAddTag();
    } else if (e.key === "Escape") {
      e.preventDefault();
      renderModalChips();
    }
  });
}

function submitAddTag() {
  const input = document.getElementById("add-tag-input");
  if (!input) return;
  const label = input.value.trim();
  if (!label) {
    input.focus();
    return;
  }
  const tag = createCustomTag(label);
  state.draftTags.add(tag.id);
  renderModalChips();
  renderFilterChips();
}

els.modalChipGroups.addEventListener("click", (e) => {
  const actionEl = e.target.closest("[data-action]");
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  if (action === "toggle-draft") {
    const id = actionEl.dataset.tagId;
    if (state.draftTags.has(id)) state.draftTags.delete(id);
    else state.draftTags.add(id);
    renderModalChips();
  } else if (action === "open-add-tag") {
    showAddTagForm();
  } else if (action === "confirm-add-tag") {
    submitAddTag();
  } else if (action === "cancel-add-tag") {
    renderModalChips();
  }
});

function openAddTagPopup() {
  els.addTagInput.value = "";
  els.addTagBackdrop.classList.remove("hidden");
  setTimeout(() => els.addTagInput.focus(), 30);
}

function closeAddTagPopup() {
  els.addTagBackdrop.classList.add("hidden");
}

function submitAddTagPopup() {
  const label = els.addTagInput.value.trim();
  if (!label) {
    els.addTagInput.focus();
    return;
  }
  createCustomTag(label);
  closeAddTagPopup();
  renderFilterChips();
  if (!els.modalBackdrop.classList.contains("hidden")) renderModalChips();
}

els.filterChipGroups.addEventListener("click", (e) => {
  const actionEl = e.target.closest("[data-action]");
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  if (action === "toggle-filter") {
    const id = actionEl.dataset.tagId;
    if (state.activeFilters.has(id)) state.activeFilters.delete(id);
    else state.activeFilters.add(id);
    render();
  } else if (action === "filter-add-tag") {
    openAddTagPopup();
  }
});

els.addTagConfirm.addEventListener("click", submitAddTagPopup);
els.addTagCancel.addEventListener("click", closeAddTagPopup);
els.addTagBackdrop.addEventListener("click", (e) => {
  if (e.target === els.addTagBackdrop) closeAddTagPopup();
});
els.addTagInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    submitAddTagPopup();
  }
});

els.clearFilters.addEventListener("click", () => {
  state.activeFilters.clear();
  render();
});

els.screenshotInput.addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (file) handleScreenshotFile(file);
});

els.removeScreenshot.addEventListener("click", () => {
  state.pendingScreenshot = null;
  els.screenshotInput.value = "";
  updatePreview();
});

document.addEventListener("paste", (e) => {
  if (els.modalBackdrop.classList.contains("hidden")) return;
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) {
        handleScreenshotFile(file);
        e.preventDefault();
        break;
      }
    }
  }
});

els.search.addEventListener("input", (e) => {
  state.search = e.target.value;
  render();
});

els.cards.addEventListener("click", (e) => {
  if (e.target.closest("a")) return;

  const actionEl = e.target.closest("[data-action]");
  if (actionEl) {
    const id = actionEl.dataset.id;
    const action = actionEl.dataset.action;
    if (action === "edit") {
      const card = state.cards.find((c) => c.id === id);
      if (card) openModal(card);
    } else if (action === "delete") {
      deleteCard(id);
    } else if (action === "zoom") {
      const card = state.cards.find((c) => c.id === id);
      if (card) openDetailModal(card);
    } else if (action === "copy-path") {
      const card = state.cards.find((c) => c.id === id);
      if (card && card.path) copyPathToClipboard(card.path, actionEl);
    }
    return;
  }

  const cardEl = e.target.closest(".card");
  if (!cardEl) return;
  const card = state.cards.find((c) => c.id === cardEl.dataset.id);
  if (card) openDetailModal(card);
});

els.detailBackBtn.addEventListener("click", closeDetailModal);
els.detailBackdrop.addEventListener("click", (e) => {
  if (e.target === els.detailBackdrop) closeDetailModal();
});

els.detailScreenshotWrap.addEventListener("click", () => {
  if (els.detailScreenshot.src) openLightbox(els.detailScreenshot.src);
});

els.detailEditBtn.addEventListener("click", () => {
  const card = state.cards.find((c) => c.id === viewingId);
  if (!card) return;
  closeDetailModal();
  openModal(card);
});

els.detailDeleteBtn.addEventListener("click", () => {
  const id = viewingId;
  if (!id) return;
  closeDetailModal();
  deleteCard(id);
});

const TILT_MAX_DEG = 8;
const TILT_LIFT_PX = 6;

function applyCardTilt(card, e) {
  const rect = card.getBoundingClientRect();
  const px = (e.clientX - rect.left) / rect.width;
  const py = (e.clientY - rect.top) / rect.height;
  const rotateX = (py - 0.5) * TILT_MAX_DEG;
  const rotateY = (0.5 - px) * TILT_MAX_DEG;
  card.style.transform = `perspective(900px) translateY(-${TILT_LIFT_PX}px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg)`;
}

function resetCardTilt(card) {
  card.style.transform = "";
}

els.cards.addEventListener("mousemove", (e) => {
  const card = e.target.closest(".card");
  if (!card) return;
  applyCardTilt(card, e);
});

els.cards.addEventListener("mouseout", (e) => {
  const card = e.target.closest(".card");
  if (!card) return;
  if (card.contains(e.relatedTarget)) return;
  resetCardTilt(card);
});

const detailModalEl = document.querySelector(".detail-modal");
const DETAIL_TILT_MAX_DEG = 6;

function applyDetailTiltFromPointer(e) {
  if (!detailModalEl) return;
  if (els.detailBackdrop.classList.contains("hidden")) return;
  const rect = detailModalEl.getBoundingClientRect();
  const cx = (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
  const cy = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
  const clampedX = Math.max(-1.5, Math.min(1.5, cx));
  const clampedY = Math.max(-1.5, Math.min(1.5, cy));
  const rotateX = (clampedY / 2) * DETAIL_TILT_MAX_DEG;
  const rotateY = (-clampedX / 2) * DETAIL_TILT_MAX_DEG;
  detailModalEl.style.transform =
    `perspective(1100px) translateY(-${TILT_LIFT_PX}px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg)`;
}

document.addEventListener("mousemove", applyDetailTiltFromPointer);

els.cards.addEventListener(
  "wheel",
  (e) => {
    const tagsEl = e.target.closest(".card-tags");
    if (!tagsEl) return;
    if (tagsEl.scrollWidth <= tagsEl.clientWidth) return;
    const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (delta === 0) return;
    e.preventDefault();
    tagsEl.scrollLeft += delta;
  },
  { passive: false }
);

els.lightbox.addEventListener("click", closeLightbox);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (!els.lightbox.classList.contains("hidden")) closeLightbox();
    else if (!els.addTagBackdrop.classList.contains("hidden")) closeAddTagPopup();
    else if (!els.modalBackdrop.classList.contains("hidden")) closeModal();
    else if (!els.detailBackdrop.classList.contains("hidden")) closeDetailModal();
  }
});

loadCustomTags();
load();
render();

(async () => {
  await migrateScreenshotsToIdb();
  persist();
  await hydrateScreenshots();
  render();
})();
