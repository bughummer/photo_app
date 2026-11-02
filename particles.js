class ParticleLayer {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.particles = [];
    this.image = null;
    this.moving = false;
  }

  setImage(source) {
    this.canvas.width = source.width;
    this.canvas.height = source.height;
    this.image = source.getContext('2d').getImageData(0, 0, source.width, source.height);
    this.particles = [];
    this.moving = false;
    this.render();
  }

  snapshot() { return this.particles.map(particle => ({ ...particle })); }

  restore(particles) {
    this.particles = particles.map(particle => ({ ...particle, energy: 0 }));
    this.moving = false;
    this.render();
  }

  stop() {
    this.moving = false;
    for (const particle of this.particles) particle.energy = 0;
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
    const count = Math.round(110 + strength * 130);
    const mask = brushMask?.data;
    for (let attempt = 0, added = 0; attempt < count * 4 && added < count; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.sqrt(Math.random()) * radius;
      const offsetX = Math.cos(angle) * distance;
      const offsetY = Math.sin(angle) * distance;
      if (mask) {
        const maskX = Math.floor((offsetX / (2 * radius) + 0.5) * brushMask.width);
        const maskY = Math.floor((offsetY / (2 * radius) + 0.5) * brushMask.height);
        const opacity = mask[Math.max(0, Math.min(brushMask.height - 1, maskY)) * brushMask.width * 4 + Math.max(0, Math.min(brushMask.width - 1, maskX)) * 4 + 3] / 255;
        if (Math.random() > opacity) continue;
      }
      const heading = speed > 0.2 ? dragAngle + (Math.random() - 0.5) * 2.1 : angle;
      const lift = Math.min(radius * 0.55, speed * 7) * strength * (0.45 + Math.random() * 0.75);
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
        angle: heading + (Math.random() - 0.5) * 1.7,
        length: 4 + Math.random() * (11 + radius * 0.07),
        width: 0.6 + Math.random() * 1.5,
        bend: (Math.random() - 0.5) * 5,
        opacity: (0.4 + Math.random() * 0.55) * strength,
        r: Math.min(255, r * 1.15), g: Math.min(255, g * 1.15), b: Math.min(255, b * 1.15), energy: 1
      });
      added++;
    }
    if (this.particles.length > 7000) this.particles.splice(0, this.particles.length - 7000);
    this.moving = animate;
    this.render();
  }

  tick() {
    if (!this.moving) return;
    let active = false;
    for (const particle of this.particles) {
      if (particle.energy < 0.03) continue;
      const curl = Math.sin(particle.x * 0.013 + particle.y * 0.009 + particle.energy * 5);
      particle.vx = particle.vx * 0.97 + curl * 0.018 * particle.energy;
      particle.vy = particle.vy * 0.97 - curl * 0.012 * particle.energy;
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.angle += curl * 0.012 * particle.energy;
      particle.energy *= 0.976;
      active = true;
    }
    this.moving = active;
    if (active) this.render();
  }

  render() {
    const context = this.context;
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    context.lineCap = 'round';
    for (const particle of this.particles) {
      if (particle.x < -20 || particle.y < -20 || particle.x > this.canvas.width + 20 || particle.y > this.canvas.height + 20) continue;
      const length = particle.length;
      const endX = particle.x + Math.cos(particle.angle) * length;
      const endY = particle.y + Math.sin(particle.angle) * length;
      context.beginPath();
      context.moveTo(particle.x, particle.y);
      context.quadraticCurveTo((particle.x + endX) / 2 - Math.sin(particle.angle) * particle.bend,
        (particle.y + endY) / 2 + Math.cos(particle.angle) * particle.bend, endX, endY);
      context.lineWidth = particle.width;
      context.strokeStyle = `rgba(${particle.r},${particle.g},${particle.b},${particle.opacity})`;
      context.stroke();
    }
  }
}
