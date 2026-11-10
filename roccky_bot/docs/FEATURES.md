# Complete feature catalogue

The import smoke test loads **148 plugin files** and **475 normalized command/alias entries**, including generated quiz, reaction and sound-effect handlers. This catalogue is built from the actual exports and source imports. It includes event-only modules, not just menu-visible commands.

## Usage conventions and limitations

Use your configured prefix (examples use `.`). A listed command generally accepts text, a link, a mention, or a replied media message as appropriate. Invoke it without arguments to receive its own syntax/example response. For quiz commands, start a quiz in a group, reply with an answer, then use its matching clue or skip command. Menu categories enumerate public commands; hidden aliases remain routable.

Listener applies owner/partner/premium/group/private/admin/botAdmin guards plus limit/energy costs. Guards shown below come from the export; modules can also apply conditional checks. Settings listed are fields referenced by that module, not instructions to enable all of them. Defaults are in Constants/config.js.

Remote APIs, searches and downloads require internet access and working providers; they can change, rate-limit, or reject content. Provider-specific configuration is inherited through the listed helpers. Media conversion requires FFmpeg/ffprobe or supported native image packages. Features using stored messages are limited by retention and availability. Only import and selected synthetic behavioral checks were run, not every external command. See AUDIT for live-validation requirements.

## Non-plugin capabilities

- Single-worker WhatsApp connection recovery, preserved authentication, private pairing and graceful shutdown: socket.js, Event, ConnectionManager and Supervisor.
- Core local/cloud snapshots, retry state, retention and restore: Database, SnapshotFile, Persistence and CloudDatabase.
- Scheduled premium/rental expiry, prayer reminders, daily quotas and maintenance: Components.
- Optional HTTP AI gateway: Chat Completions, Responses, legacy completions, session inspection/deletion and upload/provider routes in AI-SEERVER/api/index.js. Uses separate provider credentials and bounded proof of work.
- Owner coding agent: guarded filesystem/command/provider tools, confirmations and per-owner memory in agent/.
- Language learning engine: course/proficiency/vocabulary/spaced-repetition memory and interactive component rendering in ro-lang/.

## Plugin inventory

### quiz-registry

Awaits all configured quiz factories, exporting start/clue/skip and answer-event handlers. Datasets are loaded lazily from media/Text; locks release on failure and timers stop on disconnect.

- Source/category: [plugins/_quiz-registry.js](<../plugins/_quiz-registry.js>) — games.
- Commands and aliases: `.brainout`, `.cluebrain`, `.skipbrain`, `.caklontong`, `.cluecak`, `.skipcak`, `.heroff`, `.tebakff`, `.clueff`, `.skipff`, `.heroml`, `.tebakml`, `.clueml`, `.skipml`, `.jkt48`, `.cluejkt`, `.skipjkt`, `.drakor`, `.cluedrakor`, `.skipdrakor`, `.riddle`, `.tekateki`, `.clueriddle`, `.skipriddle`, `.whatanimal`, `.tebakhewan`, `.clueanimal`, `.skipanimal`, `.whatchemistry`, `.tebakkimia`, `.cluechemistry`, `.skipchemistry`, `.whatcountry`, `.tebaknegara`, `.cluecountry`, `.skipcountry`, `.whatfilm`, `.tebakfilm`, `.cluefilm`, `.skipfilm`, `.whatflag`, `.tebakbendera`, `.clueflag`, `.skipflag`, `.whatfood`, `.tebakmakanan`, `.cluefood`, `.skipfood`, `.whatlyric`, `.tebaklirik`, `.cluelyric`, `.skiplyric`, `.whatpicture`, `.tebakgambar`, `.cluepicture`, `.skippicture`, `.whatprofession`, `.tebakprofesi`, `.clueprofession`, `.skipprofession`, `.whatword`, `.tebakkata`, `.clueword`, `.skipword`, `.whoami`, `.siapaaku`, `.cluewho`, `.skipwho`.
- Guards/costs: `group=true`, `energy=15`, `limit=1`.
- Dependencies: `../lib/Components/QuizFactory.js`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### admin tools/activation

Activation: Admin-authorized group configuration or participant management.

- Source/category: [plugins/admin tools/activation.js](<../plugins/admin tools/activation.js>) — admin tools.
- Commands and aliases: `.mute`, `.unmute`.
- Guards/costs: `group=true`, `admin=true`.
- Dependencies: Listener context, socket APIs and built-in JavaScript.
- Referenced settings: `group.mute`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### admin tools/manage-group

Manage group: Admin-authorized group configuration or participant management.

- Source/category: [plugins/admin tools/manage-group.js](<../plugins/admin tools/manage-group.js>) — admin tools.
- Commands and aliases: `.closegc`, `.opengc`, `.delete`, `.setgcdesc`, `.setgcname`, `.setgcpp`, `.setleft`, `.setwelcome`, `.upgcsw`, `.del`.
- Guards/costs: `group=true`, `admin=true`, `botAdmin=true`.
- Dependencies: `../../lib/Utilities.js`.
- Referenced settings: `group.leftMessage`, `group.welcomeMessage`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### admin tools/manage-member

Manage member: Admin-authorized group configuration or participant management.

- Source/category: [plugins/admin tools/manage-member.js](<../plugins/admin tools/manage-member.js>) — admin tools.
- Commands and aliases: `.+warn`, `.-warn`, `.add`, `.kick`, `.promote`, `.demote`, `.sider`.
- Guards/costs: `group=true`, `admin=true`, `botAdmin=true`.
- Dependencies: `baileys`, `../../lib/Constants.js`, `../../lib/Serialize.js`, `../../lib/Utilities.js`.
- Referenced settings: `group.participants`, `setting.partner`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### admin tools/mentions

Mentions: Admin-authorized group configuration or participant management.

- Source/category: [plugins/admin tools/mentions.js](<../plugins/admin tools/mentions.js>) — admin tools.
- Commands and aliases: `.everyone`, `.hidetag`, `.tagall`, `.totag`.
- Guards/costs: `group=true`, `admin=true`.
- Dependencies: `../../lib/Utilities.js`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### admin tools/moderation

Moderation: Admin-authorized group configuration or participant management.

- Source/category: [plugins/admin tools/moderation.js](<../plugins/admin tools/moderation.js>) — admin tools.
- Commands and aliases: `.adminonly`, `.antibot`, `.antidelete`, `.antiporn`, `.antigroupstatus`, `.antilink`, `.antirejoin`, `.antispam`, `.antitagall`, `.antitagstatus`, `.antitoxic`, `.antiwalink`, `.autosticker`, `.labelupdate`, `.sholatreminder`, `.left`, `.welcome`.
- Guards/costs: `group=true`, `admin=true`.
- Dependencies: Listener context, socket APIs and built-in JavaScript.
- Referenced settings: `group.keySetting`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### ai/chatbot-agent

Connects the owner coding agent to private owner WhatsApp commands/events through the existing agent plugin.

- Source/category: [plugins/ai/_chatbot-agent.js](<../plugins/ai/_chatbot-agent.js>) — owner.
- Commands and aliases: `.agent`, `.devagent`, `.owneragent`.
- Guards/costs: `owner=true`, `private=true`.
- Dependencies: `../../agent/plugin.js?runtime=owner-auth-v2`.
- Limits/configuration: restricted to the configured authorized identity; state-changing commands require careful operational use. Backups, source updates and real-account changes were not executed in this audit.

### ai/chatbot

Existing conversational AI handler and format path. Uses persistent chatbot settings and existing provider/rendering code; AI text/Markdown formatting is preserved.

- Source/category: [plugins/ai/_chatbot.js](<../plugins/ai/_chatbot.js>) — message event.
- Usage: automatic message event; no direct command export.
- Guards/costs: no export-level restriction; inspect conditional checks in the handler.
- Implementation helpers: `fetch`, `func.persistToFile`, `func.sendAI`.
- Dependencies: `fs`, `path`, `cheerio`, `../../lib/Scraper.js`, `../../lib/Utilities.js`, `gtts`, `qrcode`, `axios`, `#scrap`.
- Referenced settings: `global.fetch`, `setting.chatBot`, `global.groqApiKeys`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### ai/rocky-learning

Owner-only conversational language tutor with progress, vocabulary, activities and reminders. Uses separate RO-LANG memory and lifecycle-aware socket references.

- Source/category: [plugins/ai/_rocky-learning.js](<../plugins/ai/_rocky-learning.js>) — ai.
- Commands and aliases: `.rockylearn`.
- Guards/costs: `owner=true`.
- Dependencies: `baileys`, `node:url`, `node:path`, `../../ro-lang/src/index.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### ai/gpt-image

Gpt image: AI generation/conversation integration using the configured provider and existing message renderers.

- Source/category: [plugins/ai/gpt-image.js](<../plugins/ai/gpt-image.js>) — ai.
- Commands and aliases: `.aiimg`, `.openaiimg`.
- Guards/costs: `limit=1`.
- Implementation helpers: `scrap.processEzCreateJob`, `fetch`.
- Dependencies: Listener context, socket APIs and built-in JavaScript.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### ai/image-generation

Image generation: AI generation/conversation integration using the configured provider and existing message renderers.

- Source/category: [plugins/ai/image-generation.js](<../plugins/ai/image-generation.js>) — ai.
- Commands and aliases: `.animagine`, `.cartoony`, `.dreamshaper`, `.newreality`.
- Guards/costs: `limit=1`.
- Implementation helpers: `nekolabs`.
- Dependencies: `../../lib/Request.js`, `../../lib/Utilities.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### ai/music-generation

