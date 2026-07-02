// QueueTube - popup.js
// Tag manager: create tags, assign channels to them.

// ── Extension storage ─────────────────────────────────────────

const CHANNEL_TAGS_KEY = "queuetube_channel_tags";
const CHANNELS_KEY = "queuetube_channels";
const CHANNEL_META_KEY = "queuetube_channel_meta";

function storageGet(defaults) {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get(defaults, items => resolve(items || defaults));
    } catch(e) {
      resolve(defaults);
    }
  });
}

function storageSet(values) {
  return new Promise(resolve => {
    try {
      chrome.storage.local.set(values, resolve);
    } catch(e) {
      resolve();
    }
  });
}

function storageRemove(keys) {
  return new Promise(resolve => {
    try {
      chrome.storage.local.remove(keys, resolve);
    } catch(e) {
      resolve();
    }
  });
}

async function saveChannelTags() {
  await storageSet({ [CHANNEL_TAGS_KEY]: state.channelTags });
}

// ── State ─────────────────────────────────────────────────────

const state = {
  channels: [],        // [{ handle, displayName }]
  channelTags: {},     // { [handle]: string[] }
  view: "main",
  activeTag: null,
  tagInput: "",
  tagInputVisible: false,
  channelQuery: "",
  tagChannelQuery: "",
  openInlineHandle: null, // handle whose inline tag dropdown is open
};

function getAllTags() {
  const set = new Set();
  Object.values(state.channelTags).forEach(arr => {
    if (Array.isArray(arr)) arr.forEach(t => set.add(t));
  });
  return [...set].filter(t => t !== "everything").sort();
}

function getHandlesInTag(tag) {
  return state.channels
    .filter(ch => (state.channelTags[ch.handle] || []).includes(tag))
    .map(ch => ch.handle);
}

function channelLabel(ch) {
  const handle = normaliseHandle(ch?.handle || "");
  const name = String(ch?.displayName || handle || "").trim();
  return handle ? `${name || handle} [@${handle}]` : name;
}

function channelLabelForHandle(handle) {
  const ch = state.channels.find(c => c.handle === handle);
  return channelLabel(ch || { handle, displayName: handle });
}

