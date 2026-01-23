import { useEffect, useMemo, useRef, useState } from 'react'
import type { CustomStatisticsTemplate } from '@/types/customStatisticsTemplates'
import type { WidgetRenderContext } from '@/components/CustomStatistics/registry'

type SandboxMessage =
  | { __cyberzen_custom_widget: true; token: string; type: 'ready'; payload?: {} }
  | { __cyberzen_custom_widget: true; token: string; type: 'request-update'; payload?: {} }
  | { __cyberzen_custom_widget: true; token: string; type: 'ack'; payload?: { ts?: number } }
  | { __cyberzen_custom_widget: true; token: string; type: 'resize'; payload: { height: number } }
  | { __cyberzen_custom_widget: true; token: string; type: 'error'; payload: { message: string } }
  | { __cyberzen_custom_widget: true; token: string; type: 'log'; payload: { level: 'log' | 'warn' | 'error'; args: string[] } }

function createToken(): string {
  try {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return `${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`
  }
}

function buildSrcDoc(template: CustomStatisticsTemplate, token: string, fixedHeightPx: number | null): string {
  const safeHtml = String(template.html ?? '')
    .replace(/<\s*script/gi, '&lt;script')
    .replace(/<\s*\/\s*script/gi, '&lt;/script')
  const safeCss = String(template.css ?? '').replace(/<\s*\/\s*style/gi, '<\\/style')
  const safeJs = String(template.js ?? '').replace(/<\s*\/\s*script/gi, '<\\/script')

  const csp = [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    "img-src data: blob:",
    "font-src data:",
    "script-src 'unsafe-inline'",
    "connect-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ')

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root { color-scheme: light; }
      html, body { margin: 0; padding: 0;${fixedHeightPx ? ' height: 100%;' : ''} }
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"; }
      #root { width: 100%; box-sizing: border-box;${fixedHeightPx ? ' min-height: 100%;' : ''} }
    </style>
    <style>${safeCss}</style>
  </head>
  <body>
    <div id="root">${safeHtml}</div>
    <script>
      (() => {
        'use strict';
        const TOKEN = ${JSON.stringify(token)};
        const post = (type, payload, transfer) => {
          try {
            const msg = { __cyberzen_custom_widget: true, token: TOKEN, type, payload };
            if (Array.isArray(transfer) && transfer.length) parent.postMessage(msg, '*', transfer);
            else parent.postMessage(msg, '*');
          } catch {}
        };

        const root = document.getElementById('root');
        const helpers = Object.freeze({
          sum: (arr, pick) => {
            if (!Array.isArray(arr)) return 0;
            let out = 0;
            for (const item of arr) out += pick ? (Number(pick(item)) || 0) : (Number(item) || 0);
            return out;
          },
          clamp: (v, min, max) => Math.max(Number(min) || 0, Math.min(Number(max) || 0, Number(v) || 0)),
          formatNumber: (v) => {
            const n = Number(v) || 0;
            try { return n.toLocaleString(); } catch { return String(n); }
          },
        });

        // Best-effort: prevent accessing Tauri bridge from untrusted templates.
        try { window.__TAURI__ = undefined; } catch {}
        try { window.__TAURI_INTERNALS__ = undefined; } catch {}

        const sendError = (e) => {
          const msg = (e && (e.stack || e.message)) ? String(e.stack || e.message) : String(e);
          post('error', { message: msg });
        };

        const collectCssText = () => {
          let out = '';
          const sheets = Array.from(document.styleSheets || []);
          for (const sheet of sheets) {
            let rules;
            try { rules = sheet.cssRules; } catch { continue; }
            if (!rules) continue;
            for (const r of Array.from(rules)) out += r.cssText + '\\n';
          }
          return out;
        };

        const maskNumbers = (node) => {
          try {
            const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
            let cur = walker.nextNode();
            while (cur) {
              const parent = cur.parentNode;
              const tag = parent && parent.nodeType === 1 ? parent.tagName : '';
              if (tag !== 'SCRIPT' && tag !== 'STYLE' && tag !== 'NOSCRIPT') {
                const text = String(cur.nodeValue || '');
                const masked = text.replace(/\\d/g, '•');
                if (masked !== text) cur.nodeValue = masked;
              }
              cur = walker.nextNode();
            }
          } catch {}
        };

        const replaceCanvasWithImages = (node) => {
          try {
            const canvases = node.querySelectorAll ? node.querySelectorAll('canvas') : [];
            for (const c of Array.from(canvases)) {
              try {
                const dataUrl = c.toDataURL('image/png');
                const img = document.createElement('img');
                img.src = dataUrl;
                img.width = c.width || c.clientWidth || 0;
                img.height = c.height || c.clientHeight || 0;
                img.style.width = (c.clientWidth ? c.clientWidth + 'px' : (img.width ? img.width + 'px' : '')) || '';
                img.style.height = (c.clientHeight ? c.clientHeight + 'px' : (img.height ? img.height + 'px' : '')) || '';
                img.style.display = getComputedStyle(c).display || 'block';
                c.replaceWith(img);
              } catch {}
            }
          } catch {}
        };

        const renderNodeToPngBuffer = async ({ node, width, height, pixelRatio, hideNumbers }) => {
          const cssText = collectCssText();
          const clone = node.cloneNode(true);
          if (hideNumbers) maskNumbers(clone);
          replaceCanvasWithImages(clone);

          const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svgEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
          svgEl.setAttribute('width', String(width));
          svgEl.setAttribute('height', String(height));
          svgEl.setAttribute('viewBox', '0 0 ' + width + ' ' + height);

          const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
          fo.setAttribute('x', '0');
          fo.setAttribute('y', '0');
          fo.setAttribute('width', '100%');
          fo.setAttribute('height', '100%');
          svgEl.appendChild(fo);

          const container = document.createElement('div');
          container.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
          container.style.width = width + 'px';
          container.style.height = height + 'px';
          container.style.boxSizing = 'border-box';
          container.style.background = '#ffffff';
          const style = document.createElement('style');
          style.textContent = cssText;
          container.appendChild(style);
          container.appendChild(clone);
          fo.appendChild(container);

          const svg = new XMLSerializer().serializeToString(svgEl);
          const img = new Image();
          img.decoding = 'async';
          img.loading = 'eager';
          const svgBlob = new Blob([svg], { type: 'image/svg+xml' });
          const url = URL.createObjectURL(svgBlob);
          img.src = url;
          try {
            await new Promise((resolve, reject) => {
              img.onload = () => resolve();
              img.onerror = () => reject(new Error('Failed to load SVG'));
            });
          } finally {
            try { URL.revokeObjectURL(url); } catch {}
          }
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(width * pixelRatio));
          canvas.height = Math.max(1, Math.round(height * pixelRatio));
          const ctx2 = canvas.getContext('2d');
          if (!ctx2) throw new Error('No canvas context');
          ctx2.scale(pixelRatio, pixelRatio);
          ctx2.drawImage(img, 0, 0, width, height);
          const pngBlob = await new Promise((resolve, reject) => {
            canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Failed to encode PNG'))), 'image/png');
          });
          const buffer = await pngBlob.arrayBuffer();
          return buffer;
        };

        window.addEventListener('error', (event) => {
          try { sendError(event.error || event.message); } catch {}
        });
        window.addEventListener('unhandledrejection', (event) => {
          try { sendError(event.reason); } catch {}
        });

        const forward = (level) => (...args) => {
          try { post('log', { level, args: args.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))) }); } catch {}
        };
        try {
          console.log = forward('log');
          console.warn = forward('warn');
          console.error = forward('error');
        } catch {}

        let last = { data: null, params: null };
        let pendingAck = false;
        let ackSent = false;
        const callRender = () => {
          try {
            if (typeof window.render !== 'function') return;
            window.render({ data: last.data, params: last.params, helpers, root });
            if (pendingAck && !ackSent) {
              ackSent = true;
              pendingAck = false;
              post('ack', { ts: Date.now() });
            }
          } catch (e) {
            sendError(e);
          }
        };

        const ro = typeof ResizeObserver === 'function'
          ? new ResizeObserver(() => {
              const height = Math.max(0, Math.ceil(document.documentElement.scrollHeight || document.body.scrollHeight || 0));
              post('resize', { height });
            })
          : null;
        try { ro && ro.observe(document.documentElement); } catch {}

        let gotUpdate = false;
        let requestTimer = null;
        const ensureRequestPulse = () => {
          if (gotUpdate) return;
          if (requestTimer != null) return;
          requestTimer = setInterval(() => {
            if (gotUpdate) {
              try { clearInterval(requestTimer); } catch {}
              requestTimer = null;
              return;
            }
            post('ready', {});
            post('request-update', {});
          }, 200);
        };

        window.addEventListener('message', (event) => {
          const msg = event && event.data;
          if (!msg || msg.__cyberzen_custom_widget !== true) return;
          if (msg.token !== TOKEN) return;
          if (msg.type === 'update') {
            gotUpdate = true;
            try { if (requestTimer != null) clearInterval(requestTimer); } catch {}
            requestTimer = null;
            last = msg.payload || last;
            if (typeof window.render === 'function') {
              callRender();
              if (!ackSent) {
                ackSent = true;
                post('ack', { ts: Date.now() });
              }
            } else {
              pendingAck = true;
            }
            return;
          }
          if (msg.type === 'capture') {
            const req = msg.payload || {};
            const requestId = String(req.requestId || '');
            if (!requestId) return;
            const pixelRatio = Math.max(1, Math.min(3, Number(req.pixelRatio) || 2));
            const hideNumbers = !!(req.options && req.options.hideNumbers);
            const width = Math.max(1, Math.ceil(document.documentElement.scrollWidth || document.body.scrollWidth || 0));
            const height = Math.max(1, Math.ceil(document.documentElement.scrollHeight || document.body.scrollHeight || 0));
            renderNodeToPngBuffer({ node: document.body, width, height, pixelRatio, hideNumbers })
              .then((buffer) => {
                post('capture-result', { requestId, width, height, buffer }, [buffer]);
              })
              .catch((e) => {
                post('capture-result', { requestId, error: (e && (e.stack || e.message)) ? String(e.stack || e.message) : String(e) });
              });
            return;
          }
        });

        try {
${safeJs}
        } catch (e) {
          sendError(e);
        }

        // Allow templates to define a plain render(...) function (not attached to window).
        try {
          if (typeof window.render !== 'function' && typeof render === 'function') window.render = render;
        } catch {}

        // If an update arrived before the template's render() was ready, render it now.
        try { callRender(); } catch {}

        post('ready', {});
        post('request-update', {});
        ensureRequestPulse();
        post('resize', { height: Math.max(0, Math.ceil(document.documentElement.scrollHeight || document.body.scrollHeight || 0)) });
      })();
    </script>
  </body>
