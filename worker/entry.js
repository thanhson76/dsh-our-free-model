/**
 * EAC dashboard sidebar entry injection script — served by the gateway at
 * {mount}/entry.js, which nginx injects into every page of the New API panel
 * (before </body>).
 *
 * It does exactly one thing: wait for the New API admin sidebar to render,
 * then clone the entry after "System Info" in the "Admin" group, rename it
 * to "EAC Dashboard" and point it at /eac/stats. The clone is detached DOM
 * (not wired to React events) and clicks follow a native navigation; if a
 * panel update causes React to re-render and remove the entry, the observer
 * adds it back. No secret is embedded.
 */
(function () {
  if (location.pathname.indexOf('/eac/') === 0) return // do not inject into the dashboard itself
  var HREF = '/eac/stats'
  try {
    if (document.currentScript && document.currentScript.src) {
      HREF = new URL('../stats', document.currentScript.src).pathname
    }
  } catch (e) { /* keep the default path */ }
  var done = false

  function textLeaf(el) {
    var all = el.querySelectorAll('*')
    for (var i = 0; i < all.length; i++) {
      if (all[i].children.length === 0 && all[i].textContent.trim() !== '') return all[i]
    }
    return null
  }

  function inject() {
    if (done || document.getElementById('eac-stats-entry')) { done = true; return }
    var candidates = document.querySelectorAll('aside a, aside div, nav a, nav div, [class*="sider"] a, [class*="sider"] div')
    var anchor = null
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i]
      if (el.childElementCount === 0) continue
      var leaf = textLeaf(el)
      if (leaf && leaf.textContent.trim() === '系统信息') { anchor = el; break }
    }
    if (!anchor) return
    var clone = anchor.cloneNode(true)
    clone.id = 'eac-stats-entry'
    if (clone.tagName === 'A') clone.setAttribute('href', HREF)
    else clone.addEventListener('click', function () { location.href = HREF })
    clone.style.cursor = 'pointer'
    var leaf = textLeaf(clone)
    if (leaf) leaf.textContent = 'EAC Dashboard'
    anchor.parentElement.insertBefore(clone, anchor.nextSibling)
    done = true
  }

  function start() {
    inject()
    if (!done) {
      var obs = new MutationObserver(function () { if (inject()) obs.disconnect() })
      obs.observe(document.body, { childList: true, subtree: true })
      setTimeout(function () { obs.disconnect() }, 60000)
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
  else start()
})()