function esc(str) {
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function $(id) { return document.getElementById(id); }

function normaliseHandle(raw) {
  return String(raw).replace(/^\/?@/, "").trim().toLowerCase();
}

// ── Main view ─────────────────────────────────────────────────

function renderMain() {
  const tags = getAllTags();

  $("app").innerHTML = `
    <div id="search-wrap">
      <input id="search-input" type="text" placeholder="Search channels…" autocomplete="off" spellcheck="false" />
    </div>

    <div id="tags-bar">
      ${tags.map(tag => `<button class="tag-pill" data-tag="${esc(tag)}">#${esc(tag)}</button>`).join("")}
      <button id="plus-btn" title="Create new tag">+ New tag</button>
    </div>

    <div id="new-tag-wrap">
      <input id="new-tag-input" type="text" placeholder="Tag name…" maxlength="32" autocomplete="off" />
      <button id="new-tag-confirm">Create</button>
      <button id="new-tag-cancel">✕</button>
    </div>

    <div id="channel-list"></div>

    <div id="footer">
      <span id="channel-count">${state.channels.length} channels · ${tags.length} tag${tags.length!==1?"s":""}</span>
      <button id="settings-btn" title="Settings" aria-label="Settings">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
        </svg>
      </button>
    </div>
  `;

  renderChannelList();

  const searchEl = $("search-input");
  searchEl.value = state.channelQuery;
  searchEl.addEventListener("input", e => {
    state.channelQuery = e.target.value;
    state.openInlineHandle = null; // close any open dropdown on new search
    renderChannelList();
  });

  const plusBtn = $("plus-btn");
  const newTagWrap = $("new-tag-wrap");

  if (state.tagInputVisible) {
    newTagWrap.classList.add("visible");
    const inp = $("new-tag-input");
    inp.value = state.tagInput;
    // Don't auto-focus: that would scroll the popup and is jarring
    inp.addEventListener("input", e => { state.tagInput = e.target.value; });
    inp.addEventListener("keydown", e => { if (e.key==="Enter") confirmNewTag(); if (e.key==="Escape") cancelNewTag(); });
  }

  plusBtn.addEventListener("click", () => {
    state.tagInputVisible = !state.tagInputVisible;
    newTagWrap.classList.toggle("visible", state.tagInputVisible);
    if (state.tagInputVisible) {
      const inp = $("new-tag-input");
      inp.addEventListener("input", e => { state.tagInput = e.target.value; });
      inp.addEventListener("keydown", e => { if (e.key==="Enter") confirmNewTag(); if (e.key==="Escape") cancelNewTag(); });
      // Focus without scrolling — prevents the list jumping to top
      setTimeout(() => inp?.focus({ preventScroll: true }), 30);
    }
  });

  $("new-tag-confirm").addEventListener("click", confirmNewTag);
  $("new-tag-cancel").addEventListener("click", cancelNewTag);

  document.querySelectorAll(".tag-pill").forEach(btn => {
    btn.addEventListener("click", () => openTagView(btn.dataset.tag));
  });

  $("settings-btn").addEventListener("click", renderSettings);

  // Close inline dropdowns when clicking outside
  document.addEventListener("click", onDocClick, { capture: true, once: false });
}

// Close any open inline dropdown when clicking outside a channel row
function onDocClick(e) {
  if (!e.target.closest(".channel-row")) {
    if (state.openInlineHandle !== null) {
      state.openInlineHandle = null;
      rerenderInlineDropdowns();
    }
  }
}

function renderChannelList() {
  const list = $("channel-list");
  if (!list) return;

  const scrollTop = list.scrollTop; // preserve scroll position

  const query = state.channelQuery.toLowerCase();
  const filtered = query
    ? state.channels.filter(ch => ch.displayName.toLowerCase().includes(query) || ch.handle.includes(query))
    : state.channels;

  if (!filtered.length) {
    list.innerHTML = `<div class="empty-hint">No channels match</div>`;
    return;
  }

  list.innerHTML = filtered.map(ch => buildChannelRowHTML(ch)).join("");

  // Re-attach inline dropdown events
  attachChannelRowEvents();

  // Restore scroll — use requestAnimationFrame to let the DOM paint first
  requestAnimationFrame(() => { list.scrollTop = scrollTop; });
}

function buildChannelRowHTML(ch) {
  const assignedTags = state.channelTags[ch.handle] || [];
  const allTags = getAllTags();
  const isOpen = state.openInlineHandle === ch.handle;

  const chips = assignedTags.map(t =>
    `<span class="mini-chip" data-tag="${esc(t)}" data-handle="${esc(ch.handle)}">#${esc(t)} <span class="mini-chip-x">×</span></span>`
  ).join("");

  // Inline dropdown: show all tags, tick assigned ones
  const dropdownHTML = allTags.length > 0 ? `
    <div class="inline-tag-dropdown ${isOpen ? "open" : ""}">
      ${allTags.map(t => {
        const assigned = assignedTags.includes(t);
        return `<button class="inline-tag-option ${assigned ? "assigned" : ""}" data-handle="${esc(ch.handle)}" data-tag="${esc(t)}">#${esc(t)}</button>`;
      }).join("")}
    </div>
  ` : "";

  // Generate avatar initials from display name
  const initials = ch.displayName
    .split(/\s+/).filter(Boolean)
    .slice(0, 2).map(w => w[0]).join("").toUpperCase() || ch.handle[0].toUpperCase();

  return `
    <div class="channel-row ${isOpen ? "row-open" : ""}" data-handle="${esc(ch.handle)}">
      <div class="channel-row-main">
        <div class="ch-avatar">${initials}</div>
        <span class="channel-name" title="@${esc(ch.handle)}">${esc(channelLabel(ch))}</span>
        <div class="channel-tag-chips">${chips}</div>
      </div>
      ${dropdownHTML}
    </div>
  `;
}

function attachChannelRowEvents() {
  // Channel name click → toggle inline dropdown
  document.querySelectorAll(".channel-row-main").forEach(row => {
    row.addEventListener("click", e => {
      // Don't toggle if clicking a chip's remove X
      if (e.target.classList.contains("mini-chip-x") || e.target.closest(".mini-chip")) return;
      const handle = row.closest(".channel-row").dataset.handle;
      state.openInlineHandle = (state.openInlineHandle === handle) ? null : handle;
      rerenderInlineDropdowns();
      e.stopPropagation();
    });
  });

  // Chip X → remove tag inline
  document.querySelectorAll(".mini-chip").forEach(chip => {
    chip.addEventListener("click", e => {
      e.stopPropagation();
      const handle = chip.dataset.handle;
      const tag = chip.dataset.tag;
      if (state.channelTags[handle]) {
        state.channelTags[handle] = state.channelTags[handle].filter(t => t !== tag);
      }
      saveChannelTags();
      const list = $("channel-list");
      const scrollTop = list ? list.scrollTop : 0;
      renderChannelList();
      requestAnimationFrame(() => { if (list) list.scrollTop = scrollTop; });
    });
  });

  // Inline tag option toggle
  document.querySelectorAll(".inline-tag-option").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const handle = btn.dataset.handle;
      const tag = btn.dataset.tag;
      if (!state.channelTags[handle]) state.channelTags[handle] = [];
      if (state.channelTags[handle].includes(tag)) {
        state.channelTags[handle] = state.channelTags[handle].filter(t => t !== tag);
      } else {
        state.channelTags[handle].push(tag);
      }
      saveChannelTags();
      // Only re-render this specific row, preserving scroll
      rerenderSingleRow(handle);
    });
  });
}

// Re-render only the open/close state of inline dropdowns (lightweight)
function rerenderInlineDropdowns() {
  document.querySelectorAll(".channel-row").forEach(row => {
    const handle = row.dataset.handle;
    const isOpen = state.openInlineHandle === handle;
    row.classList.toggle("row-open", isOpen);
    const dropdown = row.querySelector(".inline-tag-dropdown");
    if (dropdown) dropdown.classList.toggle("open", isOpen);
  });
}

// Re-render a single channel row in place (preserves scroll perfectly)
function rerenderSingleRow(handle) {
  const ch = state.channels.find(c => c.handle === handle);
  if (!ch) return;
  const existing = document.querySelector(`.channel-row[data-handle="${CSS.escape(handle)}"]`);
  if (!existing) return;
  existing.outerHTML = buildChannelRowHTML(ch);
  // Re-attach events to ALL rows (cheapest correct approach)
  attachChannelRowEvents();
}

function cancelNewTag() {
  state.tagInputVisible = false; state.tagInput = "";
  $("new-tag-wrap")?.classList.remove("visible");
}

function confirmNewTag() {
  const inp = $("new-tag-input");
  const raw = (inp ? inp.value : state.tagInput).trim().replace(/^#+/,"").replace(/\s+/g,"-").toLowerCase();
  if (!raw) return;
  if (raw === "everything") {
    alert("#everything is reserved for QueueTube's built-in all-channels option.");
    return;
  }
  state.tagInput = ""; state.tagInputVisible = false;
  openTagView(raw);
}

// ── Tag view ──────────────────────────────────────────────────

function openTagView(tag) {
  state.activeTag = tag; state.tagChannelQuery = ""; state.view = "tag";
  // Remove the document click listener when leaving main view
  document.removeEventListener("click", onDocClick, { capture: true });
  renderTagView();
}

function renderTagView() {
  const tag = state.activeTag;
  const memberHandles = getHandlesInTag(tag);

  $("app").innerHTML = `
    <div id="tag-view-header">
      <button id="back-btn">← Back</button>
      <span id="tag-view-title">#${esc(tag)}</span>
      <button id="delete-tag-btn" title="Delete tag">🗑</button>
    </div>

    <div id="members-section">
      <div class="section-label">In this tag <span class="section-count">${memberHandles.length}</span></div>
      <div id="members-list">
        ${!memberHandles.length
          ? `<div class="empty-hint">No channels yet — add some below</div>`
          : memberHandles.map(h => `
              <div class="member-row">
                <span class="channel-name">${esc(channelLabelForHandle(h))}</span>
                <button class="remove-btn" data-handle="${esc(h)}" title="Remove">−</button>
              </div>`).join("")
        }
      </div>
    </div>

    <div id="add-section">
      <div class="section-label">Add channels</div>
      <div id="tag-search-wrap">
        <input id="tag-search-input" type="text" placeholder="Search to add…" autocomplete="off" spellcheck="false" />
      </div>
      <div id="add-list"></div>
    </div>
  `;

  renderAddList(tag);

  $("back-btn").addEventListener("click", () => { state.view="main"; state.activeTag=null; renderMain(); });

  $("delete-tag-btn").addEventListener("click", () => {
    if (!confirm(`Delete tag #${tag}? This removes it from all channels.`)) return;
    state.channels.forEach(ch => {
      if (state.channelTags[ch.handle]) state.channelTags[ch.handle] = state.channelTags[ch.handle].filter(t=>t!==tag);
    });
    saveChannelTags(); state.view="main"; state.activeTag=null; renderMain();
  });

  document.querySelectorAll(".remove-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const handle = btn.dataset.handle;
      if (state.channelTags[handle]) state.channelTags[handle] = state.channelTags[handle].filter(t=>t!==tag);
      saveChannelTags();
      // Update members count label + list without resetting the search input
      updateMembersSection(tag);
      renderAddList(tag);
    });
  });

  const tagSearch = $("tag-search-input");
  tagSearch.value = state.tagChannelQuery;
  tagSearch.focus({ preventScroll: true });
  tagSearch.addEventListener("input", e => { state.tagChannelQuery = e.target.value; renderAddList(tag); });
}

