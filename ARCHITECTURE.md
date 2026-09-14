# Lumo Messenger Architecture

## Core
- `server.js` — base Express + MongoDB + Socket.IO messenger runtime.
- `patch-runtime.js` — bot engine v2 runtime patch.
- `patch-social.js` — idempotent build patch that mounts social modules and injects UI bundles.
- `social-runtime.js` — profile, settings, stories, message editing/deleting, rich channel posts, chat search/media APIs.
- `chat-admin-runtime.js` — group/channel management, member roles, pinned messages and unread/read state.
- `story-owner-runtime.js` — current user's story management and editing.
- `message-links-runtime.js` — reply and forward metadata plus realtime reply/forward delivery.

## Frontend
- `public/index.html` — white/pink premium Lumo shell, auth, chat list and realtime chat.
- `public/social-v3.css` — stories, rich posts, reactions, search, media and editor UI.
- `public/social-v3.js` — story rail/viewer, rich channel editor, message edit/delete/reactions, chat search/media.
- `public/message-links-v3.js` — reply/forward controls and linked-message previews.
- `public/chat-admin-v3.js` — group/channel management, pins, roles and unread badges.
- `public/story-owner-v3.js` — story management shortcut.
- `public/global-v3.js` — shared UI helpers.
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
4. Channel post -> rich editor -> optional 1-4 R2 image/video uploads -> rich-message API -> realtime message emit.
5. Message actions -> reactions, reply, forward, edit, delete and pin.
6. Group/channel admin -> edit title/description/public state, add/remove members, promote/demote admins.
7. Profile -> avatar/cover/bio/status/website/birthday + personal media grid.
8. Settings -> privacy/discovery/read receipt/story reply/autoplay/notifications + light/dark appearance.
9. Search -> server-side text search inside a selected chat.
10. Media -> per-chat and personal image/video/file galleries.
11. Read state -> per-user/per-chat read timestamp -> unread counters.
12. Bots -> built-in bot accounts, commands, keyword auto-replies and optional webhook/API access.

## Data collections added by v3
- `LumoProfile`
- `LumoStory`
- `LumoMessageExtra`
- `LumoChatState`
- `LumoReadState`
- `LumoMessageLink`

## Deployment
`npm install` runs:

`node patch-runtime.js && node patch-social.js`

The patches are idempotent, so repeated Render/GitHub builds do not duplicate server mounts or browser bundles.

Then `npm start` runs the patched `server.js`.

GitHub Actions workflow `.github/workflows/lumo-check.yml` validates install/build patching and JavaScript syntax on every push to `main`.
