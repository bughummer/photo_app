(() => {
  const buttons = document.querySelectorAll('.brush[data-brush]');
  const ink = ['#c7f2df', '#7cddd9', '#eead83'];

  function base(ctx) {
    const bg = ctx.createLinearGradient(0, 0, 64, 54);
    bg.addColorStop(0, '#102c38');
    bg.addColorStop(1, '#123f43');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 64, 54);
    ctx.fillStyle = '#e7b18e';
    ctx.beginPath();
    ctx.ellipse(31, 20, 9, 11, 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#223b4b';
    ctx.beginPath();
    ctx.ellipse(32, 52, 19, 24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1b232c';
    ctx.beginPath();
    ctx.ellipse(30, 13, 10, 6, -0.2, Math.PI, Math.PI * 2);
    ctx.fill();
  }

  function path(ctx, color, width, points) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(...points[0]);
    for (const point of points.slice(1)) ctx.lineTo(...point);
    ctx.stroke();
  }

  function preview(ctx, mode) {
    base(ctx);
    ctx.save();
    if (mode === 'smear' || mode === 'wind') {
      for (let i = 0; i < 6; i++) {
        const y = 14 + i * 5;
        path(ctx, ink[i % 3], mode === 'smear' ? 3 : 1.2, [[23, y], [36, y + i - 2], [59, y - 6]]);
      }
    } else if (mode === 'swirl') {
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = ink[i]; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(31, 25, 10 + i * 5, -1.5, 2.3); ctx.stroke();
      }
    } else if (mode === 'bulge') {
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = ink[i]; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(31, 27, 8 + i * 6, 12 + i * 5, 0, 0, Math.PI * 2); ctx.stroke();
      }
    } else if (mode === 'disperse' || mode === 'fragment' || mode === 'glitch') {
      for (let i = 0; i < 23; i++) {
        const x = (i * 29 + 7) % 60, y = (i * 17 + 11) % 49;
        const size = mode === 'glitch' ? 2 + i % 4 : 1 + i % 3;
        ctx.fillStyle = ink[i % 3];
        ctx.globalAlpha = 0.55 + (i % 3) * 0.18;
        ctx.fillRect(x, y, size, mode === 'fragment' ? size + 2 : size);
      }
      ctx.globalAlpha = 1;
      if (mode === 'glitch') {
        path(ctx, '#61d9e9', 1, [[4, 18], [23, 18], [23, 20], [58, 20]]);
        path(ctx, '#fa6c8b', 1, [[11, 34], [42, 34], [42, 32], [62, 32]]);
      }
      if (mode === 'fragment') {
        ctx.strokeStyle = '#a9d6d0'; ctx.lineWidth = 0.7;
        ctx.strokeRect(10, 9, 42, 37);
        path(ctx, '#a9d6d0', 0.7, [[21, 9], [21, 46]]);
      }
    } else if (mode === 'paint' || mode === 'dissolve') {
      for (let i = 0; i < 6; i++) {
        const y = 15 + i * 6;
        path(ctx, ink[i % 3], mode === 'dissolve' ? 3 + i % 3 : 5, [[10 + i * 2, y + 5], [30, y], [50 + i, y - 9]]);
      }
      if (mode === 'dissolve') {
        ctx.fillStyle = '#14383c'; ctx.fillRect(37, 25, 7, 5); ctx.fillRect(21, 38, 5, 4);
      }
    } else if (mode === 'water') {
      for (let i = 0; i < 4; i++) {
        ctx.strokeStyle = ink[i % 3]; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(3, 13 + i * 10);
        ctx.bezierCurveTo(18, 5 + i * 10, 29, 27 + i * 10, 62, 14 + i * 9); ctx.stroke();
      }
    } else if (mode === 'smoke') {
      for (let i = 0; i < 5; i++) {
        ctx.strokeStyle = ink[i % 3]; ctx.globalAlpha = 0.35; ctx.lineWidth = 3 + i;
        ctx.beginPath(); ctx.moveTo(18 + i * 6, 51);
        ctx.bezierCurveTo(2 + i * 8, 32, 46 - i * 3, 20, 27 + i * 4, 2); ctx.stroke();
      }
    } else if (mode === 'particle') {
      for (let i = 0; i < 36; i++) {
        const a = i * 2.399, r = 4 + (i % 7) * 3;
        ctx.fillStyle = ink[i % 3];
        ctx.fillRect(32 + Math.cos(a) * r, 26 + Math.sin(a) * r, 1.5, 1.5);
      }
    }
    ctx.restore();
  }

  for (const button of buttons) {
    const copy = document.createElement('span');
    copy.className = 'brush-copy';
    while (button.firstChild) copy.appendChild(button.firstChild);
    const canvas = document.createElement('canvas');
    canvas.className = 'brush-example';
    canvas.width = 64;
    canvas.height = 54;
    canvas.setAttribute('aria-hidden', 'true');
    preview(canvas.getContext('2d'), button.dataset.brush);
    button.append(canvas, copy);
  }
})();
