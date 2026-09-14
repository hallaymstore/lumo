# Lumo Messenger Architecture

## Core
- `server.js` — base Express + MongoDB + Socket.IO messenger runtime.
- `patch-runtime.js` — bot engine v2 runtime patch.
- `patch-social.js` — idempotent build patch that mounts social/power modules and injects UI bundles.
- `social-runtime.js` — profile, settings, stories, message edit/delete, rich channel posts, chat search/media.
- `chat-admin-runtime.js` — group/channel management, member roles, pinned messages and unread/read state.
- `story-owner-runtime.js` — current user's story management and editing.
- `message-links-runtime.js` — reply/forward metadata and realtime delivery.
- `power-runtime.js` — presence, notifications, block/report, enhanced sending, mentions, hashtags, channel comments, read receipts and scheduled channel posts.
- `power-socket-runtime.js` — per-user realtime notification socket rooms.

## Frontend
- `public/index.html` — white/pink premium Lumo shell, auth, chat list and realtime chat.
- `public/social-v3.css` / `public/social-v3.js` — stories, rich posts, reactions, search, media and editor UI.
- `public/message-links-v3.js` — reply/forward controls and linked-message previews.
- `public/chat-admin-v3.js` — group/channel management, pins, roles and unread badges.
- `public/story-owner-v3.js` — story management shortcut.
- `public/global-v3.js` — shared UI helpers.
- `public/power-v4.css` / `public/power-v4.js` — voice notes, online status, read receipts, notification center, safety controls, mentions/hashtags, channel comments and scheduled posts.
- `public/profile.html` — standalone user profile/edit/media page.
- `public/settings.html` — privacy, notification and appearance settings.
- `public/stories.html` — own story list, views/reactions, edit/delete.
- `public/bot-v2.js` — internal Lumo bot control UI.
- `public/lumo-icon.svg` — premium Lumo app icon.
- `public/manifest.json` — PWA manifest.

## Main user flows
1. Login/Register -> token stored locally -> `/api/me`.
2. Chat list -> DM / Group / Channel -> Socket.IO room `c:<chatId>`.
3. Stories -> 24-hour Story documents -> shared-chat visibility -> view/reaction events -> owner edit/delete.
4. Channel post -> rich editor -> optional 1-4 R2 image/video uploads -> rich-message API -> realtime emit.
5. Message actions -> reactions, reply, forward, edit, delete, pin and ✓/✓✓ receipt state.
6. Voice note -> MediaRecorder -> R2 upload -> power message API -> inline audio player.
7. Presence -> heartbeat -> online/last-seen rendering with privacy-aware last-seen hiding.
8. Notifications -> mentions/comments/replies -> per-user Socket.IO room + notification center badge.
9. Mentions/hashtags -> indexed message metadata -> @ user preview and # tag search.
10. Channel comments -> comment/reply/reaction threads attached to channel post messages.
11. Scheduled channel posts -> pending queue -> server scheduler -> automatic realtime publication.
12. Safety -> block/unblock DMs + report user/chat/message records.
13. Group/channel admin -> edit metadata, add/remove members, promote/demote admins.
14. Profile -> avatar/cover/bio/status/website/birthday + personal media grid.
15. Settings -> privacy/discovery/read receipt/story reply/autoplay/notifications + light/dark appearance.
16. Bots -> built-in bot accounts, commands, keyword auto-replies and optional webhook/API access.

## Data collections
### v3
- `LumoProfile`
- `LumoStory`
- `LumoMessageExtra`
- `LumoChatState`
- `LumoReadState`
- `LumoMessageLink`

### v4
- `LumoPresence`
- `LumoNotification`
- `LumoBlock`
- `LumoReport`
- `LumoPostComment`
- `LumoMessageMeta`
- `LumoScheduledPost`

## Deployment
`npm install` runs:

`node patch-runtime.js && node patch-social.js`

The patches are idempotent, so repeated Render/GitHub builds do not duplicate server mounts or browser bundles. Then `npm start` runs the patched `server.js`.

GitHub Actions workflow `.github/workflows/lumo-check.yml` validates install/build patching and JavaScript syntax on every push to `main`. Render `lumo-messenger` uses auto-deploy from `main`.
