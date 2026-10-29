/*!
 * K1000 Interactive — embed loader
 *
 * Usage on any website:
 *
 *   <div data-k1000></div>                 3D model
 *   <div data-k1000="parts"></div>         2D parts atlas (exploded line drawing)
 *   <script src="https://YOUR-VIEWER-HOST/embed.js" async></script>
 *
 * Parts atlas options: data-component, data-category, data-theme="light",
 * data-accent="e5322d" (hex, no #), data-ink="…" (line colour), data-labels="0".
 *
 * Optional attributes on the placeholder:
 *   data-height="600"            fixed height in px (default: 16:9 responsive)
 *   data-aspect="21/9"           aspect ratio when no height is given
 *   data-component="battery"     open with a component selected
 *   data-view="exploded"         exploded | internal | xray (comma separated)
 *   data-light="night"           studio | technical | night | inspection
 *   data-autorotate="0"          disable the idle rotation
 *   data-radius="12"             corner radius in px
 *
 * Programmatic control:
 *   const viewer = K1000.get(element);        // or K1000.viewers[0]
 *   viewer.select('lift-motor-03');
 *   viewer.view('top');                       // reset | front | side | top | bottom
 *   viewer.explode(0.6);                      // 0..1
 *   viewer.send('lighting', 'night');         // any command, see EMBED.md
 *   viewer.on('select', (e) => console.log(e.id, e.name));
 *
 * Also available as custom elements: <k1000-viewer component="battery"></k1000-viewer>
 * and <k1000-parts theme="light"></k1000-parts>.
 */
(function () {
  'use strict';
  if (window.K1000 && window.K1000.__loaded) return;

  var script = document.currentScript;
  var base = (function () {
    try {
      return new URL('.', script && script.src ? script.src : window.location.href).href;
    } catch (e) {
      return '/';
    }
  })();
  var origin = new URL(base).origin;

  var viewers = [];

  function attr(el, name) {
    return el.getAttribute('data-' + name) || el.getAttribute(name);
  }

  function isParts(el) {
    return el.tagName === 'K1000-PARTS' || el.getAttribute('data-k1000') === 'parts';
  }

  function buildSrc(el) {
    var parts = isParts(el);
    var u = new URL(parts ? 'parts' : '', base);
    u.searchParams.set('embed', '1');
    var map = parts
      ? { component: 'component', category: 'category', theme: 'theme', accent: 'accent', ink: 'ink', labels: 'labels' }
      : { component: 'component', view: 'view', light: 'light', autorotate: 'autorotate', mode: 'mode', overlay: 'overlay' };
    Object.keys(map).forEach(function (k) {
      var v = attr(el, k);
      if (v != null && v !== '') u.searchParams.set(map[k], v);
    });
    return u.toString();
  }

  function Viewer(el) {
    var self = this;
    this.el = el;
    this.handlers = {};
    this.ready = false;
    this.queue = [];

    var parts = isParts(el);
    var height = attr(el, 'height');
    var aspect = attr(el, 'aspect') || (parts ? '16/10' : '16/9');
    var bg = parts ? (attr(el, 'theme') === 'light' ? '#f4f6f8' : '#090b0e') : '#06080a';
    var radius = attr(el, 'radius') || '12';

    var wrap = document.createElement('div');
    wrap.style.cssText =
      'position:relative;width:100%;overflow:hidden;background:' + bg + ';border-radius:' + radius + 'px;' +
      (height ? 'height:' + parseInt(height, 10) + 'px;' : 'aspect-ratio:' + aspect + ';');

    var iframe = document.createElement('iframe');
    iframe.title = parts ? 'K1000ULE interactive parts atlas' : 'K1000ULE interactive 3D viewer';
    iframe.loading = 'lazy';
    iframe.allow = 'fullscreen; autoplay';
    iframe.setAttribute('allowfullscreen', '');
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;display:block;';
    this.iframe = iframe;
    wrap.appendChild(iframe);
    el.innerHTML = '';
    el.appendChild(wrap);

    // load only when close to the viewport
    var load = function () {
      if (!iframe.src) iframe.src = buildSrc(el);
    };
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(
        function (entries) {
          if (entries.some(function (e) { return e.isIntersecting; })) {
            load();
            io.disconnect();
          }
        },
        { rootMargin: '300px' },
      );
      io.observe(wrap);
    } else load();

    window.addEventListener('message', function (e) {
      if (e.source !== iframe.contentWindow || e.origin !== origin) return;
      var d = e.data;
      if (!d || typeof d.k1000 !== 'string') return;
      if (d.k1000 === 'ready') {
        self.ready = true;
        self.queue.splice(0).forEach(function (m) { self._post(m); });
      }
      (self.handlers[d.k1000] || []).forEach(function (fn) {
        try { fn(d); } catch (err) { console.error(err); }
      });
      el.dispatchEvent(new CustomEvent('k1000:' + d.k1000, { detail: d, bubbles: true }));
    });
  }

  Viewer.prototype._post = function (m) {
    if (this.iframe.contentWindow) this.iframe.contentWindow.postMessage(m, origin);
  };
  Viewer.prototype.send = function (command, value) {
    var m = { k1000: command, value: value };
    if (this.ready) this._post(m);
    else this.queue.push(m);
    return this;
  };
  Viewer.prototype.select = function (id) { return this.send('select', id || null); };
  Viewer.prototype.view = function (v) { return this.send('view', v); };
  Viewer.prototype.explode = function (v) { return this.send('explode', v); };
  Viewer.prototype.reset = function () { return this.send('reset'); };
  Viewer.prototype.category = function (c) { return this.send('category', c || null); };
  Viewer.prototype.on = function (event, fn) {
    (this.handlers[event] = this.handlers[event] || []).push(fn);
    return this;
  };

  function mount(el) {
    if (el.__k1000) return el.__k1000;
    var v = new Viewer(el);
    el.__k1000 = v;
    viewers.push(v);
    return v;
  }

  function scan() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-k1000]'), mount);
  }

  if (window.customElements) {
    ['k1000-viewer', 'k1000-parts'].forEach(function (tag) {
      if (customElements.get(tag)) return;
      customElements.define(
        tag,
        class extends HTMLElement {
          connectedCallback() {
            if (!this.style.display) this.style.display = 'block';
            mount(this);
          }
        },
      );
    });
  }

  window.K1000 = {
    __loaded: true,
    viewers: viewers,
    mount: mount,
    get: function (el) {
      return el && el.__k1000 ? el.__k1000 : null;
    },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan);
  else scan();
})();
