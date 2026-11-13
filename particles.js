class ParticleLayer {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.particles = [];
    this.fragments = [];
    this.paintMarks = [];
    this.cloudPoints = [];
    this.grid = null;
    this.gridVisible = true;
    this.image = null;
    this.source = null;
    this.ink = document.createElement('canvas');
    this.inkContext = this.ink.getContext('2d');
    this.moving = false;
    this.dirty = false;
  }

  setImage(source) {
    this.canvas.width = source.width;
    this.canvas.height = source.height;
    this.ink.width = source.width;
    this.ink.height = source.height;
    this.source = source;
    this.image = source.getContext('2d').getImageData(0, 0, source.width, source.height);
    this.particles = [];
    this.fragments = [];
    this.paintMarks = [];
    this.cloudPoints = [];
    this.grid = null;
    this.moving = false;
    this.render();
  }

  snapshot() {
    return {
      particles: this.particles.map(particle => ({ ...particle })),
      fragments: this.fragments.map(fragment => ({ ...fragment })),
      paintMarks: this.paintMarks.map(mark => ({ ...mark })),
      cloudPoints: this.cloudPoints.map(point => ({ ...point })),
      grid: this.grid ? { ...this.grid } : null
    };
  }

  restore(snapshot) {
    this.particles = snapshot.particles.map(particle => ({ ...particle, energy: 0 }));
    this.fragments = snapshot.fragments.map(fragment => ({ ...fragment, energy: 0 }));
    this.paintMarks = (snapshot.paintMarks || []).map(mark => ({ ...mark, energy: 0 }));
    this.cloudPoints = (snapshot.cloudPoints || []).map(point => ({ ...point, energy: 0 }));
    this.grid = snapshot.grid ? { ...snapshot.grid } : null;
    this.moving = false;
    this.render();
  }

  setGridVisible(visible) {
    this.gridVisible = visible;
    this.render();
  }

  stop() {
    this.moving = false;
    for (const particle of this.particles) particle.energy = 0;
    for (const fragment of this.fragments) fragment.energy = 0;
    for (const mark of this.paintMarks) mark.energy = 0;
    for (const point of this.cloudPoints) point.energy = 0;
  }

  spawn(point, delta, radius, strength, brushMask, animate) {
    if (!this.image) return;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const centerY = height - point.y;
    const dx = delta.x;
    const dy = -delta.y;
    const dragAngle = Math.atan2(dy, dx);
    const speed = Math.min(8, Math.hypot(dx, dy));
    const count = Math.round(150 + strength * 200);
    const mask = brushMask?.data;
    for (let attempt = 0, added = 0; attempt < count * 4 && added < count; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.sqrt(Math.random()) * radius * 0.78;
      const offsetX = Math.cos(angle) * distance;
      const offsetY = Math.sin(angle) * distance;
      if (mask) {
        const maskX = Math.floor((offsetX / (2 * radius) + 0.5) * brushMask.width);
        const maskY = Math.floor((offsetY / (2 * radius) + 0.5) * brushMask.height);
        const opacity = mask[Math.max(0, Math.min(brushMask.height - 1, maskY)) * brushMask.width * 4 + Math.max(0, Math.min(brushMask.width - 1, maskX)) * 4 + 3] / 255;
        if (Math.random() > opacity) continue;
      }
      const heading = Math.atan2(Math.sin(angle) * 0.75 + Math.sin(dragAngle) * 0.35,
        Math.cos(angle) * 0.75 + Math.cos(dragAngle) * 0.35) + (Math.random() - 0.5) * 0.7;
      const lift = Math.min(radius * 0.62, speed * 7) * strength * (0.45 + Math.random() * 0.75);
      const sourceX = point.x + offsetX;
      const sourceY = centerY + offsetY;
      if (sourceX < 0 || sourceX >= width || sourceY < 0 || sourceY >= height) continue;
      const x = sourceX + Math.cos(heading) * lift;
      const y = sourceY + Math.sin(heading) * lift;
      const pixel = (Math.floor(sourceY) * width + Math.floor(sourceX)) * 4;
      const alpha = this.image.data[pixel + 3] / 255;
      if (alpha < 0.05 || Math.random() > alpha) continue;
      const r = this.image.data[pixel];
      const g = this.image.data[pixel + 1];
      const b = this.image.data[pixel + 2];
      const luminance = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
      if (Math.random() > 0.45 + luminance * 0.55) continue;
      const velocity = (0.45 + Math.random() * 1.5 + speed * 0.13) * strength;
      this.particles.push({
        x, y, vx: Math.cos(heading) * velocity, vy: Math.sin(heading) * velocity,
        angle: heading + (Math.random() - 0.5) * 0.8,
        length: 5 + Math.random() * (16 + radius * 0.09),
        width: 0.4 + Math.random() * 1.2,
        bend: (Math.random() - 0.5) * 5,
        opacity: (0.4 + Math.random() * 0.55) * strength,
        r: Math.min(255, r * 1.3), g: Math.min(255, g * 1.3), b: Math.min(255, b * 1.3), energy: 1, kind: 'fiber'
      });
      added++;
    }
    if (this.particles.length > 8500) this.particles.splice(0, this.particles.length - 8500);
    this.moving = animate;
    this.dirty = true;
  }

  spawnFragments(point, delta, radius, strength, brushMask, animate) {
    if (!this.image) return;
    const center = { x: point.x, y: this.canvas.height - point.y };
    const dx = delta.x;
    const dy = -delta.y;
    const speed = Math.hypot(dx, dy);
    const mask = brushMask?.data;
    this.grid = { x: center.x, y: center.y, radius: Math.max(70, radius * 1.5) };
    const count = Math.round(8 + strength * 16);
    for (let attempt = 0, added = 0; attempt < count * 5 && added < count; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.sqrt(Math.random()) * radius;
      const offsetX = Math.cos(angle) * distance;
      const offsetY = Math.sin(angle) * distance;
      if (mask) {
        const mx = Math.max(0, Math.min(brushMask.width - 1, Math.floor((offsetX / (2 * radius) + 0.5) * brushMask.width)));
        const my = Math.max(0, Math.min(brushMask.height - 1, Math.floor((offsetY / (2 * radius) + 0.5) * brushMask.height)));
        if (Math.random() > mask[(my * brushMask.width + mx) * 4 + 3] / 255) continue;
      }
      const sx = center.x + offsetX;
      const sy = center.y + offsetY;
      if (sx < 0 || sy < 0 || sx >= this.canvas.width || sy >= this.canvas.height) continue;
      const pixel = (Math.floor(sy) * this.canvas.width + Math.floor(sx)) * 4;
      const luminosity = (this.image.data[pixel] + this.image.data[pixel + 1] + this.image.data[pixel + 2]) / 765;
      if (this.image.data[pixel + 3] < 30 || Math.random() > 0.3 + luminosity * 0.7) continue;
      const size = Math.max(5, Math.min(44, 6 + Math.random() * 18 + radius * 0.035));
      const motionX = dx * 1.8 + offsetX * 0.2;
      const motionY = dy * 1.8 + offsetY * 0.2;
      this.fragments.push({
        sx: Math.max(0, Math.min(this.canvas.width - size, sx - size / 2)),
        sy: Math.max(0, Math.min(this.canvas.height - size, sy - size / 2)),
        size, x: sx + motionX * strength, y: sy + motionY * strength,
        angle: (Math.random() - 0.5) * 0.6, vx: motionX * 0.06, vy: motionY * 0.06,
        opacity: 0.5 + Math.random() * 0.5, energy: 1
      });
      for (let i = 0; i < 5; i++) {
        const dustAngle = Math.random() * Math.PI * 2;
        const dustSpeed = 0.5 + Math.random() * 2.5;
        this.particles.push({
          x: sx + motionX * strength + (Math.random() - 0.5) * size * 2,
          y: sy + motionY * strength + (Math.random() - 0.5) * size * 2,
          vx: Math.cos(dustAngle) * dustSpeed, vy: Math.sin(dustAngle) * dustSpeed,
          width: 0.5 + Math.random() * 1.7, opacity: 0.3 + Math.random() * 0.65,
          r: 220 + Math.random() * 35, g: 145 + Math.random() * 75, b: 70 + Math.random() * 70,
          energy: 1, kind: 'dust'
        });
      }
      added++;
    }
    if (this.fragments.length > 500) this.fragments.splice(0, this.fragments.length - 500);
    if (this.particles.length > 8500) this.particles.splice(0, this.particles.length - 8500);
    this.moving = animate;
    this.dirty = true;
  }

  spawnWind(point, delta, radius, strength, brushMask, glow, animate) {
    if (!this.image) return;
    const dx = delta.x;
    const dy = -delta.y;
    const speed = Math.hypot(dx, dy);
    if (speed < 0.1) return;
    const axis = Math.atan2(dy, dx);
    const centerY = this.canvas.height - point.y;
    const mask = brushMask?.data;
    const count = Math.round(22 + strength * 32);
    for (let attempt = 0, added = 0; attempt < count * 4 && added < count; attempt++) {
      const side = (Math.random() - 0.5) * radius * 1.6;
      const along = (Math.random() - 0.5) * radius * 0.55;
      const offsetX = Math.cos(axis + Math.PI / 2) * side + Math.cos(axis) * along;
      const offsetY = Math.sin(axis + Math.PI / 2) * side + Math.sin(axis) * along;
      if (mask) {
        const mx = Math.max(0, Math.min(brushMask.width - 1, Math.floor((offsetX / (2 * radius) + 0.5) * brushMask.width)));
        const my = Math.max(0, Math.min(brushMask.height - 1, Math.floor((offsetY / (2 * radius) + 0.5) * brushMask.height)));
        if (Math.random() > mask[(my * brushMask.width + mx) * 4 + 3] / 255) continue;
      }
      const sourceX = point.x + offsetX;
      const sourceY = centerY + offsetY;
      if (sourceX < 0 || sourceY < 0 || sourceX >= this.canvas.width || sourceY >= this.canvas.height) continue;
      const pixel = (Math.floor(sourceY) * this.canvas.width + Math.floor(sourceX)) * 4;
      if (this.image.data[pixel + 3] < 25) continue;
      const r = this.image.data[pixel];
      const g = this.image.data[pixel + 1];
      const b = this.image.data[pixel + 2];
      const lum = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
      if (Math.random() > 0.2 + lum * 0.8) continue;
      const length = (radius * (0.22 + Math.random() * 0.38) + speed * 3.5) * strength;
      this.particles.push({
        x: sourceX + dx * 0.7 * strength, y: sourceY + dy * 0.7 * strength,
        vx: dx * 0.045, vy: dy * 0.045,
        angle: axis + (Math.random() - 0.5) * 0.22,
        length, width: 0.55 + Math.random() * 1.7,
        bend: (Math.random() - 0.5) * 8,
        opacity: (0.18 + Math.random() * 0.42) * strength,
        r: glow ? Math.min(255, r * 1.14 + 16) : r,
        g: glow ? Math.min(255, g * 1.07 + 8) : g,
        b: glow ? Math.min(255, b * 0.95) : b,
        energy: 1, kind: 'wind'
      });
      added++;
    }
    if (this.particles.length > 8500) this.particles.splice(0, this.particles.length - 8500);
    this.moving = animate;
    this.dirty = true;
  }

  spawnDissolve(point, delta, radius, strength, brushMask, animate) {
    if (!this.image) return;
    const dx = delta.x;
    const dy = -delta.y;
    const speed = Math.hypot(dx, dy);
    const dragAngle = speed > 0.1 ? Math.atan2(dy, dx) : -Math.PI / 3;
    const centerY = this.canvas.height - point.y;
    const mask = brushMask?.data;
    const count = Math.round(10 + strength * 15);
    for (let attempt = 0, added = 0; attempt < count * 5 && added < count; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.sqrt(Math.random()) * radius * 0.86;
      const offsetX = Math.cos(angle) * distance;
      const offsetY = Math.sin(angle) * distance;
      if (mask) {
        const mx = Math.max(0, Math.min(brushMask.width - 1, Math.floor((offsetX / (2 * radius) + 0.5) * brushMask.width)));
        const my = Math.max(0, Math.min(brushMask.height - 1, Math.floor((offsetY / (2 * radius) + 0.5) * brushMask.height)));
        if (Math.random() > mask[(my * brushMask.width + mx) * 4 + 3] / 255) continue;
      }
      const sx = point.x + offsetX;
      const sy = centerY + offsetY;
      if (sx < 0 || sy < 0 || sx >= this.canvas.width || sy >= this.canvas.height) continue;
      const pixel = (Math.floor(sy) * this.canvas.width + Math.floor(sx)) * 4;
      const alpha = this.image.data[pixel + 3] / 255;
      if (alpha < 0.05 || Math.random() > alpha) continue;
      const r = this.image.data[pixel];
      const g = this.image.data[pixel + 1];
      const b = this.image.data[pixel + 2];
      const lum = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
      if (Math.random() > 0.5 + lum * 0.5) continue;
      const direction = dragAngle + (Math.random() - 0.5) * 1.5;
      const length = Math.max(7, radius * (0.17 + Math.random() * 0.45) * (0.65 + strength * 0.85));
      const width = Math.max(2, radius * (0.045 + Math.random() * 0.095) * (0.5 + strength * 0.8));
      const lift = Math.min(radius * 0.5, speed * 2.7) * strength;
      this.paintMarks.push({
        x: sx + Math.cos(direction) * lift, y: sy + Math.sin(direction) * lift,
        vx: Math.cos(direction) * (0.25 + speed * 0.09) * strength,
        vy: Math.sin(direction) * (0.25 + speed * 0.09) * strength,
        angle: direction, length, width,
        bend: (Math.random() - 0.5) * width * 1.8,
        jag: 0.25 + Math.random() * 0.45,
        opacity: (0.42 + Math.random() * 0.4) * (0.65 + strength * 0.45),
        r, g, b, energy: 1
      });
      added++;
    }
    if (this.paintMarks.length > 2400) this.paintMarks.splice(0, this.paintMarks.length - 2400);
    this.moving = animate;
    this.dirty = true;
  }

  spawnPointCloud(point, delta, radius, strength, brushMask, animate) {
    if (!this.image) return;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const centerY = height - point.y;
    const dx = delta.x;
    const dy = -delta.y;
    const count = Math.round(170 + strength * 250);
    const phase = Math.random() * Math.PI * 2;
    const mask = brushMask?.data;
    for (let i = 0; i < count; i++) {
      const angle = i * 2.399963 + phase;
      const distance = Math.sqrt((i + 0.5) / count) * radius * 0.92;
      const offsetX = Math.cos(angle) * distance;
      const offsetY = Math.sin(angle) * distance;
      if (mask) {
        const mx = Math.max(0, Math.min(brushMask.width - 1, Math.floor((offsetX / (2 * radius) + 0.5) * brushMask.width)));
        const my = Math.max(0, Math.min(brushMask.height - 1, Math.floor((offsetY / (2 * radius) + 0.5) * brushMask.height)));
        if (Math.random() > mask[(my * brushMask.width + mx) * 4 + 3] / 255) continue;
      }
      const sx = point.x + offsetX;
      const sy = centerY + offsetY;
      if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
      const pixel = (Math.floor(sy) * width + Math.floor(sx)) * 4;
      const alpha = this.image.data[pixel + 3] / 255;
      if (alpha < 0.05 || Math.random() > alpha) continue;
      const r = this.image.data[pixel];
      const g = this.image.data[pixel + 1];
      const b = this.image.data[pixel + 2];
      const lum = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
      const neighbor = (Math.floor(sy) * width + Math.min(width - 1, Math.floor(sx) + 3)) * 4;
      const other = (this.image.data[neighbor] * 0.2126 + this.image.data[neighbor + 1] * 0.7152 + this.image.data[neighbor + 2] * 0.0722) / 255;
      const edge = Math.abs(lum - other);
      if (Math.random() > Math.min(1, 0.3 + lum * 0.45 + edge * 1.8)) continue;
      const depth = 0.25 + Math.random() * 0.75;
      const spread = radius * 0.22 * strength * depth;
      const liftX = dx * (1 + depth * 2.5) * strength + Math.cos(angle) * spread;
      const liftY = dy * (1 + depth * 2.5) * strength + Math.sin(angle) * spread;
      this.cloudPoints.push({
        x: sx + liftX, y: sy + liftY,
        vx: dx * 0.06 * depth + Math.cos(angle) * 0.45 * depth * strength,
        vy: dy * 0.06 * depth + Math.sin(angle) * 0.45 * depth * strength,
        size: 0.7 + depth * 1.8 + strength * 0.35,
        opacity: 0.52 + depth * 0.38,
        r: Math.min(255, r * 1.12 + 9),
        g: Math.min(255, g * 1.12 + 9),
        b: Math.min(255, b * 1.12 + 9),
        energy: 1
      });
    }
    if (this.cloudPoints.length > 9000) this.cloudPoints.splice(0, this.cloudPoints.length - 9000);
    this.moving = animate;
    this.dirty = true;
  }

  tick(animate) {
    let active = false;
    if (animate && this.moving) {
      for (const particle of this.particles) {
        if (particle.energy < 0.03) continue;
        const curl = Math.sin(particle.x * 0.013 + particle.y * 0.009 + particle.energy * 5);
        particle.vx = particle.vx * 0.97 + curl * 0.018 * particle.energy;
        particle.vy = particle.vy * 0.97 - curl * 0.012 * particle.energy;
        particle.x += particle.vx;
        particle.y += particle.vy;
        if (particle.kind === 'fiber' || particle.kind === 'wind') particle.angle += curl * 0.012 * particle.energy;
        particle.energy *= 0.976;
        active = true;
      }
      for (const fragment of this.fragments) {
        if (fragment.energy < 0.03) continue;
        fragment.x += fragment.vx * fragment.energy;
        fragment.y += fragment.vy * fragment.energy;
        fragment.angle += fragment.vx * 0.001 * fragment.energy;
        fragment.energy *= 0.974;
        active = true;
      }
      for (const mark of this.paintMarks) {
        if (mark.energy < 0.03) continue;
        mark.x += mark.vx * mark.energy;
        mark.y += mark.vy * mark.energy;
        mark.angle += Math.sin(mark.x * 0.02 + mark.y * 0.015) * 0.004 * mark.energy;
        mark.energy *= 0.97;
        active = true;
      }
      for (const point of this.cloudPoints) {
        if (point.energy < 0.03) continue;
        point.x += point.vx * point.energy;
        point.y += point.vy * point.energy;
        point.energy *= 0.974;
        active = true;
      }
      this.moving = active;
    }
    if (active || this.dirty) this.render();
  }

  render() {
    this.dirty = false;
    const context = this.context;
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (const fragment of this.fragments) {
      context.save();
      context.translate(fragment.x, fragment.y);
      context.rotate(fragment.angle);
      context.globalAlpha = fragment.opacity;
      const half = fragment.size / 2;
      context.beginPath();
      context.moveTo(-half, -half * 0.8);
      context.lineTo(half * 0.9, -half);
      context.lineTo(half, half * 0.55);
      context.lineTo(half * 0.2, half);
      context.lineTo(-half, half * 0.75);
      context.closePath();
      context.clip();
      context.drawImage(this.source, fragment.sx, fragment.sy, fragment.size, fragment.size,
        -half, -half, fragment.size, fragment.size);
      context.strokeStyle = 'rgba(255,215,154,0.35)';
      context.lineWidth = 0.75;
      context.stroke();
      context.restore();
    }
    for (const mark of this.paintMarks) {
      if (mark.x < -mark.length || mark.y < -mark.length || mark.x > this.canvas.width + mark.length || mark.y > this.canvas.height + mark.length) continue;
      context.save();
      context.translate(mark.x, mark.y);
      context.rotate(mark.angle);
      context.globalAlpha = mark.opacity;
      const l = mark.length;
      const w = mark.width;
      context.fillStyle = `rgb(${mark.r},${mark.g},${mark.b})`;
      context.beginPath();
      context.moveTo(-l * 0.5, -w * 0.08);
      context.lineTo(-l * 0.38, -w * (0.38 + mark.jag * 0.2));
      context.lineTo(-l * 0.02, -w * 0.52 + mark.bend * 0.22);
      context.lineTo(l * 0.33, -w * (0.38 + mark.jag * 0.18));
      context.lineTo(l * 0.5, w * 0.03);
      context.lineTo(l * 0.29, w * (0.42 + mark.jag * 0.15));
      context.lineTo(-l * 0.06, w * 0.47 + mark.bend * 0.22);
      context.lineTo(-l * 0.39, w * 0.32);
      context.closePath();
      context.fill();
      context.globalAlpha = mark.opacity * 0.38;
      context.strokeStyle = `rgb(${Math.min(255, mark.r + 50)},${Math.min(255, mark.g + 50)},${Math.min(255, mark.b + 50)})`;
      context.lineCap = 'round';
      context.lineWidth = Math.max(0.7, w * 0.11);
      context.beginPath();
      context.moveTo(-l * 0.35, -w * 0.14);
      context.quadraticCurveTo(-l * 0.04, -w * 0.35 + mark.bend * 0.15, l * 0.32, -w * 0.11);
      context.stroke();
      context.globalAlpha = mark.opacity * 0.35;
      context.lineWidth = Math.max(0.5, w * 0.07);
      context.beginPath();
      context.moveTo(-l * 0.18, w * 0.2);
      context.lineTo(l * (0.08 + mark.jag * 0.35), w * 0.12);
      context.stroke();
      context.restore();
    }
    const ink = this.inkContext;
    ink.clearRect(0, 0, this.ink.width, this.ink.height);
    ink.lineCap = 'round';
    for (const particle of this.particles) {
      if (particle.kind !== 'fiber' && particle.kind !== 'wind') continue;
      if (particle.x < -20 || particle.y < -20 || particle.x > this.canvas.width + 20 || particle.y > this.canvas.height + 20) continue;
      const length = particle.length;
      const endX = particle.x + Math.cos(particle.angle) * length;
      const endY = particle.y + Math.sin(particle.angle) * length;
      ink.beginPath();
      ink.moveTo(particle.x, particle.y);
      ink.quadraticCurveTo((particle.x + endX) / 2 - Math.sin(particle.angle) * particle.bend,
        (particle.y + endY) / 2 + Math.cos(particle.angle) * particle.bend, endX, endY);
      ink.lineWidth = particle.width;
      ink.strokeStyle = `rgba(${particle.r},${particle.g},${particle.b},${particle.opacity})`;
      ink.stroke();
    }
    if (this.particles.some(particle => particle.kind === 'fiber' || particle.kind === 'wind')) {
      context.save();
      context.globalCompositeOperation = 'screen';
      context.globalAlpha = 0.68;
      context.filter = 'blur(6px)';
      context.drawImage(this.ink, 0, 0);
      context.restore();
      context.drawImage(this.ink, 0, 0);
    }
    for (const particle of this.particles) {
      if (particle.kind !== 'dust') continue;
      context.fillStyle = `rgba(${particle.r},${particle.g},${particle.b},${particle.opacity})`;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.width, 0, Math.PI * 2);
      context.fill();
    }
    for (const point of this.cloudPoints) {
      if (point.x < -3 || point.y < -3 || point.x > this.canvas.width + 3 || point.y > this.canvas.height + 3) continue;
      context.fillStyle = `rgba(${point.r},${point.g},${point.b},${point.opacity})`;
      context.fillRect(point.x - point.size / 2, point.y - point.size / 2, point.size, point.size);
    }
    if (this.grid && this.gridVisible) {
      const { x, y, radius } = this.grid;
      const left = x - radius;
      const top = y - radius;
      const size = radius * 2;
      context.save();
      context.strokeStyle = 'rgba(218,227,240,0.28)';
      context.lineWidth = 0.75;
      context.strokeRect(left, top, size, size);
      for (let i = 1; i < 4; i++) {
        const t = i / 4;
        context.beginPath();
        context.moveTo(left + size * t, top);
        context.lineTo(left + size * t, top + size);
        context.moveTo(left, top + size * t);
        context.lineTo(left + size, top + size * t);
        context.stroke();
      }
      const depth = radius * 0.18;
      context.strokeRect(left + depth, top - depth, size, size);
      for (const corner of [[left, top], [left + size, top], [left, top + size], [left + size, top + size]]) {
        context.beginPath();
        context.moveTo(corner[0], corner[1]);
        context.lineTo(corner[0] + depth, corner[1] - depth);
        context.stroke();
      }
      context.restore();
    }
  }
}