Music generation: AI generation/conversation integration using the configured provider and existing message renderers.

- Source/category: [plugins/ai/music-generation.js](<../plugins/ai/music-generation.js>) — ai.
- Commands and aliases: `.suno`.
- Guards/costs: `limit=1`.
- Implementation helpers: `zenzxz`.
- Dependencies: `baileys`, `../../lib/Request.js`, `../../lib/Utilities.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### ai/nano-banana

Nano banana: AI generation/conversation integration using the configured provider and existing message renderers.

- Source/category: [plugins/ai/nano-banana.js](<../plugins/ai/nano-banana.js>) — ai.
- Commands and aliases: `.nanobanana`.
- Guards/costs: `limit=1`.
- Implementation helpers: `faa`.
- Dependencies: `../../lib/Request.js`, `../../lib/Scraper.js`, `../../lib/Utilities.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### ai/text-generation

Text generation: AI generation/conversation integration using the configured provider and existing message renderers.

- Source/category: [plugins/ai/text-generation.js](<../plugins/ai/text-generation.js>) — ai.
- Commands and aliases: `.ai`, `.claude`, `.copilot`, `.deepsearch`, `.deepseek`, `.dgaf`, `.dolphin`, `.dreamanalyze`, `.gita`, `.glm`, `.hammer`, `.nexray`, `.perplexity`.
- Guards/costs: `limit=1`.
- Implementation helpers: `nexray`.
- Dependencies: `../../lib/Request.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### download/auto-download

Auto download: Automatic message handler selected by Listener when its guards and message conditions apply.

- Source/category: [plugins/download/_auto-download.js](<../plugins/download/_auto-download.js>) — message event.
- Usage: automatic message event; no direct command export.
- Guards/costs: no export-level restriction; inspect conditional checks in the handler.
- Implementation helpers: `nexray`, `nekolabs`.
- Dependencies: `../../lib/Constants.js`, `../../lib/Request.js`, `../../lib/Scraper.js`, `../../lib/Utilities.js`.
- Referenced settings: `setting.autoDownload`, `setting.prefixes`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### download/aio

Aio: Downloads media from the named service and sends the result through the socket media helpers.

- Source/category: [plugins/download/aio.js](<../plugins/download/aio.js>) — download.
- Commands and aliases: `.aio`, `.alldl`, `.anydl`.
- Guards/costs: `limit=1`.
- Implementation helpers: `scrap.socialDl`, `scrap.resolveSaveNow`, `func.getFileSize`.
- Dependencies: Listener context, socket APIs and built-in JavaScript.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### download/capcut

Capcut: Downloads media from the named service and sends the result through the socket media helpers.

- Source/category: [plugins/download/capcut.js](<../plugins/download/capcut.js>) — download.
- Commands and aliases: `.capcut`, `.cc`.
- Guards/costs: `limit=1`.
- Implementation helpers: `nexray`.
- Dependencies: `../../lib/Request.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### download/douyin

Douyin: Downloads media from the named service and sends the result through the socket media helpers.

- Source/category: [plugins/download/douyin.js](<../plugins/download/douyin.js>) — download.
- Commands and aliases: `.douyin`, `.doump3`, `.douvn`.
- Guards/costs: `limit=1`.
- Implementation helpers: `nexray`.
- Dependencies: `baileys`, `../../lib/Request.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### download/facebook

Facebook: Downloads media from the named service and sends the result through the socket media helpers.

- Source/category: [plugins/download/facebook.js](<../plugins/download/facebook.js>) — download.
- Commands and aliases: `.facebook`, `.fbmp3`, `.fbvn`, `.fb`.
- Guards/costs: `limit=1`.
- Implementation helpers: `nexray`.
- Dependencies: `../../lib/Request.js`, `../../lib/Utilities.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### download/google-drive

Google drive: Downloads media from the named service and sends the result through the socket media helpers.

- Source/category: [plugins/download/google-drive.js](<../plugins/download/google-drive.js>) — download.
- Commands and aliases: `.gdrive`.
- Guards/costs: `limit=1`.
- Implementation helpers: `nexray`.
- Dependencies: `../../lib/Request.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### download/instagram

Instagram: Downloads media from the named service and sends the result through the socket media helpers.

- Source/category: [plugins/download/instagram.js](<../plugins/download/instagram.js>) — download.
- Commands and aliases: `.instagram`, `.ig`.
- Guards/costs: `limit=1`.
- Dependencies: `../../lib/Scraper.js`, `../../lib/Utilities.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### download/mediafire

Mediafire: Downloads media from the named service and sends the result through the socket media helpers.

- Source/category: [plugins/download/mediafire.js](<../plugins/download/mediafire.js>) — download.
- Commands and aliases: `.mediafire`, `.mf`.
- Guards/costs: `limit=1`.
- Implementation helpers: `nexray`.
- Dependencies: `../../lib/Request.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### download/pin

Pin: Downloads media from the named service and sends the result through the socket media helpers.

- Source/category: [plugins/download/pin.js](<../plugins/download/pin.js>) — download.
- Commands and aliases: `.pin`.
- Guards/costs: `limit=1`.
- Implementation helpers: `nekolabs`.
- Dependencies: `../../lib/Request.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### download/spotify

Spotify: Downloads media from the named service and sends the result through the socket media helpers.

- Source/category: [plugins/download/spotify.js](<../plugins/download/spotify.js>) — download.
- Commands and aliases: `.spotify`.
- Guards/costs: `limit=1`.
- Implementation helpers: `nexray`.
- Dependencies: `../../lib/Request.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### download/terabox

Terabox: Downloads media from the named service and sends the result through the socket media helpers.

- Source/category: [plugins/download/terabox.js](<../plugins/download/terabox.js>) — download.
- Commands and aliases: `.terabox`, `.tb`.
- Guards/costs: `limit=1`.
- Implementation helpers: `zenzxz`.
- Dependencies: `../../lib/Constants.js`, `../../lib/Request.js`, `../../lib/Utilities.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### download/tiktok

Tiktok: Downloads media from the named service and sends the result through the socket media helpers.

- Source/category: [plugins/download/tiktok.js](<../plugins/download/tiktok.js>) — download.
- Commands and aliases: `.tiktok`, `.tikwm`, `.ttmp3`, `.ttvn`, `.tt`, `.ttmp4`, `.ttwm`.
- Guards/costs: `limit=1`.
- Implementation helpers: `fetch`, `func.getFileSize`.
- Dependencies: Listener context, socket APIs and built-in JavaScript.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### download/twitter

Twitter: Downloads media from the named service and sends the result through the socket media helpers.

- Source/category: [plugins/download/twitter.js](<../plugins/download/twitter.js>) — download.
- Commands and aliases: `.twitter`, `.tw`.
- Guards/costs: `limit=1`.
- Implementation helpers: `nexray`.
- Dependencies: `../../lib/Request.js`, `../../lib/Utilities.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### download/videy

Videy: Downloads media from the named service and sends the result through the socket media helpers.

- Source/category: [plugins/download/videy.js](<../plugins/download/videy.js>) — download.
- Commands and aliases: `.videy`.
- Guards/costs: `limit=1`.
- Implementation helpers: `nexray`.
- Dependencies: `../../lib/Request.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### download/youtube

Youtube: Downloads media from the named service and sends the result through the socket media helpers.

- Source/category: [plugins/download/youtube.js](<../plugins/download/youtube.js>) — download.
- Commands and aliases: `.ytmp3`, `.ytmp4`, `.yta`, `.ytv`.
- Guards/costs: `limit=1`.
- Implementation helpers: `func.isURL`, `scrap.vidSave`.
- Dependencies: Listener context, socket APIs and built-in JavaScript.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### explore/lyric

Lyric: Searches or retrieves media/content from the named service and presents results or playable media.

- Source/category: [plugins/explore/lyric.js](<../plugins/explore/lyric.js>) — explore.
- Commands and aliases: `.lyric`, `.lirik`.
- Guards/costs: `limit=1`.
- Implementation helpers: `deline`.
- Dependencies: `../../lib/Request.js`, `../../lib/Utilities.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### explore/meloboom

Meloboom: Searches or retrieves media/content from the named service and presents results or playable media.

- Source/category: [plugins/explore/meloboom.js](<../plugins/explore/meloboom.js>) — explore.
- Commands and aliases: `.meloboom`.
- Guards/costs: `limit=1`.
- Dependencies: `../../lib/Scraper.js`, `../../lib/Utilities.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### explore/pinterest

Pinterest: Searches or retrieves media/content from the named service and presents results or playable media.

