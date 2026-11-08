/**
 * ============================================================
 *  大肥鱼网页宠物插件（dafeiyu-pet）
 *  免依赖，一行 <script> 引入即可在任意页面右下角养一条鱼。
 *
 *  用法：
 *    <script src="plugin/dafeiyu-pet.js"
 *            data-pet-config='{ "speed": 1.5, "floorOffset": 0 }'></script>
 *
 *  配置项也可用 data-* 单个覆盖（优先级低于 data-pet-config）：
 *    data-pet-speed / data-pet-gravity / data-pet-jump-force
 *    data-pet-floor-offset / data-pet-floor-selector
 *    data-pet-lines（逗号分隔台词）/ data-pet-disabled
 *
 *  JS 手动控制：
 *    DafeiyuPet.init({ ...config })   // 返回实例，重复调用不会重复创建
 *    DafeiyuPet.destroy()             // 移除宠物并停止循环
 *    pet.say('台词')                   // 让鱼说一句话
 *  资源定位：images/ 目录需与本脚本同级放置。
 * ============================================================
 */
(function (global) {
  'use strict';

  var VERSION = '1.0.0';

  /* 立即捕获引入标签：DOMContentLoaded 回调里 currentScript 已失效 */
  var scriptEl = document.currentScript;

  /* ---- 资源目录 = 本脚本 URL 的同级 images/ ---- */
  function assetBase() {
    try {
      if (scriptEl && scriptEl.src) {
        return new URL('images/', scriptEl.src).href;
      }
    } catch (e) { /* 老浏览器无 URL 构造器时走 fallback */ }
    return 'images/';
  }

  /* ---- 默认配置（与 demo 手感一致）---- */
  var DEFAULTS = {
    speed: 1.2,            // 行走速度 px/frame(约60fps)
    gravity: 0.25,         // 重力
    jumpForce: -9,         // 起跳力度
    floorOffset: 0,        // 离页面底部的距离(px)
    floorSelector: null,   // 让鱼站在某个元素顶部，如 '#my-footer'
    stayInViewport: true,  // 限制在可视区域内
    autoDecideInterval: [800, 2500], // 每次"思考"间隔(ms)
    dragThreshold: 4,      // 位移超过该距离才算拖动，否则算点击
    maxFlingSpeed: 20,     // 松手瞬间能继承的最大甩出速度 px/frame
    bounce: 0.62,          // 弹性碰撞恢复系数(0~1)
    minBounceSpeed: 2.2,   // 垂直速度低于该值不再回弹，直接静止
    groundFriction: 0.8,   // 每次落地水平速度保留比例
    zIndex: 99999,         // 层级，避免被宿主页面遮挡
    lines: ['摸鱼中…', '今天也肥肥的', '咕噜咕噜', '有人在吗', '饿了',
            '别戳我', '我只是路过', '……(发呆)', '好困'],
  };

  var STYLE_ID = 'dafeiyu-pet-style';
  var PET_ID = 'dafeiyu-pet';
  var CSS = [
    '#' + PET_ID + '{',
    '  position:fixed; left:0; top:0; pointer-events:none;',
    '  will-change:transform; user-select:none; -webkit-user-select:none;',
    '}',
    '#' + PET_ID + '.hitbox{ pointer-events:auto; cursor:grab; touch-action:none; }',
    '#' + PET_ID + '.hitbox.grabbing{ cursor:grabbing; }',
    '#' + PET_ID + ' .dq-body{ position:relative; width:72px; height:108px; }',
    '#' + PET_ID + ' .dq-body img{',
    '  position:absolute; inset:0; width:100%; height:100%;',
    '  object-fit:contain; object-position:center bottom; display:none;',
    '  -webkit-user-drag:none;',
    '}',
    '#' + PET_ID + ' .dq-body img.view-front{ display:block; }',
    /* 走路 GIF：画布 256x256，角色高 207px、脚底距画布底 23px */
    '#' + PET_ID + ' .dq-body img.walk-gif{',
    '  top:2px; bottom:auto; left:50%; right:auto;',
    '  width:117px; height:117px; transform:translateX(-50%); object-fit:fill;',
    '}',
    /* 呼吸 GIF/静态 PNG：画布同为 256x256、留白一致，共用尺寸规则 */
    '#' + PET_ID + ' .dq-body img.breath-gif{',
    '  top:3.5px; bottom:auto; left:50%; right:auto;',
    '  width:115px; height:115px; transform:translateX(-50%); object-fit:fill;',
    '}',
    /* 侧身帧脸朝右：向左飞时镜像 */
    '#' + PET_ID + ' .dq-body img.view-side.flip-self{ transform:translateX(-50%) scaleX(-1); }',
    /* 台词气泡 */
    '#' + PET_ID + ' .dq-bubble{',
    '  position:absolute; bottom:110%; left:50%; transform:translateX(-50%);',
    '  background:#fff; border:2px solid #333; border-radius:12px;',
    '  padding:6px 12px; font-size:14px; white-space:nowrap; opacity:0;',
    '  transition:opacity .25s; pointer-events:none;',
    '  box-shadow:2px 2px 0 rgba(0,0,0,.1);',
    '}',
    '#' + PET_ID + ' .dq-bubble.show{ opacity:1; }',
    /* 睡觉 Zzz */
    '#' + PET_ID + ' .dq-zzz{',
    '  position:absolute; top:-10px; right:-10px; font-size:18px;',
    '  opacity:0; animation:dq-zzz 1.6s infinite;',
    '}',
    '@keyframes dq-zzz{',
    '  0%{ opacity:0; transform:translate(0,0) scale(.8); }',
    '  50%{ opacity:1; }',
    '  100%{ opacity:0; transform:translate(12px,-18px) scale(1.2); }',
    '}',
  ].join('\n');

  function injectStyle(zIndex) {
    if (!document.getElementById(STYLE_ID)) {
      var st = document.createElement('style');
      st.id = STYLE_ID;
      st.textContent = CSS.replace('position:fixed; left:0',
                                  'position:fixed; z-index:' + zIndex + '; left:0');
      document.head.appendChild(st);
    }
  }

  function buildDom(base) {
    var wrap = document.createElement('div');
    wrap.id = PET_ID;
    wrap.innerHTML =
      '<div class="dq-bubble"></div>' +
      '<div class="dq-zzz" style="display:none">💤</div>' +
      '<div class="dq-body">' +
      '<img class="view-front breath-gif"    alt="大肥鱼·正面" src="' + base + 'dafeiyu_stand_front.png">' +
      '<img class="view-side walk-gif"       alt="大肥鱼·侧面" src="' + base + 'dafeiyu_air_side.png">' +
      '<img class="breath-gif view-front-breath" alt="大肥鱼·发呆呼吸" src="' + base + 'whale-maid-walk-front.gif">' +
      '<img class="breath-gif view-sleep"    alt="大肥鱼·睡觉" src="' + base + 'dafeiyu_sleep.png">' +
      '<img class="walk-gif view-walk-right" alt="大肥鱼·向右走" src="' + base + 'whale-maid-walk-right.gif">' +
      '<img class="walk-gif view-walk-left"  alt="大肥鱼·向左走" src="' + base + 'whale-maid-walk-left.gif">' +
      '</div>';
    document.body.appendChild(wrap);
    return wrap;
  }

  /**
   * ============================================================
   *  宠物主体（逻辑与 demo 一致，改为零 ID 依赖、可销毁）
   * ============================================================
   */
  function WebPet(cfg) {
    var o = this;
    var C = (o.cfg = Object.assign({}, DEFAULTS, cfg || {}));
    Object.assign(o, {
      x: Math.max(40, window.innerWidth * 0.2), y: 0,
      vx: 0, vy: 0,
      facing: 1,           // 1 朝右, -1 朝左
      state: 'idle',       // idle | walk | jump | fall | sleep | happy
      stateTimer: 0,
      w: 72, h: 108,       // 碰撞盒尺寸，与渲染尺寸一致
      _nextThink: 0,
      _destroyed: false,
    });

    injectStyle(C.zIndex);
    o.el = buildDom(o._base = cfg && cfg.assetBase ? cfg.assetBase : assetBase());
    o.body = o.el.querySelector('.dq-body');
    o.bub = o.el.querySelector('.dq-bubble');
    o.zzz = o.el.querySelector('.dq-zzz');
    o.views = {
      front:       o.body.querySelector('.view-front'),
      side:        o.body.querySelector('.view-side'),
      frontBreath: o.body.querySelector('.view-front-breath'),
      sleep:       o.body.querySelector('.view-sleep'),
      walkRight:   o.body.querySelector('.view-walk-right'),
      walkLeft:    o.body.querySelector('.view-walk-left'),
    };

    o.floorY = o._calcFloor();
    o.y = o.floorY;
    o.el.classList.add('hitbox');

    // 鼠标/触摸拖动 + 松手自由落体
    o._drag = { active: false, moved: false, id: null, ox: 0, oy: 0, sx: 0, sy: 0, samples: [] };
    o._handlers = [
      [o.el, 'pointerdown', function (e) { o._grab(e); }],
      [window, 'pointermove', function (e) { o._dragMove(e); }],
      [window, 'pointerup', function (e) { o._release(e); }],
      [window, 'pointercancel', function (e) { o._release(e); }],
      [o.el, 'click', function () { if (!o._drag.moved) o.react(); }],
      [window, 'resize', function () { o.floorY = o._calcFloor(); }],
      [document, 'visibilitychange', function () { o._last = 0; }],
    ];
    o._handlers.forEach(function (h) { h[0].addEventListener(h[1], h[2]); });

    o._last = 0;
    o._tick = function (ts) { o._loop(ts); };   // 只绑定一次，避免每帧新建闭包
    o._raf = requestAnimationFrame(o._tick);
    o._think();
  }

  /* ---- 地面检测 ---- */
  WebPet.prototype._calcFloor = function () {
    var sel = this.cfg.floorSelector;
    if (sel) {
      var el = document.querySelector(sel);
      if (el) return el.getBoundingClientRect().top;
    }
    // position:fixed 用视口坐标系，滚动页面不会让它掉出屏幕
    return window.innerHeight - this.h - this.cfg.floorOffset;
  };

  /* ---- 主循环 ---- */
  WebPet.prototype._loop = function (ts) {
    if (this._destroyed) return;
    this._raf = requestAnimationFrame(this._tick);
    if (document.hidden) { this._last = ts; return; }
    var dt = Math.min(ts - (this._last || ts), 50);
    this._last = ts;
    var steps = Math.max(1, Math.round(dt / 16));
    for (var i = 0; i < steps; i++) this._step();
    this._render();
  };

  WebPet.prototype._step = function () {
    var C = this.cfg;
    if (this._drag.active) return;   // 拖拽中完全跟手

    if (this.state === 'jump' || this.state === 'fall' || this.state === 'happy') {
      this.vy += C.gravity;
      this.x += this.vx;
      this.y += this.vy;
      this._collide();
      if (this.vx > 0) this.facing = 1;
      if (this.vx < 0) this.facing = -1;
      return;
    }

    this.stateTimer -= 16;
    if (this.stateTimer <= 0) this._think();

    if (this.state === 'walk') this.x += C.speed * this.facing;

    var maxW = window.innerWidth - this.w;
    if (this.x < 0)    { this.x = 0;    this.facing = 1;  this._turnInto('idle'); }
    if (this.x > maxW) { this.x = maxW; this.facing = -1; this._turnInto('idle'); }
  };

  /* ---- 边界弹性碰撞 ---- */
  WebPet.prototype._collide = function () {
    var C = this.cfg, E = C.bounce;
    var max = window.innerWidth - this.w, flr = this.floorY;

    if (this.x < 0)   { this.x = 0;   this.vx = Math.abs(this.vx) * E; }
    if (this.x > max) { this.x = max; this.vx = -Math.abs(this.vx) * E; }
    if (this.y < 0)   { this.y = 0;   this.vy = Math.abs(this.vy) * E; }

    if (this.y >= flr) {
      this.y = flr;
      if (Math.abs(this.vy) > C.minBounceSpeed) {
        this.vy = -Math.abs(this.vy) * E;
        this.vx *= C.groundFriction;
      } else {
        this.vy = 0; this.vx = 0;
        this.state = 'idle';
        this._think();
      }
    }
    if (Math.abs(this.vx) < 0.05) this.vx = 0;
  };

  /* ---- 行为决策器 ---- */
  WebPet.prototype._think = function () {
    var r = Math.random();
    switch (this.state) {
      case 'idle':
        if (r < 0.55) this._walk();
        else if (r < 0.70) this._sleep();
        else this._idle();
        break;
      case 'walk':
        if (r < 0.50) this._idle();
        else if (r < 0.70) this._jump();
        else if (r < 0.82) { this.facing *= -1; this._walk(); }
        else this._walk(true);
        break;
      default:
        this._idle();
    }
  };

  /* ---- 动作原语 ---- */
  WebPet.prototype._set = function (s, ms) { this.state = s; this.stateTimer = ms; };
  WebPet.prototype._idle = function () {
    this.vx = 0;
    this._set('idle', this._rand(this.cfg.autoDecideInterval));
  };
  WebPet.prototype._walk = function (keepDir) {
    if (!keepDir && Math.random() < 0.5) this.facing *= -1;
    this._set('walk', this._rand([1200, 3500]));
  };
  WebPet.prototype._jump = function () {
    this.vy = this.cfg.jumpForce;
    this.vx = this.facing * (1 + Math.random() * 1.5);
    this.state = 'jump';
  };
  WebPet.prototype._sleep = function () {
    this.vx = 0;
    this._set('sleep', this._rand([4000, 9000]));
    this.zzz.style.display = 'block';
  };
  WebPet.prototype._turnInto = function (s) {
    this.vx = 0;
    this._set(s, this._rand(this.cfg.autoDecideInterval));
  };

  /* ---- 拖动 & 自由落体 ---- */
  WebPet.prototype._grab = function (e) {
    if (e.button !== undefined && e.button !== 0) return;
    var d = this._drag, C = this.cfg;
    d.active = true; d.moved = false; d.id = e.pointerId;
    d.ox = e.clientX - this.x;
    d.oy = e.clientY - this.y;
    d.sx = this.x; d.sy = this.y;
    d.samples = [{ t: performance.now(), x: this.x, y: this.y }];
    if (this.state === 'sleep') this.state = 'idle';
    this.el.classList.add('grabbing');
    e.preventDefault();
  };

  WebPet.prototype._dragMove = function (e) {
    var d = this._drag, C = this.cfg;
    if (!d.active || e.pointerId !== d.id) return;
    var nx = this._clamp(e.clientX - d.ox, 0, window.innerWidth - this.w);
    var ny = this._clamp(e.clientY - d.oy, 0, this.floorY);
    if (!d.moved && Math.hypot(nx - d.sx, ny - d.sy) > C.dragThreshold) d.moved = true;
    this.x = nx; this.y = ny;
    this.facing = 1;
    var now = performance.now();
    d.samples.push({ t: now, x: nx, y: ny });
    while (d.samples.length > 2 && now - d.samples[0].t > 120) d.samples.shift();
  };

  WebPet.prototype._release = function (e) {
    var d = this._drag, C = this.cfg;
    if (!d.active || (e && e.pointerId !== d.id)) return;
    d.active = false;
    this.el.classList.remove('grabbing');
    if (!d.moved) {
      this.react();
      d.moved = true;
      return;
    }
    var s = d.samples, first = s[0], last = s[s.length - 1];
    var span = Math.max(last.t - first.t, 16), k = 16 / span;
    var ivx = (last.x - first.x) * k, ivy = (last.y - first.y) * k;
    var sp = Math.hypot(ivx, ivy);
    if (sp > C.maxFlingSpeed) { ivx *= C.maxFlingSpeed / sp; ivy *= C.maxFlingSpeed / sp; }
    this.vx = ivx; this.vy = ivy;
    this.state = 'jump';
  };

  WebPet.prototype._clamp = function (v, min, max) {
    return Math.min(Math.max(v, min), max);
  };

  WebPet.prototype.react = function () {
    this.vy = this.cfg.jumpForce * 0.7;
    this.vx = this.facing * 3;
    this.state = 'happy';
    var L = this.cfg.lines;
    this.say(L[Math.floor(Math.random() * L.length)]);
  };

  /* ---- 渲染 ---- */
  WebPet.prototype._render = function () {
    this.el.style.transform = 'translate3d(' + this.x + 'px,' + this.y + 'px,0)';

    var s = this.state, view = 'front';
    if (this._drag.active) view = 'front';
    else if (s === 'walk') view = this.facing >= 0 ? 'walkRight' : 'walkLeft';
    else if (s === 'sleep') view = 'sleep';
    else if (s === 'idle') view = 'frontBreath';
    else if (s === 'jump' || s === 'fall' || s === 'happy') {
      view = Math.abs(this.vx) > 0.5 ? 'side' : 'front';
    }
    if (view !== this._view) {
      this._view = view;
      for (var k in this.views) {
        this.views[k].style.display = (k === view) ? 'block' : 'none';
      }
    }
    if (this._view === 'side') {
      var dir = Math.abs(this.vx) > 0.5 ? this.vx : this.facing;
      this.views.side.classList.toggle('flip-self', dir < 0);
    }
    this.zzz.style.display = s === 'sleep' ? 'block' : 'none';
  };

  WebPet.prototype.say = function (text, ms) {
    ms = ms || 2200;
    this.bub.textContent = text;
    this.bub.classList.add('show');
    clearTimeout(this._bubTimer);
    var bub = this.bub;
    this._bubTimer = setTimeout(function () { bub.classList.remove('show'); }, ms);
  };

  WebPet.prototype._rand = function (a) {
    return a[0] + Math.random() * (a[1] - a[0]);
  };

  /* ---- 销毁：停循环、摘监听、删 DOM ---- */
  WebPet.prototype.destroy = function () {
    this._destroyed = true;
    cancelAnimationFrame(this._raf);
    clearTimeout(this._bubTimer);
    this._handlers.forEach(function (h) { h[0].removeEventListener(h[1], h[2]); });
    if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
  };

  /* ============================================================
   *  对外 API + 自动启动
   * ============================================================ */
  var instance = null;

  function readScriptConfig() {
    var sc = scriptEl;
    if (!sc) return {};
    var cfg = {};
    var map = {
      petSpeed: 'speed', petGravity: 'gravity', petJumpForce: 'jumpForce',
      petFloorOffset: 'floorOffset', petFloorSelector: 'floorSelector',
      petZIndex: 'zIndex',
    };
    // 先读单个 data-* 属性
    for (var key in map) {
      if (sc.dataset[key] !== undefined) {
        var v = sc.dataset[key];
        cfg[map[key]] = map[key] === 'floorSelector' ? v : Number(v);
      }
    }
    if (sc.dataset.petLines !== undefined) {
      cfg.lines = sc.dataset.petLines.split(',').map(function (x) { return x.trim(); });
    }
    // data-pet-config 整包最后合并，优先级最高
    try {
      if (sc.dataset.petConfig) Object.assign(cfg, JSON.parse(sc.dataset.petConfig));
    } catch (e) { console.warn('[dafeiyu-pet] data-pet-config 解析失败，忽略', e); }
    return cfg;
  }

  function init(cfg) {
    if (instance) return instance;      // 幂等：不重复创建
    instance = new WebPet(cfg || {});
    return instance;
  }

  function destroy() {
    if (instance) { instance.destroy(); instance = null; }
  }

  global.DafeiyuPet = {
    version: VERSION,
    defaults: DEFAULTS,
    init: init,
    destroy: destroy,
    getInstance: function () { return instance; },
  };

  /* 自动启动（<head> 里 defer/同步引入均适用）；data-pet-disabled 时跳过 */
  function autostart() {
    var sc = scriptEl;
    if (sc && sc.dataset.petDisabled !== undefined) return;
    init(readScriptConfig());
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autostart);
  } else {
    autostart();
  }
})(window);
