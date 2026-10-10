/*
 * Browser floor check: iOS / Safari 15.4, Chrome and Edge 98, Firefox 94.
 *
 * Runs before the app as a plain script, written in old JavaScript on purpose, so that it
 * still runs in the browsers it is checking for. Below the floor the app would otherwise
 * load and then fail part-way (Safari 15.0 to 15.3 lacks Object.hasOwn and structuredClone,
 * which the charts use), or show a white screen. Instead the person is told what to do.
 *
 * It is a file rather than inline so the Content-Security-Policy's script-src 'self'
 * covers it without another hash. main.tsx will not start the app when this sets
 * window.__safeopsUnsupported.
 */
(function () {
  var ok = false
  try {
    ok = typeof Object.hasOwn === 'function' &&
      typeof window.structuredClone === 'function' &&
      typeof Array.prototype.at === 'function' &&
      typeof Promise !== 'undefined' &&
      typeof window.fetch === 'function' &&
      !!(window.crypto && window.crypto.getRandomValues) &&
      'noModule' in document.createElement('script')
  } catch (e) {
    ok = false
  }
  if (ok) return
  window.__safeopsUnsupported = true

  function show() {
    var root = document.getElementById('root')
    if (!root) return
    var ios = /iP(hone|ad|od)/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    var how = ios
      ? 'On an iPhone or iPad, open Settings, then General, then Software Update, and install the latest update. Then open this page again in Safari.'
      : 'Update this browser to its latest version, or open this page in a current version of Chrome, Edge, Firefox or Safari.'
    root.innerHTML =
      // Its own light box, so it stays readable when the page is in dark mode.
      '<div style="padding:0 16px"><main role="alert" style="max-width:32rem;margin:2rem auto;padding:20px 16px;' +
      'background:#fff;color:#1f2937;border-radius:12px;' +
      'font:16px/1.5 -apple-system,system-ui,sans-serif">' +
      '<h1 style="font-size:1.375rem;margin:0 0 .75rem">This browser is too old for SafeChain</h1>' +
      '<p style="margin:0 0 .75rem">SafeChain needs iOS 15.4 or later on an iPhone or iPad, ' +
      'or a browser updated in the last few years on a computer or Android phone.</p>' +
      '<p style="margin:0 0 .75rem">' + how + '</p>' +
      '<p style="margin:0;color:#4b5563">If you need to report an incident and cannot update ' +
      'now, tell your supervisor or safety officer directly.</p>' +
      '</main></div>'
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show)
  else show()
})()
