const { app, BrowserWindow, nativeTheme, shell, protocol, net } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// Polyfill DOMMatrix for pdfjs-dist in Electron main process (Node.js 环境缺少此 Web API)
if (typeof globalThis.DOMMatrix === 'undefined') {
  class SimpleDOMMatrix {
    constructor(init) {
      this.a = 1; this.b = 0; this.c = 0;
      this.d = 1; this.e = 0; this.f = 0;
      if (Array.isArray(init) && init.length >= 6) {
        [this.a, this.b, this.c, this.d, this.e, this.f] = init;
      }
    }
    get is2D() { return true; }
    get isIdentity() {
      return this.a === 1 && this.b === 0 && this.c === 0
          && this.d === 1 && this.e === 0 && this.f === 0;
    }
    translate(tx, ty) {
      return new SimpleDOMMatrix([this.a, this.b, this.c, this.d,
        this.e + tx * this.a + ty * this.c,
        this.f + tx * this.b + ty * this.d]);
    }
    scale(sx, sy) {
      return new SimpleDOMMatrix([this.a * sx, this.b * sx, this.c * sy, this.d * sy, this.e, this.f]);
    }
    multiply(other) {
      return new SimpleDOMMatrix([
        this.a * other.a + this.c * other.b,
        this.b * other.a + this.d * other.b,
        this.a * other.c + this.c * other.d,
        this.b * other.c + this.d * other.d,
        this.a * other.e + this.c * other.f + this.e,
        this.b * other.e + this.d * other.f + this.f,
      ]);
    }
    rotate(deg) {
      const rad = (deg || 0) * Math.PI / 180;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      return this.multiply(new SimpleDOMMatrix([cos, sin, -sin, cos, 0, 0]));
    }
    rotateAxisAngle(x, y, z, angle) {
      if (z === 1 || z === -1) return this.rotate(z * angle);
      return new SimpleDOMMatrix();
    }
    inverse() {
      const det = this.a * this.d - this.b * this.c;
      return new SimpleDOMMatrix([
        this.d / det, -this.b / det, -this.c / det, this.a / det,
        (this.b * this.f - this.d * this.e) / det,
        (this.c * this.e - this.a * this.f) / det,
      ]);
    }
    transformPoint(point) {
      return {
        x: this.a * point.x + this.c * point.y + this.e,
        y: this.b * point.x + this.d * point.y + this.f,
        z: point.z || 0, w: point.w || 1,
      };
    }
    toString() {
      return `matrix(${this.a},${this.b},${this.c},${this.d},${this.e},${this.f})`;
    }
  }
  globalThis.DOMMatrix = SimpleDOMMatrix;
}

const { registerIpcHandlers } = require('./ipc/index.cjs');
const { setupAutoUpdate, triggerUpdateDownload, quitAndInstall } = require('./services/updateService.cjs');
const { getGeneratedImagesDir } = require('./utils/paths.cjs');

const rendererUrl = process.env.ELECTRON_RENDERER_URL;
const iconPath = path.join(__dirname, '../assets/icon.ico');

protocol.registerSchemesAsPrivileged([{
  scheme: 'yibiao-asset',
  privileges: { standard: true, secure: true, supportFetchAPI: true },
}]);

function registerAssetProtocol() {
  protocol.handle('yibiao-asset', (request) => {
    try {
      const url = new URL(request.url);
      if (url.hostname !== 'generated-images') {
        return new Response('Not found', { status: 404 });
      }

      const relativePath = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
      if (!relativePath) {
        return new Response('Not found', { status: 404 });
      }

      const baseDir = path.resolve(getGeneratedImagesDir(app));
      const filePath = path.resolve(baseDir, relativePath);
      if (filePath !== baseDir && !filePath.startsWith(`${baseDir}${path.sep}`)) {
        return new Response('Forbidden', { status: 403 });
      }

      if (!fs.existsSync(filePath)) {
        return new Response('Not found', { status: 404 });
      }

      return net.fetch(pathToFileURL(filePath).toString());
    } catch {
      return new Response('Invalid asset url', { status: 400 });
    }
  });
}

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1040,
    minHeight: 720,
    backgroundColor: '#f8fafd',
    title: '易标投标工具箱',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  return mainWindow;
}

app.whenReady().then(() => {
  nativeTheme.themeSource = 'light';
  registerAssetProtocol();
  const mainWindow = createMainWindow();
  registerIpcHandlers({ app, mainWindow, triggerUpdateDownload, quitAndInstall });
  setupAutoUpdate({ app, mainWindow });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
