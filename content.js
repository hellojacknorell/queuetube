// QueueTube - content.js
// Queues your YouTube subscription feed for back-to-back playback.

const STORAGE_KEY = "queuetube_queue";
const INDEX_KEY   = "queuetube_index";
const SAVED_QUEUE_KEY = "queuetube_saved_queue";
const SAVED_INDEX_KEY = "queuetube_saved_index";
const CHANNEL_TAGS_KEY = "queuetube_channel_tags";
const CHANNELS_KEY = "queuetube_channels";
const CHANNEL_META_KEY = "queuetube_channel_meta";

// ── Extension storage helpers ────────────────────────────────

function storageGet(defaults, cb) {
  try {
    chrome.storage.local.get(defaults, items => cb(items || defaults));
  } catch(e) {
    cb(defaults);
  }
}

function storageSet(values, cb) {
  try {
    chrome.storage.local.set(values, () => { if (cb) cb(); });
  } catch(e) {
    if (cb) cb();
  }
}

function storageRemove(keys, cb) {
  try {
    chrome.storage.local.remove(keys, () => { if (cb) cb(); });
  } catch(e) {
    if (cb) cb();
  }
}

function getQueue(cb) {
  storageGet({ [STORAGE_KEY]: [] }, items => cb(Array.isArray(items[STORAGE_KEY]) ? items[STORAGE_KEY] : []));
}
function setQueue(queue, cb) {
  storageSet({ [STORAGE_KEY]: Array.isArray(queue) ? queue : [] }, cb);
}
function getIndex(cb) {
  storageGet({ [INDEX_KEY]: 0 }, items => {
    const idx = parseInt(items[INDEX_KEY] || "0", 10);
    cb(Number.isFinite(idx) ? idx : 0);
  });
}
function setIndex(i, cb) {
  storageSet({ [INDEX_KEY]: Number.isFinite(i) ? i : 0 }, cb);
}
function clearStorage(cb) {
  storageRemove([STORAGE_KEY, INDEX_KEY], cb);
}

// ── Persistent queue ────────────────────────────────────────

function getSavedQueue(cb) {
  storageGet({ [SAVED_QUEUE_KEY]: null }, items => cb(Array.isArray(items[SAVED_QUEUE_KEY]) ? items[SAVED_QUEUE_KEY] : null));
}
function persistQueue(queue, idx, cb) {
  storageSet({
    [SAVED_QUEUE_KEY]: Array.isArray(queue) ? queue : [],
    [SAVED_INDEX_KEY]: Number.isFinite(idx) ? idx : 0
  }, cb);
}
function getSavedIndex(cb) {
  storageGet({ [SAVED_INDEX_KEY]: 0 }, items => {
    const idx = parseInt(items[SAVED_INDEX_KEY] || "0", 10);
    cb(Number.isFinite(idx) ? idx : 0);
  });
}
function discardSavedQueue(cb) {
  storageRemove([SAVED_QUEUE_KEY, SAVED_INDEX_KEY], cb);
}

// ── Channel tags ─────────────────────────────────────────────
// Keys are normalised channel handles, e.g. "pinkbloc" (lowercase, no @)

function getChannelTags(cb) {
  storageGet({ [CHANNEL_TAGS_KEY]: {} }, items => {
    const tags = items[CHANNEL_TAGS_KEY];
    cb(tags && typeof tags === "object" && !Array.isArray(tags) ? tags : {});
  });
}

function getAllTags(cb) {
  getChannelTags(tags => {
    const set = new Set();
    Object.values(tags).forEach(arr => {
      if (Array.isArray(arr)) arr.forEach(t => set.add(t));
    });
    cb([...set].sort());
  });
}

function normaliseHandle(raw) {
  return String(raw).replace(/^\/?@/, "").trim().toLowerCase();
}

// ── Feed page: scrape videos ─────────────────────────────────

