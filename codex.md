# QueueTube Security Review

Review date: 2026-07-02

Scope reviewed:
- `manifest.json`
- `content.js`
- `popup.js`
- `popup.html`

## Executive Summary

QueueTube has a small attack surface: it runs only on `https://www.youtube.com/*`, does not fetch remote application data, and does not use `eval` or dynamic code generation. The main security concerns are around storage trust boundaries and DOM rendering.

The extension currently stores queues, captured channels, and tags in `youtube.com` `localStorage` / `sessionStorage`. That means YouTube-origin scripts can read and modify QueueTube data. Because some stored queue fields are later rendered with `innerHTML`, tampered storage can become a DOM injection issue inside the content script UI.

## Findings and Mitigations

### High: Page-origin storage is treated as trusted extension data

Evidence:
- `content.js` reads and writes QueueTube state in page `sessionStorage` and `localStorage`: lines 10, 13, 31, 35, 36, 50, 334-336.
- `popup.js` reads and writes that page storage via `chrome.scripting.executeScript`: lines 15-18, 28-31, 40-43.

Risk:
- Any script running on `youtube.com` can read or change queue, channel, and tag data.
- Tampered values can crash the popup, cause unwanted navigation, or feed unsafe values into rendered markup.
- This also weakens the privacy claim that user data stays under extension control.

Mitigation steps:
1. Move QueueTube-owned state to `chrome.storage.local` or `chrome.storage.session`.
2. Keep only non-sensitive, short-lived page state in `sessionStorage` if it is genuinely needed for page navigation.
3. Add a migration path that reads existing `queuetube_*` page keys once, validates them, writes them to extension storage, then removes the page keys.
4. Update `PRIVACY_POLICY.md`; it currently says reset clears `chrome.storage.local`, but the code uses YouTube page storage.

Recommended storage split:
- Queue and queue index: `chrome.storage.session` if available, with `chrome.storage.local` only for "continue previous queue".
- Channel list and tags: `chrome.storage.local`.
- UI-only flags such as reload guards: `sessionStorage` is acceptable.

### High: Stored queue values can inject markup through `innerHTML`

Evidence:
- `content.js` builds the queue panel with `panel.innerHTML`: line 410.
- Titles are escaped with `escapeHtml`, which is good: lines 429-431 and 503.
- `v.progress` is inserted directly into a `style` attribute: line 435.
- Saved queue data is read from mutable page `localStorage`: line 31.

Risk:
- If `queuetube_saved_queue` or `queuetube_queue` is tampered with, a malicious `progress` value could break out of the style attribute.
- Queue URLs are also trusted for navigation in `goToIndex`: line 487.

Mitigation steps:
1. Validate every queue item loaded from storage.
2. Coerce `progress` to a finite number and clamp it between `0` and `100`.
3. Accept only YouTube video IDs matching `/^[A-Za-z0-9_-]{11}$/`.
4. Rebuild `url` from the validated ID instead of trusting a stored `url`.
5. Prefer DOM construction (`createElement`, `textContent`, `style.width`) for queue rows instead of template-string `innerHTML`.

Suggested validation shape:

```js
function sanitizeQueueItem(item) {
  const id = String(item?.id || "").match(/^[A-Za-z0-9_-]{11}$/)?.[0];
  if (!id) return null;

  const progress = Math.max(0, Math.min(100, Number(item?.progress) || 0));
  return {
    id,
    title: String(item?.title || "Untitled video").slice(0, 300),
    channelHandle: normaliseHandle(item?.channelHandle || ""),
    progress,
    url: `https://www.youtube.com/watch?v=${id}`
  };
}
```

### Medium: Popup can crash on malformed stored JSON

Evidence:
- `popup.js` parses page storage without `try/catch`: lines 547 and 549.

Risk:
- If YouTube page storage is malformed or manually edited, the popup fails during initialization.
- This becomes more likely because the data is stored in the page origin rather than extension storage.

Mitigation steps:
1. Wrap popup storage parsing in safe parse helpers.
2. Validate parsed data shape before assigning it to `state`.
3. On invalid data, show a reset/recover option rather than leaving the popup blank.

### Medium: Required extension permission appears to be missing

Evidence:
- `popup.js` calls `chrome.scripting.executeScript`: lines 15, 28, 40.
- `manifest.json` declares only `"storage"` in `permissions`: lines 30-32.

Risk:
- The popup bridge may fail at runtime because Manifest V3 requires the `"scripting"` permission for `chrome.scripting`.
- If this code is published and happens to work only in a local/dev context, users may see silent failures because errors are swallowed.

Mitigation steps:
1. If keeping the current bridge, add `"scripting"` to `permissions`.
2. Prefer removing the bridge by moving state into `chrome.storage.*`; then the popup can read extension storage directly and `"scripting"` may not be needed.
3. Avoid swallowing errors completely; log concise diagnostics during development or show a user-facing recovery state.

### Medium: Remote Google Fonts import in extension popup

Evidence:
- `popup.html` imports fonts from Google Fonts: line 10.

Risk:
- Opening the extension popup can contact a third party.
- Remote UI assets reduce offline reliability and complicate privacy claims.
- Extension store review may scrutinize remotely loaded resources.

Mitigation steps:
1. Remove the `@import` and use system fonts, or bundle font files locally.
2. If bundling fonts, document their license and add them as packaged extension assets.
3. Keep extension pages self-contained unless there is a strong user-facing need.

### Low: Manifest and docs understate permissions/data handling

Evidence:
- `manifest.json` requests `storage` and `host_permissions` for YouTube: lines 30-35.
- `README.md` advertises "No Permissions Required": line 9.
- `PRIVACY_POLICY.md` says reset clears `chrome.storage.local`, but the app stores most data in YouTube `localStorage`: around lines 17 and 47.

Risk:
- Users may misunderstand what access the extension has and where data is stored.
- Store reviewers may treat mismatched docs as a compliance issue.

Mitigation steps:
1. Update README badges/text to mention YouTube host access and storage permission accurately.
2. Update the privacy policy after the storage migration.
3. State that no browsing history is collected and no data is transmitted off-device, if that remains true after changes.

## Positive Notes

- The manifest is scoped to `https://www.youtube.com/*`, not all sites.
- No `eval`, `new Function`, `fetch`, or `XMLHttpRequest` usage was found in application code.
- Most dynamic text rendered into popup and panel HTML is escaped with `esc` / `escapeHtml`.
- Navigation targets are generated from scraped YouTube video IDs during normal operation.

## Recommended Remediation Order

1. Move persistent QueueTube data from YouTube page storage to `chrome.storage.local` / `chrome.storage.session`.
2. Add queue and channel/tag schema validation at every storage boundary.
3. Replace the queue panel's dynamic `innerHTML` rendering with DOM construction, or fully validate and escape all interpolated fields.
4. Fix manifest permissions based on the final architecture.
5. Remove remote font import or bundle fonts locally.
6. Update README and privacy policy to match actual permissions and storage behavior.

## Chrome Web Store Review Readiness

The remediation plan above covers the main technical issues, but store review also depends on clear and accurate disclosures. Before submitting a new version to the Chrome Web Store:

1. Update the Chrome Web Store privacy fields so they match what QueueTube handles locally: YouTube channel names/handles, queue entries, watch-progress signals used for filtering, and user-created tags.
2. Make the privacy policy clear that this data is stored locally in extension storage, is used only to provide QueueTube's queueing and tagging features, and is not transmitted to the developer or third parties.
3. Update README and store listing text so they do not claim "No Permissions Required" while the extension requests YouTube host access and storage.
4. Add a short permission justification for `storage` and YouTube host access. If `scripting` is still required after the storage migration, explain why; otherwise remove it.
5. Test the packaged extension from a clean profile before submission so the popup, capture flow, queue flow, reset flow, and migration path all work without developer-only state.
6. Keep all popup assets packaged locally. Do not load remote fonts or other remote UI resources unless there is a strong reason and the privacy policy discloses it.

## Changelog Standard

Future changes should add an entry to `changelog.md`. Entries should use simple wording where possible and be detailed enough to follow the work in principle: what changed, why it changed, and the broad implementation approach.

Example entry:

```md
## Unreleased

### Security

- Moved saved queues, captured channels, and tags out of YouTube page storage and into extension storage. This keeps QueueTube data under the extension's control instead of leaving it readable and editable by scripts running on youtube.com. The content script now asks the extension for queue data, and the popup reads and writes the same extension-owned store.
- Added validation when loading saved queue items. QueueTube now accepts only valid YouTube video IDs, rebuilds watch URLs from those IDs, clamps watch progress between 0 and 100, and falls back to a plain title when stored data is missing or malformed. This prevents broken or tampered stored data from being rendered into the queue panel.
```