- Source/category: [plugins/explore/pinterest.js](<../plugins/explore/pinterest.js>) — explore.
- Commands and aliases: `.pinimg`, `.pins`.
- Guards/costs: `limit=1`.
- Implementation helpers: `nexray`.
- Dependencies: `../../lib/Request.js`, `../../lib/Utilities.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### explore/spotify-play

Spotify play: Searches or retrieves media/content from the named service and presents results or playable media.

- Source/category: [plugins/explore/spotify-play.js](<../plugins/explore/spotify-play.js>) — explore.
- Commands and aliases: `.spotplay`.
- Guards/costs: `limit=1`.
- Implementation helpers: `zenzxz`.
- Dependencies: `baileys`, `../../lib/Request.js`, `../../lib/Utilities.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### explore/spotify-search

Spotify search: Searches or retrieves media/content from the named service and presents results or playable media.

- Source/category: [plugins/explore/spotify-search.js](<../plugins/explore/spotify-search.js>) — explore.
- Commands and aliases: `.spotsearch`.
- Guards/costs: `limit=1`.
- Implementation helpers: `zenzxz`.
- Dependencies: `baileys`, `../../lib/Request.js`, `../../lib/Utilities.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### explore/sticker-pack

Sticker pack: Searches or retrieves media/content from the named service and presents results or playable media.

- Source/category: [plugins/explore/sticker-pack.js](<../plugins/explore/sticker-pack.js>) — explore.
- Commands and aliases: `.stickerpack`, `.skpack`.
- Guards/costs: `limit=1`.
- Dependencies: `../../lib/Scraper.js`, `../../lib/Utilities.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### explore/stickerly

Stickerly: Searches or retrieves media/content from the named service and presents results or playable media.

- Source/category: [plugins/explore/stickerly.js](<../plugins/explore/stickerly.js>) — explore.
- Commands and aliases: `.stickerly`.
- Guards/costs: `limit=1`.
- Dependencies: `../../lib/Scraper.js`, `../../lib/Utilities.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### explore/tiktok-photo

Tiktok photo: Searches or retrieves media/content from the named service and presents results or playable media.

- Source/category: [plugins/explore/tiktok-photo.js](<../plugins/explore/tiktok-photo.js>) — explore.
- Commands and aliases: `.ttphoto`.
- Guards/costs: `limit=1`.
- Implementation helpers: `nexray`.
- Dependencies: `../../lib/Request.js`, `../../lib/Utilities.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### explore/wallcraft

Wallcraft: Searches or retrieves media/content from the named service and presents results or playable media.

- Source/category: [plugins/explore/wallcraft.js](<../plugins/explore/wallcraft.js>) — explore.
- Commands and aliases: `.wallcraft`.
- Guards/costs: `limit=1`.
- Implementation helpers: `nexray`.
- Dependencies: `../../lib/Request.js`, `../../lib/Utilities.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### explore/youtube-play

Youtube play: Searches or retrieves media/content from the named service and presents results or playable media.

- Source/category: [plugins/explore/youtube-play.js](<../plugins/explore/youtube-play.js>) — explore.
- Commands and aliases: `.play`.
- Guards/costs: `limit=1`.
- Implementation helpers: `fetch`, `func.frame`, `func.formatNumber`, `scrap.vidSave`.
- Dependencies: Listener context, socket APIs and built-in JavaScript.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### explore/youtube-search

Youtube search: Searches or retrieves media/content from the named service and presents results or playable media.

- Source/category: [plugins/explore/youtube-search.js](<../plugins/explore/youtube-search.js>) — explore.
- Commands and aliases: `.ytsearch`, `.yts`, `.ytsa`, `.ytsv`.
- Guards/costs: `limit=1`.
- Implementation helpers: `nexray`.
- Dependencies: `baileys`, `yt-search`, `../../lib/Request.js`, `../../lib/Utilities.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### explore/youtube-video

Youtube video: Searches or retrieves media/content from the named service and presents results or playable media.