function scrapeFeedVideos() {
  const selectors = [
    "a.yt-lockup-metadata-view-model__title",
    "a.yt-lockup-view-model__content-image",
    "a#video-title-link",
    "a#thumbnail",
    "ytd-rich-item-renderer a[href*='/watch']"
  ];

  const seen = new Set();
  const videos = [];

  for (const selector of selectors) {
    for (const a of document.querySelectorAll(selector)) {
      const match = (a.href || "").match(/\/watch\?v=([\w-]+)/);
      if (!match || seen.has(match[1])) continue;
      seen.add(match[1]);

      let title = `Video ${videos.length + 1}`;
      let channelHandle = "";

      // Title
      if (a.classList.contains("yt-lockup-metadata-view-model__title")) {
        title = a.textContent.trim() || a.getAttribute("aria-label") || title;
      } else {
        const container = a.closest("ytd-rich-item-renderer, ytd-video-renderer, yt-lockup-view-model");
        const titleEl = container && (
          container.querySelector("a.yt-lockup-metadata-view-model__title") ||
          container.querySelector("#video-title") ||
          container.querySelector("#title") ||
          container.querySelector("h3")
        );
        if (titleEl) title = titleEl.textContent.trim() || title;
      }

      // Channel handle — extract from href="/@handle" which is stable and unambiguous
      const container = a.closest("ytd-rich-item-renderer, ytd-video-renderer, yt-lockup-view-model");
      if (container) {
        const channelLink =
          container.querySelector("a.yt-lockup-byline-view-model") ||
          container.querySelector("a.yt-core-attributed-string__link[href^='/@']") ||
          container.querySelector("a[href^='/@']") ||
          container.querySelector("yt-formatted-string#channel-name a") ||
          container.querySelector("#channel-name a") ||
          container.querySelector("ytd-channel-name a");

        if (channelLink) {
          const href = channelLink.getAttribute("href") || "";
          const handleMatch = href.match(/^\/?@([\w.-]+)/);
          channelHandle = handleMatch
            ? handleMatch[1].toLowerCase()
            : normaliseHandle(channelLink.textContent.trim());
        }
      }

      // Progress bar
      let progress = 0;
      const pContainer = a.closest("ytd-rich-item-renderer, ytd-video-renderer, yt-lockup-view-model");
      if (pContainer) {
        const bar = pContainer.querySelector(".ytThumbnailOverlayProgressBarHostWatchedProgressBarSegment");
        if (bar) progress = parseFloat(bar.style.width) || 0;
      }

      videos.push({ id: match[1], title, channelHandle, progress, url: `https://www.youtube.com/watch?v=${match[1]}` });
    }
    if (videos.length > 0) break;
  }

  return videos;
}

function filterVideosByTag(videos, tag, cb) {
  if (!tag) { cb(videos); return; }
  getChannelTags(channelTags => {
    const taggedHandles = new Set(
      Object.entries(channelTags)
        .filter(([, tags]) => Array.isArray(tags) && tags.includes(tag))
        .map(([handle]) => handle)
    );
    cb(videos.filter(v => taggedHandles.has(v.channelHandle)));
  });
}

function filterVideosUnwatched(videos) {
  // progress === 0 means YouTube has not rendered a red progress bar —
  // i.e. the video is unwatched (or watched so long ago YouTube cleared it).
  return videos.filter(v => v.progress === 0);
}

// ── Feed page: inject queue button ───────────────────────────

let tagPanelOpen = false;

