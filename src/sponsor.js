/** Sponsor content and daily notice interactions: browser-only; does not read accounts or call sponsor APIs. */
export const SPONSOR = Object.freeze({
  title: 'Advertisement from our sponsor',
  name: 'Beichen API',
  url: 'https://beichenapi.com/register?aff=DL49WAC2DQNG',
  invite: 'DL49WAC2DQNG',
  greeting: 'We are very sorry, dear friends:',
  paragraphs: [
    'In order to rent a server (super expensive, and we are just a few broke students...) so that our plugin can keep working normally, we had no choice but to find a sponsor, take on a few ads, and earn a little commission. We are very sorry — this is all to increase server concurrency and the account pool (100% to improve the experience and keep operations running) (we suddenly went viral, our little server just blew up, so we had to pay to replace it); we really had no other choice. If the ads make for a worse experience, we hope you will understand.',
    'This plugin aims to provide everyone with free compute for learning. Response speeds may indeed be rather slow, but we are doing everything we can to improve them. (Definitely not trying to trick you into giving us a star — the recent sudden popularity really caught us by surprise.) If responses are too slow, it may be because many people are using it at the same time, and we hope you will bear with us.',
    'About the ads: the ads are to pay for the server and for operations, and they come from the commission on everyone using the relay station. (So if you can, please be sure to use our invite code ʕ  •ᴥ•ʔ)',
    'This is our sponsor\'s relay station. You can go to the official site\'s homepage, where there is a group link, and ask the group owner for a trial. It provides high-quality foreign large-model compute (the quality is definitely guaranteed, otherwise we would not dare list it as a partner). If you want to test high-quality foreign large models (go bold with the pelican test), please be sure to consider using our link. (Please, everyone, do not skip this invite code — one of our members will do anything for this ( •̥́ ˍ •̀ू ))',
    '(•‾̑⌣‾̑•)✧˖ If you want to use paid compute like this, please be sure to consider the channel we provide (actually this channel is pretty good — the price and quality are both decent). Our project will keep running, and it will stay free in the future too. We only ran this ad because we had no choice... (Believe us, we really do not want to grab money, we just want to run this project well (so we rented a very expensive server), (ó﹏ò｡) and to friends who hate ads, we are really sorry)',
    'In short, thank you all for your support (if you cannot support us through the relay station, that is okay too — just being willing to give us a Star and use it already makes us very happy) and for sticking with us. With this indirect form of sponsorship, we will definitely make sure the OFM service keeps getting better and better. Thank you all again, sincerely.',
  ],
})

export const SPONSOR_DAY_KEY = 'ofm.sponsor.last-shown.v1'

/** Use the user's local calendar date; do not use UTC toISOString() to divide "today". */
export function sponsorLocalDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** Same-origin windows share a Web Lock; only record it after the notice has successfully opened. When storage is disabled, skip the automatic ad. */
export async function claimSponsorDay({ storage, locks, now = () => new Date(), eligible = () => true, show = () => {} }) {
  const claim = () => {
    if (!eligible()) return false
    const day = sponsorLocalDay(now())
    try {
      if (storage.getItem(SPONSOR_DAY_KEY) === day) return false
      // If the write fails, do not show the popup, to avoid repeatedly disturbing the user on refresh, remount, or in private mode.
      const previous = storage.getItem(SPONSOR_DAY_KEY)
      storage.setItem(SPONSOR_DAY_KEY, day)
      try { show() } catch (error) {
        if (previous === null) storage.removeItem(SPONSOR_DAY_KEY)
        else storage.setItem(SPONSOR_DAY_KEY, previous)
        throw error
      }
      return true
    } catch { return false }
  }
  try { return locks?.request ? await locks.request('ofm-sponsor-daily', claim) : claim() }
  catch { return false }
}