- Source/category: [plugins/explore/youtube-video.js](<../plugins/explore/youtube-video.js>) — explore.
- Commands and aliases: `.playvideo`, `.ptv`.
- Guards/costs: `limit=1`.
- Implementation helpers: `nexray`.
- Dependencies: `yt-search`, `../../lib/Request.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### group/afk-notifier

Afk notifier: Automatic message handler selected by Listener when its guards and message conditions apply.

- Source/category: [plugins/group/_afk-notifier.js](<../plugins/group/_afk-notifier.js>) — message event.
- Usage: automatic message event; no direct command export.
- Guards/costs: `group=true`.
- Dependencies: `baileys`, `../../lib/Utilities.js`.
- Referenced settings: `setting.afkNotifier`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### group/anti-bot

Anti bot: Automatic message handler selected by Listener when its guards and message conditions apply.

- Source/category: [plugins/group/_anti-bot.js](<../plugins/group/_anti-bot.js>) — message event.
- Usage: automatic message event; no direct command export.
- Guards/costs: `group=true`, `botAdmin=true`.
- Dependencies: `./_anti-link.js`.
- Referenced settings: `group.antiBot`, `group.participants`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### group/anti-delete

Anti delete: Automatic message handler selected by Listener when its guards and message conditions apply.

- Source/category: [plugins/group/_anti-delete.js](<../plugins/group/_anti-delete.js>) — message event.
- Usage: automatic message event; no direct command export.
- Guards/costs: `group=true`.
- Dependencies: Listener context, socket APIs and built-in JavaScript.
- Referenced settings: `group.antiDelete`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### group/anti-group-status

Anti group status: Automatic message handler selected by Listener when its guards and message conditions apply.

- Source/category: [plugins/group/_anti-group-status.js](<../plugins/group/_anti-group-status.js>) — message event.
- Usage: automatic message event; no direct command export.
- Guards/costs: `group=true`, `botAdmin=true`.
- Dependencies: `./_anti-link.js`.
- Referenced settings: `group.antiGroupStatus`, `group.participants`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### group/anti-link

Anti link: Automatic message handler selected by Listener when its guards and message conditions apply.

- Source/category: [plugins/group/_anti-link.js](<../plugins/group/_anti-link.js>) — message event.
- Usage: automatic message event; no direct command export.
- Guards/costs: `group=true`, `botAdmin=true`.
- Dependencies: `../../lib/Utilities.js`.
- Referenced settings: `group.antiLink`, `group.participants`, `group.antiWALink`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### group/anti-porn

Anti porn: Automatic message handler selected by Listener when its guards and message conditions apply.

- Source/category: [plugins/group/_anti-porn.js](<../plugins/group/_anti-porn.js>) — message event.
- Usage: automatic message event; no direct command export.
- Guards/costs: `group=true`, `botAdmin=true`.
- Dependencies: `../../lib/Utilities.js`, `../../lib/Components/SightEngine.js`, `./_anti-link.js`.
- Referenced settings: `group.antiPorn`, `group.participants`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### group/anti-spam

Anti spam: Automatic message handler selected by Listener when its guards and message conditions apply.

- Source/category: [plugins/group/_anti-spam.js](<../plugins/group/_anti-spam.js>) — message event.
- Usage: automatic message event; no direct command export.
- Guards/costs: `group=true`, `botAdmin=true`.
- Dependencies: `../../lib/Components/AntiSpam.js`, `./_anti-link.js`.
- Referenced settings: `group.antiSpam`, `group.participants`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### group/anti-tag-all

Anti tag all: Automatic message handler selected by Listener when its guards and message conditions apply.

- Source/category: [plugins/group/_anti-tag-all.js](<../plugins/group/_anti-tag-all.js>) — message event.
- Usage: automatic message event; no direct command export.
- Guards/costs: `group=true`, `botAdmin=true`.
- Dependencies: `./_anti-link.js`.
- Referenced settings: `group.antiTagAll`, `group.participants`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### group/anti-tag-status

Anti tag status: Automatic message handler selected by Listener when its guards and message conditions apply.

- Source/category: [plugins/group/_anti-tag-status.js](<../plugins/group/_anti-tag-status.js>) — message event.
- Usage: automatic message event; no direct command export.
- Guards/costs: `group=true`, `botAdmin=true`.
- Dependencies: `./_anti-link.js`.
- Referenced settings: `group.antiTagStatus`, `group.participants`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### group/anti-toxic

Anti toxic: Automatic message handler selected by Listener when its guards and message conditions apply.

- Source/category: [plugins/group/_anti-toxic.js](<../plugins/group/_anti-toxic.js>) — message event.
- Usage: automatic message event; no direct command export.
- Guards/costs: `group=true`, `botAdmin=true`.
- Dependencies: `./_anti-link.js`.
- Referenced settings: `group.antiToxic`, `setting.forbiddenWords`, `group.participants`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### group/auto-sticker

Auto sticker: Automatic message handler selected by Listener when its guards and message conditions apply.

- Source/category: [plugins/group/_auto-sticker.js](<../plugins/group/_auto-sticker.js>) — message event.
- Usage: automatic message event; no direct command export.
- Guards/costs: `group=true`.
- Dependencies: `../../lib/Utilities.js`.
- Referenced settings: `group.autoSticker`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### group/label-update

Label update: Automatic message handler selected by Listener when its guards and message conditions apply.

- Source/category: [plugins/group/_label-update.js](<../plugins/group/_label-update.js>) — message event.
- Usage: automatic message event; no direct command export.
- Guards/costs: `group=true`.
- Dependencies: Listener context, socket APIs and built-in JavaScript.
- Referenced settings: `group.memberLabelUpdate`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### group/view-once

View once: Automatic message handler selected by Listener when its guards and message conditions apply.

- Source/category: [plugins/group/_view-once.js](<../plugins/group/_view-once.js>) — message event.
- Usage: automatic message event; no direct command export.
- Guards/costs: `group=true`.
- Dependencies: Listener context, socket APIs and built-in JavaScript.
- Referenced settings: `group.viewOnceForwarder`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### group/addmode

Addmode: Group-only utilities or automatic moderation/message behavior.

- Source/category: [plugins/group/addmode.js](<../plugins/group/addmode.js>) — group.
- Commands and aliases: `.addmode`, `.addmember`.
- Guards/costs: `group=true`, `admin=true`, `botAdmin=true`.
- Dependencies: Listener context, socket APIs and built-in JavaScript.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### group/couple

Couple: Group-only utilities or automatic moderation/message behavior.

- Source/category: [plugins/group/couple.js](<../plugins/group/couple.js>) — group.
- Commands and aliases: `.couple`, `.cp`.
- Guards/costs: `group=true`.
- Dependencies: `../../lib/Utilities.js`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### group/ephemeral

Ephemeral: Group-only utilities or automatic moderation/message behavior.

- Source/category: [plugins/group/ephemeral.js](<../plugins/group/ephemeral.js>) — group.
- Commands and aliases: `.ephemeral`, `.disappearing`.
- Guards/costs: `group=true`, `admin=true`, `botAdmin=true`.
- Dependencies: Listener context, socket APIs and built-in JavaScript.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### group/getgcsw

Getgcsw: Group-only utilities or automatic moderation/message behavior.

- Source/category: [plugins/group/getgcsw.js](<../plugins/group/getgcsw.js>) — group.
- Commands and aliases: `.getgcsw`.
- Guards/costs: `group=true`.
- Dependencies: `../../lib/Utilities.js`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### group/getpp

Getpp: Group-only utilities or automatic moderation/message behavior.

- Source/category: [plugins/group/getpp.js](<../plugins/group/getpp.js>) — group.
- Commands and aliases: `.getpp`.
- Guards/costs: `premium=true`, `group=true`.
- Dependencies: `baileys`, `../../lib/Serialize.js`.
- Referenced settings: `setting.partner`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### group/group-info

Group info: Group-only utilities or automatic moderation/message behavior.

- Source/category: [plugins/group/group-info.js](<../plugins/group/group-info.js>) — group.
- Commands and aliases: `.gcinfo`, `.idgc`.
- Guards/costs: `group=true`.
- Dependencies: `../../lib/Utilities.js`.
- Referenced settings: `group.autoSticker`, `group.antiBot`, `group.antiDelete`, `group.antiPorn`, `group.antiGroupStatus`, `group.antiLink`, `group.antiRejoin`, `group.antiSpam`, `group.antiTagAll`, `group.antiTagStatus`, `group.antiToxic`, `group.antiWALink`, `group.memberLabelUpdate`, `group.sholatReminder`, `group.left`, `group.welcome`, `group.adminOnly`, `group.mute`, `group.rentExpiry`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### group/group-link

Group link: Group-only utilities or automatic moderation/message behavior.

- Source/category: [plugins/group/group-link.js](<../plugins/group/group-link.js>) — group.
- Commands and aliases: `.gclink`.
- Guards/costs: `group=true`, `botAdmin=true`.
- Dependencies: `../../lib/Utilities.js`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### group/joinreq

Joinreq: Group-only utilities or automatic moderation/message behavior.

- Source/category: [plugins/group/joinreq.js](<../plugins/group/joinreq.js>) — group.
- Commands and aliases: `.joinreq`, `.accjoin`, `.rejjoin`, `.pendingjoin`, `.approvejoin`, `.rejectjoin`.
- Guards/costs: `group=true`, `admin=true`, `botAdmin=true`.
- Dependencies: `../../lib/Utilities.js`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### group/pinmsg

Pinmsg: Group-only utilities or automatic moderation/message behavior.

- Source/category: [plugins/group/pinmsg.js](<../plugins/group/pinmsg.js>) — group.
- Commands and aliases: `.pinmsg`.
- Guards/costs: `group=true`, `admin=true`, `botAdmin=true`.
- Dependencies: Listener context, socket APIs and built-in JavaScript.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### group/poll

Poll: Group-only utilities or automatic moderation/message behavior.

- Source/category: [plugins/group/poll.js](<../plugins/group/poll.js>) — group.
- Commands and aliases: `.poll`, `.buatpoll`.
- Guards/costs: `group=true`, `limit=1`.
- Dependencies: Listener context, socket APIs and built-in JavaScript.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### group/quoted-message

Quoted message: Group-only utilities or automatic moderation/message behavior.

- Source/category: [plugins/group/quoted-message.js](<../plugins/group/quoted-message.js>) — group.
- Commands and aliases: `.quoted`.
- Guards/costs: `group=true`.
- Dependencies: Listener context, socket APIs and built-in JavaScript.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### group/read-once

Read once: Group-only utilities or automatic moderation/message behavior.

- Source/category: [plugins/group/read-once.js](<../plugins/group/read-once.js>) — group.
- Commands and aliases: `.rvo`.
- Guards/costs: `premium=true`, `group=true`.
- Dependencies: `../../lib/Utilities.js`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### group/revokelink

Revokelink: Group-only utilities or automatic moderation/message behavior.

- Source/category: [plugins/group/revokelink.js](<../plugins/group/revokelink.js>) — group.
- Commands and aliases: `.revokelink`, `.revoke`.
- Guards/costs: `group=true`, `admin=true`, `botAdmin=true`.
- Dependencies: `../../lib/Utilities.js`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### group/total-chat

Total chat: Group-only utilities or automatic moderation/message behavior.

- Source/category: [plugins/group/total-chat.js](<../plugins/group/total-chat.js>) — group.
- Commands and aliases: `.totalchat`.
- Guards/costs: `group=true`.
- Dependencies: `../../lib/Utilities.js`.
- Referenced settings: `group.participants`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### maker/attp

Attp: Creates or transforms media from user text, quoted media or provider templates.

- Source/category: [plugins/maker/attp.js](<../plugins/maker/attp.js>) — maker.
- Commands and aliases: `.attp`, `.ttp`.
- Guards/costs: `limit=1`.
- Dependencies: `../../lib/Request.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### maker/balogo

Balogo: Creates or transforms media from user text, quoted media or provider templates.

- Source/category: [plugins/maker/balogo.js](<../plugins/maker/balogo.js>) — maker.
- Commands and aliases: `.balogo`.
- Guards/costs: `limit=1`.
- Implementation helpers: `nexray`.
- Dependencies: `../../lib/Request.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### maker/brat-hd

Brat hd: Creates or transforms media from user text, quoted media or provider templates.

- Source/category: [plugins/maker/brat-hd.js](<../plugins/maker/brat-hd.js>) — maker.
- Commands and aliases: `.brathd`, `.bratvidhd`.
- Guards/costs: `premium=true`, `limit=1`.
- Dependencies: `../../lib/Request.js`, `../../lib/Scraper.js`, `../../lib/Utilities.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### maker/brat-variant

Brat variant: Creates or transforms media from user text, quoted media or provider templates.

- Source/category: [plugins/maker/brat-variant.js](<../plugins/maker/brat-variant.js>) — maker.
- Commands and aliases: `.bratanime`, `.bratgirl`.
- Guards/costs: `limit=1`.
- Dependencies: `../../lib/Request.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### maker/brat

Brat: Creates or transforms media from user text, quoted media or provider templates.

- Source/category: [plugins/maker/brat.js](<../plugins/maker/brat.js>) — maker.
- Commands and aliases: `.brat`, `.bratvid`.
- Guards/costs: `limit=1`.
- Dependencies: `../../lib/Utilities.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### maker/carbonify

Carbonify: Creates or transforms media from user text, quoted media or provider templates.

- Source/category: [plugins/maker/carbonify.js](<../plugins/maker/carbonify.js>) — maker.
- Commands and aliases: `.carbonify`.
- Guards/costs: `limit=1`.
- Implementation helpers: `nexray`.
- Dependencies: `../../lib/Request.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### maker/fake-call

Fake call: Creates or transforms media from user text, quoted media or provider templates.

- Source/category: [plugins/maker/fake-call.js](<../plugins/maker/fake-call.js>) — maker.
- Commands and aliases: `.fakecall`.
- Guards/costs: `limit=1`.
- Implementation helpers: `zenzxz`.
- Dependencies: `../../lib/Request.js`, `../../lib/Scraper.js`, `../../lib/Utilities.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### maker/fake-dana

