/* Hollow Run runtime layer: Halloween night, pumpkin-head hero, ghost pursuer, ghost trains,
   restart, share-for-reward, stage HUD and the Sekai ending. Rigs and animations are the game's own. */
(function () {
  'use strict';

  // Theme data lives in the remix block at the top of the page.
  if (!window.REMIX) throw new Error('Hollow Run: the remix block is missing; it must come before remix.js.');
  const NIGHT_SKY = parseInt(String(window.REMIX.COLOURS.nightSky).replace('#', ''), 16);
  const STAGE_LENGTH = window.REMIX.FEEL.stageLength;
  const STAGES = window.REMIX.TEXT.stages;
  const ROMAN = ['I', 'II', 'III', 'IV', 'V'];
  const RUNNING = 1;
  const PAUSED = 2;
  const SOURCE_PROPS = /(^|_)bag(_|$)|spray|sandwich/i;
  const ENV_ATLAS = /environment-tex/;

  // Files that only the trimmed pages used (boards, the other characters and their outfits, portrait
  // previews, hoverboard animation). The game's loader checks this before fetching, so they are neither
  // downloaded nor shipped.
  const TRIMMED_ASSETS = /assets\/boards\/|assets\/character-previews\/|assets\/characters-idle\/(?!avatar_jake\.|jake-)|assets\/animations-basic\/hoverboards\.pk/;
  window.__remixSkipAsset = (url) => TRIMMED_ASSETS.test(String(url));

  // The source build's reporting beacons are cut out of its code at build time (builder/patches.py).
  // This is the second lock on the same door: nothing on this page may send one.
  try { navigator.sendBeacon = () => false; } catch (error) { console.error('Hollow Run: could not disable beacons', error); }

  const sdk = window.PokiSDK;
  if (!sdk) throw new Error('Hollow Run: the host SDK stub is missing; remix.js must load after runtime.js.');
  if (!window.RemixActions || !window.SekaiEnding) throw new Error('Hollow Run: sekai-ending.js and remix-actions.js must load before remix.js.');

  const css = `
  .hr-ui{position:fixed;z-index:5;font:600 12px/1.2 system-ui,-apple-system,sans-serif;color:#f6efe6;pointer-events:none}
  .hr-ui[hidden]{display:none}
  .hr-restart{left:calc(10px + env(safe-area-inset-left,0px));top:calc(92px + env(safe-area-inset-top,0px));width:44px;height:44px;border-radius:12px;border:1.5px solid #ff8c1a;background:linear-gradient(#3b2752,#170d26);box-shadow:0 2px 0 #0b0514,0 0 10px #ff8c1a44;display:grid;place-items:center;pointer-events:auto;cursor:pointer;padding:0;touch-action:manipulation}
  .hr-restart:active{transform:translateY(1px)}
  .hr-restart:focus-visible{outline:2px solid #b6f24a;outline-offset:2px}
  .hr-restart svg{width:24px;height:24px}
  .hr-stage{left:50%;top:calc(58px + env(safe-area-inset-top,0px));transform:translateX(-50%);width:min(52vw,240px);text-align:center;text-shadow:0 1px 2px #0b0514}
  .hr-stage b{display:block;font-size:10px;letter-spacing:.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .hr-bar{height:6px;margin-top:5px;border-radius:3px;background:#170d26cc;border:1px solid #4a3566;overflow:hidden}
  .hr-bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#d9600a,#ffb347);box-shadow:0 0 8px #ff8c1a}
  .hr-banner{left:50%;top:30%;transform:translate(-50%,-50%);text-align:center;opacity:0;transition:opacity .35s ease;width:86vw}
  .hr-banner.on{opacity:1}
  .hr-banner small{display:block;font-size:12px;letter-spacing:.24em;color:#ffb347}
  .hr-banner strong{display:block;font:italic 700 clamp(24px,7vw,34px)/1.15 Georgia,serif;color:#fff6e9;text-shadow:0 2px 0 #0b0514,0 0 18px #ff8c1a99}
  .hr-paused{left:50%;top:22%;transform:translateX(-50%);width:min(78vw,300px);text-align:center;color:#2a1247}
  .hr-paused strong{display:block;font:400 clamp(30px,9vw,44px)/1.1 "Titan One",Georgia,serif;letter-spacing:.04em}
  .hr-paused span{display:block;white-space:pre-line;margin-top:clamp(40px,9vh,70px);font:600 15px/1.5 system-ui,-apple-system,sans-serif}
  .hr-toast{left:50%;bottom:calc(84px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);max-width:84vw;padding:10px 14px;border-radius:12px;background:#170d26ee;border:1px solid #ff8c1a;text-align:center;opacity:0;transition:opacity .25s ease}
  .hr-toast.on{opacity:1}
  @media(prefers-reduced-motion:reduce){.hr-banner,.hr-toast{transition:none}}
  .hr-chip{left:50%;top:calc(10px + env(safe-area-inset-top,0px));transform:translateX(-50%);min-height:44px;padding:0 18px;border-radius:22px;border:1.5px solid #ff8c1a;background:linear-gradient(#3b2752,#170d26);box-shadow:0 2px 0 #0b0514,0 0 12px #ff8c1a55;color:#ffd9a3;font:700 14px/1 system-ui,-apple-system,sans-serif;pointer-events:auto;cursor:pointer;touch-action:manipulation;white-space:nowrap}
  .hr-chip:active{transform:translateX(-50%) translateY(1px)}
  .hr-chip:focus-visible{outline:2px solid #b6f24a;outline-offset:2px}
  dialog.se-ending{z-index:10}`;

  function el(tag, className, html) {
    const node = document.createElement(tag);
    node.className = className;
    if (html) node.innerHTML = html;
    return node;
  }

  let restartBtn, endingChip, stageBox, stageName, stageFill, banner, toastBox, pausedBox, toastTimer, bannerTimer;
  function buildDom() {
    document.head.appendChild(el('style', '')).textContent = css;
    restartBtn = el('button', 'hr-ui hr-restart', '<svg viewBox="0 0 24 24" fill="none" stroke="#ffb347" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/></svg>');
    restartBtn.type = 'button';
    restartBtn.setAttribute('aria-label', 'Restart run');
    restartBtn.hidden = true;
    // Shown over the score board once the ending is put away, so Remix and Share stay one tap off.
    endingChip = el('button', 'hr-ui hr-chip');
    endingChip.type = 'button';
    endingChip.textContent = 'Remix · Share';
    endingChip.hidden = true;
    stageBox = el('div', 'hr-ui hr-stage', '<b></b><div class="hr-bar"><i></i></div>');
    stageBox.hidden = true;
    stageName = stageBox.querySelector('b');
    stageFill = stageBox.querySelector('i');
    banner = el('div', 'hr-ui hr-banner', '<small></small><strong></strong>');
    toastBox = el('div', 'hr-ui hr-toast');
    toastBox.setAttribute('role', 'status');
    // The pause panel lost its word-hunt and mission sections; this fills the stone with the run so far.
    pausedBox = el('div', 'hr-ui hr-paused', '<strong>PAUSED</strong><span></span>');
    pausedBox.hidden = true;
    document.body.append(restartBtn, endingChip, stageBox, banner, toastBox, pausedBox);
  }

  function toast(text, ms) {
    toastBox.textContent = text;
    toastBox.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastBox.classList.remove('on'), ms || 2600);
  }

  function announce(index) {
    banner.querySelector('small').textContent = 'STAGE ' + ROMAN[index % ROMAN.length];
    banner.querySelector('strong').textContent = STAGES[index % STAGES.length];
    banner.classList.add('on');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => banner.classList.remove('on'), 2200);
  }

  // Every rewarded video in the game goes through rewardedBreak; it becomes a Sekai share.
  // The host sends no share receipt, so the reward is granted when the share sheet is requested.
  sdk.rewardedBreak = async function (beforeStart) {
    if (typeof beforeStart === 'function') beforeStart();
    const sent = window.RemixActions.share();
    toast(sent ? 'Shared. Reward unlocked.' : 'Reward unlocked. Open this game in Sekai to share it.');
    return true;
  };

  /* ---------- 3D costume layer ---------- */

  // The engine build is minified, so its classes are taken from live objects instead of by name.
  let kit = null;
  function makeKit(scene) {
    let sample = null;
    scene.traverse((node) => {
      if (!sample && node.isMesh && !node.isSkinnedMesh && node.material && node.material.map && node.geometry.attributes.position) sample = node;
    });
    if (!sample) return null;
    return {
      Mesh: sample.constructor,
      Geometry: sample.geometry.constructor,
      Attribute: sample.geometry.attributes.position.constructor,
      Material: sample.material.constructor,
      Texture: sample.material.map.constructor,
      Vector3: sample.position.constructor,
      Matrix4: sample.matrix.constructor,
      colorSpace: sample.material.map.colorSpace,
    };
  }

  function material(map, options) {
    const made = new kit.Material({ map });
    Object.assign(made, options || {});
    return made;
  }

  // A copy of one of the game's materials with a different texture. The world-bend shader
  // patch lives in own properties, which clone() does not carry over.
  function reskin(source, map) {
    const copy = source.clone();
    for (const key of Object.keys(source)) {
      if (!(key in copy) || typeof source[key] === 'function') copy[key] = source[key];
    }
    for (const key of ['flipY', 'colorSpace', 'wrapS', 'wrapT', 'minFilter', 'magFilter', 'generateMipmaps', 'anisotropy']) map[key] = source.map[key];
    map.needsUpdate = true;
    copy.map = map;
    if (copy.uniforms && copy.uniforms.uDiffuseMap) copy.uniforms = { ...source.uniforms, uDiffuseMap: { value: map } };
    return copy;
  }

  function canvasTexture(size, draw) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    draw(canvas.getContext('2d'), size);
    const texture = new kit.Texture(canvas);
    texture.colorSpace = kit.colorSpace;
    texture.needsUpdate = true;
    return texture;
  }

  // Surface of revolution; the texture seam sits at the back so u = 0.5 is the front (+Z).
  function lathe(rings, segments, shape) {
    const positions = [], uvs = [], indices = [];
    for (let j = 0; j <= rings; j++) {
      const v = j / rings;
      for (let i = 0; i <= segments; i++) {
        const u = i / segments;
        const theta = (u - 0.5) * Math.PI * 2;
        const p = shape(v, theta);
        positions.push(Math.sin(theta) * p.r, p.y, Math.cos(theta) * p.r);
        uvs.push(u, 1 - v);
      }
    }
    for (let j = 0; j < rings; j++) {
      for (let i = 0; i < segments; i++) {
        const a = j * (segments + 1) + i, b = a + segments + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const geometry = new kit.Geometry();
    geometry.setAttribute('position', new kit.Attribute(new Float32Array(positions), 3));
    geometry.setAttribute('uv', new kit.Attribute(new Float32Array(uvs), 2));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    return geometry;
  }

  function jackFace(ctx, cx, cy, s, fill, edge) {
    ctx.fillStyle = fill;
    ctx.strokeStyle = edge;
    ctx.lineWidth = s * 0.05;
    ctx.lineJoin = 'round';
    const shape = (points) => {
      ctx.beginPath();
      points.forEach(([x, y], i) => (i ? ctx.lineTo(cx + x * s, cy + y * s) : ctx.moveTo(cx + x * s, cy + y * s)));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    };
    shape([[-0.62, -0.18], [-0.2, -0.3], [-0.3, 0.08]]);
    shape([[0.62, -0.18], [0.2, -0.3], [0.3, 0.08]]);
    shape([[0, 0.02], [-0.1, 0.2], [0.1, 0.2]]);
    shape([[-0.7, 0.3], [-0.45, 0.42], [-0.32, 0.3], [-0.16, 0.46], [0, 0.32], [0.16, 0.46], [0.32, 0.3], [0.45, 0.42], [0.7, 0.3],
      [0.5, 0.66], [0.3, 0.56], [0.14, 0.74], [0, 0.6], [-0.14, 0.74], [-0.3, 0.56], [-0.5, 0.66]]);
  }

  let pumpkinParts = null;
  function pumpkin() {
    if (!pumpkinParts) {
      const skin = canvasTexture(256, (ctx, n) => {
        const body = ctx.createLinearGradient(0, 0, 0, n);
        body.addColorStop(0, '#ff9320');
        body.addColorStop(0.5, '#ee6a0c');
        body.addColorStop(1, '#9c3a08');
        ctx.fillStyle = body;
        ctx.fillRect(0, 0, n, n);
        for (let k = 0; k <= 8; k++) {
          const x = (k / 8) * n;
          const crease = ctx.createLinearGradient(x - n * 0.035, 0, x + n * 0.035, 0);
          crease.addColorStop(0, 'rgba(110,40,0,0)');
          crease.addColorStop(0.5, 'rgba(110,40,0,.6)');
          crease.addColorStop(1, 'rgba(110,40,0,0)');
          ctx.fillStyle = crease;
          ctx.fillRect(x - n * 0.035, 0, n * 0.07, n);
        }
        ctx.shadowColor = '#fff3a0';
        ctx.shadowBlur = n * 0.04;
        jackFace(ctx, n / 2, n * 0.45, n * 0.2, '#ffe873', '#4a1a00');
      });
      pumpkinParts = {
        body: lathe(14, 24, (v, theta) => {
          const phi = v * Math.PI;
          return { r: Math.sin(phi) * (1 - 0.07 * Math.abs(Math.sin(theta * 4))), y: Math.cos(phi) * 0.84 };
        }),
        stem: lathe(3, 8, (v) => ({ r: v === 0 ? 0 : 0.13 - v * 0.03, y: 1.12 - v * 0.36 })),
        skin: new kit.Material({ map: skin }),
        bark: new kit.Material({ map: canvasTexture(8, (ctx, n) => { ctx.fillStyle = '#4f6b1f'; ctx.fillRect(0, 0, n, n); }) }),
      };
    }
    const head = new kit.Mesh(pumpkinParts.body, pumpkinParts.skin);
    head.add(new kit.Mesh(pumpkinParts.stem, pumpkinParts.bark));
    head.frustumCulled = false;
    return head;
  }

  let ghostParts = null;
  function ghost() {
    if (!ghostParts) {
      const skin = canvasTexture(256, (ctx, n) => {
        const body = ctx.createLinearGradient(0, 0, 0, n);
        body.addColorStop(0, '#ffffff');
        body.addColorStop(0.6, '#e6ecff');
        body.addColorStop(1, '#a9b6e8');
        ctx.fillStyle = body;
        ctx.fillRect(0, 0, n, n);
        ctx.fillStyle = '#140a26';
        const oval = (x, y, rx, ry) => { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); };
        oval(n * 0.43, n * 0.27, n * 0.035, n * 0.07);
        oval(n * 0.57, n * 0.27, n * 0.035, n * 0.07);
        oval(n * 0.5, n * 0.45, n * 0.05, n * 0.085);
      });
      ghostParts = {
        body: lathe(16, 24, (v, theta) => {
          const dome = v < 0.38;
          const r = dome ? Math.sin((v / 0.38) * Math.PI / 2) : 1 + (v - 0.38) * 0.3;
          const hem = v > 0.9 ? 0.2 * Math.sin(theta * 6) * (v - 0.9) * 10 : 0;
          return { r, y: (dome ? Math.cos((v / 0.38) * Math.PI / 2) : -(v - 0.38) * 2.4) + hem };
        }),
        skin: material(skin, { transparent: true, opacity: 0.94, side: 2 }),
      };
    }
    const mesh = new kit.Mesh(ghostParts.body, ghostParts.skin);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    return mesh;
  }

  function skinnedCentre(mesh) {
    const count = mesh.geometry.attributes.position.count;
    const point = new kit.Vector3(), centre = new kit.Vector3();
    const points = [];
    for (let i = 0; i < count; i += 3) {
      mesh.getVertexPosition(i, point);
      points.push(point.clone().applyMatrix4(mesh.matrixWorld));
      centre.add(points[points.length - 1]);
    }
    centre.multiplyScalar(1 / points.length);
    let radius = 0;
    for (const p of points) radius = Math.max(radius, p.distanceTo(centre));
    return { centre, radius };
  }

  const HIDDEN_LAYER = 31;   // no camera renders this layer; children of a hidden mesh still draw
  const dressed = new WeakSet();
  const attempts = new WeakMap();
  const chasers = [];        // { root, anchor, mesh, phase }

  function hide(mesh) { mesh.layers.set(HIDDEN_LAYER); }

  function shaded(size, paint) {
    return canvasTexture(size, (ctx, n) => {
      paint(ctx, n);
      // Unlit materials: bake a soft side light so round parts do not look flat.
      const light = ctx.createLinearGradient(0, 0, n, 0);
      light.addColorStop(0, 'rgba(0,0,0,.42)');
      light.addColorStop(0.3, 'rgba(0,0,0,0)');
      light.addColorStop(0.62, 'rgba(255,255,255,.14)');
      light.addColorStop(1, 'rgba(0,0,0,.42)');
      ctx.fillStyle = light;
      ctx.fillRect(0, 0, n, n);
    });
  }

  let wardrobe = null;
  function makeWardrobe() {
    const stripes = (a, b, count) => shaded(64, (ctx, n) => {
      for (let i = 0; i < count; i++) { ctx.fillStyle = i % 2 ? a : b; ctx.fillRect(0, (i / count) * n, n, n / count + 1); }
    });
    const flat = (colour) => shaded(32, (ctx, n) => { ctx.fillStyle = colour; ctx.fillRect(0, 0, n, n); });
    const cloak = shaded(256, (ctx, n) => {
      const cloth = ctx.createLinearGradient(0, 0, 0, n);
      cloth.addColorStop(0, '#5a2d8c');
      cloth.addColorStop(1, '#2a1247');
      ctx.fillStyle = cloth;
      ctx.fillRect(0, 0, n, n);
      ctx.fillStyle = '#ff8c1a';
      ctx.fillRect(0, n * 0.1, n, n * 0.045);
      ctx.beginPath();
      for (let i = 0; i <= 16; i++) ctx.lineTo((i / 16) * n, n * (i % 2 ? 0.80 : 0.92));
      ctx.lineTo(n, n); ctx.lineTo(0, n); ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#f6d98a';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      for (const [x, y, w, h] of [[0.16, 0.36, 0.14, 0.16], [0.62, 0.48, 0.16, 0.14], [0.86, 0.3, 0.1, 0.12]]) {
        ctx.fillStyle = '#7d3fb8';
        ctx.fillRect(x * n, y * n, w * n, h * n);
        ctx.strokeRect(x * n, y * n, w * n, h * n);
      }
    });
    const hat = shaded(128, (ctx, n) => {
      ctx.fillStyle = '#1d0f33';
      ctx.fillRect(0, 0, n, n);
      ctx.fillStyle = '#ff8c1a';
      ctx.fillRect(0, n * 0.60, n, n * 0.10);
      ctx.fillStyle = '#ffe873';
      ctx.fillRect(n * 0.45, n * 0.585, n * 0.1, n * 0.13);
    });
    const tube = (r0, r1) => lathe(1, 10, (v) => ({ r: r0 + (r1 - r0) * v, y: v }));
    const ball = lathe(8, 12, (v) => ({ r: Math.sin(v * Math.PI), y: Math.cos(v * Math.PI) }));
    wardrobe = {
      ball,
      sleeve: tube(1, 1.35),
      leg: tube(1, 0.82),
      boot: lathe(6, 10, (v) => ({ r: Math.sin(Math.min(1, v * 1.25) * Math.PI) * (0.8 + 0.4 * v), y: v })),
      // Bell-shaped cloak: fitted at the neck, flaring to a ragged hem over the hips.
      cloak: lathe(10, 20, (v, theta) => ({ r: 0.42 + 0.72 * Math.pow(v, 0.8) + (v > 0.85 ? 0.07 * Math.sin(theta * 8) : 0), y: 1 - v })),
      // Witch hat in pumpkin units: brim, crown and a tip that leans back.
      hat: lathe(10, 16, (v) => (v < 0.1 ? { r: v * 12.5, y: 0.62 } : v < 0.2 ? { r: 1.25 - (v - 0.1) * 5.5, y: 0.62 + (v - 0.1) * 0.6 } : { r: 0.7 * (1 - (v - 0.2) / 0.8), y: 0.68 + (v - 0.2) * 1.75 })),
      mat: {
        cloak: new kit.Material({ map: cloak }),
        hat: new kit.Material({ map: hat }),
        sleeve: new kit.Material({ map: stripes('#ff8c1a', '#2a1247', 6) }),
        leg: new kit.Material({ map: stripes('#f3ead8', '#1d0f33', 8) }),
        glove: new kit.Material({ map: flat('#9bd24a') }),
        boot: new kit.Material({ map: flat('#3a2157') }),
      },
    };
    for (const material of Object.values(wardrobe.mat)) material.side = 2;
  }

  // A rigid part hung on bone `from`, stretched toward the rest position of its child bone `to`.
  function part(from, to, geometry, material, radius, stretch) {
    const length = to.position.length();
    if (!(length > 0)) return null;
    const mesh = new kit.Mesh(geometry, material);
    mesh.quaternion.setFromUnitVectors(new kit.Vector3(0, 1, 0), to.position.clone().normalize());
    mesh.scale.set(radius, length * (stretch || 1), radius);
    mesh.frustumCulled = false;
    from.add(mesh);
    return mesh;
  }

  function knob(bone, material, radius) {
    const mesh = new kit.Mesh(wardrobe.ball, material);
    mesh.scale.setScalar(radius);
    mesh.frustumCulled = false;
    bone.add(mesh);
    return mesh;
  }

  // Replaces the whole character model with a new one built on the same skeleton, so every
  // original animation still drives it. Returns false while the rig is not ready yet.
  function dressHero(headMesh) {
    const skeleton = headMesh.skeleton;
    if (!skeleton || !skeleton.bones.length) return false;
    const bone = (pattern) => skeleton.bones.find((b) => pattern.test(b.name));
    const head = bone(/^head_jnt$/i), spine = bone(/^lowerspine_jnt$/i);
    if (!head || !spine) return false;
    let root = headMesh;
    while (root.parent && !root.parent.isScene) root = root.parent;
    root.updateMatrixWorld(true);

    const skinned = [];
    let eyes = null;
    let model = headMesh;
    for (let i = 0; i < 4 && model.parent && !model.parent.isScene && !/^(meshes|character)$/i.test(model.name); i++) model = model.parent;
    model.traverse((node) => {
      if (!node.isSkinnedMesh || node.skeleton !== skeleton && !/^(.*_(head|mesh|outfit\d*)|eye_.*)$/i.test(node.name)) return;
      skinned.push(node);
      if (/eye/i.test(node.name)) eyes = node;
    });
    if (!skinned.includes(headMesh)) skinned.push(headMesh);

    const skull = skinnedCentre(headMesh);
    if (!(skull.radius > 0)) return false;
    if (!wardrobe) makeWardrobe();

    const forward = eyes ? skinnedCentre(eyes).centre.sub(skull.centre) : new kit.Vector3(0, 0, 1);
    if (forward.lengthSq() < 1e-8) forward.set(0, 0, 1);
    forward.normalize();
    const up = new kit.Vector3(0, 1, 0);
    up.addScaledVector(forward, -up.dot(forward)).normalize();
    const right = new kit.Vector3().crossVectors(up, forward);
    const size = skull.radius * 1.15;
    skull.centre.addScaledVector(up, skull.radius * 0.2);
    const world = new kit.Matrix4().makeBasis(right.multiplyScalar(size), up.multiplyScalar(size), forward.multiplyScalar(size)).setPosition(skull.centre);
    const mask = pumpkin();
    new kit.Matrix4().copy(head.matrixWorld).invert().multiply(world).decompose(mask.position, mask.quaternion, mask.scale);
    const hat = new kit.Mesh(wardrobe.hat, wardrobe.mat.hat);
    hat.rotation.x = -0.18;
    hat.frustumCulled = false;
    mask.add(hat);
    head.add(mask);

    const cloak = part(spine, head, wardrobe.cloak, wardrobe.mat.cloak, head.position.length() * 0.95, 1.95);
    if (cloak) cloak.position.copy(head.position).multiplyScalar(-0.95);

    for (const side of ['L', 'R']) {
      const b = (name) => bone(new RegExp('^' + side + '_' + name + '_jnt$', 'i'));
      const shoulder = b('Shoulder'), elbow = b('Elbow'), hand = b('Hand'), tip = b('HandTip');
      const hip = b('Leg'), knee = b('Knee'), foot = b('Foot'), toes = b('Toes');
      if (shoulder && elbow && hand) {
        part(shoulder, elbow, wardrobe.sleeve, wardrobe.mat.sleeve, 0.3);
        part(elbow, hand, wardrobe.sleeve, wardrobe.mat.sleeve, 0.3);
        const glove = knob(hand, wardrobe.mat.glove, 0.42);
        if (tip) glove.position.copy(tip.position).multiplyScalar(0.45);
      }
      if (hip && knee && foot) {
        part(hip, knee, wardrobe.leg, wardrobe.mat.leg, 0.36);
        part(knee, foot, wardrobe.leg, wardrobe.mat.leg, 0.3);
        if (toes) part(foot, toes, wardrobe.boot, wardrobe.mat.boot, 0.5, 1.35);
      }
    }
    for (const mesh of skinned) hide(mesh);
    return true;
  }

  function dressChaser(guardMesh) {
    if (!guardMesh.skeleton || !guardMesh.skeleton.bones.length) return false;
    const anchor = guardMesh.skeleton.bones.find((b) => /chest/i.test(b.name)) || guardMesh.skeleton.bones[0];
    let root = guardMesh;
    while (root.parent && !root.parent.isScene) root = root.parent;
    const mesh = ghost();
    root.add(mesh);
    chasers.push({ root, anchor, mesh, phase: Math.random() * 6 });
    hide(guardMesh);
    return true;
  }

  /* ---------- pickups: candy instead of coins, keys, letters and power-ups ---------- */

  // The game keeps every model in a registry keyed by name; meshes point at those geometries.
  const byGeometry = new Map();
  let registrySize = -1;
  function modelName(geometry) {
    const registry = window.geometries;
    if (!registry) return null;
    const size = Object.keys(registry).length;
    if (size !== registrySize) {
      byGeometry.clear();
      for (const [name, entry] of Object.entries(registry)) if (entry && entry.threeGeometry) byGeometry.set(entry.threeGeometry, name);
      registrySize = size;
    }
    return byGeometry.get(geometry) || null;
  }

  let helper = null;
  function placed(px, py, pz, rx, ry, rz, sx, sy, sz) {
    if (!helper) helper = new kit.Mesh();
    helper.position.set(px, py, pz);
    helper.rotation.set(rx, ry, rz);
    helper.scale.set(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz);
    helper.updateMatrix();
    return helper.matrix.clone();
  }

  // Quadrants of a pickup texture, as [u0, v0, u1, v1].
  const Q = { a: [0, 0.5, 0.5, 1], b: [0.5, 0.5, 1, 1], c: [0, 0, 0.5, 0.5], d: [0.5, 0, 1, 0.5] };

  function merge(parts) {
    const positions = [], uvs = [], indices = [];
    const point = new kit.Vector3();
    for (const [geometry, matrix, rect] of parts) {
      const base = positions.length / 3;
      const P = geometry.attributes.position, U = geometry.attributes.uv, I = geometry.index;
      for (let i = 0; i < P.count; i++) {
        point.fromBufferAttribute(P, i).applyMatrix4(matrix);
        positions.push(point.x, point.y, point.z);
        uvs.push(rect[0] + U.getX(i) * (rect[2] - rect[0]), rect[1] + U.getY(i) * (rect[3] - rect[1]));
      }
      for (let i = 0; i < I.count; i++) indices.push(base + I.getX(i));
    }
    const geometry = new kit.Geometry();
    geometry.setAttribute('position', new kit.Attribute(new Float32Array(positions), 3));
    geometry.setAttribute('uv', new kit.Attribute(new Float32Array(uvs), 2));
    geometry.setIndex(indices);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  let shapes = null;
  function makeShapes() {
    const quad = (points) => {
      const geometry = new kit.Geometry();
      geometry.setAttribute('position', new kit.Attribute(new Float32Array(points.flat()), 3));
      geometry.setAttribute('uv', new kit.Attribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
      geometry.setIndex([0, 1, 2, 0, 2, 3]);
      return geometry;
    };
    shapes = {
      ball: lathe(8, 14, (v) => ({ r: Math.sin(v * Math.PI), y: Math.cos(v * Math.PI) })),
      tube: lathe(1, 10, (v) => ({ r: 1, y: v })),
      cone: lathe(2, 10, (v) => ({ r: v, y: 1 - v })),
      bowl: lathe(6, 14, (v) => ({ r: Math.sin((0.32 + v * 0.68) * Math.PI), y: Math.cos((0.32 + v * 0.68) * Math.PI) })),
      disc: lathe(1, 14, (v) => ({ r: v, y: 0 })),
      face: quad([[-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0]]),
      wing: quad([[0, -0.2, 0], [1, -0.7, 0], [1.15, 0.6, 0], [0, 0.35, 0]]),
    };
  }

  function stripes(ctx, x, y, w, h, colours, slant) {
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    const band = w / 5;
    for (let i = -6; i < 12; i++) {
      ctx.fillStyle = colours[((i % colours.length) + colours.length) % colours.length];
      ctx.beginPath();
      ctx.moveTo(x + i * band, y); ctx.lineTo(x + (i + 1) * band, y);
      ctx.lineTo(x + (i + 1) * band + slant * h, y + h); ctx.lineTo(x + i * band + slant * h, y + h);
      ctx.fill();
    }
    ctx.restore();
  }

  function fill(ctx, x, y, w, h, colour) { ctx.fillStyle = colour; ctx.fillRect(x, y, w, h); }

  const HALF_PI = Math.PI / 2;
  const recipes = {
    // Wrapped candy, long axis across the lane; it spins where the coin used to.
    currency_coin: () => ({
      paint: (ctx, n) => { stripes(ctx, 0, 0, n / 2, n / 2, ['#ff8c1a', '#fff3dc', '#8a3fd1', '#fff3dc'], 0.6); fill(ctx, n / 2, 0, n / 2, n / 2, '#ffe9a8'); stripes(ctx, n / 2, 0, n / 2, n / 2, ['#ffe9a8', '#f2c75c'], 0); },
      parts: [[shapes.ball, placed(0, 0, 0, 0, 0, 0, 2.2, 1.9, 1.5), Q.a], [shapes.cone, placed(3.6, 0, 0, 0, 0, HALF_PI, 1.7, 2.1, 1.3), Q.b], [shapes.cone, placed(-3.6, 0, 0, 0, 0, -HALF_PI, 1.7, 2.1, 1.3), Q.b]],
    }),
    // Swirl lollipop in place of the key.
    currency_key: () => ({
      paint: (ctx, n) => { stripes(ctx, 0, 0, n / 2, n / 2, ['#ff4f8b', '#fff3dc'], 1.2); fill(ctx, n / 2, 0, n / 2, n / 2, '#fff3dc'); },
      parts: [[shapes.ball, placed(0, 1.3, 0, HALF_PI, 0, 0, 2.7, 0.8, 2.7), Q.a], [shapes.tube, placed(0, -4, 0, 0, 0, 0, 0.28, 3.2, 0.28), Q.b]],
    }),
    // Witch's broom in place of the jetpack.
    powerups_jetpack: () => ({
      paint: (ctx, n) => { fill(ctx, 0, 0, n / 2, n / 2, '#8a5a2b'); fill(ctx, n / 2, 0, n / 2, n / 2, '#e9c46a'); stripes(ctx, n / 2, 0, n / 2, n / 2, ['#e9c46a', '#c9a13e'], 0); fill(ctx, 0, n / 2, n / 2, n / 2, '#8a3fd1'); },
      parts: [[shapes.tube, placed(0, -1, 0, 0, 0, 0, 0.3, 4.4, 0.3), Q.a], [shapes.cone, placed(0, -4.5, 0, 0, 0, 0, 1.9, 3.2, 1.9), Q.b], [shapes.tube, placed(0, -1.3, 0, 0, 0, 0, 0.75, 0.5, 0.75), Q.c]],
    }),
    // Bubbling cauldron in place of the magnet.
    powerups_coinMagnet: () => ({
      paint: (ctx, n) => { fill(ctx, 0, 0, n / 2, n / 2, '#2a1f3d'); fill(ctx, n / 2, 0, n / 2, n / 2, '#8df04a'); ctx.fillStyle = '#d9ff9c'; for (const [x, y, r] of [[0.62, 0.12, 0.04], [0.8, 0.3, 0.05], [0.7, 0.4, 0.03], [0.9, 0.14, 0.03]]) { ctx.beginPath(); ctx.arc(x * n, y * n, r * n, 0, 7); ctx.fill(); } },
      parts: [[shapes.bowl, placed(0, -0.3, 0, 0, 0, 0, 3, 2.8, 3), Q.a], [shapes.disc, placed(0, 1.15, 0, 0, 0, 0, 2.5, 1, 2.5), Q.b], [shapes.tube, placed(0, 0.95, 0, 0, 0, 0, 2.7, 0.5, 2.7), Q.a]],
    }),
    // Bat in place of the sneakers.
    powerups_superSneakers: () => ({
      paint: (ctx, n) => { fill(ctx, 0, 0, n, n, '#3a2157'); ctx.fillStyle = '#ffe873'; ctx.beginPath(); ctx.arc(n * 0.19, n * 0.2, n * 0.03, 0, 7); ctx.arc(n * 0.31, n * 0.2, n * 0.03, 0, 7); ctx.fill(); ctx.strokeStyle = '#5a3a86'; ctx.lineWidth = 2; for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(n / 2, n * 0.25); ctx.lineTo(n / 2 + (i / 4) * n / 2, n / 2); ctx.stroke(); } },
      parts: [[shapes.ball, placed(0, 0, 0, 0, 0, 0, 1.4, 1.7, 1.2), Q.a], [shapes.wing, placed(0.8, 0.2, 0, 0, 0, 0.15, 3.2, 3.4, 1), Q.b], [shapes.wing, placed(-0.8, 0.2, 0, 0, Math.PI, -0.15, 3.2, 3.4, 1), Q.b], [shapes.cone, placed(0.6, 1.4, 0, 0, 0, -0.3, 0.45, 1, 0.3), Q.a], [shapes.cone, placed(-0.6, 1.4, 0, 0, 0, 0.3, 0.45, 1, 0.3), Q.a]],
    }),
    // Firework rocket in place of the pogo stick.
    powerups_rocketPogo: () => ({
      paint: (ctx, n) => { stripes(ctx, 0, 0, n / 2, n / 2, ['#ff8c1a', '#2a1247'], 0.5); fill(ctx, n / 2, 0, n / 2, n / 2, '#ffe873'); fill(ctx, 0, n / 2, n / 2, n / 2, '#8a5a2b'); },
      parts: [[shapes.tube, placed(0, 0.5, 0, 0, 0, 0, 1.3, 3.6, 1.3), Q.a], [shapes.cone, placed(0, 4.1, 0, 0, 0, 0, 1.6, 2, 1.6), Q.b], [shapes.tube, placed(0.9, -3.3, 0, 0, 0, 0, 0.2, 4.2, 0.2), Q.c]],
    }),
    powerups_2xMultiplier: () => potion('#8df04a', 'x2'),
    powerups_coinMultiplier: () => potion('#ff8c1a', '+'),
    mysteryBox_default: () => bucket('#ff8c1a'),
    mysteryBox_super: () => bucket('#b06cf0'),
  };

  function potion(colour, label) {
    return {
      paint: (ctx, n) => {
        fill(ctx, 0, 0, n / 2, n / 2, colour);
        ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(n * 0.05, n * 0.05, n * 0.06, n * 0.3);
        ctx.fillStyle = '#1d0f33'; ctx.font = '900 ' + n * 0.2 + 'px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, n * 0.25, n * 0.27);
        fill(ctx, n / 2, 0, n / 2, n / 2, '#8a5a2b');
      },
      parts: [[shapes.ball, placed(0, -0.8, 0, 0, 0, 0, 2.6, 2.6, 2), Q.a], [shapes.tube, placed(0, 1.4, 0, 0, 0, 0, 0.9, 1.6, 0.9), Q.a], [shapes.tube, placed(0, 2.9, 0, 0, 0, 0, 1, 0.8, 1), Q.b]],
    };
  }

  // Trick-or-treat bucket in place of the mystery box.
  function bucket(colour) {
    return {
      paint: (ctx, n) => {
        fill(ctx, 0, 0, n / 2, n / 2, colour);
        jackFace(ctx, n * 0.25, n * 0.22, n * 0.1, '#1d0f33', '#1d0f33');
        fill(ctx, n / 2, 0, n / 2, n / 2, '#1d0f33');
        stripes(ctx, 0, n / 2, n / 2, n / 2, ['#ff4f8b', '#fff3dc', '#8df04a', '#ffe873'], 0.8);
      },
      parts: [[shapes.bowl, placed(0, -0.6, 0, 0, 0, 0, 4, 3.6, 4), Q.a], [shapes.tube, placed(0, 1.1, 0, 0, 0, 0, 3.5, 0.5, 3.5), Q.b], [shapes.ball, placed(-1.1, 2.0, 0.4, 0, 0, 0, 1.4, 1.1, 1.4), Q.c], [shapes.ball, placed(1.2, 1.9, -0.5, 0, 0, 0, 1.5, 1.2, 1.5), Q.c], [shapes.ball, placed(0.1, 2.3, 1.1, 0, 0, 0, 1.2, 1, 1.2), Q.c]],
    };
  }

  // Word-hunt letters become carved stone tiles.
  function letterTile(letter, golden) {
    return {
      paint: (ctx, n) => {
        fill(ctx, 0, 0, n, n, golden ? '#ff9a2e' : '#cfc6e6');
        ctx.strokeStyle = golden ? '#7a3a06' : '#5b4a80'; ctx.lineWidth = n * 0.06; ctx.strokeRect(n * 0.03, n * 0.03, n * 0.94, n * 0.94);
        ctx.fillStyle = golden ? '#3a1500' : '#2a1247'; ctx.font = '900 ' + n * 0.72 + 'px "Titan One",system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(letter, n / 2, n * 0.55);
      },
      full: true,
      parts: [[shapes.face, placed(0, 0, 0.6, 0, 0, 0, 3, 3.2, 1), [0, 0, 1, 1]], [shapes.face, placed(0, 0, -0.6, 0, Math.PI, 0, 3, 3.2, 1), [0, 0, 1, 1]],
        [shapes.face, placed(3, 0, 0, 0, HALF_PI, 0, 0.6, 3.2, 1), [0, 0, 0.05, 0.05]], [shapes.face, placed(-3, 0, 0, 0, -HALF_PI, 0, 0.6, 3.2, 1), [0, 0, 0.05, 0.05]],
        [shapes.face, placed(0, 3.2, 0, -HALF_PI, 0, 0, 3, 0.6, 1), [0, 0, 0.05, 0.05]], [shapes.face, placed(0, -3.2, 0, HALF_PI, 0, 0, 3, 0.6, 1), [0, 0, 0.05, 0.05]]],
    };
  }

  /* ---------- coffins and hearses in place of the trains ---------- */

  // A box that changes width along its length, built from flat quads. Each face family maps to its
  // own quadrant of the texture: lid, sides, ends.
  function loft(stations, y0, y1, rects) {
    const quads = [];
    const quad = (a, b, c, d, rect) => quads.push([a, b, c, d, rect]);
    for (let i = 0; i < stations.length - 1; i++) {
      const [z0, w0] = stations[i], [z1, w1] = stations[i + 1];
      quad([-w0, y1, z0], [w0, y1, z0], [w1, y1, z1], [-w1, y1, z1], rects.lid);
      quad([w0, y0, z0], [w1, y0, z1], [w1, y1, z1], [w0, y1, z0], rects.side);
      quad([-w1, y0, z1], [-w0, y0, z0], [-w0, y1, z0], [-w1, y1, z1], rects.side);
    }
    const [zf, wf] = stations[0], [zb, wb] = stations[stations.length - 1];
    quad([wf, y0, zf], [-wf, y0, zf], [-wf, y1, zf], [wf, y1, zf], rects.end);
    quad([-wb, y0, zb], [wb, y0, zb], [wb, y1, zb], [-wb, y1, zb], rects.end);
    return quads;
  }

  function fromQuads(quads) {
    const positions = [], uvs = [], indices = [];
    for (const [a, b, c, d, r] of quads) {
      const base = positions.length / 3;
      positions.push(...a, ...b, ...c, ...d);
      uvs.push(r[0], r[1], r[2], r[1], r[2], r[3], r[0], r[3]);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const geometry = new kit.Geometry();
    geometry.setAttribute('position', new kit.Attribute(new Float32Array(positions), 3));
    geometry.setAttribute('uv', new kit.Attribute(new Float32Array(uvs), 2));
    geometry.setIndex(indices);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  function paintCoffin(wood, trim, emblem) {
    return (ctx, n) => {
      const h = n / 2;
      const planks = (x, y, w, hh, across) => {
        fill(ctx, x, y, w, hh, wood[0]);
        ctx.fillStyle = wood[1];
        for (let i = 1; i < 5; i++) across ? ctx.fillRect(x, y + (i / 5) * hh - 1, w, 2) : ctx.fillRect(x + (i / 5) * w - 1, y, 2, hh);
      };
      // lid (top-left): planks along the length, a border and a cross
      planks(0, 0, h, h, false);
      ctx.strokeStyle = trim; ctx.lineWidth = n * 0.02; ctx.strokeRect(n * 0.03, n * 0.03, h - n * 0.06, h - n * 0.06);
      fill(ctx, h * 0.46, h * 0.18, h * 0.08, h * 0.64, trim); fill(ctx, h * 0.3, h * 0.34, h * 0.4, h * 0.08, trim);
      // sides (top-right): planks, handles, a dark skirt at the bottom
      planks(h, 0, h, h, true);
      ctx.strokeStyle = trim; ctx.lineWidth = n * 0.02; ctx.strokeRect(h + n * 0.02, n * 0.02, h - n * 0.04, h * 0.8);
      for (const x of [0.2, 0.5, 0.8]) { ctx.beginPath(); ctx.arc(h + x * h, h * 0.42, h * 0.07, 0, Math.PI); ctx.stroke(); }
      fill(ctx, h, h * 0.86, h, h * 0.14, '#0d0718');
      // ends (bottom-left): planks and a glowing face
      planks(0, h, h, h, true);
      ctx.shadowColor = emblem; ctx.shadowBlur = n * 0.05;
      jackFace(ctx, h * 0.5, h + h * 0.42, h * 0.3, emblem, '#1a0a00');
      ctx.shadowBlur = 0;
    };
  }

  // The ramp is a long shallow wedge. Nothing in this world is lit, so the slope has to be painted on:
  // the deck brightens towards the top, every board casts a line of shadow, arrows point uphill and the
  // flanks are dark, fading to black at the ground.
  function paintRamp(ctx, n) {
    const h = n / 2, boards = 14;
    const deck = ctx.createLinearGradient(0, n, 0, 0);
    deck.addColorStop(0, '#4a2f1a'); deck.addColorStop(0.5, '#a9763c'); deck.addColorStop(1, '#f1c27a');
    ctx.fillStyle = deck; ctx.fillRect(0, 0, h, n);
    for (let i = 0; i < boards; i++) {
      const y = (i / boards) * n;
      fill(ctx, 0, y, h, n * 0.012, 'rgba(255,236,190,0.35)');
      fill(ctx, 0, y + n / boards - n * 0.022, h, n * 0.022, 'rgba(20,8,2,0.6)');
    }
    ctx.strokeStyle = '#ff8c1a'; ctx.lineWidth = n * 0.035; ctx.lineJoin = 'miter';
    for (let i = 0; i < 4; i++) {
      const y = n * (0.2 + i * 0.22);
      ctx.beginPath(); ctx.moveTo(h * 0.3, y); ctx.lineTo(h * 0.5, y - n * 0.07); ctx.lineTo(h * 0.7, y); ctx.stroke();
    }
    fill(ctx, 0, 0, h * 0.09, n, '#2a1709'); fill(ctx, h * 0.91, 0, h * 0.09, n, '#2a1709');
    // flank (top-right)
    const flank = ctx.createLinearGradient(0, 0, 0, h);
    flank.addColorStop(0, '#3d2616'); flank.addColorStop(1, '#090410');
    ctx.fillStyle = flank; ctx.fillRect(h, 0, h, h);
    // tall back end (bottom-right)
    fill(ctx, h, h, h, h, '#3d2616');
    ctx.fillStyle = '#261509';
    for (let i = 1; i < 5; i++) ctx.fillRect(h + (i / 5) * h - 1, h, 2, h);
  }

  const RAMP = { foot: -36.5, top: 28, low: 0.6, high: 29, half: 8.6 };
  let rampMaterial = null;
  function ramp() {
    if (!rampMaterial) rampMaterial = material(canvasTexture(256, paintRamp), { side: 2 });
    const { foot, top, low, high, half } = RAMP;
    const flank = (x) => [[x, low, foot], [x, low, top], [x, high, top], [x, low, foot], Q.b];
    const quads = [
      [[-half, low, foot], [half, low, foot], [half, high, top], [-half, high, top], [0, 0, 0.5, 1]],
      flank(half), flank(-half),
      [[-half, low, top], [half, low, top], [half, high, top], [-half, high, top], Q.d],
    ];
    return { geometry: fromQuads(quads), material: rampMaterial };
  }

  const COFFIN = { lid: Q.a, side: Q.b, end: Q.c };
  const SKIRT = { lid: [0.5, 0.5, 1, 0.56], side: [0.5, 0.5, 1, 0.56], end: [0.5, 0.5, 1, 0.56] };
  let coffinMaterials = null;
  function coffin(kind) {
    if (!coffinMaterials) {
      coffinMaterials = {
        coffin: material(canvasTexture(256, paintCoffin(['#5a3a24', '#3d2616'], '#e2a84a', '#ffb62e')), { side: 2 }),
        hearse: material(canvasTexture(256, paintCoffin(['#3b2157', '#261238'], '#c9c2dc', '#9bf04a')), { side: 2 }),
      };
    }
    // Shoulders near one end, tapering to the foot: the classic coffin outline seen from above.
    const quads = [
      ...loft([[-28, 6.2], [-12, 9.8], [28, 6.8]], 8, 28, COFFIN),
      ...loft([[-27, 8.4], [27, 8.4]], 2.4, 8, SKIRT),
    ];
    return { geometry: fromQuads(quads), material: coffinMaterials[kind] };
  }

  Object.assign(recipes, {
    train_cargo01_low: () => coffin('coffin'),
    train_cargo02_low: () => coffin('coffin'),
    train_freight_low: () => coffin('coffin'),
    train_standard_wagon_low: () => coffin('coffin'),
    train_sub_wagon_low: () => coffin('coffin'),
    train_ramp_low: () => ramp(),
    train_standard_low: () => coffin('hearse'),
    train_sub_low: () => coffin('hearse'),
  });

  // Mystery-box prizes: jewels, records, tapes, chains and trophies all become sweets.
  const PRIZE_MODELS = /^(sapphire|emerald|ruby|diamond|gold|moneyBag|goldSkull|discoBall|microphone|antlers|goldHeadPhones|goldChain\w*|\w+Ring|tape_\w+|lp_\w+|can_\w+|unlocker_\w+|toprun\w+|\w+_star|\w+_medal|headstartToken|ScoreBooster|boost\d)$/;
  const TREAT_COLOURS = window.REMIX.COLOURS.treats;
  function treat(name) {
    let hash = 0;
    for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    const [a, b] = TREAT_COLOURS[hash % TREAT_COLOURS.length];
    const kind = (hash >>> 3) % 3;
    if (kind === 0) {
      // Wrapped sweet
      return { paint: (ctx, n) => { stripes(ctx, 0, 0, n / 2, n / 2, [a, b], 0.6); fill(ctx, n / 2, 0, n / 2, n / 2, '#ffe9a8'); }, parts: [[shapes.ball, placed(0, 0, 0, 0, 0, 0, 2.4, 2, 1.7), Q.a], [shapes.cone, placed(3.8, 0, 0, 0, 0, HALF_PI, 1.8, 2.1, 1.4), Q.b], [shapes.cone, placed(-3.8, 0, 0, 0, 0, -HALF_PI, 1.8, 2.1, 1.4), Q.b]] };
    }
    if (kind === 1) {
      // Lollipop
      return { paint: (ctx, n) => { stripes(ctx, 0, 0, n / 2, n / 2, [a, b], 1.2); fill(ctx, n / 2, 0, n / 2, n / 2, '#fff3dc'); }, parts: [[shapes.ball, placed(0, 1.2, 0, HALF_PI, 0, 0, 2.8, 0.9, 2.8), Q.a], [shapes.tube, placed(0, -4, 0, 0, 0, 0, 0.3, 3.2, 0.3), Q.b]] };
    }
    // Candy corn
    return { paint: (ctx, n) => { fill(ctx, 0, 0, n / 2, n / 6, '#fff3dc'); fill(ctx, 0, n / 6, n / 2, n / 6, a); fill(ctx, 0, n / 3, n / 2, n / 6, '#ffe873'); }, parts: [[shapes.cone, placed(0, -3, 0, 0, 0, 0, 2.6, 6, 1.6), Q.a]] };
  }

  const pickups = new Map();   // model name -> { geometry, material } or null when the model is left alone
  function pickup(name) {
    if (pickups.has(name)) return pickups.get(name);
    if (!shapes) makeShapes();
    const letter = /^([A-Z])(_Golden)?$/.exec(name);
    const recipe = letter ? letterTile(letter[1], !!letter[2]) : recipes[name] ? recipes[name]() : PRIZE_MODELS.test(name) ? treat(name) : null;
    const made = !recipe ? null : recipe.geometry ? recipe : { geometry: merge(recipe.parts), material: material(recipe.full ? canvasTexture(128, recipe.paint) : shaded(128, recipe.paint), { side: 2 }) };
    pickups.set(name, made);
    return made;
  }

  function within(value, range) { return value >= range[0] && value <= range[1]; }

  // Graffiti gear from the source game: named props, the kit bag on the start line and the can in the hero's hand.
  const KIT_BAG = { w: [3.5, 4.6], h: [2.4, 3.6], l: [6.4, 7.6] };
  const HELD_CAN = { w: [0.6, 1.4], h: [1.5, 2.5], l: [0.6, 1.4] };
  function sized(mesh, shape) {
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox;
    return within(box.max.x - box.min.x, shape.w) && within(box.max.y - box.min.y, shape.h) && within(box.max.z - box.min.z, shape.l);
  }

  // The detailed train and barrier models are not in the registry; they are recognised by size.
  const SIZED = [
    ['train_ramp_low', { w: [18, 22], h: [24, 32], l: [61, 66] }],
    ['train_standard_low', { w: [18, 22], h: [24, 32], l: [58.5, 60.9] }],
    ['train_cargo01_low', { w: [18, 22], h: [24, 32], l: [50, 58.5] }],
    ['track', { w: [19, 21], h: [5, 7], l: [170, 190] }],
    ['barrier_low', { w: [18, 22], h: [13, 19], l: [12, 18] }],
    ['barrier_high', { w: [18, 22], h: [28, 34], l: [12, 18] }],
  ];
  function sizedName(mesh) {
    const image = mesh.material && mesh.material.map && mesh.material.map.image;
    if (!image || !ENV_ATLAS.test(image.src || '')) return null;
    for (const [name, shape] of SIZED) if (sized(mesh, shape)) return name;
    return null;
  }

  // Gravestone to jump over, cemetery gate to roll under; built to the size of the barrier they replace.
  let barrierMaterial = null;
  function stoneMaterial() {
    if (!barrierMaterial) {
      barrierMaterial = material(canvasTexture(256, (ctx, n) => {
        const h = n / 2;
        fill(ctx, 0, 0, h, h, '#9d95b5');
        ctx.strokeStyle = '#5b4a80'; ctx.lineWidth = n * 0.02; ctx.strokeRect(n * 0.03, n * 0.03, h - n * 0.06, h - n * 0.06);
        ctx.fillStyle = '#2a1247'; ctx.font = '900 ' + h * 0.36 + 'px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('R.I.P', h / 2, h * 0.45);
        fill(ctx, h, 0, h, h, '#6f6788');
        fill(ctx, 0, h, h, h, '#241536');
        ctx.fillStyle = '#ff8c1a'; ctx.font = '900 ' + h * 0.22 + 'px system-ui,sans-serif';
        ctx.fillText('KEEP OUT', h / 2, h * 1.5);
        fill(ctx, h, h, h, h, '#16101f');
      }), { side: 2 });
    }
    return barrierMaterial;
  }

  function barrier(mesh, high) {
    stoneMaterial();
    const box = mesh.geometry.boundingBox;
    const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2, y0 = box.min.y, y1 = box.max.y;
    const half = (box.max.x - box.min.x) / 2;
    const at = (quads) => quads.map(([a, b, c, d, r]) => [a, b, c, d].map(([x, y, z]) => [x + cx, y, z + cz]).concat([r]));
    const STONE = { lid: Q.b, side: Q.b, end: Q.a }, IRON = { lid: Q.d, side: Q.d, end: Q.d }, SIGN = { lid: Q.d, side: Q.d, end: Q.c };
    const quads = high
      ? [...loft([[-1.2, half], [1.2, half]], y1 - 8, y1, SIGN), ...[-1, 1].flatMap((side) => loft([[-1.2, 1.3], [1.2, 1.3]], y0, y1 - 8, IRON).map(([a, b, c, d, r]) => [a, b, c, d].map(([x, y, z]) => [x + side * (half - 1.3), y, z]).concat([r])))]
      : [-1, 0, 1].flatMap((slot) => loft([[-1.4, half * 0.27], [1.4, half * 0.27]], y0, y0 + (y1 - y0) * (slot ? 0.82 : 1), STONE).map(([a, b, c, d, r]) => [a, b, c, d].map(([x, y, z]) => [x + slot * half * 0.66, y, z]).concat([r])));
    return { geometry: fromQuads(at(quads)), material: barrierMaterial };
  }

  // One lane of graveyard path in place of a rail segment: packed earth with stepping stones.
  // The game's shader ignores texture alpha, so the rails are removed as geometry, not painted out.
  let pathMaterial = null;
  function path(mesh) {
    if (!pathMaterial) {
      pathMaterial = material(canvasTexture(128, (ctx, n) => {
        const h = n / 2;
        fill(ctx, 0, 0, h, h, '#3a3050');
        ctx.fillStyle = '#463a60';
        for (let i = 0; i < 40; i++) ctx.fillRect(((i * 37) % 61) / 61 * h, ((i * 53) % 59) / 59 * h, 3, 2);
        fill(ctx, h, 0, h, h, '#a79dc2');
        ctx.strokeStyle = '#6f6490'; ctx.lineWidth = 3; ctx.strokeRect(h + 3, 3, h - 6, h - 6);
        fill(ctx, 0, h, h, h, '#2a2238');
      }), { side: 2 });
    }
    const box = mesh.geometry.boundingBox;
    // The rails themselves are baked into the scenery meshes, so the path lies just above them and covers them.
    const x0 = box.min.x, x1 = box.max.x, z0 = box.min.z, z1 = box.max.z, top = box.max.y + 0.08, floor = box.min.y;
    const quads = [
      [[x0, top, z0], [x1, top, z0], [x1, top, z1], [x0, top, z1], Q.a],
      [[x0, floor, z0], [x0, floor, z1], [x0, top, z1], [x0, top, z0], Q.c],
      [[x1, floor, z1], [x1, floor, z0], [x1, top, z0], [x1, top, z1], Q.c],
    ];
    const cx = (x0 + x1) / 2, step = 12;
    for (let z = z0 + step / 2, i = 0; z < z1; z += step, i++) {
      const half = 5.2 + (i % 3) * 0.6, lean = (i % 2 ? 0.5 : -0.5), y = top + 0.12;
      quads.push([[cx - half, y, z - 2.6 + lean], [cx + half, y, z - 2.6 - lean], [cx + half, y, z + 2.6 - lean], [cx - half, y, z + 2.6 + lean], Q.b]);
    }
    return { geometry: fromQuads(quads), material: pathMaterial };
  }

  /* ---------- graveyard scenery in place of the market street ---------- */

  const SCENERY = /^(low|med|high)_\d+_(left|right)/;
  const SOURCE_DECOR = /^(Monkey_On_SkateBoard|Boat1|Flag_\d+|Gas_sign)/;
  const CELL = (col, row) => [col / 4 + 0.004, 1 - (row + 1) / 4 + 0.004, (col + 1) / 4 - 0.004, 1 - row / 4 - 0.004];
  const SPRITE = { tree: CELL(0, 0), cross: CELL(1, 0), slab: CELL(2, 0), pumpkin: CELL(3, 0), fence: CELL(0, 1), house: CELL(1, 1), crypt: CELL(2, 1), lamp: CELL(3, 1), hill: CELL(0, 2), shrub: CELL(1, 2), tower: CELL(2, 2) };

  function paintSprites(ctx, n) {
    const c = n / 4, INK = '#150c22', EDGE = '#3b2a5e', STONE = '#a79dc2', STONE_DARK = '#6f6490';
    const cell = (col, row, draw) => { ctx.save(); ctx.translate(col * c, row * c); ctx.beginPath(); ctx.rect(0, 0, c, c); ctx.clip(); draw(); ctx.restore(); };
    ctx.clearRect(0, 0, n, n);
    ctx.lineCap = 'round';
    cell(0, 0, () => {   // dead tree
      const limb = (x0, y0, x1, y1, w) => { ctx.strokeStyle = INK; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0 * c, y0 * c); ctx.lineTo(x1 * c, y1 * c); ctx.stroke(); ctx.strokeStyle = EDGE; ctx.lineWidth = Math.max(1, w * 0.25); ctx.beginPath(); ctx.moveTo(x0 * c - w * 0.3, y0 * c); ctx.lineTo(x1 * c - w * 0.3, y1 * c); ctx.stroke(); };
      limb(0.5, 1, 0.5, 0.45, c * 0.09); limb(0.5, 0.55, 0.2, 0.25, c * 0.05); limb(0.5, 0.48, 0.82, 0.2, c * 0.05); limb(0.2, 0.25, 0.08, 0.1, c * 0.025);
      limb(0.2, 0.25, 0.3, 0.06, c * 0.025); limb(0.82, 0.2, 0.95, 0.08, c * 0.025); limb(0.82, 0.2, 0.7, 0.04, c * 0.025); limb(0.5, 0.45, 0.48, 0.12, c * 0.035);
    });
    cell(1, 0, () => {   // stone cross
      ctx.fillStyle = STONE; ctx.fillRect(c * 0.4, c * 0.12, c * 0.2, c * 0.8); ctx.fillRect(c * 0.2, c * 0.3, c * 0.6, c * 0.18);
      ctx.fillStyle = STONE_DARK; ctx.fillRect(c * 0.54, c * 0.12, c * 0.06, c * 0.8); ctx.fillRect(c * 0.2, c * 0.44, c * 0.6, c * 0.04); ctx.fillRect(c * 0.25, c * 0.9, c * 0.5, c * 0.1);
    });
    cell(2, 0, () => {   // round-top gravestone
      ctx.fillStyle = STONE; ctx.beginPath(); ctx.arc(c * 0.5, c * 0.42, c * 0.32, Math.PI, 0); ctx.lineTo(c * 0.82, c); ctx.lineTo(c * 0.18, c); ctx.fill();
      ctx.fillStyle = STONE_DARK; ctx.fillRect(c * 0.74, c * 0.42, c * 0.08, c * 0.58);
      ctx.fillStyle = '#2a1247'; ctx.font = '900 ' + c * 0.2 + 'px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.fillText('RIP', c * 0.48, c * 0.55);
    });
    cell(3, 0, () => {   // jack-o'-lantern
      for (const dx of [-0.18, 0.18, 0]) { ctx.fillStyle = dx ? '#d9600a' : '#f07c12'; ctx.beginPath(); ctx.ellipse(c * (0.5 + dx), c * 0.62, c * 0.22, c * 0.3, 0, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#4f6b1f'; ctx.fillRect(c * 0.46, c * 0.2, c * 0.08, c * 0.16);
      ctx.shadowColor = '#ffe873'; ctx.shadowBlur = c * 0.06; jackFace(ctx, c * 0.5, c * 0.56, c * 0.27, '#ffe873', '#7a3a06'); ctx.shadowBlur = 0;
    });
    cell(0, 1, () => {   // iron fence, tiles sideways
      ctx.fillStyle = INK; ctx.fillRect(0, c * 0.35, c, c * 0.05); ctx.fillRect(0, c * 0.8, c, c * 0.05);
      for (let i = 0; i < 6; i++) { const x = (i + 0.5) / 6 * c; ctx.fillRect(x - c * 0.02, c * 0.16, c * 0.04, c * 0.84); ctx.beginPath(); ctx.moveTo(x - c * 0.05, c * 0.18); ctx.lineTo(x, c * 0.02); ctx.lineTo(x + c * 0.05, c * 0.18); ctx.fill(); }
    });
    cell(1, 1, () => {   // haunted house
      ctx.fillStyle = INK; ctx.fillRect(c * 0.14, c * 0.45, c * 0.72, c * 0.55); ctx.fillRect(c * 0.6, c * 0.2, c * 0.2, c * 0.5);
      const roof = (x0, x1, y, peak) => { ctx.beginPath(); ctx.moveTo(c * x0, c * y); ctx.lineTo(c * (x0 + x1) / 2, c * peak); ctx.lineTo(c * x1, c * y); ctx.fill(); };
      roof(0.08, 0.92, 0.47, 0.22); roof(0.56, 0.84, 0.22, 0.02);
      ctx.fillStyle = EDGE; ctx.fillRect(c * 0.14, c * 0.45, c * 0.03, c * 0.55);
      ctx.shadowColor = '#ff8c1a'; ctx.shadowBlur = c * 0.05; ctx.fillStyle = '#ffb347';
      for (const [x, y] of [[0.24, 0.58], [0.42, 0.58], [0.66, 0.32], [0.66, 0.6], [0.3, 0.8]]) ctx.fillRect(c * x, c * y, c * 0.09, c * 0.12);
      ctx.shadowBlur = 0; ctx.fillStyle = '#0a0612'; ctx.fillRect(c * 0.46, c * 0.78, c * 0.12, c * 0.22);
    });
    cell(2, 1, () => {   // crypt
      ctx.fillStyle = STONE_DARK; ctx.fillRect(c * 0.12, c * 0.4, c * 0.76, c * 0.6);
      ctx.fillStyle = STONE; ctx.beginPath(); ctx.moveTo(c * 0.06, c * 0.42); ctx.lineTo(c * 0.5, c * 0.14); ctx.lineTo(c * 0.94, c * 0.42); ctx.fill();
      for (const x of [0.16, 0.74]) ctx.fillRect(c * x, c * 0.42, c * 0.1, c * 0.58);
      ctx.fillStyle = '#0a0612'; ctx.beginPath(); ctx.arc(c * 0.5, c * 0.68, c * 0.14, Math.PI, 0); ctx.lineTo(c * 0.64, c); ctx.lineTo(c * 0.36, c); ctx.fill();
    });
    cell(3, 1, () => {   // lamp post
      ctx.fillStyle = INK; ctx.fillRect(c * 0.47, c * 0.3, c * 0.06, c * 0.7); ctx.fillRect(c * 0.4, c * 0.94, c * 0.2, c * 0.06);
      const glow = ctx.createRadialGradient(c * 0.5, c * 0.2, 0, c * 0.5, c * 0.2, c * 0.3); glow.addColorStop(0, 'rgba(255,200,110,.95)'); glow.addColorStop(0.3, 'rgba(255,140,26,.55)'); glow.addColorStop(1, 'rgba(255,140,26,0)');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, c, c * 0.6);
      ctx.fillStyle = INK; ctx.fillRect(c * 0.42, c * 0.08, c * 0.16, c * 0.03); ctx.fillRect(c * 0.42, c * 0.3, c * 0.16, c * 0.03);
    });
    cell(0, 2, () => {   // distant hill line, tiles sideways
      ctx.fillStyle = '#0d0718'; ctx.beginPath(); ctx.moveTo(0, c);
      for (let i = 0; i <= 32; i++) ctx.lineTo((i / 32) * c, c * (0.55 - 0.18 * Math.sin((i / 32) * Math.PI * 2) - 0.06 * Math.sin((i / 32) * Math.PI * 6)));
      ctx.lineTo(c, c); ctx.fill();
    });
    cell(1, 2, () => {   // dead shrub
      ctx.strokeStyle = INK; ctx.lineWidth = c * 0.03;
      for (let i = 0; i < 9; i++) { const a = Math.PI * (0.15 + 0.7 * i / 8); ctx.beginPath(); ctx.moveTo(c * 0.5, c); ctx.quadraticCurveTo(c * (0.5 - 0.2 * Math.cos(a)), c * 0.7, c * (0.5 - 0.45 * Math.cos(a)), c * (1 - 0.75 * Math.sin(a))); ctx.stroke(); }
    });
    cell(2, 2, () => {   // far tower
      ctx.fillStyle = '#0d0718'; ctx.fillRect(c * 0.38, c * 0.3, c * 0.24, c * 0.7); ctx.beginPath(); ctx.moveTo(c * 0.32, c * 0.32); ctx.lineTo(c * 0.5, c * 0.02); ctx.lineTo(c * 0.68, c * 0.32); ctx.fill();
      ctx.fillStyle = '#ffb347'; ctx.fillRect(c * 0.46, c * 0.42, c * 0.08, c * 0.1);
    });
  }

  let sceneryMaterials = null;
  const sceneryParts = new Map();   // model name -> { ground, sprites }
  function buildScenery(name, box) {
    let seed = 0;
    for (const char of name) seed = (seed * 31 + char.charCodeAt(0)) >>> 0;
    const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const z0 = box.min.z, z1 = box.max.z, length = z1 - z0;
    const side = (box.min.x + box.max.x) / 2 >= 0 ? 1 : -1;
    const outer = side > 0 ? box.max.x : box.min.x;
    const coversLanes = box.min.x <= -25 && box.max.x >= 25;
    const tall = /^high/.test(name) ? 2 : /^med/.test(name) ? 1 : 0;

    // Opaque part: lawn out to the horizon, plus the lane bed where this model used to carry it.
    const LAWN = Q.a, DIRT = Q.b, KERB = Q.c;
    const flat = (xa, xb, y, rect) => [[Math.min(xa, xb), y, z0], [Math.max(xa, xb), y, z0], [Math.max(xa, xb), y, z1], [Math.min(xa, xb), y, z1], rect];
    const ground = [flat(side * 32, outer, 0.4, LAWN), flat(side * 30, side * 32, 0.4, KERB), [[side * 30, -6, z0], [side * 30, -6, z1], [side * 30, 0.4, z1], [side * 30, 0.4, z0], KERB]];
    if (coversLanes) ground.push(flat(-30, 30, -0.15, DIRT), flat(-side * 30, -side * 32, 0.4, KERB));

    // Sprites: far ones first, so nearer ones draw over them.
    const sprites = [];
    const across = (cx, y, z, w, h, rect) => sprites.push([z, [[cx - w / 2, y, z], [cx + w / 2, y, z], [cx + w / 2, y + h, z], [cx - w / 2, y + h, z], rect]]);
    const along = (x, y, z, w, h, rect) => sprites.push([z, [[x, y, z - w / 2], [x, y, z + w / 2], [x, y + h, z + w / 2], [x, y + h, z - w / 2], rect]]);
    const spot = (near, far) => [side * (near + random() * (far - near)), z0 + random() * length];
    for (let z = z0; z < z1 - 1; z += 18) along(side * 33.5, 0.4, z + 9, 18, 9, SPRITE.fence);
    for (let z = z0; z < z1 - 1; z += 180) across(side * 420, 0.4, z + 90, 520, 120, SPRITE.hill);
    for (let i = 0; i < 9; i++) { const [x, z] = spot(38, 78); const kind = random() < 0.5 ? SPRITE.slab : SPRITE.cross; across(x, 0.4, z, 7, 9, kind); along(x, 0.4, z, 3, 9, kind); }
    for (let i = 0; i < 5; i++) { const [x, z] = spot(37, 70); across(x, 0.4, z, 6.5, 6.5, SPRITE.pumpkin); along(x, 0.4, z, 6.5, 6.5, SPRITE.pumpkin); }
    for (let i = 0; i < 3; i++) { const [x, z] = spot(36, 44); across(x, 0.4, z, 9, 24, SPRITE.lamp); }
    for (let i = 0; i < 5; i++) { const [x, z] = spot(60, 170); const h = 40 + random() * 26; across(x, 0.4, z, h * 0.75, h, SPRITE.tree); along(x, 0.4, z, h * 0.75, h, SPRITE.tree); }
    for (let i = 0; i < 4; i++) { const [x, z] = spot(45, 120); across(x, 0.4, z, 12, 9, SPRITE.shrub); }
    for (let i = 0; i < 1 + tall; i++) { const [x, z] = spot(85, 150); across(x, 0.4, z, 34, 30, SPRITE.crypt); along(x - side * 17, 0.4, z + 14, 28, 22, SPRITE.crypt); }
    for (let i = 0; i < tall; i++) { const [x, z] = spot(150, 260); const h = 90 + tall * 30 + random() * 30; across(x, 0.4, z, h * 0.9, h, SPRITE.house); }
    for (let i = 0; i < 2; i++) { const [x, z] = spot(260, 380); across(x, 0.4, z, 50, 110 + random() * 50, SPRITE.tower); }
    sprites.sort((a, b) => b[0] - a[0]);
    return { ground: fromQuads(ground), sprites: fromQuads(sprites.map((entry) => entry[1])) };
  }

  function dressScenery(mesh, name) {
    if (!sceneryMaterials) {
      sceneryMaterials = {
        ground: material(canvasTexture(64, (ctx, n) => {
          const h = n / 2;
          fill(ctx, 0, 0, h, h, '#1e2a2a');
          ctx.fillStyle = '#263636'; for (let i = 0; i < 30; i++) ctx.fillRect(((i * 37) % 31) / 31 * h, ((i * 53) % 29) / 29 * h, 2, 1);
          fill(ctx, h, 0, h, h, '#3a3050');
          fill(ctx, 0, h, h, h, '#6f6490');
        }), { side: 2 }),
        sprites: material(canvasTexture(512, paintSprites), { transparent: true, side: 2, depthWrite: false }),
      };
    }
    if (!sceneryParts.has(name)) {
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      sceneryParts.set(name, buildScenery(name, mesh.geometry.boundingBox));
    }
    const parts = sceneryParts.get(name);
    mesh.geometry = parts.ground;
    mesh.material = sceneryMaterials.ground;
    // The sprite layer is a child so it follows the pooled mesh; swap it if the mesh changed model.
    let layer = mesh.userData.hollowSprites;
    if (!layer) {
      layer = new kit.Mesh(parts.sprites, sceneryMaterials.sprites);
      layer.renderOrder = 1;
      layer.frustumCulled = false;
      kit.Mesh.prototype.add.call(mesh, layer);
      mesh.userData.hollowSprites = layer;
    } else layer.geometry = parts.sprites;
  }

  /* ---------- special sections: lane gates, tunnels, stations, bridges ---------- */

  // Lane gates: a wall across the lanes with some lanes left open. Which lanes are open is read
  // from the source model, so the replacement always blocks exactly the same lanes.
  const LANE_GATE = /^gates_(mid|left|right|sides)$/;
  const LANES = [-20, 0, 20];
  const gates = new Map();
  function gate(name, source) {
    if (gates.has(name)) return gates.get(name);
    const P = source.attributes.position;
    const blockedAt = LANES.map(() => Infinity);
    for (let i = 0; i < P.count; i++) {
      const y = P.getY(i);
      if (y <= 3 || y >= 24) continue;
      LANES.forEach((lane, index) => { if (Math.abs(P.getX(i) - lane) < 7) blockedAt[index] = Math.min(blockedAt[index], P.getZ(i)); });
    }
    if (!source.boundingBox) source.computeBoundingBox();
    const front = Math.min(...blockedAt.filter(Number.isFinite), source.boundingBox.min.z + 60);
    const back = source.boundingBox.max.z;
    const shift = (quads, dx) => quads.map(([a, b, c, d, r]) => [a, b, c, d].map(([x, y, z]) => [x + dx, y, z]).concat([r]));
    const WALL = { lid: Q.b, side: Q.b, end: Q.c }, STONE = { lid: Q.b, side: Q.b, end: Q.b }, DARK = { lid: Q.d, side: Q.d, end: Q.d };
    const quads = [];
    LANES.forEach((lane, index) => { if (Number.isFinite(blockedAt[index])) quads.push(...shift(loft([[front, 10], [front + 5, 10]], 0, 30, WALL), lane)); });
    // A row of stone frames carries the corridor to the end of the section.
    for (let z = front; z <= back; z += Math.max(40, (back - front) / 3)) {
      quads.push(...loft([[z, 37], [z + 5, 37]], 30, 40, STONE));
      for (const side of [-1, 1]) quads.push(...shift(loft([[z, 3.5], [z + 5, 3.5]], 0, 46, STONE), side * 33.5));
      for (const edge of [-10, 10]) quads.push(...shift(loft([[z, 1], [z + 5, 1]], 0, 30, DARK), edge));
    }
    const made = { geometry: fromQuads(quads), material: stoneMaterial() };
    gates.set(name, made);
    return made;
  }

  // Wide structural scenery (tunnel hall, station, bridge, gate building) keeps its shape, because
  // the lanes run through it, but is drawn in bare stone instead of the source game's colours.
  const STRUCTURE = /^(gates_base|epic_|pillars_|pillar$|station_|tube$|track_gates$|Extra_0\d)/;
  const CRYPT_SKIN = 'bundles/bali/game-idle/environment-crypt.webp';
  let cryptImage = null, cryptSource = null, cryptMaterial = null;
  function loadCryptSkin() {
    const image = new Image();
    image.onload = () => { cryptImage = image; };
    image.onerror = () => console.error('Hollow Run: the stone texture failed to load: ' + CRYPT_SKIN);
    image.src = CRYPT_SKIN;
  }

  function dressStructure(mesh) {
    if (cryptSource !== mesh.material) {
      cryptMaterial = reskin(mesh.material, new kit.Texture(cryptImage));
      cryptSource = mesh.material;
    }
    mesh.material = cryptMaterial;
  }

  const barriers = new Map();
  // Pooled meshes are handed their original geometry again when reused, so this runs every scan.
  function swapPickup(mesh) {
    const name = modelName(mesh.geometry) || sizedName(mesh);
    if (name && SCENERY.test(name)) { dressScenery(mesh, name); return true; }
    if (name && SOURCE_DECOR.test(name)) { hide(mesh); return true; }
    if (name && STRUCTURE.test(name)) {
      // The stone texture loads asynchronously; look at this mesh again once it is there.
      if (!cryptImage) { seen.delete(mesh); return false; }
      if (mesh.material !== cryptMaterial) dressStructure(mesh);
      return true;
    }
    let made = null;
    if (name === 'barrier_low' || name === 'barrier_high' || /^track(_shadow_(start|mid|end|start_end))?$/.test(name || '')) {
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox;
      const kind = name.startsWith('track') ? 'track' : name;
      const key = kind + ':' + [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z].map((v) => v.toFixed(1)).join(',');
      if (!barriers.has(key)) barriers.set(key, kind === 'track' ? path(mesh) : barrier(mesh, kind === 'barrier_high'));
      made = barriers.get(key);
    } else if (name && LANE_GATE.test(name)) made = gate(name, mesh.geometry);
    else if (name) made = pickup(name);
    if (!made) return false;
    mesh.geometry = made.geometry;
    mesh.material = made.material;
    return true;
  }

  // The bag of spray cans on the start line is registered under the start train's name.
  const START_BAG = { w: [3.5, 5], h: [2.4, 3.6], l: [5, 7.6] };
  function isSourceProp(mesh) {
    const model = modelName(mesh.geometry) || '';
    if (/^(startScreen_bag|sprayCan$)/.test(model)) return true;
    if (model === 'train_start' && sized(mesh, START_BAG)) return true;
    let node = mesh, held = false;
    for (let i = 0; i < 4 && node; i++, node = node.parent) {
      if (SOURCE_PROPS.test(node.name || '')) return true;
      if (/^attachpoint/i.test(node.name || '')) held = true;
    }
    const image = mesh.material && mesh.material.map && mesh.material.map.image;
    if (!image || !/props-tex/.test(image.src || '')) return false;
    return sized(mesh, KIT_BAG) || (held && sized(mesh, HELD_CAN));
  }

  // The original backdrop (daylight clouds and temple roofs) is drawn in a fixed colour by the
  // game's shader, so it is hidden and a painted night sky takes its place.
  let nightSky = null;
  function paintSky(ctx, n) {
    const w = n, h = n / 4;
    ctx.clearRect(0, 0, n, n);
    const blob = (x, y, r, colour) => { ctx.fillStyle = colour; ctx.beginPath(); ctx.ellipse(x, y, r * 1.9, r, 0, 0, Math.PI * 2); ctx.fill(); };
    ctx.shadowColor = '#ffd98a';
    ctx.shadowBlur = h * 0.25;
    ctx.fillStyle = '#ffeab5';
    ctx.beginPath(); ctx.arc(w * 0.56, h * 0.36, h * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#e8c98a';
    for (const [x, y, r] of [[0.552, 0.3, 0.035], [0.57, 0.44, 0.05], [0.565, 0.27, 0.02]]) { ctx.beginPath(); ctx.arc(w * x, h * y, h * r, 0, Math.PI * 2); ctx.fill(); }
    for (let i = 0; i < 14; i++) {
      const x = ((i * 0.618) % 1) * w, y = h * (0.2 + ((i * 0.37) % 1) * 0.4);
      blob(x, y, h * (0.06 + ((i * 0.29) % 1) * 0.07), i % 2 ? '#3b2a5e' : '#4a3573');
      blob(x + h * 0.14, y + h * 0.05, h * 0.06, '#33244f');
    }
    ctx.fillStyle = '#0d0718';
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i <= 64; i++) ctx.lineTo((i / 64) * w, h * (0.80 - 0.07 * Math.sin(i * 0.7) - 0.04 * Math.sin(i * 2.3)));
    ctx.lineTo(w, h);
    ctx.fill();
    for (let i = 0; i < 9; i++) {
      const x = w * (0.04 + i * 0.115), base = h * 0.78, tall = h * (0.2 + ((i * 0.41) % 1) * 0.16);
      if (i % 3 === 1) {
        ctx.fillRect(x - h * 0.07, base - tall * 0.8, h * 0.14, tall);
        ctx.beginPath(); ctx.moveTo(x - h * 0.1, base - tall * 0.8); ctx.lineTo(x, base - tall * 1.35); ctx.lineTo(x + h * 0.1, base - tall * 0.8); ctx.fill();
        ctx.fillStyle = '#ffb347';
        ctx.fillRect(x - h * 0.02, base - tall * 0.6, h * 0.04, h * 0.05);
        ctx.fillStyle = '#0d0718';
      } else {
        ctx.lineWidth = h * 0.02;
        ctx.strokeStyle = '#0d0718';
        ctx.beginPath();
        ctx.moveTo(x, base); ctx.lineTo(x, base - tall);
        ctx.moveTo(x, base - tall * 0.55); ctx.lineTo(x - h * 0.09, base - tall * 0.95);
        ctx.moveTo(x, base - tall * 0.7); ctx.lineTo(x + h * 0.1, base - tall * 1.05);
        ctx.moveTo(x - h * 0.05, base - tall * 0.78); ctx.lineTo(x - h * 0.11, base - tall * 0.72);
        ctx.stroke();
      }
    }
  }

  function dressSkyline(game) {
    const skyline = game.environment && game.environment.skyline;
    if (!skyline || !kit || dressed.has(skyline)) return;
    let box = null;
    skyline.traverse((node) => {
      if (!node.isMesh) return;
      if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
      box = box || node.geometry.boundingBox;
      // This backdrop is drawn in a pass that ignores layers, so it is switched off directly.
      node.visible = false;
    });
    if (!box) return;
    if (!nightSky) {
      const plane = new kit.Geometry();
      plane.setAttribute('position', new kit.Attribute(new Float32Array([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0]), 3));
      plane.setAttribute('uv', new kit.Attribute(new Float32Array([0, 0.75, 1, 0.75, 1, 1, 0, 1]), 2));
      plane.setIndex([0, 1, 2, 0, 2, 3]);
      plane.computeBoundingSphere();
      nightSky = { plane, material: material(canvasTexture(1024, paintSky), { transparent: true, side: 2, depthWrite: false }) };
    }
    const sky = new kit.Mesh(nightSky.plane, nightSky.material);
    const reach = Math.max(Math.abs(box.min.x), Math.abs(box.max.x));
    sky.position.set(0, box.min.y - (box.max.y - box.min.y) * 0.25, box.min.z);
    sky.scale.set(reach, reach / 2, 1);
    sky.frustumCulled = false;
    sky.renderOrder = -1;
    // Game entities override add() for their component system; use the engine's own.
    kit.Mesh.prototype.add.call(skyline, sky);
    dressed.add(skyline);
  }

  const scenes = new Set();
  const seen = new WeakMap();
  const SOURCE_BODY = /(_head|_mesh|_outfit\d*)$|^eye_|^(guard|dog)$/i;
  let costumeFailed = false;
  // Read-only handle for the browser checks in builder/tests.
  window.__hollowRun = { chasers, scenes, pickup: (name) => pickup(name), gate: (name) => gate(name, window.geometries[name].threeGeometry), get kit() { return kit; }, dressScene: (scene) => dressScene(scene) };
  function dressScene(scene) {
    if (!kit) kit = makeKit(scene);
    if (!kit) return;
    const todo = [];
    scene.traverse((node) => {
      if (!node.isMesh || dressed.has(node)) return;
      if (node.isSkinnedMesh) {
        // Source characters never reach the screen: they are hidden the moment they appear, even
        // if their rig is not ready for the replacement yet.
        if (SOURCE_BODY.test(node.name)) hide(node);
        if (/_head$/i.test(node.name)) todo.push(['hero', node]);
        else if (/^(guard|dog)$/i.test(node.name)) todo.push([node.name.toLowerCase(), node]);
        return;
      }
      // This runs before every frame, so a mesh is only looked at again when its geometry changes
      // (pooled pickups get their original geometry back when reused).
      if (seen.get(node) === node.geometry) return;
      seen.set(node, node.geometry);
      if (swapPickup(node)) return;
      if (isSourceProp(node)) todo.push(['prop', node]);
    });
    for (const [kind, node] of todo) {
      // Rigs are bound a moment after their meshes appear, so a part that is not ready is tried again.
      const tries = (attempts.get(node) || 0) + 1;
      attempts.set(node, tries);
      try {
        let ready = true;
        if (kind === 'hero') ready = dressHero(node);
        else if (kind === 'guard') ready = dressChaser(node);
        else if (kind === 'dog' || kind === 'prop') hide(node);
        if (ready) dressed.add(node);
        else if (tries >= 900) throw new Error('rig never became ready');   // about 15 s of frames
      } catch (error) {
        dressed.add(node);
        console.error('Hollow Run: could not restyle ' + kind + ' mesh "' + node.name + '"', error);
      }
    }
  }

  const scratch = {};
  // Called by the three.js render hook before every draw.
  let skyPatched = null;
  function patchSky(renderer) {
    // The game clears to opaque daylight blue for the world and to transparent for character
    // previews. Only the opaque clear becomes night; forcing it everywhere paints a black box
    // behind the preview on the high-score screen.
    const setClearColor = renderer.setClearColor;
    renderer.setClearColor = function (colour, alpha) {
      return alpha === undefined || alpha >= 1 ? setClearColor.call(this, NIGHT_SKY, 1) : setClearColor.call(this, colour, alpha);
    };
    if (renderer.getClearAlpha() >= 1) renderer.setClearColor(NIGHT_SKY, 1);
    skyPatched = renderer;
  }

  let framesDrawn = 0;
  window.__remixFrame = function (scene, camera, renderer) {
    if (skyPatched !== renderer) patchSky(renderer);
    scenes.add(scene);
    // The loading screen waits for this: on a phone the first frames (shader compiling, building the
    // costume and scenery) take a while, and the canvas is black until they are done.
    if (++framesDrawn === 4) window.__hollowReady = true;
    // Title buttons for trimmed pages are hidden on the frame they appear, not on the next timer tick.
    const title = window.game && window.game.app && window.game.app.title;
    if (title) for (const key of TRIMMED_TITLE_BUTTONS) off(title[key]);
    // Restyle before the frame is drawn, so nothing from the source game shows even for one frame.
    try {
      dressScene(scene);
    } catch (error) {
      if (!costumeFailed) console.error('Hollow Run: the costume layer failed', error);
      costumeFailed = true;
    }
    if (!chasers.length) return;
    if (!scratch.v) { scratch.v = new kit.Vector3(); scratch.q = chasers[0].mesh.quaternion.clone(); }
    const time = performance.now() / 1000;
    for (const chaser of chasers) {
      chaser.anchor.getWorldPosition(scratch.v);
      scratch.v.y += 0.9 + Math.sin(time * 3 + chaser.phase) * 0.45;
      chaser.root.worldToLocal(scratch.v);
      chaser.mesh.position.copy(scratch.v);
      chaser.root.getWorldQuaternion(scratch.q);
      chaser.mesh.quaternion.copy(scratch.q.invert());
      chaser.mesh.rotateZ(Math.sin(time * 2 + chaser.phase) * 0.12);
      chaser.mesh.scale.setScalar(2.1);
    }
  };

  /* ---------- trimmed modules: word hunt, missions, awards, quests, characters, boards ---------- */

  const TRIMMED_TITLE_BUTTONS = ['btnBoards', 'btnMyTour', 'btnMe'];
  const TRIMMED_LABEL_KEYS = ['word-hunt'];
  const TRIMMED_PRIZES = { hoverboard: 150 };   // candy per item
  const HINT_KEY = 'hollow-run:hinted';
  const TRIMMED_SHELF_KEYS = ['hoverboards'];
  const trimmedLabels = new Set();
  const trimmedShelves = new Set();
  function loadTrimmedLabels() {
    for (const lang of ['en', 'pt-br']) {
      fetch('assets/data/lang-' + lang + '.json')
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error('HTTP ' + response.status))))
        .then((copy) => {
          for (const key of TRIMMED_LABEL_KEYS) if (copy[key]) trimmedLabels.add(String(copy[key]).toLowerCase());
          for (const key of TRIMMED_SHELF_KEYS) if (copy[key]) trimmedShelves.add(String(copy[key]).toLowerCase());
        })
        .catch((error) => console.error('Hollow Run: could not read lang-' + lang + '.json, so some trimmed panels may still show', error));
    }
  }

  function off(node) {
    if (!node) return;
    node.visible = false;
    node.renderable = false;
    if ('eventMode' in node) node.eventMode = 'none';
  }

  function labelled(node, depth) {
    if (!node || depth > 4) return false;
    if (typeof node.text === 'string' && trimmedLabels.has(node.text.toLowerCase())) return true;
    return (node.children || []).some((child) => labelled(child, depth + 1));
  }

  let systemsTrimmed = false;
  function trimModules(game) {
    const app = game.app;
    // Screens are built lazily and re-show their parts when opened, so this runs on every tick.
    if (app.title) for (const key of TRIMMED_TITLE_BUTTONS) off(app.title[key]);
    const hud = game.hud;
    if (hud) {
      off(hud.wordDropDownPanel);
      off(hud.missionDropDownPanel);
      if (hud.paused && hud.paused.built) {
        off(hud.paused.missionSection);
        for (const child of hud.paused.children || []) if (labelled(child, 0)) off(child);
      }
    }
    if (app.gameover && app.gameover.built) {
      // The Boosts button sits next to Menu and Play; it is the only one carrying that label.
      const visit = (node, depth) => {
        if (!node || depth > 5) return;
        for (const child of node.children || []) {
          if ((child.children || []).some((part) => typeof part.text === 'string' && trimmedLabels.has(part.text.toLowerCase()))) off(child);
          else visit(child, depth + 1);
        }
      };
      visit(app.gameover, 0);
    }
    // The share-for-treats page lists its rows directly; the hoverboard row goes and the rest close the gap.
    const treats = app.boostShop && app.boostShop.sections && app.boostShop.sections.freestuff;
    if (treats) {
      const rows = (treats.children || []).filter((row) => (row.children || []).length);
      rows.forEach((row, index) => {
        const named = (row.children || []).some((part) => typeof part.text === 'string' && trimmedShelves.has(part.text.toLowerCase()));
        if (!named) return;
        off(row);
        const next = rows[index + 1];
        if (!next || next.y <= row.y) return;
        const pitch = next.y - row.y;
        for (const later of rows.slice(index + 1)) later.y -= pitch;
      });
    }
    if (systemsTrimmed || !game.pickup || !Array.isArray(game.pickup.timedPickups) || !game.missions || !game.controller) return;
    // Word-hunt letters are one of the timed pickups; its class is the one that carries a `letter` field.
    game.pickup.timedPickups = game.pickup.timedPickups.filter((entry) => !Object.values(entry).some((value) => typeof value === 'function' && /\['letter'\]/.test(String(value))));
    for (const method of ['progressMission', 'showNotification']) if (typeof game.missions[method] === 'function') game.missions[method] = function () {};
    // Hoverboards went with the boards page: no double-tap, no action key and no shelf in the shop.
    const shelves = app.shop && app.shop.boosts;
    if (shelves && Array.isArray(shelves.consumables)) shelves.consumables = shelves.consumables.filter((item) => !TRIMMED_PRIZES[item.id]);
    for (const method of ['doubleTapUpdate', 'pressAction']) if (typeof game.controller[method] === 'function') game.controller[method] = function () {};

    // Mystery boxes could hand out hoverboards; those are candy now.
    const sweeten = (prize) => (prize && TRIMMED_PRIZES[prize.type] ? { ...prize, type: 'coins', amount: TRIMMED_PRIZES[prize.type] * (prize.amount || 1) } : prize);
    const screen = app.prizeScreen, user = app.user;
    if (screen && typeof screen.open === 'function') {
      const open = screen.open;
      screen.open = function (options) {
        const patched = options && Array.isArray(options.prizes) ? { ...options, prizes: options.prizes.map(sweeten) } : options;
        return open.call(this, patched, ...Array.prototype.slice.call(arguments, 1));
      };
    }
    if (user && typeof user.openMysteryBox === 'function') {
      const award = user.openMysteryBox;
      user.openMysteryBox = function (prize) { return award.call(this, sweeten(prize)); };
    }

    // The scripted tutorial teaches the hoverboard that no longer exists, so it is skipped and
    // replaced by a one-line hint on the first run.
    if (game.tutorial && user) {
      if (user.tutorial === false) user.tutorial = true;
      if (game.tutorial.enabled) game.tutorial.enabled = false;
    }
    systemsTrimmed = true;
  }

  /* ---------- flow: restart, stages, ending ---------- */

  /* ---------- Sekai feel: haptics and tilt steering ---------- */

  const HAPTICS_KEY = 'hollow-run:haptics', TILT_KEY = 'hollow-run:tilt';
  function stored(key, fallback) {
    try { const value = window.localStorage.getItem(key); return value === null ? fallback : value === '1'; } catch (error) { return fallback; }
  }
  function store(key, on) {
    try { window.localStorage.setItem(key, on ? '1' : '0'); } catch (error) { /* private mode: the choice lasts for this visit */ }
  }
  const feel = { haptics: stored(HAPTICS_KEY, true), tilt: stored(TILT_KEY, false) };

  // Sound name -> [haptic strength, minimum ms since the last buzz]. Haptics ride on the game's own
  // sound cues, so every buzz lands exactly where a sound does.
  const HAPTICS = {
    'pickup-coin': ['selectionClick', 180], 'gui-coin': ['selectionClick', 180], 'gui-tap': ['selectionClick', 60],
    'hero-jump': ['light', 60], 'hero-sneakers-jump': ['light', 60], 'hero-roll': ['light', 60], 'hero-dodge': ['light', 60],
    'pickup-powerup': ['medium', 0], 'pickup-powerdown': ['light', 0], 'special-jetpack-start': ['medium', 0],
    'hero-revive': ['medium', 0], 'open-prize': ['medium', 0], 'unlock': ['medium', 0],
    'hero-stumble': ['heavy', 0], 'hero-death': ['heavy', 0], 'hero-death-hitcam': ['heavy', 0], 'hero-hoverboard-crash': ['heavy', 0], 'guard-catch': ['heavy', 0],
  };
  const BROWSER_BUZZ_MS = { selectionClick: 8, light: 12, medium: 22, heavy: 40 };
  let lastBuzz = 0, buzzFailed = false;
  // Sekai's native haptics. Inside the app the bridge is on the window; inside the feed's frame the
  // shell relays the same request; in a plain browser the Vibration API stands in.
  function buzz(type, gap) {
    if (!feel.haptics) return;
    const now = performance.now();
    if (now - lastBuzz < gap) return;
    lastBuzz = now;
    const message = JSON.stringify({ action: 'vibrate', data: { type } });
    try {
      if (typeof window.sendMessageToFlutter === 'function') {
        const reply = window.sendMessageToFlutter(message);
        if (reply && typeof reply.catch === 'function') reply.catch(() => {});
      } else if (window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === 'function') {
        window.flutter_inappwebview.callHandler('messageHandler', message);
      } else if (window.parent !== window) {
        window.parent.postMessage({ origin: 'sekai_gaming_iframe_api', type: 'gen_vibration', taskId: 'haptic-' + Math.round(now), data: { type } }, '*');
      } else if (typeof navigator.vibrate === 'function') {
        navigator.vibrate(BROWSER_BUZZ_MS[type] || 12);
      }
    } catch (error) {
      if (!buzzFailed) console.error('Hollow Run: haptics failed and are off for this visit', error);
      buzzFailed = true;
      feel.haptics = false;
    }
  }

  function hookHaptics(game) {
    const sound = game.app.sound;
    if (!sound || typeof sound.play !== 'function') { console.error('Hollow Run: the sound player changed; haptics are off.'); return; }
    const play = sound.play;
    sound.play = function (name) {
      const cue = HAPTICS[name];
      if (cue) buzz(cue[0], cue[1]);
      return play.apply(this, arguments);
    };
  }

  // Tilt steering. Roll picks the lane (left, middle, right, measured from where the phone was held
  // when the run began); a quick tip of the top edge towards you jumps, away from you rolls. Swipes
  // and keys keep working, so a sensor that goes quiet never leaves the run without controls.
  const LANE_TILT = 13, LANE_CENTRE = 6, FLICK_RATE = 170, FLICK_REST_MS = 420, LANE_REST_MS = 140;
  const KEY_EVENT = { preventDefault() {} };
  const tilt = { listening: false, seen: false, neutral: null, roll: 0, pitch: 0, rate: 0, at: 0, zone: 0, movedAt: 0, flickedAt: 0, steering: false };
  let tiltGame = null;

  function screenAngle() {
    const angle = window.screen && window.screen.orientation ? window.screen.orientation.angle : window.orientation;
    return ((Number(angle) || 0) % 360 + 360) % 360;
  }

  function onTilt(event) {
    if (event.beta === null || event.gamma === null) return;
    tilt.seen = true;
    // beta tips the phone front-to-back and gamma side-to-side when upright; they trade places in landscape.
    const angle = screenAngle();
    const roll = angle === 90 ? event.beta : angle === 270 ? -event.beta : angle === 180 ? -event.gamma : event.gamma;
    const pitch = angle === 90 ? -event.gamma : angle === 270 ? event.gamma : angle === 180 ? -event.beta : event.beta;
    const now = performance.now();
    const seconds = (now - tilt.at) / 1000;
    if (tilt.at && seconds > 0.004 && seconds < 0.25) tilt.rate = 0.55 * tilt.rate + 0.45 * ((pitch - tilt.pitch) / seconds);
    tilt.roll = roll; tilt.pitch = pitch; tilt.at = now;
    if (tilt.neutral === null) tilt.neutral = roll;
    steer(now);
  }

  function steer(now) {
    const game = tiltGame;
    if (!feel.tilt || !game || game.state !== RUNNING || game.paused || !game.controller) { tilt.steering = false; return; }
    // The first reading of a run (or after a pause) sets "straight ahead" to however the phone is held now.
    if (!tilt.steering) { tilt.steering = true; tilt.neutral = tilt.roll; tilt.zone = 0; tilt.rate = 0; return; }
    const lean = tilt.roll - tilt.neutral;
    if (lean < -LANE_TILT) tilt.zone = -1;
    else if (lean > LANE_TILT) tilt.zone = 1;
    else if (Math.abs(lean) < LANE_CENTRE) tilt.zone = 0;
    const lane = game.hero && game.hero.lane;
    if (lane && typeof lane.lane === 'number' && !lane.changing && tilt.zone !== lane.lane && now - tilt.movedAt > LANE_REST_MS) {
      tilt.movedAt = now;
      if (tilt.zone > lane.lane) game.controller.pressRight(KEY_EVENT); else game.controller.pressLeft(KEY_EVENT);
    }
    if (Math.abs(tilt.rate) > FLICK_RATE && now - tilt.flickedAt > FLICK_REST_MS) {
      tilt.flickedAt = now;
      if (tilt.rate > 0) game.controller.pressUp(KEY_EVENT); else game.controller.pressDown(KEY_EVENT);
      tilt.rate = 0;
    }
  }

  function listenTilt(on) {
    if (on === tilt.listening) return;
    tilt.listening = on;
    if (on) window.addEventListener('deviceorientation', onTilt); else window.removeEventListener('deviceorientation', onTilt);
  }

  // Must run inside a tap: iOS only shows its motion prompt from a user gesture. Resolves to whether
  // the sensor is actually delivering readings, because a frame without permission fails silently.
  function startTilt() {
    const Sensor = window.DeviceOrientationEvent;
    if (!Sensor) return Promise.resolve(false);
    const asked = typeof Sensor.requestPermission === 'function' ? Sensor.requestPermission() : Promise.resolve('granted');
    return asked.then((answer) => {
      if (answer !== 'granted') return false;
      tilt.seen = false;
      listenTilt(true);
      return new Promise((resolve) => setTimeout(() => { if (!tilt.seen) listenTilt(false); resolve(tilt.seen); }, 1200));
    }).catch(() => false);
  }

  function setTilt(on) {
    if (!on) { feel.tilt = false; store(TILT_KEY, false); listenTilt(false); return Promise.resolve(false); }
    return startTilt().then((working) => {
      feel.tilt = working;
      store(TILT_KEY, working);
      toast(working ? 'Tilt on. Lean to change lanes, flick up to jump, flick down to roll.' : 'Tilt is not available here. Swipes still work.');
      return working;
    });
  }

  // Two rows in the game's own settings panel, built from its row class. They take the place of the
  // privacy-policy row, which pointed at the source publisher and is blank now.
  let feelRows = false;
  function buildFeelRows(game) {
    const panel = game.app.settings;
    if (feelRows || !panel || !Array.isArray(panel.items) || panel.items.length < 2 || typeof panel.addItem !== 'function') return;
    feelRows = true;
    const Row = Object.getPrototypeOf(panel.items[1].constructor);
    const policy = panel.items.find((item) => item.subtitle && item.subtitle.text === '');
    if (policy) { off(policy); panel.items.splice(panel.items.indexOf(policy), 1); }
    const add = (icon, title, read, flip) => {
      const row = new Row({ icon, title: 'sound', subtitle: 'on' });
      const refresh = () => { row.title.text = title; row.subtitle.text = read() ? 'On' : 'Off'; };
      row.enable = refresh;
      row.disable = () => {};
      row.onTap = () => Promise.resolve(flip()).then(refresh);
      panel.addItem(row);
      refresh();
    };
    add('icon-white-missions.png', 'Vibration', () => feel.haptics, () => { feel.haptics = !feel.haptics; store(HAPTICS_KEY, feel.haptics); buzz('medium', 0); });
    add('icon-white-awards.png', 'Tilt controls', () => feel.tilt, () => setTilt(!feel.tilt));
  }

  function attachFeel(game) {
    tiltGame = game;
    hookHaptics(game);
    // A saved "tilt on" still needs a tap before iOS will hand over the sensor.
    if (feel.tilt) {
      const wake = () => { window.removeEventListener('pointerdown', wake, true); startTilt().then((working) => { if (!working) { feel.tilt = false; toast('Tilt is not available here. Swipes still work.'); } }); };
      window.addEventListener('pointerdown', wake, true);
    }
  }

  let ending = null;
  function showEnding(game) {
    const score = Math.round(game.app.user.score || 0);
    const stage = Math.floor((game.stats.distance || 0) / STAGE_LENGTH);
    if (!ending) {
      ending = window.SekaiEnding.create({
        id: 'hollow-run-ending',
        eyebrow: 'THE GHOST CAUGHT YOU',
        title: 'Run ended.',
        invitation: 'Remix this run.',
        continueLabel: 'Run again',
        onRemix: () => window.RemixActions.remix(),
        onShare: () => window.RemixActions.share(),
        onContinue: () => game.app.gameover.onTapPlay(),
      });
      // The score board sits underneath; this puts the ending away without starting a run.
      const ranks = el('button', 'se-close');
      ranks.type = 'button';
      ranks.textContent = 'See the ranks';
      ranks.onclick = () => ending.close();
      ending.dialog.appendChild(ranks);
    }
    ending.dialog.querySelector('h1').textContent = 'Stage ' + ROMAN[stage % ROMAN.length] + ' · ' + score.toLocaleString('en-US');
    ending.dialog.querySelector('h1 + p').textContent = 'You fell in ' + STAGES[stage % STAGES.length] + '. The night is not over.';
    ending.setStatus('');
    ending.show();
  }

  function attach(game) {
    const nav = game.app.nav;
    const board = game.app.gameover;
    if (typeof nav.toGame !== 'function' || !board || typeof board.onOpen !== 'function' || typeof board.onTapPlay !== 'function') {
      throw new Error('Hollow Run: the game navigation changed; restart and the ending cannot attach.');
    }
    // The score board is the true end of a run: the revive offer and any high-score screen are already over.
    const onOpen = board.onOpen;
    board.onOpen = function () {
      const result = onOpen.apply(this, arguments);
      showEnding(game);
      return result;
    };
    restartBtn.addEventListener('click', () => {
      if (game.state === RUNNING) nav.toGame();
    });
    endingChip.addEventListener('click', () => { if (ending) ending.show(); });
    attachFeel(game);

    let lastStage = -1, hinted = false;
    setInterval(() => {
      try {
        dressSkyline(game);
        trimModules(game);
        buildFeelRows(game);
      } catch (error) {
        // The costume layer must never take the HUD, restart or ending down with it.
        if (!attach.reported) console.error('Hollow Run: the costume layer failed', error);
        attach.reported = true;
      }
      const pausedOpen = game.state === PAUSED && !!(game.hud && game.hud.paused && game.hud.paused.opened);
      pausedBox.hidden = !pausedOpen;
      if (pausedOpen) {
        const at = Math.floor((game.stats.distance || 0) / STAGE_LENGTH);
        pausedBox.querySelector('span').textContent = 'Stage ' + ROMAN[at % ROMAN.length] + ' · ' + STAGES[at % STAGES.length] + '\nScore ' + Math.round(game.stats.score || 0).toLocaleString('en-US');
        banner.classList.remove('on');
      }
      const running = game.state === RUNNING && !game.paused;
      restartBtn.hidden = !running;
      stageBox.hidden = !running;
      endingChip.hidden = !(ending && !ending.dialog.open && board.opened);
      if (!running) {
        if (game.state !== RUNNING && game.state !== PAUSED) lastStage = -1;
        return;
      }
      const distance = game.stats.distance || 0;
      const stage = Math.floor(distance / STAGE_LENGTH);
      if (!hinted) {
        hinted = true;
        let seen = false;
        try { seen = !!localStorage.getItem(HINT_KEY); localStorage.setItem(HINT_KEY, '1'); } catch (error) { seen = false; }
        if (!seen) toast(matchMedia('(pointer:coarse)').matches ? 'Swipe left or right to dodge, up to jump, down to roll.' : 'Arrow keys: left or right to dodge, up to jump, down to roll.', 6000);
      }
      if (stage !== lastStage) {
        lastStage = stage;
        stageName.textContent = ROMAN[stage % ROMAN.length] + ' · ' + STAGES[stage % STAGES.length].toUpperCase();
        announce(stage);
      }
      stageFill.style.width = ((distance % STAGE_LENGTH) / STAGE_LENGTH * 100).toFixed(1) + '%';
    }, 200);
  }

  function boot() {
    buildDom();
    loadTrimmedLabels();
    loadCryptSkin();
    const started = Date.now();
    const wait = setInterval(() => {
      const game = window.game;
      if (game && game.app && game.app.nav && game.stats && game.environment) {
        clearInterval(wait);
        attach(game);
      } else if (Date.now() - started > 60000) {
        clearInterval(wait);
        console.error('Hollow Run: the game object never appeared; restart, stages and the ending are disabled.');
        toast('Some extras failed to load. Reload to try again.');
      }
    }, 200);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
