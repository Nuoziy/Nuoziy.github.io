/*!
 * 入站封面 ·「潮汐」 —— Nozie's Blog
 * ---------------------------------------------------------------------------
 * 两片 canvas：上面一片静止的星空，下面一片会呼吸的海。
 * 点一下 / 按 Enter，海水涨满整个屏幕，再退去，露出博客。
 *
 * 结构：source/_data/body-end.njk
 * 样式：source/_data/styles.styl 第 ⑧ 节
 * 开关：_config.hexo-theme-next-master.yml 的 ⑮ entry_cover
 * 再看一次：网址后面加 ?cover=1
 * ---------------------------------------------------------------------------
 */
(function () {
  'use strict';

  var TAU = Math.PI * 2;
  var html = document.documentElement;
  var cover = document.getElementById('entry-cover');
  if (!cover) return;

  var starsCv = document.getElementById('ec-stars');
  var wavesCv = document.getElementById('ec-waves');
  var content = cover.querySelector('.ec-content');
  var btn = cover.querySelector('.ec-enter');
  var sctx = starsCv.getContext('2d');
  var wctx = wavesCv.getContext('2d');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var autoMs = parseInt(cover.getAttribute('data-auto-enter') || '0', 10) || 0;

  var W = 0, H = 0, dpr = 1;
  var pal = readPalette();
  var stars = [];
  var motes = [];
  var ripples = [];
  var raf = 0;
  var running = true;
  var leaving = false;
  var surgeAt = 0;
  var px = 0;          // 指针横向 → 海面漂移
  var drift = 0;       // 指针纵向 → 浪高
  var tx = 0, td = 0;  // 目标值

  /* 海平线的高度（占屏高比例），竖屏会低一点，海面才够开阔 */
  var HORIZON = .59;

  /* ── 五层浪：由远及近 ──
     d   离海平线的深度（0 = 海平线，1 = 屏幕底）
     amp 振幅（占“海面高度”的比例）
     wl  波长；sp 流速；a 这一层的浓度；foam 浪尖反光；k 相位偏移 */
  var layers = [
    { d: .00, amp: .014, wl: 1.55, sp: .09, a: .32, foam: .00, k: 0.0 },
    { d: .19, amp: .026, wl: 1.20, sp: .17, a: .46, foam: .14, k: 1.1 },
    { d: .39, amp: .042, wl: .96, sp: .26, a: .60, foam: .22, k: 2.2 },
    { d: .60, amp: .062, wl: .76, sp: .37, a: .76, foam: .32, k: 3.4 },
    { d: .80, amp: .090, wl: .54, sp: .50, a: .93, foam: .50, k: 4.7 }
  ];

  /* ══════════ 配色：直接从 CSS 变量里读，明暗模式只写一处 ══════════ */
  function cssVar(name, fallback) {
    var v = getComputedStyle(cover).getPropertyValue(name).trim();
    return v || fallback;
  }
  function readPalette() {
    return {
      far: rgb(cssVar('--ec-water-far', '128, 184, 226')),
      near: rgb(cssVar('--ec-water-near', '8, 40, 74')),
      haze: rgb(cssVar('--ec-haze', '10, 33, 56')),
      foam: cssVar('--ec-foam', '234, 248, 255'),
      star: cssVar('--ec-star', '223, 241, 255'),
      starAlpha: parseFloat(cssVar('--ec-star-alpha', '1')) || 0
    };
  }

  /* 颜色小工具 */
  function rgb(s) {
    var p = String(s).split(',').map(function (n) { return parseFloat(n) || 0; });
    return [p[0] || 0, p[1] || 0, p[2] || 0];
  }
  function mix(c1, c2, t) {
    return [
      c1[0] + (c2[0] - c1[0]) * t,
      c1[1] + (c2[1] - c1[1]) * t,
      c1[2] + (c2[2] - c1[2]) * t
    ];
  }
  function shade(c, f) {
    return [
      Math.max(0, Math.min(255, c[0] * f)),
      Math.max(0, Math.min(255, c[1] * f)),
      Math.max(0, Math.min(255, c[2] * f))
    ];
  }
  function rgba(c, a) {
    return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + a + ')';
  }

  /* ══════════ 尺寸 ══════════ */
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    W = cover.clientWidth || window.innerWidth;
    H = cover.clientHeight || window.innerHeight;
    HORIZON = (W / H < .85) ? .62 : .59;
    cover.style.setProperty('--ec-horizon', String(HORIZON));

    [starsCv, wavesCv].forEach(function (cv) {
      cv.width = Math.max(1, Math.round(W * dpr));
      cv.height = Math.max(1, Math.round(H * dpr));
      cv.style.width = W + 'px';
      cv.style.height = H + 'px';
      var c = cv.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
    });

    makeStars();
    makeMotes();
    makeRipples();
    drawStars();
  }

  /* ══════════ 星空（只画一次，不烧帧） ══════════ */
  function makeStars() {
    stars = [];
    var n = Math.round(Math.min(170, Math.max(40, (W * H) / 12000)));
    for (var i = 0; i < n; i++) {
      stars.push({
        x: Math.random() * W,
        // 只长在天空里，越靠上越密
        y: Math.pow(Math.random(), 1.7) * H * (HORIZON - .02),
        r: Math.random() * 1.1 + .32,
        a: .14 + Math.random() * .72,
        halo: Math.random() < .07
      });
    }
  }

  function drawStars() {
    sctx.clearRect(0, 0, W, H);

    // 两团很淡的星云，让天空别太空
    var n1 = sctx.createRadialGradient(W * .24, H * .10, 0, W * .24, H * .10, Math.max(W, H) * .46);
    n1.addColorStop(0, 'rgba(102, 204, 255, .085)');
    n1.addColorStop(.45, 'rgba(126, 166, 255, .035)');
    n1.addColorStop(1, 'rgba(0, 0, 0, 0)');
    sctx.fillStyle = n1;
    sctx.fillRect(0, 0, W, H);

    var n2 = sctx.createRadialGradient(W * .76, H * .22, 0, W * .76, H * .22, Math.max(W, H) * .34);
    n2.addColorStop(0, 'rgba(180, 214, 255, .06)');
    n2.addColorStop(1, 'rgba(0, 0, 0, 0)');
    sctx.fillStyle = n2;
    sctx.fillRect(0, 0, W, H);

    sctx.fillStyle = 'rgb(' + pal.star + ')';
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      // 靠近海平线就淡下去，别飘到水面上
      var fade = 1;
      if (s.y > H * .26) fade = Math.max(0, 1 - (s.y - H * .26) / (H * .3));
      var a = s.a * pal.starAlpha * fade;
      if (a <= .005) continue;

      sctx.globalAlpha = a;
      sctx.beginPath();
      sctx.arc(s.x, s.y, s.r, 0, TAU);
      sctx.fill();

      if (s.halo) {
        var g = sctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 6);
        g.addColorStop(0, 'rgba(' + pal.foam + ',' + (.20 * a) + ')');
        g.addColorStop(1, 'rgba(' + pal.foam + ',0)');
        sctx.globalAlpha = 1;
        sctx.fillStyle = g;
        sctx.beginPath();
        sctx.arc(s.x, s.y, s.r * 6, 0, TAU);
        sctx.fill();
        sctx.fillStyle = 'rgb(' + pal.star + ')';
      }
    }
    sctx.globalAlpha = 1;
  }

  /* ══════════ 水面浮游的光点 ══════════ */
  function makeMotes() {
    motes = [];
    var n = Math.round(Math.min(20, Math.max(7, W / 95)));
    for (var i = 0; i < n; i++) {
      motes.push({
        x: Math.random() * W,
        y: Math.random() * H * 1.25,
        r: .7 + Math.random() * 1.7,
        vy: 5 + Math.random() * 13,
        sway: 12 + Math.random() * 42,
        sp: .22 + Math.random() * .5,
        ph: Math.random() * TAU,
        tw: .5 + Math.random() * 1.1,
        a: .2 + Math.random() * .5
      });
    }
  }

  function drawMotes(now) {
    var t = now / 1000;
    for (var i = 0; i < motes.length; i++) {
      var m = motes[i];
      var yy = m.y - ((t * m.vy) % (H + 140));
      if (yy < -70) yy += H + 140;
      var xx = m.x + Math.sin(t * m.sp + m.ph) * m.sway;
      var a = m.a * (.35 + .65 * (.5 + .5 * Math.sin(t * m.tw + m.ph)));
      if (a <= .01) continue;

      var rr = m.r * 5;
      var g = wctx.createRadialGradient(xx, yy, 0, xx, yy, rr);
      g.addColorStop(0, 'rgba(' + pal.foam + ',' + a + ')');
      g.addColorStop(.35, 'rgba(' + pal.foam + ',' + (a * .35) + ')');
      g.addColorStop(1, 'rgba(' + pal.foam + ',0)');
      wctx.fillStyle = g;
      wctx.beginPath();
      wctx.arc(xx, yy, rr, 0, TAU);
      wctx.fill();
    }
  }

  /* ══════════ 海浪 ══════════ */
  /* ══════════ 粼光：水面上细碎的反光，靠它才像水 ══════════ */
  function makeRipples() {
    ripples = [];
    var hz = H * HORIZON;
    var seaH = H - hz;
    var n = Math.round(Math.min(420, Math.max(90, (W * seaH) / 2400)));
    for (var i = 0; i < n; i++) {
      ripples.push({
        x: Math.random() * W,
        d: Math.pow(Math.random(), .85) * .72,   // 主要铺在中远处
        w: 3 + Math.random() * 14,
        a: .03 + Math.random() * .13,
        ph: Math.random() * TAU,
        sp: .25 + Math.random() * 1.0
      });
    }
  }

  function drawRipples(now) {
    var t = now / 1000;
    var hz = H * HORIZON;
    var seaH = H - hz;
    for (var i = 0; i < ripples.length; i++) {
      var r = ripples[i];
      // 靠海平线的地方淡出去，免得粼光在水平线上突然出现
      var near = Math.min(1, r.d / .12);
      var a = r.a * near * (.4 + .6 * (.5 + .5 * Math.sin(t * r.sp + r.ph)));
      if (a <= .004) continue;

      var y = hz + r.d * seaH + Math.sin(t * .9 + r.ph) * 1.6;
      var x = r.x + Math.sin(t * r.sp * .5 + r.ph) * 9;
      var w = r.w * (.45 + r.d * .9);

      wctx.fillStyle = 'rgba(' + pal.foam + ',' + a + ')';
      wctx.fillRect(x, y, w, 1.1);
    }
  }

  function traceCrest(pts, dy) {
    dy = dy || 0;
    wctx.beginPath();
    wctx.moveTo(pts[0], pts[1] + dy);
    for (var p = 2; p < pts.length; p += 2) wctx.lineTo(pts[p], pts[p + 1] + dy);
  }

  function drawWaves(now) {
    var t = (now || 0) / 1000;
    var progress=Math.min(1,Math.max(0,window.scrollY/(cover.parentNode.offsetHeight||H)));
    var surge=Math.min(1,progress/.72);surge=surge*surge*(3-2*surge);
    var lift=reduced.matches?0:surge*H*1.6;
    var breath = Math.sin(t * .26) * H * .004;   // 整片海轻轻呼吸

    wctx.clearRect(0, 0, W, H);

    // 地平线附近的雾：远处的水化进天光里，不留生硬的接缝
    var hz = H * HORIZON;
    var hzDraw = hz - lift;
    var seaH = H - hz;
    var haze = wctx.createLinearGradient(0, hzDraw - H * .15, 0, hzDraw + H * .02);
    haze.addColorStop(0, rgba(pal.haze, 0));
    haze.addColorStop(.76, rgba(pal.haze, .45));
    haze.addColorStop(1, rgba(pal.haze, 0));
    wctx.fillStyle = haze;
    wctx.fillRect(0, hzDraw - H * .15, W, H * .18);

    for (var i = 0; i < layers.length; i++) {
      var L = layers[i];
      var t01 = layers.length > 1 ? i / (layers.length - 1) : 0;
      // 远处的水淡（近天光），近处的水深 —— 层次全靠这一条插值
      var col = mix(pal.far, pal.near, Math.pow(t01, .92));

      var amp = seaH * L.amp * (1 + drift * .5 + surge * 1.2);
      var base = hz + seaH * L.d + breath - lift * (1 + i * .05);
      if (base - amp * 3.4 > H + 30) continue;

      var step = Math.max(6, W / 200);
      var k1 = TAU / (W * L.wl);
      var pts = [];
      for (var x = -step; x <= W + step; x += step) {
      var y = base
          + Math.sin(x * k1 + t * L.sp + L.k + px) * amp
          + Math.sin(x * k1 * 2.3 - t * L.sp * .58 + L.k * 1.7) * amp * .38
          + Math.sin(x * k1 * .45 + t * .08) * amp * .7
          // 细碎的小浪：让浪尖别像用尺子画的（越近越明显）
          + Math.sin(x * k1 * 6.7 + t * L.sp * 1.9 + L.k * 3) * amp * .15 * t01;
        pts.push(x, y);
      }

      // 填充：浪尖亮一点（受天光），水底沉一点
      traceCrest(pts);
      wctx.lineTo(W + step, H + 4);
      wctx.lineTo(-step, H + 4);
      wctx.closePath();

      var top = Math.max(-H, base - amp * 2.2);
      var g;
      if (i === 0) {
        // 最远那层：从海平线附近淡淡化开，不留一条生硬的上边缘
        g = wctx.createLinearGradient(0, hzDraw - amp, 0, hzDraw + seaH * .13);
        g.addColorStop(0, rgba(shade(col, 1.1), 0));
        g.addColorStop(.55, rgba(shade(col, 1.06), L.a * .55));
        g.addColorStop(1, rgba(col, L.a));
      } else {
        g = wctx.createLinearGradient(0, top, 0, H);
        // 浪尖上一圈很窄的提亮 —— 光从上面落下来，浪就有了体积
        var rim = Math.min(.55, 46 / Math.max(1, H - top));
        g.addColorStop(0, rgba(shade(col, 1.34), Math.min(1, L.a * .92)));
        g.addColorStop(rim, rgba(shade(col, 1.04), L.a));
        g.addColorStop(1, rgba(shade(col, .8), Math.min(1, L.a * 1.05)));
      }
      wctx.fillStyle = g;
      wctx.fill();

      // 浪尖下面压一道很淡的影 —— 浪才像鼓起来的，而不是平的色带
      if (i > 0) {
        traceCrest(pts, 7);
        wctx.lineJoin = 'round';
        wctx.lineCap = 'round';
        wctx.lineWidth = 14;
        wctx.strokeStyle = rgba(shade(col, .45), L.a * .12);
        wctx.stroke();
      }

      // 只在近处两层留一点点碎光，远处不用（不然像划痕）
      if (i >= 2 && L.foam > 0) {
        traceCrest(pts);
        wctx.lineJoin = 'round';
        wctx.lineCap = 'round';
        wctx.setLineDash([64 + i * 26, 150 + i * 60, 34, 210]);
        wctx.lineDashOffset = -(t * (9 + i * 4) + i * 90);
        wctx.lineWidth = 9;
        wctx.strokeStyle = rgba(mix(col, rgb(pal.foam), .85), L.foam * .07);
        wctx.stroke();
        wctx.setLineDash([]);
      }
    }
  }

  /* ══════════ 主循环 ══════════ */
  function frame(now) {
    if (!running) return;
    // 指针缓动，别跟得太死
    px += (tx - px) * .045;
    drift += (td - drift) * .05;

    drawWaves(now);
    drawRipples(now);
    drawMotes(now);
    raf = requestAnimationFrame(frame);
  }

  var active=true;
  function updateDepth(){var p=Math.min(1,Math.max(0,scrollY/(cover.parentNode.offsetHeight||H)));var f=Math.max(0,Math.min(1,(p-.36)/.48));cover.style.opacity=String(1-f*f*(3-2*f));if(reduced.matches)drawWaves(0);}
  function sync(){cancelAnimationFrame(raf);running=active&&!document.hidden&&!reduced.matches;if(running)raf=requestAnimationFrame(frame);else if(reduced.matches)drawWaves(0);}
  addEventListener('pointermove',function(e){if(reduced.matches||!active)return;tx=(e.clientX/Math.max(1,W)-.5)*1.1;td=e.clientY/Math.max(1,H)-.5;},{passive:true});
  addEventListener('scroll',updateDepth,{passive:true});addEventListener('resize',function(){resize();updateDepth();},{passive:true});
  document.addEventListener('visibilitychange',sync);reduced.addEventListener('change',sync);
  new IntersectionObserver(function(entries){active=entries[0].isIntersecting;sync();}).observe(cover.parentNode);
  new MutationObserver(function(){pal=readPalette();drawStars();if(reduced.matches)drawWaves(0);}).observe(html,{attributes:true,attributeFilter:['data-theme']});
  resize();updateDepth();sync();
})();
