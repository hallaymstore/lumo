# Lumo Messenger Architecture

## Core
- `server.js` — base Express + MongoDB + Socket.IO messenger runtime.
- `patch-runtime.js` — bot engine v2 runtime patch.
- `patch-social.js` — idempotent build patch that mounts social/chat-admin modules and injects UI bundles.
- `social-runtime.js` — profile, settings, stories, message editing, rich channel posts, chat search/media APIs.
- `chat-admin-runtime.js` — group/channel management, member roles, pinned messages and unread/read state.

## Frontend
- `public/index.html` — white/pink premium Lumo shell, auth, chat list and realtime chat.
- `public/social-v3.css` — stories, rich posts, reactions, search and media UI.
- `public/social-v3.js` — story rail/viewer, rich channel editor, message edit/delete/reactions, chat search/media.
- `public/chat-admin-v3.js` — group/channel management, pins and unread badges.
- `public/global-v3.js` — shared UI helpers.
- `public/profile.html` — standalone user profile/edit/media page.
- `public/settings.html` — privacy, notification and appearance settings.
- `public/bot-v2.js` — internal Lumo bot control UI.
- `public/lumo-icon.svg` — premium Lumo app icon.
- `public/manifest.json` — PWA manifest.

## Main user flows
1. Login/Register -> token stored locally -> `/api/me`.
2. Chat list -> DM / Group / Channel -> Socket.IO room `c:<chatId>`.
3. Stories -> 24-hour Story documents -> shared-contact visibility -> view/reaction events.
4. Channel post -> rich editor -> optional 1-4 R2 media uploads -> rich-message API -> realtime message emit.
5. Message actions -> reactions, edit, delete, pin.
6. Group/channel admin -> edit metadata, add/remove members, promote/demote admins.
7. Profile -> avatar/cover/bio/status/website/birthday + personal media grid.
8. Settings -> privacy/discovery/read receipt/story reply/autoplay/notifications + light/dark appearance.
9. Search -> server-side text search inside a selected chat.
10. Read state -> per-user/per-chat read timestamp -> unread counters.

## Data collections added by v3
- `LumoProfile`
- `LumoStory`
- `LumoMessageExtra`
- `LumoChatState`
- `LumoReadState`

## Deployment
`npm install` runs:

`node patch-runtime.js && node patch-social.js`

Then `npm start` runs the patched `server.js`.

GitHub Actions workflow `.github/workflows/lumo-check.yml` validates install/build patching and JavaScript syntax on every push to `main`.