Fake dana: Creates or transforms media from user text, quoted media or provider templates.

- Source/category: [plugins/maker/fake-dana.js](<../plugins/maker/fake-dana.js>) — maker.
- Commands and aliases: `.fakedana`.
- Guards/costs: `limit=1`.
- Implementation helpers: `zenzxz`.
- Dependencies: `../../lib/Request.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### maker/fake-fbcomment

Fake fbcomment: Creates or transforms media from user text, quoted media or provider templates.

- Source/category: [plugins/maker/fake-fbcomment.js](<../plugins/maker/fake-fbcomment.js>) — maker.
- Commands and aliases: `.fakefbcomment`.
- Guards/costs: `limit=1`.
- Implementation helpers: `zenzxz`.
- Dependencies: `../../lib/Request.js`, `../../lib/Scraper.js`, `../../lib/Utilities.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### maker/fake-ff

Fake ff: Creates or transforms media from user text, quoted media or provider templates.

- Source/category: [plugins/maker/fake-ff.js](<../plugins/maker/fake-ff.js>) — maker.
- Commands and aliases: `.fakeff`.
- Guards/costs: `limit=1`.
- Implementation helpers: `nexray`.
- Dependencies: `../../lib/Request.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### maker/fake-ml

Fake ml: Creates or transforms media from user text, quoted media or provider templates.

- Source/category: [plugins/maker/fake-ml.js](<../plugins/maker/fake-ml.js>) — maker.
- Commands and aliases: `.fakeml`.
- Guards/costs: `limit=1`.
- Implementation helpers: `nexray`.
- Dependencies: `../../lib/Request.js`, `../../lib/Scraper.js`, `../../lib/Utilities.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### maker/fake-story

Fake story: Creates or transforms media from user text, quoted media or provider templates.

- Source/category: [plugins/maker/fake-story.js](<../plugins/maker/fake-story.js>) — maker.
- Commands and aliases: `.fakestory`.
- Guards/costs: `limit=1`.
- Implementation helpers: `nexray`.
- Dependencies: `../../lib/Request.js`, `../../lib/Scraper.js`, `../../lib/Utilities.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### maker/fake-threads

Fake threads: Creates or transforms media from user text, quoted media or provider templates.

- Source/category: [plugins/maker/fake-threads.js](<../plugins/maker/fake-threads.js>) — maker.
- Commands and aliases: `.fakethreads`.
- Guards/costs: `limit=1`.
- Implementation helpers: `nexray`.
- Dependencies: `../../lib/Request.js`, `../../lib/Scraper.js`, `../../lib/Utilities.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### maker/fake-ttcomment

Fake ttcomment: Creates or transforms media from user text, quoted media or provider templates.

- Source/category: [plugins/maker/fake-ttcomment.js](<../plugins/maker/fake-ttcomment.js>) — maker.
- Commands and aliases: `.fakettcomment`.
- Guards/costs: `limit=1`.
- Implementation helpers: `zenzxz`.
- Dependencies: `../../lib/Request.js`, `../../lib/Scraper.js`, `../../lib/Utilities.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### maker/fake-ttprofile

Fake ttprofile: Creates or transforms media from user text, quoted media or provider templates.

- Source/category: [plugins/maker/fake-ttprofile.js](<../plugins/maker/fake-ttprofile.js>) — maker.
- Commands and aliases: `.fakettprofile`.
- Guards/costs: `limit=1`.
- Implementation helpers: `zenzxz`.
- Dependencies: `../../lib/Request.js`, `../../lib/Scraper.js`, `../../lib/Utilities.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### maker/fake-wachannel

Fake wachannel: Creates or transforms media from user text, quoted media or provider templates.

- Source/category: [plugins/maker/fake-wachannel.js](<../plugins/maker/fake-wachannel.js>) — maker.
- Commands and aliases: `.fakewachannel`.
- Guards/costs: `limit=1`.
- Implementation helpers: `zenzxz`.
- Dependencies: `../../lib/Request.js`, `../../lib/Scraper.js`, `../../lib/Utilities.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### maker/fake-wagroup

Fake wagroup: Creates or transforms media from user text, quoted media or provider templates.

- Source/category: [plugins/maker/fake-wagroup.js](<../plugins/maker/fake-wagroup.js>) — maker.
- Commands and aliases: `.fakewagroup`.
- Guards/costs: `limit=1`.
- Implementation helpers: `zenzxz`.
- Dependencies: `../../lib/Request.js`, `../../lib/Scraper.js`, `../../lib/Utilities.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### maker/fake-xnxx

Fake xnxx: Creates or transforms media from user text, quoted media or provider templates.

- Source/category: [plugins/maker/fake-xnxx.js](<../plugins/maker/fake-xnxx.js>) — maker.
- Commands and aliases: `.fakexnxx`.
- Guards/costs: `limit=1`.
- Implementation helpers: `deline`.
- Dependencies: `../../lib/Request.js`, `../../lib/Utilities.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### maker/fake-ytcomment

Fake ytcomment: Creates or transforms media from user text, quoted media or provider templates.

- Source/category: [plugins/maker/fake-ytcomment.js](<../plugins/maker/fake-ytcomment.js>) — maker.
- Commands and aliases: `.fakeytcomment`.
- Guards/costs: `limit=1`.
- Implementation helpers: `deline`.
- Dependencies: `../../lib/Request.js`, `../../lib/Scraper.js`, `../../lib/Utilities.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### maker/iqc

Iqc: Creates or transforms media from user text, quoted media or provider templates.

- Source/category: [plugins/maker/iqc.js](<../plugins/maker/iqc.js>) — maker.
- Commands and aliases: `.iqc`.
- Guards/costs: `limit=1`.
- Implementation helpers: `nexray`.
- Dependencies: `../../lib/Request.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### maker/msg

Msg: Creates or transforms media from user text, quoted media or provider templates.

- Source/category: [plugins/maker/msg.js](<../plugins/maker/msg.js>) — maker.
- Commands and aliases: `.msg`.
- Guards/costs: `limit=1`.
- Implementation helpers: `nexray`.
- Dependencies: `../../lib/Request.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### maker/qc

Qc: Creates or transforms media from user text, quoted media or provider templates.

- Source/category: [plugins/maker/qc.js](<../plugins/maker/qc.js>) — maker.
- Commands and aliases: `.qc`.
- Guards/costs: `limit=1`.
- Implementation helpers: `nekolabs`.
- Dependencies: `../../lib/Request.js`, `../../lib/Scraper.js`, `../../lib/Utilities.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### maker/reaction

Exports one handler for each reaction name; resolves reaction media through its provider and sends media.

- Source/category: [plugins/maker/reaction.js](<../plugins/maker/reaction.js>) — reaction.
- Commands and aliases: `.kiss`, `.cry`, `.wave`, `.poke`, `.waifu`, `.neko`, `.shinobu`, `.megumin`, `.bully`, `.cuddle`, `.hug`, `.awoo`, `.kicked`, `.pat`, `.smug`, `.bonk`, `.yeet`, `.blush`, `.smile`, `.highfive`, `.handhold`, `.nom`, `.bite`, `.glomp`, `.slap`, `.kill`, `.happy`, `.wink`, `.dance`, `.cringe`.
- Guards/costs: `limit=true`.
- Implementation helpers: `request`.
- Dependencies: `../../lib/Constants.js`, `../../lib/Request.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### maker/smeme

Smeme: Creates or transforms media from user text, quoted media or provider templates.

- Source/category: [plugins/maker/smeme.js](<../plugins/maker/smeme.js>) — maker.
- Commands and aliases: `.smeme`.
- Guards/costs: `limit=1`.
- Implementation helpers: `deline`.
- Dependencies: `../../lib/Request.js`, `../../lib/Scraper.js`, `../../lib/Utilities.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### maker/sticker

Sticker: Creates or transforms media from user text, quoted media or provider templates.

- Source/category: [plugins/maker/sticker.js](<../plugins/maker/sticker.js>) — maker.
- Commands and aliases: `.sticker`, `.s`, `.stiker`, `.svid`.
- Guards/costs: `limit=1`.
- Dependencies: `../../lib/Utilities.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### maker/text-2-qr

Text 2 qr: Creates or transforms media from user text, quoted media or provider templates.

- Source/category: [plugins/maker/text-2-qr.js](<../plugins/maker/text-2-qr.js>) — maker.
- Commands and aliases: `.text2qr`.
- Guards/costs: `limit=1`.
- Implementation helpers: `faa`.
- Dependencies: `../../lib/Request.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### maker/wanted

Wanted: Creates or transforms media from user text, quoted media or provider templates.

- Source/category: [plugins/maker/wanted.js](<../plugins/maker/wanted.js>) — maker.
- Commands and aliases: `.wanted`.
- Guards/costs: `limit=1`.
- Implementation helpers: `nexray`.
- Dependencies: `../../lib/Request.js`, `../../lib/Scraper.js`, `../../lib/Utilities.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### maker/wasted

Wasted: Creates or transforms media from user text, quoted media or provider templates.

