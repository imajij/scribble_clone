// ========================================
// BACHELOR MODE — Drawing Canvas (adapted from Scribble)
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
    this.tool = 'brush';
    this.lastX = 0;
    this.lastY = 0;
    this.history = [];
    this.maxHistory = 20;

    this.resizeCanvas();
    this.setupEvents();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  resizeCanvas() {
    const container = this.canvas.parentElement;
    const w = container.clientWidth;
    const h = Math.min(container.clientHeight, window.innerHeight * 0.45);
    const saved = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx.putImageData(saved, 0, 0);
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
  }

  setupEvents() {
    this.canvas.addEventListener('mousedown',  e => this.startDraw(e));
    this.canvas.addEventListener('mousemove',  e => this.draw(e));
    this.canvas.addEventListener('mouseup',    () => this.stopDraw());
    this.canvas.addEventListener('mouseleave', () => this.stopDraw());
    this.canvas.addEventListener('touchstart', e => { e.preventDefault(); this.startDraw(e.touches[0]); }, { passive: false });
    this.canvas.addEventListener('touchmove',  e => { e.preventDefault(); this.draw(e.touches[0]); },  { passive: false });
    this.canvas.addEventListener('touchend',   e => { e.preventDefault(); this.stopDraw(); });
  }

  getPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (this.canvas.width / rect.width),
      y: (e.clientY - rect.top)  * (this.canvas.height / rect.height),
    };
  }

  startDraw(e) {
    if (!this.isEnabled) return;
    const pos = this.getPos(e);
    if (this.tool === 'fill') {
      this.floodFill(Math.round(pos.x), Math.round(pos.y), this.color);
      this.socket.emit('drawData', { type: 'fill', x: Math.round(pos.x), y: Math.round(pos.y), color: this.color, canvasW: this.canvas.width, canvasH: this.canvas.height });
      return;
    }
    this.isDrawing = true;
    this.lastX = pos.x; this.lastY = pos.y;
    this.saveHistory();
    this.ctx.beginPath();
    this.ctx.arc(pos.x, pos.y, this.getActualSize() / 2, 0, Math.PI * 2);
    this.ctx.fillStyle = this.getActualColor();
    this.ctx.fill();
    this.socket.emit('drawData', { type: 'dot', x: pos.x, y: pos.y, color: this.getActualColor(), size: this.getActualSize(), canvasW: this.canvas.width, canvasH: this.canvas.height });
  }

  draw(e) {
    if (!this.isDrawing || !this.isEnabled) return;
    const pos = this.getPos(e);
    this.ctx.beginPath();
    this.ctx.moveTo(this.lastX, this.lastY);
    this.ctx.lineTo(pos.x, pos.y);
    this.ctx.strokeStyle = this.getActualColor();
    this.ctx.lineWidth = this.getActualSize();
    this.ctx.lineCap = 'round'; this.ctx.lineJoin = 'round';
    this.ctx.stroke();
    this.socket.emit('drawData', { type: 'line', x1: this.lastX, y1: this.lastY, x2: pos.x, y2: pos.y, color: this.getActualColor(), size: this.getActualSize(), canvasW: this.canvas.width, canvasH: this.canvas.height });
    this.lastX = pos.x; this.lastY = pos.y;
  }

  stopDraw() { this.isDrawing = false; }
  getActualColor() { return this.tool === 'eraser' ? '#FFFFFF' : this.color; }
  getActualSize()  { return this.tool === 'eraser' ? this.brushSize * 3 : this.brushSize; }

  remoteDrawData(data) {
    const sx = this.canvas.width / data.canvasW;
    const sy = this.canvas.height / data.canvasH;
    if (data.type === 'dot') {
      this.ctx.beginPath();
      this.ctx.arc(data.x * sx, data.y * sy, data.size / 2, 0, Math.PI * 2);
      this.ctx.fillStyle = data.color; this.ctx.fill();
    } else if (data.type === 'line') {
      this.ctx.beginPath();
      this.ctx.moveTo(data.x1 * sx, data.y1 * sy);
      this.ctx.lineTo(data.x2 * sx, data.y2 * sy);
      this.ctx.strokeStyle = data.color; this.ctx.lineWidth = data.size;
      this.ctx.lineCap = 'round'; this.ctx.lineJoin = 'round'; this.ctx.stroke();
    } else if (data.type === 'fill') {
      this.floodFill(Math.round(data.x * sx), Math.round(data.y * sy), data.color);
    }
  }

  floodFill(startX, startY, fillColor) {
    const imgData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    const d = imgData.data; const w = this.canvas.width; const h = this.canvas.height;
    const ti = (startY * w + startX) * 4;
    const tR = d[ti], tG = d[ti+1], tB = d[ti+2];
    const hex = fillColor.replace('#','');
    const fR = parseInt(hex.substring(0,2),16), fG = parseInt(hex.substring(2,4),16), fB = parseInt(hex.substring(4,6),16);
    if (tR===fR && tG===fG && tB===fB) return;
    const stack = [[startX, startY]]; const tol = 30;
    const match = idx => Math.abs(d[idx]-tR)<=tol && Math.abs(d[idx+1]-tG)<=tol && Math.abs(d[idx+2]-tB)<=tol;
    while (stack.length) {
      const [x,y] = stack.pop(); const idx = (y*w+x)*4;
      if (x<0||x>=w||y<0||y>=h||!match(idx)) continue;
      d[idx]=fR; d[idx+1]=fG; d[idx+2]=fB; d[idx+3]=255;
      stack.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);
    }
    this.ctx.putImageData(imgData, 0, 0);
  }

  saveHistory() {
    if (this.history.length >= this.maxHistory) this.history.shift();
    this.history.push(this.canvas.toDataURL());
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.history = [];
  }

  enable()  { this.isEnabled = true;  this.canvas.style.cursor = 'crosshair'; }
  disable() { this.isEnabled = false; this.isDrawing = false; this.canvas.style.cursor = 'default'; }
  setColor(c) { this.color = c; if (this.tool === 'eraser') this.tool = 'brush'; }
  setBrushSize(s) { this.brushSize = s; }
  setTool(t) { this.tool = t; }
}