function injectQueueButton() {
  if (document.getElementById("queuetube-btn-wrapper")) return;

  // Outer anchor — fixed position, centred. Does NOT use flexbox that would
  // shift the Queue button when the tag row expands. Instead the tag row is
  // absolutely positioned so it never affects sibling layout.
  const wrapper = document.createElement("div");
  wrapper.id = "queuetube-btn-wrapper";

  // Main queue button
  const btn = document.createElement("button");
  btn.id = "queuetube-btn";
  btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/></svg><span>Queue Subscriptions</span>`;
  btn.setAttribute("aria-label", "Queue all subscription videos for back-to-back playback");
  btn.addEventListener("click", () => {
    const videos = scrapeFeedVideos();
    if (!videos.length) { alert("No videos found — try scrolling down first to load more."); return; }
    setQueue(videos, () => setIndex(0, () => {
      persistQueue(videos, 0, () => {
        showToast(`✅ Queued ${videos.length} videos! Starting now…`);
        setTimeout(() => { window.location.href = videos[0].url; }, 800);
      });
    }));
  });
  wrapper.appendChild(btn);

  // Queue Unwatched button — only queues videos with no red progress bar
  const unwatchedBtn = document.createElement("button");
  unwatchedBtn.id = "queuetube-unwatched-btn";
  unwatchedBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg><span>Queue Unwatched</span>`;
  unwatchedBtn.setAttribute("aria-label", "Queue only videos with no watch progress");
  unwatchedBtn.addEventListener("click", () => {
    const videos = scrapeFeedVideos();
    const unwatched = filterVideosUnwatched(videos);
    if (!unwatched.length) {
      showToast("⚠️ No unwatched videos found — try scrolling to load more first.");
      return;
    }
    setQueue(unwatched, () => setIndex(0, () => {
      persistQueue(unwatched, 0, () => {
        showToast(`✅ Queued ${unwatched.length} unwatched videos! Starting now…`);
        setTimeout(() => { window.location.href = unwatched[0].url; }, 800);
      });
    }));
  });
  wrapper.appendChild(unwatchedBtn);

  let continueBtn = null;

  function appendContinueButton(done) {
    getSavedQueue(saved => {
      if (!saved || !saved.length) { done(); return; }
      getSavedIndex(savedIdx => {
        continueBtn = document.createElement("button");
        continueBtn.id = "queuetube-continue-btn";
        continueBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg><span>Continue Previous Queue (${savedIdx + 1}/${saved.length})</span><span class="qt-continue-discard" title="Discard">&#10005;</span>`;
        continueBtn.addEventListener("click", (e) => {
          if (e.target.classList.contains("qt-continue-discard")) {
            discardSavedQueue(() => { continueBtn.remove(); continueBtn = null; });
            showToast("Previous queue discarded."); return;
          }
          setQueue(saved, () => setIndex(savedIdx, () => {
            showToast(`▶ Resuming from video ${savedIdx + 1} of ${saved.length}…`);
            setTimeout(() => { window.location.href = saved[savedIdx].url; }, 800);
          }));
        });
        wrapper.appendChild(continueBtn);
        done();
      });
    });
  }

  getAllTags(allTags => {
    if (allTags.length > 0) {
      // # btn — declared first but appended AFTER tagRow so it appears to the right of tags
      const hashBtn = document.createElement("button");
      hashBtn.id = "queuetube-hash-btn";
      hashBtn.setAttribute("aria-label", "Filter queue by tag");
      hashBtn.innerHTML = `<span>#</span>`;

      // Tag row — inline flex, slides open between Queue btn and # btn
      const tagRow = document.createElement("div");
      tagRow.id = "queuetube-tag-row";

      allTags.forEach((tag, i) => {
        const tb = document.createElement("button");
        tb.className = "queuetube-tag-btn";
        tb.textContent = `#${tag}`;
        tb.style.animationDelay = `${i * 40}ms`;
        tb.addEventListener("click", () => {
          const videos = scrapeFeedVideos();
          filterVideosByTag(videos, tag, filtered => {
            if (!filtered.length) {
              showToast(`⚠️ No videos found for #${tag} — try scrolling to load more first.`);
              return;
            }
            setQueue(filtered, () => setIndex(0, () => {
              persistQueue(filtered, 0, () => {
                showToast(`✅ Queued ${filtered.length} videos for #${tag}!`);
                setTimeout(() => { window.location.href = filtered[0].url; }, 800);
              });
            }));
          });
        });
        tagRow.appendChild(tb);
      });

      // Order: Queue btn | tag row (slides open) | # btn | Continue btn
      wrapper.appendChild(tagRow);
      wrapper.appendChild(hashBtn);

      hashBtn.addEventListener("click", () => {
        tagPanelOpen = !tagPanelOpen;
        tagRow.classList.toggle("open", tagPanelOpen);
        hashBtn.classList.toggle("active", tagPanelOpen);
        // Fade continue button in/out without layout shift
        if (continueBtn) {
          if (tagPanelOpen) {
            continueBtn.classList.add("qt-hidden");
          } else {
            continueBtn.classList.remove("qt-hidden");
          }
        }
      });
    }

    appendContinueButton(() => document.body.appendChild(wrapper));
  });
}

