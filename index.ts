/**
 * NodeLink Instagram Plugin
 * Copyright (c) 2026 ALLAY-XD-20. All rights reserved.
 *
 * Proprietary software. See the LICENSE file. Unauthorized copying,
 * modification or distribution is prohibited.
 *
 * Supported links:
 *   post / reel / tv (instagram.com/p|reel|reels|tv/CODE), share links (/share/...),
 *   carousels (every video slide becomes a track), stories
 *   (instagram.com/stories/USER/ID), highlights (instagram.com/stories/highlights/ID)
 *   and profiles (instagram.com/USER, latest videos). Photo-only items are skipped.
 *
 * Config (config.ts):
 *   plugins: [{ name: 'nodelink-instagram-plugin', source: 'local' }],
 *   pluginConfig: {
 *     'nodelink-instagram-plugin': { username: 'SPARE_ACCOUNT', password: 'PASSWORD' }
 *   }
 * Or use the env vars IG_USERNAME and IG_PASSWORD (safer than plain text).
 */

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import igpkg from 'instagram-private-api'

const { IgApiClient } = igpkg as any

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const URL_RE = /^https?:\/\/(?:www\.)?instagr(?:\.am|am\.com)\//i
const MEDIA_RE = /instagram\.com\/(?:[\w.]+\/)?(?:p|reel|reels|tv)\/([\w-]+)/i
const SHARE_RE = /instagram\.com\/share\/(?:(?:p|reel|r)\/)?([\w-]+)/i
const HIGHLIGHT_RE = /instagram\.com\/stories\/highlights\/(\d+)/i
const STORY_RE = /instagram\.com\/stories\/([\w.]+)(?:\/(\d+))?/i
const PROFILE_RE = /^https?:\/\/(?:www\.)?instagram\.com\/([\w.]+)\/?(?:[?#].*)?$/i
const RESERVED = new Set(['p', 'reel', 'reels', 'tv', 'stories', 'explore', 'accounts', 'direct', 'share', 'about', 'legal'])
const PROFILE_LIMIT = 20

function shortcodeToId(shortcode: string): string {
  let id = 0n
  for (const ch of shortcode) id = id * 64n + BigInt(ALPHABET.indexOf(ch))
  return id.toString()
}

export default async function (nodelink: any, config: any, context: any) {
  const log = (msg: string, level = 'info') =>
    nodelink.logger(level, `Plugin:${context.pluginName}`, msg)

  // Sources only live in the worker process. Nothing to do in master.
  if (context.type !== 'worker') {
    log('Instagram plugin loaded (master).')
    return
  }

  const cfg = config?.[context.pluginName] || config || {}
  const username = cfg.username || process.env.IG_USERNAME
  const password = cfg.password || process.env.IG_PASSWORD
  const sessionFile = path.join(process.cwd(), '.cache', 'instagram-session.json')

  // ---------- Instagram client (lazy login, shared session file) ----------
  const ig = new IgApiClient()
  let loginPromise: Promise<void> | null = null

  async function doLogin(): Promise<void> {
    if (!username || !password) throw new Error('Instagram username/password not configured')
    ig.state.generateDevice(username)

    if (fs.existsSync(sessionFile)) {
      try {
        await ig.state.deserialize(JSON.parse(fs.readFileSync(sessionFile, 'utf8')))
        await ig.account.currentUser() // throws if the saved session is dead
        return
      } catch {
        /* fall through to a fresh login */
      }
    }

    try {
      await ig.simulate.preLoginFlow()
      await ig.account.login(username, password)
    } catch (err: any) {
      const name = err?.constructor?.name
      if (name === 'IgCheckpointError') throw new Error('Instagram checkpoint: approve the login in the Instagram app, then restart')
      if (name === 'IgLoginTwoFactorRequiredError') throw new Error('Instagram 2FA is enabled: use an account without 2FA')
      throw err
    }

    fs.mkdirSync(path.dirname(sessionFile), { recursive: true })
    fs.writeFileSync(sessionFile, JSON.stringify(await ig.state.serialize()))
  }

  function ensureLogin(): Promise<void> {
    if (!loginPromise) {
      loginPromise = doLogin().catch((e) => {
        loginPromise = null // allow a retry later
        throw e
      })
    }
    return loginPromise
  }

  // ---------- Item helpers ----------
  const videoOf = (item: any): string | null => item?.video_versions?.[0]?.url || null

  function toInfo(item: any, identifier: string, uri: string, videoUrl: string) {
    return {
      identifier,
      title: String(item.caption?.text || `Instagram ${item.code || item.pk || identifier}`).split('\n')[0].slice(0, 100),
      author: item.user?.full_name || item.user?.username || 'Instagram',
      length: Math.round((item.video_duration || 0) * 1000),
      artworkUrl: item.image_versions2?.candidates?.[0]?.url || null,
      uri,
      videoUrl
    }
  }

  // One media item -> list of playable entries (carousels expand to every video slide)
  function expandItem(item: any, uri: string): any[] {
    const out: any[] = []
    if (item.carousel_media?.length) {
      item.carousel_media.forEach((c: any, i: number) => {
        const v = videoOf(c)
        if (v) out.push(toInfo({ ...c, user: item.user, caption: item.caption, code: item.code }, `c:${item.code}:${i}`, uri, v))
      })
      return out
    }
    const v = videoOf(item)
    if (!v) return out
    const isStory = item.product_type === 'story' || !item.code
    out.push(toInfo(item, isStory ? `s:${item.pk}` : `m:${item.code}`, uri, v))
    return out
  }

  async function resolveShare(url: string): Promise<string> {
    const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0' } })
    return res.url || url
  }

  // Returns { name, entries } for any supported link
  async function loadLink(inputUrl: string) {
    let url = inputUrl
    await ensureLogin()

    if (SHARE_RE.test(url)) url = await resolveShare(url)

    let m: RegExpExecArray | null
    if ((m = MEDIA_RE.exec(url))) {
      const res = await ig.media.info(shortcodeToId(m[1]))
      const item = res.items?.[0]
      if (!item) return { name: '', entries: [] }
      return { name: item.caption?.text?.split('\n')[0]?.slice(0, 100) || `Instagram ${m[1]}`, entries: expandItem(item, url) }
    }

    if ((m = HIGHLIGHT_RE.exec(url))) {
      const items = await ig.feed.reelsMedia({ userIds: [`highlight:${m[1]}`] }).items()
      return { name: 'Instagram highlight', entries: items.flatMap((it: any) => expandItem(it, url)) }
    }

    if ((m = STORY_RE.exec(url))) {
      const userId = await ig.user.getIdByUsername(m[1])
      const items = await ig.feed.userStory(userId).items()
      const pick = m[2] ? items.filter((it: any) => String(it.pk) === m![2]) : items
      const uri = (it: any) => `https://www.instagram.com/stories/${m![1]}/${it.pk}/`
      return { name: `${m[1]} stories`, entries: pick.flatMap((it: any) => expandItem(it, uri(it))) }
    }

    if ((m = PROFILE_RE.exec(url)) && !RESERVED.has(m[1].toLowerCase())) {
      const userId = await ig.user.getIdByUsername(m[1])
      const items = await ig.feed.user(userId).items()
      const entries: any[] = []
      for (const it of items) {
        entries.push(...expandItem(it, `https://www.instagram.com/p/${it.code}/`))
        if (entries.length >= PROFILE_LIMIT) break
      }
      return { name: `${m[1]} (latest videos)`, entries: entries.slice(0, PROFILE_LIMIT) }
    }

    return { name: '', entries: [] }
  }

  // Fresh stream URL for an identifier (CDN links expire)
  async function freshUrl(identifier: string, uri: string): Promise<string | null> {
    await ensureLogin()
    const [kind, a, b] = String(identifier).split(':')
    if (kind === 's') {
      const res = await ig.media.info(a)
      return videoOf(res.items?.[0])
    }
    if (kind === 'c') {
      const res = await ig.media.info(shortcodeToId(a))
      return videoOf(res.items?.[0]?.carousel_media?.[Number(b)])
    }
    const code = kind === 'm' ? a : identifier
    const res = await ig.media.info(shortcodeToId(code))
    return videoOf(res.items?.[0])
  }

  // ---------- Track encoder (find NodeLink's own encoder) ----------
  let encoder: ((info: any) => string) | null = null
  async function getEncoder() {
    if (encoder) return encoder
    if (typeof nodelink.encodeTrack === 'function') return (encoder = nodelink.encodeTrack.bind(nodelink))
    if (typeof nodelink.utils?.encodeTrack === 'function') return (encoder = nodelink.utils.encodeTrack)

    const candidates = ['src/utils.ts', 'dist/src/utils.js']
    for (const rel of candidates) {
      const file = path.join(process.cwd(), rel)
      if (!fs.existsSync(file)) continue
      try {
        const mod = await import(pathToFileURL(file).href)
        if (typeof mod.encodeTrack === 'function') return (encoder = mod.encodeTrack)
      } catch {
        /* try next */
      }
    }
    throw new Error('Could not find NodeLink encodeTrack (see plugin notes)')
  }

  // ---------- NodeLink source ----------
  class InstagramSource {
    nodelink: any
    sourceName: string
    searchTerms: string[]
    patterns: RegExp[]
    priority: number

    constructor(nl: any) {
      this.nodelink = nl
      this.sourceName = 'instagram'
      this.searchTerms = ['instagram']
      this.patterns = [URL_RE]
      this.priority = 100
    }

    async setup() {
      return true // login happens lazily on first use
    }

    async search(_query: any) {
      return { loadType: 'empty', data: {} }
    }

    async resolve(url: any) {
      try {
        const { name, entries } = await loadLink(String(url))
        if (!entries.length) {
          return { exception: { message: 'No playable video found (photo-only, private or unsupported link)', severity: 'common' } }
        }
        const encode = await getEncoder()
        const tracks = entries.map((e) => {
          const info = {
            identifier: e.identifier,
            isSeekable: true,
            author: e.author,
            length: e.length,
            isStream: false,
            position: 0,
            title: e.title,
            uri: e.uri,
            artworkUrl: e.artworkUrl,
            isrc: null,
            sourceName: 'instagram'
          }
          return { encoded: encode(info), info, pluginInfo: {} }
        })
        if (tracks.length === 1) return { loadType: 'track', data: tracks[0] }
        return { loadType: 'playlist', data: { info: { name, selectedTrack: 0 }, pluginInfo: {}, tracks } }
      } catch (e: any) {
        log(`resolve failed: ${e.message}`, 'error')
        return { exception: { message: e.message, severity: 'common' } }
      }
    }

    // Instagram CDN links expire, so fetch a fresh one at play time.
    async getTrackUrl(trackInfo: any) {
      try {
        const info = trackInfo?.info || trackInfo
        const url = await freshUrl(info?.identifier, info?.uri)
        if (!url) return { exception: { message: 'Media not found', severity: 'common' } }
        return { url, protocol: 'https', format: 'mp4' }
      } catch (e: any) {
        log(`getTrackUrl failed: ${e.message}`, 'error')
        return { exception: { message: e.message, severity: 'common' } }
      }
    }
  }

  const source = new InstagramSource(nodelink)
  nodelink.registerSource('instagram', source)
  try {
    nodelink.sources.searchTermMap.set('instagram', 'instagram')
  } catch {
    if (nodelink.sources?.searchTermMap) nodelink.sources.searchTermMap.set('instagram', 'instagram')
  }

  log('Instagram source registered (worker).')
}
