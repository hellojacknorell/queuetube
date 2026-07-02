# Changelog

All notable changes to QueueTube should be recorded here.

Use simple wording where possible. Each entry should be detailed enough that a reader can understand what changed, why it changed, and the broad shape of how it was done without reading every line of code.

## Unreleased

### 2026-07-02 - Security

- Moved QueueTube-owned queue, saved queue, captured channel, and tag data out of YouTube page storage and into `chrome.storage.local`. This keeps the extension's data under the extension's own storage area instead of leaving it readable and editable by scripts running on youtube.com. The content script now uses extension storage helpers, and the popup reads and writes the same extension-owned data directly.
- Chose not to migrate old YouTube page-storage data because the stored data is trivial to rebuild: users can re-capture their subscriptions, recreate any tags they still need, and start a fresh queue. This keeps the storage change simpler and avoids carrying old page-origin data forward.
- Removed the popup's `chrome.scripting.executeScript` storage bridge. The popup no longer needs to inject code into an open YouTube tab to read or update QueueTube data, which avoids needing the extra `scripting` permission for this storage flow.

### 2026-07-02 - UI Fixes

- Updated the empty popup state to include the full rebuild path after the storage change: capture subscriptions again, then return to the popup and use `+ New tag` to re-add tags if none are stored.
- Kept the subscriptions-page `#` tag control visible even when no tags are stored. Clicking it now tells users to open QueueTube, capture subscriptions, and create tags instead of making the tag option disappear.
- Made subscription capture report failure when no channels are found or when extension storage cannot save them, so a failed capture does not look like a successful setup.
- Updated tag manager channel labels to show both the display name and handle, for example `P!NK [@pinkvideovault]`, so channels with handles that differ from their public names are easier to identify.
- Fixed subscription capture to prefer the visible YouTube channel name from `ytd-channel-name #text` before falling back to the handle, so labels can show names like `P!NK [@pinkvideovault]` instead of repeating the handle.
- Changed subscription queueing into a two-step choice: first select `Queue Subscriptions` or `Queue Unwatched`, then select a tag. Added reserved `#everything` as the built-in all-channels tag so both queue styles can be used with either all channels or a saved tag.

### 2026-07-02 - Added

- Added this changelog so future work can be tracked in one place.
