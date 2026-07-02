# QueueTube Privacy Policy

**Last updated:** 2026-03-26

## Summary
QueueTube does not collect, transmit, or share any personal data. All data is stored locally in your browser only and never leaves your device.

## What data is stored

QueueTube uses two browser storage mechanisms, both scoped entirely to your local browser:

### chrome.storage.local (extension storage) — persists until you clear it or reset the extension
- Your active queue of video URLs and titles
- Your current position in the active queue
- **Saved queue** (`queuetube_saved_queue`, `queuetube_saved_index`) — your most recent queue and playback position, used by the "Continue Previous Queue" feature
- **Channel list** (`queuetube_channels`, `queuetube_channel_meta`) — the list of channel names and handles captured from your subscriptions page
- **Channel tags** (`queuetube_channel_tags`) — your tag assignments (e.g. which channels belong to which tag)

`chrome.storage.local` is storage that belongs to the extension itself, sandboxed from the rest of your browser. It is not accessible by websites and is not synced to your Google account.

### sessionStorage on youtube.com — cleared when you close the tab
- Internal page-reload flags used to ensure videos load correctly

This data never leaves your browser. It is never written to any server, synced to your Google account, or shared in any way.

## What data is NOT collected
- No browsing history
- No personal information
- No YouTube account data
- No analytics or telemetry
- Nothing is sent to any external server

## Permissions

QueueTube requests one browser permission:

- **`storage`** — required to save and retrieve your queue, channel list, and tags using the extension's own sandboxed storage (`chrome.storage.local`). This means QueueTube can keep your queue and tag manager data without storing it in YouTube's page storage. This permission only accesses QueueTube's own data and cannot read anything outside the extension.

QueueTube does **not** use this permission to read your browsing history, access any data outside of QueueTube's own storage, or collect any data.

## Third parties
QueueTube communicates with no external servers. It operates entirely within your browser.

## Clearing your data
You can remove all stored channel and tag data at any time via **Settings → Reset** inside the QueueTube popup. The saved queue can be discarded from the QueueTube controls. All QueueTube-owned data is stored in `chrome.storage.local`.

## Contact
If you have any questions, please open an issue on the GitHub repository.