- Source/category: [plugins/maker/wasted.js](<../plugins/maker/wasted.js>) — maker.
- Commands and aliases: `.wasted`.
- Guards/costs: `limit=1`.
- Implementation helpers: `nexray`.
- Dependencies: `../../lib/Request.js`, `../../lib/Scraper.js`, `../../lib/Utilities.js`.
- Limits/configuration: provider availability and credentials where required; shared download/media caps apply where these helpers are used. No live provider validation was performed.

### menu

Builds the registry-backed menu in nine styles. Uses complete text fallback, explicit text mode and revision-based category caching.

- Source/category: [plugins/menu.js](<../plugins/menu.js>) — message event.
- Commands and aliases: `.menu`, `.command`, `.help`, `.allmenu`.
- Guards/costs: no export-level restriction; inspect conditional checks in the handler.
- Implementation helpers: `Func.toArray`, `Func.frame`, `Func.toTime`, `Func.formatSize`, `Func.toTitleCase`, `Func.createMenuDocument`, `Func.resizeImage`, `Func.greeting`, `Func.fetchThumbnail`.
- Dependencies: `../lib/Constants.js`, `#func`, `../lib/Watcher.js`.
- Referenced settings: `setting.self`, `setting.menuMessage`, `global.interactiveMenuMode`, `setting.menuStyle`, `setting.menuMusic`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### other/commands

Commands: General information, discovery or runtime status commands.

- Source/category: [plugins/other/commands.js](<../plugins/other/commands.js>) — other.
- Commands and aliases: `.commands`.
- Guards/costs: no export-level restriction; inspect conditional checks in the handler.
- Dependencies: `../../lib/Constants.js`, `../../lib/Utilities.js`, `../../lib/Watcher.js`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### other/credits

Credits: General information, discovery or runtime status commands.

- Source/category: [plugins/other/credits.js](<../plugins/other/credits.js>) — other.
- Commands and aliases: `.credits`, `.script`, `.thanksto`, `.sc`.
- Guards/costs: no export-level restriction; inspect conditional checks in the handler.
- Dependencies: `../../lib/Utilities.js`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### other/list-data

List data: General information, discovery or runtime status commands.

- Source/category: [plugins/other/list-data.js](<../plugins/other/list-data.js>) — other.
- Commands and aliases: `.listbanned`, `.listtoxic`.
- Guards/costs: no export-level restriction; inspect conditional checks in the handler.
- Dependencies: `../../lib/Utilities.js`.
- Referenced settings: `setting.forbiddenWords`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### other/owner

Owner: General information, discovery or runtime status commands.

- Source/category: [plugins/other/owner.js](<../plugins/other/owner.js>) — other.
- Commands and aliases: `.owner`.
- Guards/costs: no export-level restriction; inspect conditional checks in the handler.
- Dependencies: `../../lib/Constants.js`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### other/pricing

Pricing: General information, discovery or runtime status commands.

- Source/category: [plugins/other/pricing.js](<../plugins/other/pricing.js>) — other.
- Commands and aliases: `.premium`, `.rental`, `.prem`, `.rent`.
- Guards/costs: no export-level restriction; inspect conditional checks in the handler.
- Dependencies: `../../lib/Utilities.js`, `../../lib/Watcher.js`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### other/test

Test: General information, discovery or runtime status commands.

- Source/category: [plugins/other/test.js](<../plugins/other/test.js>) — other.
- Commands and aliases: `.disk`, `.ping`, `.ram`, `.run`, `.server`, `.statistic`.
- Guards/costs: no export-level restriction; inspect conditional checks in the handler.
- Dependencies: `os`, `../../lib/Constants.js`, `../../lib/Utilities.js`.
- Referenced settings: `setting.messageEgress`, `setting.messageIngress`, `setting.byteEgress`, `setting.byteIngress`, `setting.self`, `setting.afkNotifier`, `setting.autoDownload`, `setting.chatBot`, `setting.commandSuggestions`, `setting.groupOnly`, `setting.menuMusic`, `setting.noPrefix`, `setting.notifier`, `setting.reactStatus`, `setting.readMessage`, `setting.rejectCall`, `setting.secureLabel`, `setting.slowMode`, `setting.typingPresence`, `setting.prefixes`, `setting.lastReset`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### owner/evaluate

Owner-only JavaScript/VM evaluation and subprocess commands. Subprocesses have output/time limits; owner JavaScript remains privileged and can block execution.

- Source/category: [plugins/owner/_evaluate.js](<../plugins/owner/_evaluate.js>) — message event.
- Usage: automatic message event; no direct command export.
- Additional syntax: `>`, `=>`, `~`, `~>`, `$`, `%` followed by owner-supplied code/command.
- Guards/costs: `owner=true`.
- Dependencies: `node:events`, `child_process`, `util`, `vm`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### owner/broadcast

Owner broadcasts to private/group/status destinations with cooldown and deduplicated recipients.

- Source/category: [plugins/owner/broadcast.js](<../plugins/owner/broadcast.js>) — owner.
- Commands and aliases: `.broadcast`, `.broadcastgc`, `.broadcastgcsw`, `.bc`, `.bcgc`, `.bcgcsw`, `.jpm`.
- Guards/costs: `owner=true`.
- Dependencies: `baileys`, `../../lib/Constants.js`, `../../lib/Utilities.js`.
- Referenced settings: `group.participants`, `setting.broadcastCooldown`.
- Limits/configuration: restricted to the configured authorized identity; state-changing commands require careful operational use. Backups, source updates and real-account changes were not executed in this audit.

### owner/buatgc

Buatgc: Privileged bot configuration and operational controls.

- Source/category: [plugins/owner/buatgc.js](<../plugins/owner/buatgc.js>) — owner.
- Commands and aliases: `.buatgc`, `.creategc`.
- Guards/costs: `owner=true`.
- Dependencies: Listener context, socket APIs and built-in JavaScript.
- Referenced settings: `group.id`.
- Limits/configuration: restricted to the configured authorized identity; state-changing commands require careful operational use. Backups, source updates and real-account changes were not executed in this audit.

### owner/manage-bot

Owner settings, menus, backups, restoration, restart, profile and source-update operations. ZIP output now honors backpressure/finish; core restore validates before replacing records.

- Source/category: [plugins/owner/manage-bot.js](<../plugins/owner/manage-bot.js>) — owner.
- Commands and aliases: `.afknotifier`, `.autodownload`, `.backup`, `.backupsc`, `.chatbot`, `.commandsuggestion`, `.disable`, `.enable`, `.gconly`, `.menumusic`, `.noprefix`, `.notifier`, `.public`, `.reactstatus`, `.readmessage`, `.rejectcall`, `.resetlimit`, `.restart`, `.restore`, `.securelabel`, `.setbroadcastcd`, `.setinstruction`, `.setmenu`, `.setmenumusic`, `.setmenumessage`, `.setmodel`, `.setname`, `.setbio`, `.setpp`, `.setcover`, `.setchid`, `.setreply`, `.slowmode`, `.self`, `.typingpresence`, `.updatesc`, `.+prefix`, `.-prefix`.
- Guards/costs: `owner=true`.
- Dependencies: `node:events`, `node:stream/promises`, `baileys`, `fflate`, `fs`, `fs/promises`, `path`, `../../lib/Constants.js`, `../../lib/Utilities.js`, `../../lib/Watcher.js`.
- Referenced settings: `global.authFolder`, `setting.botModel`, `setting.keySetting`, `setting.disabledCommand`, `setting.lastReset`, `setting.broadcastCooldown`, `setting.botInstruction`, `setting.menuStyle`, `setting.menuMessage`, `setting.newsletterId`, `setting.replyStyle`, `setting.self`, `setting.prefixes`.
- Limits/configuration: restricted to the configured authorized identity; state-changing commands require careful operational use. Backups, source updates and real-account changes were not executed in this audit.

### owner/manage-label

Manage label: Privileged bot configuration and operational controls.

- Source/category: [plugins/owner/manage-label.js](<../plugins/owner/manage-label.js>) — owner.
- Commands and aliases: `.setlabel`, `.dellabel`.
- Guards/costs: `owner=true`, `group=true`.
- Dependencies: Listener context, socket APIs and built-in JavaScript.
- Limits/configuration: restricted to the configured authorized identity; state-changing commands require careful operational use. Backups, source updates and real-account changes were not executed in this audit.

### owner/manage-newsletter

Manage newsletter: Privileged bot configuration and operational controls.

- Source/category: [plugins/owner/manage-newsletter.js](<../plugins/owner/manage-newsletter.js>) — owner.
- Commands and aliases: `.setchname`, `.setchdesc`, `.setchpp`.
- Guards/costs: `owner=true`.
- Dependencies: `baileys`, `../../lib/Utilities.js`.
- Referenced settings: `setting.newsletterId`.
- Limits/configuration: restricted to the configured authorized identity; state-changing commands require careful operational use. Backups, source updates and real-account changes were not executed in this audit.

### owner/manage-plugin

Manage plugin: Privileged bot configuration and operational controls.

