# NodeLink Instagram Plugin

Play audio from Instagram links in [NodeLink](https://github.com/PerformanC/NodeLink).
Add the plugin, add your account, and send an Instagram link to your player.

> **Not affiliated with Instagram or Meta.** Using this plugin may violate Instagram's Terms of Use. You use it at your own risk. See [Disclaimer](#disclaimer).

## Features

- Reels, posts and IGTV links
- Share links (`instagram.com/share/...`)
- Carousels: every video slide becomes a track
- Stories and highlights
- Profile links: loads the latest videos as a playlist
- Links with tracking parameters work as they are (`?utm_source=...`, `?exln=...`)
- Session is saved, so the account isn't logged in again on every start

Photo-only posts have no audio and can't be played.

## Requirements

- NodeLink v3.x with plugin support
- Node.js 22.22.2 or newer
- A **spare** Instagram account (2FA off)

## Installation

1. Download this repository and put the folder in NodeLink's `plugins` directory:

   ```
   plugins/
   └── instagram-plugin/
       ├── index.ts
       ├── package.json
       ├── LICENSE
       └── README.md
   ```

2. Install the plugin's dependencies:

   ```bash
   cd plugins/nodelink-instagram-plugin
   npm install
   ```

   On a game panel without a shell, add the dependencies listed in the plugin's `package.json` to NodeLink's main `package.json`, then restart so they get installed.

3. Edit your NodeLink `config.ts` (see below), then restart NodeLink.

When it loads you will see this in the console:

```
Instagram source registered (worker).
```

## Configuration

### Example `config.ts`

```js
// 1. Register the plugin
plugins: [
  { name: 'nodelink-instagram-plugin', source: 'local' }
],

// 2. Add your account
pluginConfig: {
  'nodelink-instagram-plugin': {
    username: 'YOUR_SPARE_ACCOUNT',
    password: 'YOUR_PASSWORD'
  }
},
```

If NodeLink has its own Instagram source, disable it so the two don't clash:

```js
sources: {
  instagram: {
    enabled: false
  }
}
```

### Environment variables (recommended)

Keeping the password out of `config.ts` is safer:

```bash
IG_USERNAME=your_spare_account
IG_PASSWORD=your_password
```

If the variables are set, you can leave `username` and `password` out of `pluginConfig`.

## Supported links

| Type | Example |
| --- | --- |
| Reel | `https://www.instagram.com/reel/XXXXXXXXXXX/` |
| Post | `https://www.instagram.com/p/XXXXXXXXXXX/` |
| IGTV | `https://www.instagram.com/tv/XXXXXXXXXXX/` |
| Share link | `https://www.instagram.com/share/reel/XXXXXXXXXXX/` |
| Story | `https://www.instagram.com/stories/username/1234567890/` |
| Highlight | `https://www.instagram.com/stories/highlights/1234567890/` |
| Profile | `https://www.instagram.com/username/` |

## Troubleshooting

| Problem | What to do |
| --- | --- |
| `Instagram username/password not configured` | Check the plugin name in `pluginConfig` matches the folder name, or use the environment variables. |
| `checkpoint` error | Open the Instagram app and approve the login, then restart. |
| `2FA` error | Use an account without two-factor authentication. |
| `No playable video found` | The post is photo-only, private (the account must follow it), or deleted. |
| Plugin is not loaded | Check the `plugins` entry in `config.ts` and the folder name. |

## Security

- Use a spare account, never your main one.
- Keep your password out of screenshots, logs and public repositories.
- Don't commit your `config.ts` or the `.cache` folder.

## Disclaimer

This is an unofficial project. It is not endorsed by Instagram or Meta. Automated access can lead to rate limits, login challenges, or a locked or banned account. The software is provided "as is", without warranty of any kind. You are responsible for following Instagram's terms and the laws that apply to you.

## License

Copyright (c) 2026 ALLAY-XD-20. **All rights reserved.**

This software is proprietary. You may not copy, modify, redistribute or sell it without written permission from the copyright holder. See the [LICENSE](LICENSE) file.

