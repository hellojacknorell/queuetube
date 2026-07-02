# Changelog

All notable changes to QueueTube should be recorded here.

Use simple wording where possible. Each entry should be detailed enough that a reader can understand what changed, why it changed, and the broad shape of how it was done without reading every line of code.

## Unreleased

### Security

- Moved QueueTube-owned queue, saved queue, captured channel, and tag data out of YouTube page storage and into `chrome.storage.local`. This keeps the extension's data under the extension's own storage area instead of leaving it readable and editable by scripts running on youtube.com. The content script now uses extension storage helpers, and the popup reads and writes the same extension-owned data directly.
- Chose not to migrate old YouTube page-storage data because the stored data is trivial to rebuild: users can re-capture their subscriptions, recreate any tags they still need, and start a fresh queue. This keeps the storage change simpler and avoids carrying old page-origin data forward.
- Removed the popup's `chrome.scripting.executeScript` storage bridge. The popup no longer needs to inject code into an open YouTube tab to read or update QueueTube data, which avoids needing the extra `scripting` permission for this storage flow.

### Added

- Added this changelog so future work can be tracked in one place.