- Source/category: [plugins/owner/manage-plugin.js](<../plugins/owner/manage-plugin.js>) — owner.
- Commands and aliases: `.delplugin`, `.getplugin`, `.saveplugin`, `.dp`, `.gp`, `.sp`.
- Guards/costs: `owner=true`.
- Dependencies: `fs/promises`, `path`, `../../lib/Utilities.js`.
- Limits/configuration: restricted to the configured authorized identity; state-changing commands require careful operational use. Backups, source updates and real-account changes were not executed in this audit.

### owner/manage-user

Manage user: Privileged bot configuration and operational controls.

- Source/category: [plugins/owner/manage-user.js](<../plugins/owner/manage-user.js>) — owner.
- Commands and aliases: `.+partner`, `.-partner`, `.-user`, `.ban`, `.block`, `.unban`, `.unblock`.
- Guards/costs: `owner=true`.
- Dependencies: `baileys`, `../../lib/Serialize.js`, `../../lib/Utilities.js`.
- Referenced settings: `setting.partner`.
- Limits/configuration: restricted to the configured authorized identity; state-changing commands require careful operational use. Backups, source updates and real-account changes were not executed in this audit.

### owner/upload-status

Upload status: Privileged bot configuration and operational controls.

- Source/category: [plugins/owner/upload-status.js](<../plugins/owner/upload-status.js>) — owner.
- Commands and aliases: `.upsw`.
- Guards/costs: `owner=true`.
- Dependencies: `../../lib/Utilities.js`.
- Limits/configuration: restricted to the configured authorized identity; state-changing commands require careful operational use. Backups, source updates and real-account changes were not executed in this audit.

### partner/manage-group

Manage group: Partner-authorized account, group or quota management.

- Source/category: [plugins/partner/manage-group.js](<../plugins/partner/manage-group.js>) — partner.
- Commands and aliases: `.groups`, `.gc`.
- Guards/costs: `partner=true`.
- Dependencies: `../../lib/Constants.js`, `../../lib/Utilities.js`.
- Referenced settings: `group.name`, `group.id`, `group.mute`, `group.rentExpiry`, `group._notifiedRent`.
- Limits/configuration: restricted to the configured authorized identity; state-changing commands require careful operational use. Backups, source updates and real-account changes were not executed in this audit.

### partner/manage-limit

Manage limit: Partner-authorized account, group or quota management.

- Source/category: [plugins/partner/manage-limit.js](<../plugins/partner/manage-limit.js>) — partner.
- Commands and aliases: `.+limit`, `.-limit`.
- Guards/costs: `partner=true`.
- Dependencies: `baileys`, `../../lib/Serialize.js`, `../../lib/Utilities.js`.
- Referenced settings: `setting.partner`.
- Limits/configuration: restricted to the configured authorized identity; state-changing commands require careful operational use. Backups, source updates and real-account changes were not executed in this audit.

### partner/manage-premium

Manage premium: Partner-authorized account, group or quota management.

- Source/category: [plugins/partner/manage-premium.js](<../plugins/partner/manage-premium.js>) — partner.
- Commands and aliases: `.+premium`, `.-premium`, `.+prem`, `.-prem`.
- Guards/costs: `partner=true`.
- Dependencies: `baileys`, `../../lib/Constants.js`, `../../lib/Serialize.js`, `../../lib/Utilities.js`.
- Referenced settings: `setting.partner`.
- Limits/configuration: restricted to the configured authorized identity; state-changing commands require careful operational use. Backups, source updates and real-account changes were not executed in this audit.

### partner/manage-word

Manage word: Partner-authorized account, group or quota management.

- Source/category: [plugins/partner/manage-word.js](<../plugins/partner/manage-word.js>) — partner.
- Commands and aliases: `.+word`, `.-word`.
- Guards/costs: `partner=true`.
- Dependencies: Listener context, socket APIs and built-in JavaScript.
- Referenced settings: `setting.forbiddenWords`.
- Limits/configuration: restricted to the configured authorized identity; state-changing commands require careful operational use. Backups, source updates and real-account changes were not executed in this audit.

### partner/sticker-command

Sticker command: Partner-authorized account, group or quota management.

- Source/category: [plugins/partner/sticker-command.js](<../plugins/partner/sticker-command.js>) — partner.
- Commands and aliases: `.+cmdstic`, `.-cmdstic`.
- Guards/costs: `partner=true`.
- Dependencies: `../../lib/Serialize.js`.
- Referenced settings: `setting.stickerCommand`.
- Limits/configuration: restricted to the configured authorized identity; state-changing commands require careful operational use. Backups, source updates and real-account changes were not executed in this audit.

### partner/upload-newsletter

Upload newsletter: Partner-authorized account, group or quota management.

- Source/category: [plugins/partner/upload-newsletter.js](<../plugins/partner/upload-newsletter.js>) — partner.
- Commands and aliases: `.playch`, `.playvidch`, `.ptvch`, `.upch`.
- Guards/costs: `partner=true`.
- Implementation helpers: `nexray`.
- Dependencies: `baileys`, `yt-search`, `../../lib/Request.js`, `../../lib/Utilities.js`, `../owner/manage-newsletter.js`.
- Referenced settings: `setting.newsletterId`.
- Limits/configuration: restricted to the configured authorized identity; state-changing commands require careful operational use. Backups, source updates and real-account changes were not executed in this audit.

### tools/blur-face

Blur face: Utility, lookup, conversion or media-processing commands.

- Source/category: [plugins/tools/blur-face.js](<../plugins/tools/blur-face.js>) — tools.
- Commands and aliases: `.blurface`.
- Guards/costs: `limit=1`.
- Implementation helpers: `nexray`.
- Dependencies: `../../lib/Request.js`, `../../lib/Scraper.js`, `../../lib/Utilities.js`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### tools/calculator

Calculator: Utility, lookup, conversion or media-processing commands.

- Source/category: [plugins/tools/calculator.js](<../plugins/tools/calculator.js>) — tools.
- Commands and aliases: `.calculator`, `.cal`.
- Guards/costs: no export-level restriction; inspect conditional checks in the handler.
- Dependencies: Listener context, socket APIs and built-in JavaScript.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### tools/cekstatus

Cekstatus: Utility, lookup, conversion or media-processing commands.

- Source/category: [plugins/tools/cekstatus.js](<../plugins/tools/cekstatus.js>) — tools.
- Commands and aliases: `.cekstatus`, `.about`.
- Guards/costs: `limit=1`.
- Dependencies: `../../lib/Serialize.js`, `../../lib/Utilities.js`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### tools/cekwa

Cekwa: Utility, lookup, conversion or media-processing commands.

- Source/category: [plugins/tools/cekwa.js](<../plugins/tools/cekwa.js>) — tools.
- Commands and aliases: `.cekwa`, `.onwa`.
- Guards/costs: `limit=1`.
- Dependencies: `../../lib/Serialize.js`, `../../lib/Utilities.js`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### tools/character-recognition

Character recognition: Utility, lookup, conversion or media-processing commands.

- Source/category: [plugins/tools/character-recognition.js](<../plugins/tools/character-recognition.js>) — tools.
- Commands and aliases: `.ocr`.
- Guards/costs: `limit=1`.
- Implementation helpers: `nexray`.
- Dependencies: `../../lib/Request.js`, `../../lib/Scraper.js`, `../../lib/Utilities.js`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### tools/colorize

Colorize: Utility, lookup, conversion or media-processing commands.

- Source/category: [plugins/tools/colorize.js](<../plugins/tools/colorize.js>) — tools.
- Commands and aliases: `.colorize`.
- Guards/costs: `limit=1`.
- Implementation helpers: `nexray`.
- Dependencies: `../../lib/Request.js`, `../../lib/Scraper.js`, `../../lib/Utilities.js`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### tools/convert-webp

Convert webp: Utility, lookup, conversion or media-processing commands.

- Source/category: [plugins/tools/convert-webp.js](<../plugins/tools/convert-webp.js>) — tools.
- Commands and aliases: `.toimage`, `.tovideo`, `.toimg`, `.tovid`.
- Guards/costs: `limit=1`.
- Implementation helpers: `nexray`.
- Dependencies: `../../lib/Request.js`, `../../lib/Scraper.js`, `../../lib/Utilities.js`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### tools/emoji-gif

Emoji gif: Utility, lookup, conversion or media-processing commands.

- Source/category: [plugins/tools/emoji-gif.js](<../plugins/tools/emoji-gif.js>) — tools.
- Commands and aliases: `.emojito`, `.emogif`.
- Guards/costs: `limit=1`.
- Implementation helpers: `nexray`.
- Dependencies: `../../lib/Request.js`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### tools/emoji-mix

Emoji mix: Utility, lookup, conversion or media-processing commands.

- Source/category: [plugins/tools/emoji-mix.js](<../plugins/tools/emoji-mix.js>) — tools.
- Commands and aliases: `.emojimix`, `.mix`.
- Guards/costs: `limit=1`.
- Implementation helpers: `nexray`.
- Dependencies: `../../lib/Request.js`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### tools/enhance

Enhance: Utility, lookup, conversion or media-processing commands.