function updateMembersSection(tag) {
  const memberHandles = getHandlesInTag(tag);
  const label = document.querySelector("#members-section .section-label");
  if (label) label.innerHTML = `In this tag <span class="section-count">${memberHandles.length}</span>`;
  const membersList = $("members-list");
  if (!membersList) return;
  membersList.innerHTML = !memberHandles.length
    ? `<div class="empty-hint">No channels yet — add some below</div>`
    : memberHandles.map(h => `
        <div class="member-row">
          <span class="channel-name">${esc(channelLabelForHandle(h))}</span>
          <button class="remove-btn" data-handle="${esc(h)}" title="Remove">−</button>
        </div>`).join("");

  membersList.querySelectorAll(".remove-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const handle = btn.dataset.handle;
      if (state.channelTags[handle]) state.channelTags[handle] = state.channelTags[handle].filter(t=>t!==tag);
      saveChannelTags();
      updateMembersSection(tag);
      renderAddList(tag);
    });
  });
}

function renderAddList(tag) {
  const addList = $("add-list");
  if (!addList) return;

  const addListScrollTop = addList.scrollTop;

  const memberHandles = new Set(getHandlesInTag(tag));
  const query = state.tagChannelQuery.toLowerCase();
  const nonMembers = state.channels.filter(ch => !memberHandles.has(ch.handle));
  const filtered = query ? nonMembers.filter(ch => ch.displayName.toLowerCase().includes(query) || ch.handle.includes(query)) : nonMembers;

  if (!filtered.length) {
    addList.innerHTML = `<div class="empty-hint">${query ? "No channels match" : "All channels already in this tag!"}</div>`;
    return;
  }

  addList.innerHTML = filtered.map(ch => `
    <div class="add-row">
      <span class="channel-name">${esc(channelLabel(ch))}</span>
      <button class="add-btn" data-handle="${esc(ch.handle)}" title="Add to tag">+</button>
    </div>`).join("");

  requestAnimationFrame(() => { addList.scrollTop = addListScrollTop; });

  addList.querySelectorAll(".add-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const handle = btn.dataset.handle;
      if (!state.channelTags[handle]) state.channelTags[handle] = [];
      if (!state.channelTags[handle].includes(tag)) state.channelTags[handle].push(tag);
      saveChannelTags();
      // Update members without touching the search input or its focus
      updateMembersSection(tag);
      renderAddList(tag);
    });
  });
}