</html>`
}

export function CustomWidgetSandbox({
  template,
  ctx,
}: {
  template: CustomStatisticsTemplate
  ctx: WidgetRenderContext & { range: 'today' | 'all' }
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const tokenRef = useRef<string>(createToken())
  const [height, setHeight] = useState<number>(160)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  const fixedHeightPx = useMemo(() => {
    const raw = template.height_px
    const n = Number(raw)
    if (!Number.isFinite(n) || n <= 0) return null
    return Math.max(24, Math.min(6000, Math.floor(n)))
  }, [template.height_px])

  const srcDoc = useMemo(
    () => buildSrcDoc(template, tokenRef.current, fixedHeightPx),
    [fixedHeightPx, template.id, template.name, template.html, template.css, template.js],
  )

  const lastPayloadRef = useRef<{ data: any; params: any } | null>(null)
  const retryTimersRef = useRef<number[]>([])
  const ackedRef = useRef(false)

  const sendUpdate = () => {
    const frame = iframeRef.current
    const payload = lastPayloadRef.current
    if (!frame || !payload) return
    try {
      frame.contentWindow?.postMessage(
        { __cyberzen_custom_widget: true, token: tokenRef.current, type: 'update', payload },
        '*',
      )
    } catch (e) {
      setError(String(e))
    }
  }

  const clearRetries = () => {
    for (const id of retryTimersRef.current) window.clearTimeout(id)
    retryTimersRef.current = []
  }

  const queueRetries = (delaysMs: number[]) => {
    clearRetries()
    retryTimersRef.current = delaysMs.map((ms) =>
      window.setTimeout(() => {
        if (ackedRef.current) return
        sendUpdate()
      }, ms),
    )
  }

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const msg = event.data as SandboxMessage
      if (!msg || (msg as any).__cyberzen_custom_widget !== true) return
      if (msg.token !== tokenRef.current) return

      if (msg.type === 'ready') {
        setReady(true)
        sendUpdate()
        queueRetries([60, 140, 260, 520, 900, 1400])
        return
      }
      if (msg.type === 'request-update') {
        sendUpdate()
        queueRetries([60, 140, 260, 520, 900, 1400])
        return
      }
      if (msg.type === 'ack') {
        ackedRef.current = true
        clearRetries()
        return
      }
      if (msg.type === 'resize') {
        if (fixedHeightPx != null) return
        const next = Math.max(80, Math.min(2000, Number(msg.payload?.height) || 0))
        if (Number.isFinite(next)) setHeight(next)
        return
      }
      if (msg.type === 'error') {
        setError(String(msg.payload?.message ?? 'unknown_error'))
        return
      }
      if (msg.type === 'log') {
        // Intentionally ignored by default to avoid noisy UI; kept for future devtools.
        return
      }
    }
    window.addEventListener('message', onMessage)
    return () => {
      window.removeEventListener('message', onMessage)
      clearRetries()
    }
  }, [fixedHeightPx])

  useEffect(() => {
    setError(null)
    setReady(false)
    ackedRef.current = false
    clearRetries()
  }, [srcDoc])

  useEffect(() => {
    lastPayloadRef.current = { data: ctx, params: template.params ?? {} }
    if (ready) {
      sendUpdate()
      return
    }
    // Cover the "ready message missed" / slow-load cases without spamming.
    queueRetries([0, 120, 260, 520, 900, 1400])
  }, [ctx, ready, template.params])

  return (
    <div className="w-full">
      <iframe
        ref={iframeRef}
        title={template.name}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        data-custom-widget-id={template.id}
        data-custom-widget-token={tokenRef.current}
        className="w-full rounded-lg border border-slate-200 bg-white"
        style={{ height: fixedHeightPx ?? height }}
        srcDoc={srcDoc}
        onLoad={() => {
          // Post a few updates after load to avoid "missed ready" races.
          queueRetries([0, 60, 140, 260, 520, 900])
        }}
      />
      {error && <div className="mt-2 text-xs text-red-600 whitespace-pre-wrap">{error}</div>}
    </div>
  )
}