- Source/category: [plugins/tools/enhance.js](<../plugins/tools/enhance.js>) — tools.
- Commands and aliases: `.hd`, `.enhance`.
- Guards/costs: `limit=1`.
- Dependencies: `../../lib/Request.js`, `../../lib/Scraper.js`, `../../lib/Utilities.js`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### tools/interactive-demo

Interactive demo: Utility, lookup, conversion or media-processing commands.

- Source/category: [plugins/tools/interactive-demo.js](<../plugins/tools/interactive-demo.js>) — tools.
- Commands and aliases: `.button`, `.interactive`, `.demo`.
- Guards/costs: no export-level restriction; inspect conditional checks in the handler.
- Dependencies: Listener context, socket APIs and built-in JavaScript.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### tools/inviteinfo

Inviteinfo: Utility, lookup, conversion or media-processing commands.

- Source/category: [plugins/tools/inviteinfo.js](<../plugins/tools/inviteinfo.js>) — tools.
- Commands and aliases: `.inviteinfo`, `.ceklink`.
- Guards/costs: `limit=1`.
- Dependencies: `../../lib/Utilities.js`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### tools/morse

Morse: Utility, lookup, conversion or media-processing commands.

- Source/category: [plugins/tools/morse.js](<../plugins/tools/morse.js>) — tools.
- Commands and aliases: `.morse`, `.dmorse`.
- Guards/costs: no export-level restriction; inspect conditional checks in the handler.
- Dependencies: `../../lib/Constants.js`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### tools/newsletter-id

Newsletter id: Utility, lookup, conversion or media-processing commands.

- Source/category: [plugins/tools/newsletter-id.js](<../plugins/tools/newsletter-id.js>) — tools.
- Commands and aliases: `.channelid`, `.idch`, `.cekidch`.
- Guards/costs: `limit=1`.
- Dependencies: `../../lib/Constants.js`, `../../lib/Utilities.js`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### tools/no-background

No background: Utility, lookup, conversion or media-processing commands.

- Source/category: [plugins/tools/no-background.js](<../plugins/tools/no-background.js>) — tools.
- Commands and aliases: `.removebg`, `.nobackground`.
- Guards/costs: `limit=1`.
- Implementation helpers: `nexray`.
- Dependencies: `../../lib/Request.js`, `../../lib/Scraper.js`, `../../lib/Utilities.js`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### tools/no-watermark

No watermark: Utility, lookup, conversion or media-processing commands.

- Source/category: [plugins/tools/no-watermark.js](<../plugins/tools/no-watermark.js>) — tools.
- Commands and aliases: `.removewm`, `.nowatermark`.
- Guards/costs: `premium=true`, `limit=1`.
- Implementation helpers: `nexray`.
- Dependencies: `../../lib/Request.js`, `../../lib/Scraper.js`, `../../lib/Utilities.js`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### tools/qr-2-text

Qr 2 text: Utility, lookup, conversion or media-processing commands.

- Source/category: [plugins/tools/qr-2-text.js](<../plugins/tools/qr-2-text.js>) — tools.
- Commands and aliases: `.qr2text`.
- Guards/costs: `limit=1`.
- Implementation helpers: `faa`.
- Dependencies: `../../lib/Request.js`, `../../lib/Scraper.js`, `../../lib/Utilities.js`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### tools/screenshot-web

Screenshot web: Utility, lookup, conversion or media-processing commands.

- Source/category: [plugins/tools/screenshot-web.js](<../plugins/tools/screenshot-web.js>) — tools.
- Commands and aliases: `.ssweb`.
- Guards/costs: `limit=1`.
- Implementation helpers: `zenzxz`.
- Dependencies: `../../lib/Request.js`, `../../lib/Utilities.js`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### tools/sfile-upl

Sfile upl: Utility, lookup, conversion or media-processing commands.

- Source/category: [plugins/tools/sfile-upl.js](<../plugins/tools/sfile-upl.js>) — tools.
- Commands and aliases: `.sfileupl`.
- Guards/costs: `limit=1`.
- Implementation helpers: `func.frame`.
- Dependencies: `#utils`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### tools/sound-effect

Exports named audio effects and processes quoted audio through FFmpeg helpers.

- Source/category: [plugins/tools/sound-effect.js](<../plugins/tools/sound-effect.js>) — sound effect.
- Commands and aliases: `.bass`, `.blown`, `.chipmunk`, `.deep`, `.earrape`, `.fast`, `.fat`, `.nightcore`, `.reverse`, `.robot`, `.slow`, `.smooth`, `.vibrato`, `.echo`, `.tremolo`, `.cave`, `.haunted`, `.underwater`, `.cursed`, `.dizzy`, `.demonic`, `.alien`, `.ghost`, `.glitch`, `.vintage`, `.telephone`, `.8d`, `.drunk`, `.helium`, `.muted`, `.underworld`, `.squirrel`, `.boostbass`, `.boosttreble`, `.whisper`, `.darthvader`, `.chipdemon`, `.megaphone`, `.immersive`, `.reverb`.
- Guards/costs: `limit=1`.
- Dependencies: `../../lib/Utilities.js`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### tools/stalk

Stalk: Utility, lookup, conversion or media-processing commands.

- Source/category: [plugins/tools/stalk.js](<../plugins/tools/stalk.js>) — tools.
- Commands and aliases: `.dcstalk`, `.ffstalk`, `.igstalk`, `.robloxstalk`, `.ttstalk`.
- Guards/costs: `premium=true`, `limit=1`.
- Implementation helpers: `zenzxz`.
- Dependencies: `../../lib/Request.js`, `../../lib/Utilities.js`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### tools/sticker-watermark

Sticker watermark: Utility, lookup, conversion or media-processing commands.

- Source/category: [plugins/tools/sticker-watermark.js](<../plugins/tools/sticker-watermark.js>) — tools.
- Commands and aliases: `.swm`.
- Guards/costs: `premium=true`, `limit=1`.
- Dependencies: `../../lib/Utilities.js`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### tools/toaudio

Toaudio: Utility, lookup, conversion or media-processing commands.

- Source/category: [plugins/tools/toaudio.js](<../plugins/tools/toaudio.js>) — tools.
- Commands and aliases: `.toaudio`, `.tovn`, `.tomp3`.
- Guards/costs: `limit=1`.
- Dependencies: `../../lib/Utilities.js`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### tools/tourl

Tourl: Utility, lookup, conversion or media-processing commands.

- Source/category: [plugins/tools/tourl.js](<../plugins/tools/tourl.js>) — tools.
- Commands and aliases: `.tourl`.
- Guards/costs: `limit=1`.
- Dependencies: `../../lib/Scraper.js`, `../../lib/Utilities.js`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### user info/afk

Afk: User profile, activity, energy, quota and ranking commands.

- Source/category: [plugins/user info/afk.js](<../plugins/user info/afk.js>) — user info.
- Commands and aliases: `.afk`.
- Guards/costs: no export-level restriction; inspect conditional checks in the handler.
- Dependencies: `../../lib/Utilities.js`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### user info/charge-energy

Charge energy: User profile, activity, energy, quota and ranking commands.

- Source/category: [plugins/user info/charge-energy.js](<../plugins/user info/charge-energy.js>) — user info.
- Commands and aliases: `.chargeenergy`, `.charge`.
- Guards/costs: `limit=3`.
- Dependencies: `../../lib/Constants.js`, `../../lib/Utilities.js`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### user info/claim

Claim: User profile, activity, energy, quota and ranking commands.

- Source/category: [plugins/user info/claim.js](<../plugins/user info/claim.js>) — user info.
- Commands and aliases: `.claim`.
- Guards/costs: no export-level restriction; inspect conditional checks in the handler.
- Dependencies: `../../lib/Constants.js`, `../../lib/Utilities.js`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### user info/leaderboard

Leaderboard: User profile, activity, energy, quota and ranking commands.

- Source/category: [plugins/user info/leaderboard.js](<../plugins/user info/leaderboard.js>) — user info.
- Commands and aliases: `.limit`, `.leaderboard`.
- Guards/costs: no export-level restriction; inspect conditional checks in the handler.
- Dependencies: `baileys`, `../../lib/Utilities.js`.
- Referenced settings: `setting.partner`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### user info/profile

Profile: User profile, activity, energy, quota and ranking commands.

- Source/category: [plugins/user info/profile.js](<../plugins/user info/profile.js>) — user info.
- Commands and aliases: `.profile`, `.me`.
- Guards/costs: no export-level restriction; inspect conditional checks in the handler.
- Dependencies: `baileys`, `../../lib/Serialize.js`, `../../lib/Utilities.js`.
- Referenced settings: `setting.partner`.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

### user info/wa-me

Wa me: User profile, activity, energy, quota and ranking commands.

- Source/category: [plugins/user info/wa-me.js](<../plugins/user info/wa-me.js>) — user info.
- Commands and aliases: `.wame`.
- Guards/costs: no export-level restriction; inspect conditional checks in the handler.
- Dependencies: Listener context, socket APIs and built-in JavaScript.
- Limits/configuration: subject to bot mode, stored settings/quotas and WhatsApp permissions; device/account behavior still needs live validation.