// ── Settings view ─────────────────────────────────────────────

function renderSettings() {
  state.view = "settings";
  document.removeEventListener("click", onDocClick, { capture: true });
  $("app").innerHTML = `
    <div id="tag-view-header">
      <button id="back-btn">← Back</button>
      <span id="tag-view-title">Settings</span>
      <span></span>
    </div>

    <div id="settings-list">
      <div class="settings-row">
        <div class="settings-info">
          <div class="settings-title">Clear All Tags</div>
          <div class="settings-desc">Remove all tags from all channels. Your channel list is kept.</div>
        </div>
        <button class="settings-action-btn danger" id="clear-tags-btn">Clear</button>
      </div>

      <div class="settings-row">
        <div class="settings-info">
          <div class="settings-title">Refresh Channels &amp; Tags</div>
          <div class="settings-desc">Wipes everything. You'll need to re-capture from youtube.com/feed/channels.</div>
        </div>
        <button class="settings-action-btn danger" id="refresh-btn">Reset</button>
      </div>

      <div class="settings-row">
        <div class="settings-info">
          <div class="settings-title">Chrome Web Store</div>
          <div class="settings-desc">View QueueTube on the Chrome Web Store.</div>
        </div>
        <button class="settings-action-btn" id="store-btn">Open ↗</button>
      </div>
    </div>
  `;

  $("back-btn").addEventListener("click", () => { state.view="main"; renderMain(); });

  $("clear-tags-btn").addEventListener("click", async () => {
    if (!confirm("Clear all tags from all channels?\n\nYour channel list will be kept — only tags will be removed.")) return;
    state.channels.forEach(ch => { state.channelTags[ch.handle] = []; });
    await saveChannelTags();
    showSettingsToast("✅ All tags cleared.");
  });

  $("refresh-btn").addEventListener("click", async () => {
    if (!confirm("⚠️ This will delete ALL your channels and tags — the app will reset to its initial state.\n\nAre you sure?")) return;
    state.channels = [];
    state.channelTags = {};
    await Promise.all([
      storageSet({
        [CHANNELS_KEY]: [],
        [CHANNEL_TAGS_KEY]: {}
      }),
      storageRemove(CHANNEL_META_KEY),
    ]);
    $("app").innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📺</div>
        <p>All data cleared.</p>
        <p>Go to <a id="channels-link" href="#">youtube.com/feed/channels</a> and click <strong>Capture Subscriptions</strong> to start again.</p>
        <p>Then come back here and use <strong>+ New tag</strong> to re-add any tags you want.</p>
      </div>
    `;
    $("channels-link").addEventListener("click", e => { e.preventDefault(); chrome.tabs.create({ url: "https://www.youtube.com/feed/channels" }); });
  });

  $("store-btn").addEventListener("click", () => {
    chrome.tabs.create({ url: "https://chromewebstore.google.com/detail/queuetube/fjcljgepicfodmpacgfimeepjibomlcd" });
  });
}

function showSettingsToast(msg) {
  let t = $("settings-toast");
  if (!t) { t = document.createElement("div"); t.id = "settings-toast"; $("app")?.appendChild(t); }
  t.textContent = msg; t.classList.add("visible");
  clearTimeout(t._timer); t._timer = setTimeout(() => t.classList.remove("visible"), 2500);
}

// ── Init ─────────────────────────────────────────────────────

(async () => {
  $("app").innerHTML = `<div class="loading">Loading…</div>`;

  const stored = await storageGet({
    [CHANNELS_KEY]: [],
    [CHANNEL_TAGS_KEY]: {}
  });

  const rawChannels = Array.isArray(stored[CHANNELS_KEY]) ? stored[CHANNELS_KEY] : [];
  state.channels = rawChannels.map(c => {
    if (typeof c === "string") return { handle: c.toLowerCase(), displayName: c };
    return {
      handle: String(c?.handle || "").toLowerCase(),
      displayName: String(c?.displayName || c?.handle || "")
    };
  }).filter(ch => ch.handle && ch.displayName);
  const tags = stored[CHANNEL_TAGS_KEY];
  state.channelTags = tags && typeof tags === "object" && !Array.isArray(tags) ? tags : {};
  state.channels.forEach(ch => { if (!(ch.handle in state.channelTags)) state.channelTags[ch.handle] = []; });

  if (!state.channels.length) {
    $("app").innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📺</div>
        <p>No channels captured yet.</p>
        <p>Go to <a id="channels-link" href="#">youtube.com/feed/channels</a><br/>and click <strong>Capture Subscriptions</strong>.</p>
        <p>After capture, return here and use <strong>+ New tag</strong> to re-add tags if none are stored.</p>
      </div>
    `;
    $("channels-link").addEventListener("click", e => { e.preventDefault(); chrome.tabs.create({ url: "https://www.youtube.com/feed/channels" }); });
    return;
  }

  renderMain();
})();
