const STORAGE_KEY = "dataset-locator-cards-v1";
const MAX_IMAGE_DIM = 1280;
const JPEG_QUALITY = 0.85;

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

const TAGS = TAG_GROUPS.flatMap((g) => g.chips);
const TAG_BY_ID = Object.fromEntries(TAGS.map((t) => [t.id, t]));

const state = {
  cards: [],
  search: "",
  activeFilters: new Set(),
  draftTags: new Set(),
  editingId: null,
  pendingScreenshot: null,
};

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
  detailTags: document.getElementById("detail-tags"),
  detailNotes: document.getElementById("detail-notes"),
  detailEditBtn: document.getElementById("detail-edit-btn"),
  detailDeleteBtn: document.getElementById("detail-delete-btn"),
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
  });
  if (migrated) persist();
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.cards));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
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
  els.modalChipGroups.innerHTML = TAG_GROUPS.map((group) => {
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
}

function renderFilterChips() {
  els.filterChipGroups.innerHTML = TAG_GROUPS.map((group) => {
    const chips = group.chips
      .map((t) =>
        chipHtml(t, {
          active: state.activeFilters.has(t.id),
          interactive: true,
          action: "toggle-filter",
        })
      )
      .join("");
    return `
      <div class="filter-group">
        <span class="filter-group-label">${escapeHtml(group.title)}</span>
        <div class="chip-row">${chips}</div>
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
        : `<span class="card-thumb-placeholder">No screenshot</span>`;
      const tagChips = c.tags
        .map((id) => TAG_BY_ID[id])
        .filter(Boolean)
        .map((t) => chipHtml(t, { active: true, interactive: false }))
        .join("");
      const tagsBlock = tagChips ? `<div class="card-tags">${tagChips}</div>` : `<div class="card-tags"></div>`;
      const notes = c.notes ? `<p class="card-notes">${escapeHtml(c.notes)}</p>` : "";
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

function saveCard(e) {
  e.preventDefault();
  const card = {
    id: state.editingId || uid(),
    name: els.name.value.trim(),
    link: els.link.value.trim(),
    tags: TAGS.filter((t) => state.draftTags.has(t.id)).map((t) => t.id),
    notes: els.notes.value.trim(),
    screenshot: state.pendingScreenshot,
    updatedAt: Date.now(),
  };
  if (!card.name || !card.link) return;

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
    alert(
      "Could not save — likely out of localStorage space. Try a smaller screenshot or remove old cards.\n\n" +
        err.message
    );
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
  persist();
  render();
}

function openDetailModal(card) {
  viewingId = card.id;
  els.detailTitle.textContent = card.name;
  els.detailLink.textContent = card.link;
  els.detailLink.href = card.link;

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

els.modalChipGroups.addEventListener("click", (e) => {
  const chip = e.target.closest("[data-action='toggle-draft']");
  if (!chip) return;
  const id = chip.dataset.tagId;
  if (state.draftTags.has(id)) state.draftTags.delete(id);
  else state.draftTags.add(id);
  renderModalChips();
});

els.filterChipGroups.addEventListener("click", (e) => {
  const chip = e.target.closest("[data-action='toggle-filter']");
  if (!chip) return;
  const id = chip.dataset.tagId;
  if (state.activeFilters.has(id)) state.activeFilters.delete(id);
  else state.activeFilters.add(id);
  render();
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
    else if (!els.modalBackdrop.classList.contains("hidden")) closeModal();
    else if (!els.detailBackdrop.classList.contains("hidden")) closeDetailModal();
  }
});

load();
render();