// ── Channels page: capture subscriptions ────────────────────

function injectCaptureButton() {
  if (document.getElementById("queuetube-capture-btn")) return;

  const btn = document.createElement("button");
  btn.id = "queuetube-capture-btn";
  btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/></svg><span>Capture Subscriptions</span>`;
  btn.setAttribute("aria-label", "Capture all subscribed channels for tagging");
  btn.addEventListener("click", startChannelCapture);
  document.body.appendChild(btn);
}

function startChannelCapture() {
  document.getElementById("queuetube-capture-btn")?.remove();

  const overlay = document.createElement("div");
  overlay.id = "queuetube-capture-overlay";
  overlay.innerHTML = `<div id="qt-capture-box"><div id="qt-capture-spinner"></div><div id="qt-capture-msg">Please hold, capturing! 😊</div><div id="qt-capture-sub">Auto-scrolling to load all your subscriptions…</div><div id="qt-capture-count">0 channels found so far</div></div>`;
  document.body.appendChild(overlay);

  let idleTime = 0;
  const IDLE_LIMIT = 10000;
  let lastHeight = document.documentElement.scrollHeight;

  const scrollInterval = setInterval(() => {
    window.scrollBy(0, 600);
    const newHeight = document.documentElement.scrollHeight;
    idleTime = (newHeight === lastHeight) ? idleTime + 300 : 0;
    lastHeight = newHeight;

    const channels = scrapeChannels();
    const countEl = document.getElementById("qt-capture-count");
    if (countEl) countEl.textContent = `${channels.length} channels found so far`;

    if (idleTime >= IDLE_LIMIT) {
      clearInterval(scrollInterval);
      finishCapture();
    }
  }, 300);

  function finishCapture() {
    const channels = scrapeChannels();
    document.getElementById("qt-capture-msg").textContent = "✅ Done!";
    document.getElementById("qt-capture-sub").textContent = `Captured ${channels.length} channels.`;
    document.getElementById("qt-capture-count").textContent = "Click the extension icon to tag them.";

    getChannelTags(existing => {
      const meta = {};
      channels.forEach(({ handle, displayName }) => {
        if (!(handle in existing)) existing[handle] = [];
        meta[handle] = displayName;
      });
      storageSet({
        [CHANNEL_TAGS_KEY]: existing,
        [CHANNELS_KEY]: channels,
        [CHANNEL_META_KEY]: meta
      }, () => {
        setTimeout(() => {
          document.getElementById("queuetube-capture-overlay")?.remove();
          showToast(`✅ ${channels.length} channels captured! Click the extension icon to tag them.`);
        }, 1500);
      });
    });
  }
}

// Scrape /feed/channels — returns [{ handle, displayName }]
// KEY FIX: only read displayName from the anchor's OWN direct yt-formatted-string
// child (not from a closest() ancestor which causes the doubling bug).
function scrapeChannels() {
  const seen = new Set();
  const channels = [];

  for (const a of document.querySelectorAll(
    "ytd-channel-renderer a[href*='/@'], ytd-subscription-item-renderer a[href*='/@']"
  )) {
    const href = a.getAttribute("href") || "";
    const hMatch = href.match(/^\/?@([\w.-]+)/);
    if (!hMatch) continue;
    const handle = hMatch[1].toLowerCase();
    if (seen.has(handle)) continue;
    seen.add(handle);

    // Only look at direct children to avoid inheriting text from nested containers
    // that would duplicate the name (the root cause of "Pinkbloc Pinkbloc")
    const directFmtStr = a.querySelector(":scope > yt-formatted-string");
    const directSpan   = a.querySelector(":scope > span");
    const displayName  = (
      directFmtStr?.textContent ||
      directSpan?.textContent ||
      // Last resort: the link's own textContent but ONLY if it has no complex children
      (a.children.length === 0 ? a.textContent : null) ||
      handle
    ).trim().replace(/\s+/g, " ");

    if (displayName.length >= 1) channels.push({ handle, displayName });
  }

  // Fallback: broader scan
  if (channels.length === 0) {
    for (const a of document.querySelectorAll("a[href^='/@']")) {
      const href = a.getAttribute("href") || "";
      const hMatch = href.match(/^\/?@([\w.-]+)/);
      if (!hMatch) continue;
      const handle = hMatch[1].toLowerCase();
      if (seen.has(handle)) continue;
      seen.add(handle);
      const directFmtStr = a.querySelector(":scope > yt-formatted-string");
      const displayName = (
        a.getAttribute("aria-label") ||
        directFmtStr?.textContent ||
        handle
      ).trim().replace(/\s+/g, " ");
      if (displayName.length < 2) continue;
      channels.push({ handle, displayName });
    }
  }

  return channels;
}

// ── Video page: queue panel ──────────────────────────────────

function buildPlayerUI() {
  if (document.getElementById("queuetube-panel")) return;
  getQueue(queue => {
    getIndex(idx => {
      if (!queue.length) return;
      const panel = document.createElement("div");
      panel.id = "queuetube-panel";
      panel.innerHTML = `
        <div id="qt-header">
          <span id="qt-title">▶ QueueTube</span>
          <div id="qt-controls">
            <button id="qt-prev" title="Previous" aria-label="Previous video">&#9664;</button>
            <span id="qt-counter">${idx + 1} / ${queue.length}</span>
            <button id="qt-next" title="Next" aria-label="Next video">&#9654;</button>
            <button id="qt-close" title="Stop queue" aria-label="Stop queue">&#10005;</button>
          </div>
        </div>
        <div id="qt-list" role="list">
          ${[...queue].sort((a, b) => {
            const ai = queue.indexOf(a), bi = queue.indexOf(b);
            if (ai < idx && bi < idx) return ai - bi;
            if (ai < idx) return -1; if (bi < idx) return 1;
            return ai - bi;
          }).map(v => {
            const i = queue.indexOf(v);
            return `
              <div class="qt-item ${i===idx?"active":i<idx?"watched":""}" data-index="${i}" role="listitem" tabindex="0" title="${escapeHtml(v.title)}">
                <span class="qt-num">${i+1}</span>
                <span class="qt-name">${escapeHtml(v.title)}</span>
                ${i===idx?'<span class="qt-now">NOW</span>':""}
                ${i<idx?'<span class="qt-check">✓</span>':""}
              </div>
              ${v.progress>0?`<div class="qt-progress-bar"><div class="qt-progress-fill" style="width:${v.progress}%"></div></div>`:""}
            `;
          }).join("")}
        </div>`;
      document.body.appendChild(panel);
      setTimeout(() => {
        const list = panel.querySelector("#qt-list"), active = panel.querySelector(".qt-item.active");
        if (list && active) list.scrollTop = active.offsetTop - list.offsetTop;
      }, 300);
      document.getElementById("qt-next").addEventListener("click", () => goToIndex(idx + 1));
      document.getElementById("qt-prev").addEventListener("click", () => goToIndex(idx - 1));
      document.getElementById("qt-close").addEventListener("click", stopQueue);
      panel.querySelectorAll(".qt-item").forEach(el => {
        el.addEventListener("click", () => goToIndex(parseInt(el.dataset.index, 10)));
        el.addEventListener("keydown", e => { if (e.key==="Enter"||e.key===" ") goToIndex(parseInt(el.dataset.index,10)); });
      });
    });
  });
}

function goToIndex(i) {
  getQueue(queue => {
    if (i < 0 || i >= queue.length) return;
    setIndex(i, () => { persistQueue(queue, i, () => { window.location.href = queue[i].url; }); });
  });
}

function stopQueue() {
  discardSavedQueue(() => {
    clearStorage(() => { document.getElementById("queuetube-panel")?.remove(); showToast("Queue stopped."); });
  });
}

function watchForVideoEnd() {
  const tryAttach = setInterval(() => {
    const video = document.querySelector("video");
    if (!video) return;
    clearInterval(tryAttach);
    video.addEventListener("ended", () => {
      getQueue(queue => getIndex(idx => {
        if (idx + 1 < queue.length) {
          showToast(`⏭ Playing next: ${queue[idx+1].title}`);
          setTimeout(() => goToIndex(idx+1), 1500);
        } else { showToast("🎉 Queue complete!"); }
      }));
    });
    function reg() {
      if (!("mediaSession" in navigator)) return;
      navigator.mediaSession.setActionHandler("nexttrack", () => getIndex(i => goToIndex(i+1)));
      navigator.mediaSession.setActionHandler("previoustrack", () => getIndex(i => goToIndex(i-1)));
    }
    reg();
    const mhi = setInterval(() => getQueue(q => { if (!q.length) { clearInterval(mhi); return; } reg(); }), 500);
  }, 500);
}

// ── Toast ────────────────────────────────────────────────────

function showToast(msg) {
  let t = document.getElementById("queuetube-toast");
  if (!t) {
    t = document.createElement("div"); t.id = "queuetube-toast";
    t.setAttribute("role","status"); t.setAttribute("aria-live","polite");
    document.body.appendChild(t);
  }
  t.textContent = msg; t.classList.add("visible");
  clearTimeout(t._timer); t._timer = setTimeout(() => t.classList.remove("visible"), 3000);
}

function escapeHtml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ── Router ───────────────────────────────────────────────────

let lastUrl = location.href;

function onNavigate() {
  const url = location.href;
  if (url === lastUrl) return;
  const prev = lastUrl;
  lastUrl = url;
  document.getElementById("queuetube-panel")?.remove();
  document.getElementById("queuetube-btn-wrapper")?.remove();
  document.getElementById("queuetube-capture-btn")?.remove();
  route(prev);
}

function route(previousUrl) {
  const url = location.href;
  previousUrl = previousUrl || "";

  if (url.includes("/feed/channels")) {
    waitForElement("ytd-channel-renderer, ytd-item-section-renderer", injectCaptureButton);
    return;
  }

  if (url.includes("/feed/subscriptions")) {
    if (!sessionStorage.getItem("queuetube_reloaded")) {
      sessionStorage.setItem("queuetube_reloaded", "1");
      location.reload(); return;
    }
    waitForElement("ytd-rich-item-renderer, ytd-video-renderer", injectQueueButton);
    return;
  }

  if (previousUrl.includes("/feed/subscriptions") && !url.includes("/watch")) {
    if (!sessionStorage.getItem("queuetube_left")) {
      sessionStorage.setItem("queuetube_left", "1");
      sessionStorage.removeItem("queuetube_reloaded");
      location.reload(); return;
    }
    sessionStorage.removeItem("queuetube_left");
  } else {
    sessionStorage.removeItem("queuetube_reloaded");
    sessionStorage.removeItem("queuetube_left");
  }

  if (url.includes("/watch")) {
    getQueue(queue => {
      if (queue.length > 0) waitForElement("ytd-watch-flexy, ytd-app", () => { buildPlayerUI(); watchForVideoEnd(); });
    });
  }
}

function waitForElement(selector, callback, timeout = 8000) {
  if (document.querySelector(selector)) { callback(); return; }
  const start = Date.now();
  const obs = new MutationObserver(() => {
    if (document.querySelector(selector)) { obs.disconnect(); callback(); }
    else if (Date.now() - start > timeout) obs.disconnect();
  });
  obs.observe(document.body, { childList: true, subtree: true });
}

new MutationObserver(onNavigate).observe(document, { subtree: true, childList: true });
route();