/** React component shared by both surfaces; the plugin inlines it via the build script, and the standalone surface imports it directly. */
export function createSponsorUI(React, image, createPortal, variant = 'plugin') {
  const { createElement: h, useState, useEffect, useRef } = React
  const surfaceClass = `ofm-sponsor ofm-sponsor-${variant}`
  const icon = (name, size = 18) => h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
    name === 'arrow' ? h('path', { d: 'M7 17 17 7M7 7h10v10' })
      : name === 'close' ? h('path', { d: 'm6 6 12 12M6 18 18 6' })
        : [h('path', { key: 1, d: 'M20 8v5a3 3 0 0 1-3 3H8a4 4 0 0 1-4-4V8zM20 9h1a2 2 0 0 1 0 4h-1M8 4v1m5-1v1' }), h('path', { key: 2, d: 'M4 20h16' })])

  function SponsorArticle() {
    const [copied, setCopied] = useState('')
    const copyTimer = useRef(null)
    useEffect(() => () => clearTimeout(copyTimer.current), [])
    const copy = async (value, label) => {
      try {
        await navigator.clipboard.writeText(value)
        setCopied(`${label} copied`)
      } catch { setCopied('Copy did not complete; please select the text and copy it manually.') }
      clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(''), 3000)
    }
    const paragraph = index => h('p', { key: index }, SPONSOR.paragraphs[index])
    return h('article', { className: 'ofm-sponsor-article' },
      h('div', { className: 'ofm-sponsor-intro' },
        h('div', null, h('h2', null, 'Let the free service keep you company.'), h('p', null, 'A note from the OFM team, and also a candid sponsorship invitation.')),
        h('span', { className: 'ofm-sponsor-seal', 'aria-hidden': true }, icon('cup', 26))),
      h('div', { className: 'ofm-sponsor-letter' },
        h('p', { className: 'ofm-sponsor-greeting' }, SPONSOR.greeting),
        paragraph(0), paragraph(1), paragraph(2),
        h('div', { className: 'ofm-sponsor-contact' },
          h('p', null, 'Here is the link with the invite code attached:'),
          h('a', { className: 'ofm-sponsor-url', href: SPONSOR.url, target: '_blank', rel: 'noopener noreferrer' }, SPONSOR.url, icon('arrow', 16)),
          h('div', { className: 'ofm-sponsor-copyrow' }, h('span', null, 'Invite code ', h('strong', null, SPONSOR.invite)),
            h('button', { type: 'button', onClick: () => copy(SPONSOR.invite, 'Invite code') }, 'Copy invite code')),
          h('span', { className: 'ofm-sponsor-copy-status', role: 'status' }, copied)),
        paragraph(3), paragraph(4), paragraph(5),
        h('div', { className: 'ofm-sponsor-signoff' }, h('span', null, 'Thank you for your understanding and company'), h('strong', null, 'The OFM team'))),
      h('figure', { className: 'ofm-sponsor-evidence' },
        h('figcaption', null, h('strong', null, 'Also attached: relay station pelican test'), h('span', null, 'Found a problem? Contact them directly · The original image provided is below')),
        h('img', { src: image, alt: 'Provided generation example: three images showing a pelican riding a bicycle and mountain-and-river scenery, with the model name, generation time, and elapsed time retained below.', width: 1227, height: 367, loading: 'lazy', decoding: 'async' })),
      h('div', { className: 'ofm-sponsor-end' }, h('p', null, 'If you would like to learn more, take one step further.'),
        h('a', { className: 'ofm-sponsor-visit', href: SPONSOR.url, target: '_blank', rel: 'noopener noreferrer' }, 'Go to Beichen API', icon('arrow')), h('span', null, 'Sponsor website · includes invite code')))
  }

  function SponsorPage() {
    return h('section', { className: surfaceClass + ' ofm-sponsor-page', 'aria-labelledby': 'ofm-sponsor-page-title' },
      h('header', { className: 'ofm-sponsor-pagehead' }, h('h1', { id: 'ofm-sponsor-page-title' }, SPONSOR.title), h('p', null, 'Beichen API × OFM · You can read the full text here at any time.')),
      h(SponsorArticle))
  }

  function SponsorNotice({ targetId, placement = 'below' }) {
    const dialog = useRef(null)
    const mounted = useRef(false)
    const closing = useRef(false)
    const animation = useRef(null)
    const previousFocus = useRef(null)
    const unlock = useRef(() => {})
    const [opened, setOpened] = useState(false)
    const [leaving, setLeaving] = useState(false)
    const finish = () => {
      dialog.current?.close()
      // Clear the closing animation's forwards state, otherwise reopening on a later day in the same UI would be transparent and block interaction.
      animation.current?.cancel()
      animation.current = null
      unlock.current()
      if (mounted.current) { setOpened(false); setLeaving(false) }
    }
    const dismiss = () => {
      const node = dialog.current
      if (!node?.open || closing.current) return
      closing.current = true
      setLeaving(true)
      const target = document.getElementById(targetId)
      const focusedInside = node.contains(document.activeElement)
      const complete = () => {
        if (!mounted.current) return
        finish()
        if (focusedInside) (target ?? previousFocus.current)?.focus({ preventScroll: true })
        if (target && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          target.animate?.([{ outline: '2px solid currentColor', outlineOffset: '4px' }, { outline: '2px solid transparent', outlineOffset: '0px' }], { duration: 700, easing: 'ease-out' })
        }
      }
      if (target) {
        const rect = target.getBoundingClientRect()
        if (rect.left < 0 || rect.right > window.innerWidth || rect.top < 0 || rect.bottom > window.innerHeight) {
          target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
        }
      }
      if (!target || !node.animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { complete(); return }
      const from = node.getBoundingClientRect(), to = target.getBoundingClientRect()
      if (to.bottom < 0 || to.top > window.innerHeight) { complete(); return }
      animation.current = node.animate([
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${to.x + to.width / 2 - from.x - from.width / 2}px, ${to.y + to.height / 2 - from.y - from.height / 2}px) scale(${Math.max(.08, to.width / from.width)}, ${Math.max(.04, to.height / from.height)})`, opacity: 0 },
      ], { duration: 440, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' })
      animation.current.finished.then(complete, complete)
    }
    useEffect(() => {
      mounted.current = true
      let cancelled = false
      const blockedByDialog = () => {
        const selector = 'dialog[open], [role="dialog"][aria-modal="true"]'
        // The plugin is mounted inside the host settings dialog; the layer containing the menu is not another dialog that needs to be avoided.
        const hostDialog = variant === 'plugin' ? document.getElementById(targetId)?.closest(selector) : null
        return [...document.querySelectorAll(selector)].some(node => node !== dialog.current && node !== hostDialog && node.getClientRects().length > 0)
      }
      const show = () => {
        if (cancelled || document.hidden || !dialog.current || blockedByDialog()) throw new Error('not ready')
        previousFocus.current = document.activeElement
        dialog.current.showModal()
        closing.current = false
        const oldOverflow = document.body.style.overflow, oldPadding = document.body.style.paddingRight
        const gutter = Math.max(0, window.innerWidth - document.documentElement.clientWidth)
        document.body.style.overflow = 'hidden'
        if (gutter) document.body.style.paddingRight = `${gutter + parseFloat(getComputedStyle(document.body).paddingRight || '0')}px`
        let restored = false
        unlock.current = () => { if (restored) return; restored = true; document.body.style.overflow = oldOverflow; document.body.style.paddingRight = oldPadding }
        setOpened(true)
      }
      const tryShow = () => {
        if (cancelled || document.hidden) return
        if (blockedByDialog()) { observe(); return }
        let storage
        try { storage = window.localStorage } catch { return }
        void claimSponsorDay({ storage, locks: navigator.locks, eligible: () => !cancelled && !document.hidden, show }).then(shown => {
          if (shown || storage.getItem(SPONSOR_DAY_KEY) === sponsorLocalDay()) observer.disconnect()
        }).catch(() => { observer.disconnect() })
      }
      const observer = new MutationObserver(tryShow)
      const observe = () => observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'aria-hidden'] })
      const timer = setTimeout(tryShow, 700)
      const onVisibility = () => { if (!document.hidden) tryShow() }
      // The host closes the settings page with Esc on document; when the notice is open, consume the keypress first and keep the settings page.
      const onKeyDown = event => {
        if (event.key !== 'Escape' || !dialog.current?.open) return
        event.preventDefault()
        event.stopPropagation()
        dismiss()
      }
      document.addEventListener('visibilitychange', onVisibility)
      document.addEventListener('keydown', onKeyDown, true)
      return () => {
        cancelled = true; mounted.current = false
        clearTimeout(timer)
        observer.disconnect()
        document.removeEventListener('visibilitychange', onVisibility)
        document.removeEventListener('keydown', onKeyDown, true)
        animation.current?.cancel()
        dialog.current?.close()
        unlock.current()
      }
    }, [])
    return createPortal(h('dialog', { ref: dialog, className: `${surfaceClass} ofm-sponsor-dialog${leaving ? ' is-closing' : ''}`, 'aria-labelledby': 'ofm-sponsor-dialog-title', 'aria-describedby': 'ofm-sponsor-dialog-description', 'data-placement': placement,
      onCancel: event => { event.preventDefault(); dismiss() },
      onClick: event => { if (event.target === dialog.current) { const r = dialog.current.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dismiss() } } },
      h('header', { className: 'ofm-sponsor-dialoghead' }, h('div', null, h('h2', { id: 'ofm-sponsor-dialog-title' }, SPONSOR.title), h('p', { id: 'ofm-sponsor-dialog-description' }, 'Beichen API × OFM · Shown once, the first time you open it each day')),
        h('button', { type: 'button', className: 'ofm-sponsor-close', autoFocus: true, onClick: dismiss, 'aria-label': 'Collapse notice to the ad menu', title: 'Collapse to the ad menu (Esc)' }, icon('close'))),
      h('div', { className: 'ofm-sponsor-scroll', tabIndex: 0, role: 'region', 'aria-label': 'Full ad text, scrollable' }, opened ? h(SponsorArticle) : null),
      h('footer', { className: 'ofm-sponsor-dialogfoot' }, h('p', null, 'You do not need to read it all; you can collapse it at any time.', h('span', null, 'The full text will remain in the ad menu.')),
        h('button', { type: 'button', className: 'ofm-sponsor-fold', onClick: dismiss }, 'Collapse to menu', icon('arrow', 16)))), document.body)
  }
  return { SponsorPage, SponsorNotice }
}
