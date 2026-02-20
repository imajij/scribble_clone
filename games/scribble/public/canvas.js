// ========================================
// DRAWING CANVAS ENGINE
// ========================================

class DrawingCanvas {
  constructor(canvasId, socket) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.socket = socket;

    this.isDrawing = false;
    this.isEnabled = false;
    this.color = '#000000';
    this.brushSize = 5;
    this.tool = 'brush'; // brush | eraser | fill

    this.lastX = 0;
    this.lastY = 0;
    this.history = []; // For undo
    this.maxHistory = 20;

    this.resizeCanvas();
    this.setupEvents();

    window.addEventListener('resize', () => this.resizeCanvas());
  }

  resizeCanvas() {
    const container = this.canvas.parentElement;
    const topBar = container.querySelector('.top-bar');
    const tools = container.querySelector('.draw-tools');

    const topH = topBar ? topBar.offsetHeight : 52;
    const toolsH = (tools && !tools.classList.contains('hidden')) ? tools.offsetHeight : 0;

    const w = container.clientWidth;
    const h = container.clientHeight - topH - toolsH;

    // Save current drawing
    const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);

    this.canvas.width = w;
    this.canvas.height = h;

    // Restore drawing
    this.ctx.putImageData(imageData, 0, 0);
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
  }

  setupEvents() {
    // Mouse events
    this.canvas.addEventListener('mousedown', (e) => this.startDraw(e));
    this.canvas.addEventListener('mousemove', (e) => this.draw(e));
    this.canvas.addEventListener('mouseup', () => this.stopDraw());
    this.canvas.addEventListener('mouseleave', () => this.stopDraw());

    // Touch events
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      this.startDraw(touch);
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      this.draw(touch);
    }, { passive: false });

    this.canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.stopDraw();
    });
  }

  getPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (this.canvas.width / rect.width),
      y: (e.clientY - rect.top) * (this.canvas.height / rect.height)
    };
  }

  startDraw(e) {
    if (!this.isEnabled) return;

    const pos = this.getPos(e);

    if (this.tool === 'fill') {
      this.floodFill(Math.round(pos.x), Math.round(pos.y), this.color);
      this.socket.emit('draw', {
        type: 'fill',
        x: Math.round(pos.x),
        y: Math.round(pos.y),
        color: this.color,
        canvasW: this.canvas.width,
        canvasH: this.canvas.height
      });
      return;
    }

    this.isDrawing = true;
    this.lastX = pos.x;
    this.lastY = pos.y;

    // Save snapshot for undo
    this.saveHistory();

    // Draw a dot
    this.ctx.beginPath();
    this.ctx.arc(pos.x, pos.y, this.getActualSize() / 2, 0, Math.PI * 2);
    this.ctx.fillStyle = this.getActualColor();
    this.ctx.fill();

    this.socket.emit('draw', {
      type: 'dot',
      x: pos.x,
      y: pos.y,
      color: this.getActualColor(),
      size: this.getActualSize(),
      canvasW: this.canvas.width,
      canvasH: this.canvas.height
    });
  }

  draw(e) {
    if (!this.isDrawing || !this.isEnabled) return;

    const pos = this.getPos(e);

    this.ctx.beginPath();
    this.ctx.moveTo(this.lastX, this.lastY);
    this.ctx.lineTo(pos.x, pos.y);
    this.ctx.strokeStyle = this.getActualColor();
    this.ctx.lineWidth = this.getActualSize();
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.stroke();

    this.socket.emit('draw', {
      type: 'line',
      x1: this.lastX,
      y1: this.lastY,
      x2: pos.x,
      y2: pos.y,
      color: this.getActualColor(),
      size: this.getActualSize(),
      canvasW: this.canvas.width,
      canvasH: this.canvas.height
    });

    this.lastX = pos.x;
    this.lastY = pos.y;
  }

  stopDraw() {
    this.isDrawing = false;
  }

  getActualColor() {
    return this.tool === 'eraser' ? '#FFFFFF' : this.color;
  }

  getActualSize() {
    return this.tool === 'eraser' ? this.brushSize * 3 : this.brushSize;
  }

  // Receive remote drawing
  remoteDrawing(data) {
    const scaleX = this.canvas.width / data.canvasW;
    const scaleY = this.canvas.height / data.canvasH;

    if (data.type === 'dot') {
      this.ctx.beginPath();
      this.ctx.arc(data.x * scaleX, data.y * scaleY, data.size / 2, 0, Math.PI * 2);
      this.ctx.fillStyle = data.color;
      this.ctx.fill();
    } else if (data.type === 'line') {
      this.ctx.beginPath();
      this.ctx.moveTo(data.x1 * scaleX, data.y1 * scaleY);
      this.ctx.lineTo(data.x2 * scaleX, data.y2 * scaleY);
      this.ctx.strokeStyle = data.color;
      this.ctx.lineWidth = data.size;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      this.ctx.stroke();
    } else if (data.type === 'fill') {
      this.floodFill(
        Math.round(data.x * scaleX),
        Math.round(data.y * scaleY),
        data.color
      );
    }
  }

  floodFill(startX, startY, fillColor) {
    const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    const data = imageData.data;
    const w = this.canvas.width;
    const h = this.canvas.height;

    const targetIdx = (startY * w + startX) * 4;
    const targetR = data[targetIdx];
    const targetG = data[targetIdx + 1];
    const targetB = data[targetIdx + 2];

    // Parse fill color
    const hex = fillColor.replace('#', '');
    const fillR = parseInt(hex.substring(0, 2), 16);
    const fillG = parseInt(hex.substring(2, 4), 16);
    const fillB = parseInt(hex.substring(4, 6), 16);

    if (targetR === fillR && targetG === fillG && targetB === fillB) return;

    const stack = [[startX, startY]];
    const tolerance = 30;

    const matchColor = (idx) => {
      return Math.abs(data[idx] - targetR) <= tolerance &&
             Math.abs(data[idx + 1] - targetG) <= tolerance &&
             Math.abs(data[idx + 2] - targetB) <= tolerance;
    };

    while (stack.length > 0) {
      const [x, y] = stack.pop();
      const idx = (y * w + x) * 4;

      if (x < 0 || x >= w || y < 0 || y >= h) continue;
      if (!matchColor(idx)) continue;

      data[idx] = fillR;
      data[idx + 1] = fillG;
      data[idx + 2] = fillB;
      data[idx + 3] = 255;

      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }

    this.ctx.putImageData(imageData, 0, 0);
  }

  saveHistory() {
    if (this.history.length >= this.maxHistory) {
      this.history.shift();
    }
    this.history.push(this.canvas.toDataURL());
  }

  undo() {
    if (this.history.length === 0) return;
    const img = new Image();
    img.onload = () => {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.fillStyle = '#FFFFFF';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.drawImage(img, 0, 0);
    };
    img.src = this.history.pop();

    this.socket.emit('clearCanvas');
    // Note: undo only works locally for the drawer — remote players get a clear
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.history = [];
  }

  enable() {
    this.isEnabled = true;
    this.canvas.style.cursor = 'crosshair';
  }

  disable() {
    this.isEnabled = false;
    this.isDrawing = false;
    this.canvas.style.cursor = 'default';
  }

  setColor(color) {
    this.color = color;
    if (this.tool === 'eraser') this.tool = 'brush';
  }

  setBrushSize(size) {
    this.brushSize = size;
  }

  setTool(tool) {
    this.tool = tool;
  }
}
