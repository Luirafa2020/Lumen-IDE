const { app, BrowserWindow, ipcMain, dialog, clipboard } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const http = require('http');
const chokidar = require('chokidar');
const WebSocket = require('ws');
const mime = require('mime-types');

let mainWindow;
const SUPPORTED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico'];
const SVG_EXTENSION = '.svg';
const DEFAULT_LIVE_SERVER_PORT = 5500;
const IGNORED_DIRS_WATCH = ['node_modules', '.git', '.vscode', 'dist', 'build'];

let liveHttpServer = null;
let liveWebSocketServer = null;
let liveFileWatcher = null;
let liveServerPort = null;
let liveServerFolderPath = null;
let liveWebSocketClients = new Set();

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        frame: false, // Add this line to remove the standard frame
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false
        },
        icon: path.join(__dirname, 'logo.png')
    });
    mainWindow.loadFile('index.html');
    mainWindow.on('closed', () => { mainWindow = null; });

    mainWindow.on('close', async (e) => {
        if (liveHttpServer) {
            console.log("Window closing, stopping live server...");
            await stopLiveServer();
        }
    });

    // Listen for maximize/unmaximize events to notify renderer
    mainWindow.on('maximize', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('window:maximized');
        }
    });
    mainWindow.on('unmaximize', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('window:unmaximized');
        }
    });
}

async function findAvailablePort(startPort) {
    let port = startPort;
    while (true) {
        try {
            await new Promise((resolve, reject) => {
                const server = http.createServer();
                server.listen(port, '127.0.0.1', () => {
                    server.close(resolve);
                });
                server.on('error', (err) => {
                    if (err.code === 'EADDRINUSE') {
                        reject(err);
                    } else {
                        reject(err);
                    }
                });
            });
            return port;
        } catch (error) {
            if (error.code === 'EADDRINUSE') {
                console.log(`Port ${port} in use, trying next...`);
                port++;
                if (port > startPort + 100) {
                    throw new Error("Could not find an available port after 100 tries.");
                }
            } else {
                throw error;
            }
        }
    }
}

function injectWebSocketClient(htmlContent, wsPort) {
    const script = `
<script>
    (function() {
        const socket = new WebSocket('ws://localhost:${wsPort}');
        socket.onopen = () => console.log('[Lumen Live Reload] Connected.');
        socket.onmessage = (event) => {
            if (event.data === 'reload') {
                console.log('[Lumen Live Reload] Reloading page...');
                window.location.reload();
            } else if (event.data === 'refreshcss') {
                console.log('[Lumen Live Reload] Refreshing CSS...');
                const links = document.querySelectorAll('link[rel="stylesheet"]');
                links.forEach(link => {
                    const url = new URL(link.href);
                    url.searchParams.set('_cacheBust', Date.now());
                    link.href = url.toString();
                });
            }
        };
        socket.onerror = (err) => console.error('[Lumen Live Reload] WebSocket error:', err);
        socket.onclose = () => console.log('[Lumen Live Reload] Connection closed.');
    })();
</script>
</body>`;
    const bodyEndIndex = htmlContent.lastIndexOf('</body>');
    if (bodyEndIndex !== -1) {
        return htmlContent.slice(0, bodyEndIndex) + script + htmlContent.slice(bodyEndIndex);
    } else {
        return htmlContent + script.replace('</body>','');
    }
}

async function handleLiveServerRequest(req, res, folderPath, wsPort) {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    let filePath = path.join(folderPath, decodeURIComponent(requestUrl.pathname));

    if (!filePath.startsWith(folderPath)) {
        console.warn(`[LiveServer] Blocked path traversal attempt: ${requestUrl.pathname}`);
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
    }

    try {
        const stats = await fs.stat(filePath);

        if (stats.isDirectory()) {
            filePath = path.join(filePath, 'index.html');
            try {
                 await fs.access(filePath, fsSync.constants.R_OK);
            } catch (indexErr) {
                 console.log(`[LiveServer] Directory requested, index.html not found: ${requestUrl.pathname}`);
                 res.writeHead(404, { 'Content-Type': 'text/plain' });
                 res.end('Not Found (Index)');
                 return;
            }
        }

        let fileContent = await fs.readFile(filePath);
        const contentType = mime.lookup(filePath) || 'application/octet-stream';

        res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'no-cache'
        });

        if (contentType === 'text/html') {
            fileContent = injectWebSocketClient(fileContent.toString('utf-8'), wsPort);
        }

        res.end(fileContent);
        console.log(`[LiveServer] Served: ${requestUrl.pathname} (${contentType})`);

    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log(`[LiveServer] Not found: ${requestUrl.pathname}`);
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
        } else {
            console.error(`[LiveServer] Error serving ${requestUrl.pathname}:`, error);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Internal Server Error');
        }
    }
}

function broadcastToWebSockets(message) {
    if (!liveWebSocketServer || liveWebSocketClients.size === 0) {
        return;
    }
    liveWebSocketClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

async function startLiveServer(folderPath) {
    if (liveHttpServer) {
        console.warn("[LiveServer] Server already running.");
        return { success: false, error: 'Server already running.' };
    }
    if (!folderPath) {
        return { success: false, error: 'No folder path provided.' };
    }

    try {
        liveServerFolderPath = folderPath;
        liveServerPort = await findAvailablePort(DEFAULT_LIVE_SERVER_PORT);
        const wsPort = liveServerPort;

        liveHttpServer = http.createServer((req, res) =>
            handleLiveServerRequest(req, res, liveServerFolderPath, wsPort)
        );

        liveWebSocketServer = new WebSocket.Server({ server: liveHttpServer });

        liveWebSocketServer.on('connection', (ws) => {
            console.log('[LiveServer WS] Client connected');
            liveWebSocketClients.add(ws);
            ws.on('close', () => {
                console.log('[LiveServer WS] Client disconnected');
                liveWebSocketClients.delete(ws);
            });
            ws.on('error', (error) => {
                console.error('[LiveServer WS] Client error:', error);
                liveWebSocketClients.delete(ws);
            });
        });

        liveWebSocketServer.on('error', (error) => {
            console.error('[LiveServer WS] Server error:', error);
            stopLiveServer().catch(e => console.error("Error stopping server after WS error:", e));
            sendLiveServerStatusUpdate(false, null, `WebSocket server error: ${error.message}`);
        });

        liveFileWatcher = chokidar.watch(liveServerFolderPath, {
            ignored: (pathString) => {
                const base = path.basename(pathString);
                return base.startsWith('.') || IGNORED_DIRS_WATCH.some(dir => pathString.includes(path.sep + dir + path.sep) || base === dir);
            },
            ignoreInitial: true,
            persistent: true,
            depth: 99
        });

        liveFileWatcher
            .on('add', (filePath) => { console.log(`[Watcher] File added: ${path.basename(filePath)}`); broadcastToWebSockets('reload'); })
            .on('change', (filePath) => {
                const ext = path.extname(filePath).toLowerCase();
                console.log(`[Watcher] File changed: ${path.basename(filePath)}`);
                if (ext === '.css') {
                    broadcastToWebSockets('refreshcss');
                } else {
                    broadcastToWebSockets('reload');
                }
             })
            .on('unlink', (filePath) => { console.log(`[Watcher] File removed: ${path.basename(filePath)}`); broadcastToWebSockets('reload'); })
             .on('unlinkDir', (dirPath) => { console.log(`[Watcher] Directory removed: ${path.basename(dirPath)}`); broadcastToWebSockets('reload'); })
             .on('addDir', (dirPath) => { console.log(`[Watcher] Directory added: ${path.basename(dirPath)}`); broadcastToWebSockets('reload'); })
            .on('error', (error) => console.error('[Watcher] Error:', error));

        await new Promise((resolve, reject) => {
            liveHttpServer.listen(liveServerPort, '127.0.0.1', () => {
                console.log(`[LiveServer] Started on http://localhost:${liveServerPort} for folder ${liveServerFolderPath}`);
                resolve();
            });
            liveHttpServer.on('error', (err) => {
                console.error("[LiveServer] HTTP server error:", err);
                reject(err);
            });
        });

        sendLiveServerStatusUpdate(true, liveServerPort, liveServerFolderPath);
        return { success: true, port: liveServerPort, folderPath: liveServerFolderPath };

    } catch (error) {
        console.error("[LiveServer] Failed to start:", error);
        await stopLiveServer();
        sendLiveServerStatusUpdate(false, null, null, `Failed to start: ${error.message}`);
        return { success: false, error: `Failed to start live server: ${error.message}` };
    }
}

async function stopLiveServer() {
    let stopped = false;
    console.log("[LiveServer] Attempting to stop...");

    if (liveFileWatcher) {
        try {
            await liveFileWatcher.close();
            console.log("[LiveServer] File watcher closed.");
            liveFileWatcher = null;
            stopped = true;
        } catch (err) {
            console.error("[LiveServer] Error closing file watcher:", err);
        }
    }

    if (liveWebSocketClients.size > 0) {
         console.log(`[LiveServer WS] Closing ${liveWebSocketClients.size} client connections...`);
         liveWebSocketClients.forEach(client => {
             client.terminate();
         });
         liveWebSocketClients.clear();
    }

    if (liveWebSocketServer) {
        await new Promise((resolve) => {
            liveWebSocketServer.close(() => {
                console.log("[LiveServer] WebSocket server closed.");
                liveWebSocketServer = null;
                stopped = true;
                resolve();
            });
        });
    }

    if (liveHttpServer) {
        await new Promise((resolve, reject) => {
             liveHttpServer.close((err) => {
                 if (err) {
                     console.error("[LiveServer] Error closing HTTP server:", err);
                 } else {
                     console.log("[LiveServer] HTTP server closed.");
                     stopped = true;
                 }
                 liveHttpServer = null;
                 resolve();
             });
        });
    }

    if (stopped) {
        console.log("[LiveServer] Stopped successfully.");
        const oldPort = liveServerPort;
        liveServerPort = null;
        liveServerFolderPath = null;
        sendLiveServerStatusUpdate(false, oldPort);
    } else {
        console.warn("[LiveServer] Stop called but nothing seemed to be running.");
    }
    liveWebSocketClients.clear();

    return { success: true };
}

function sendLiveServerStatusUpdate(isRunning, port, folderPath, error = null) {
     if (mainWindow && !mainWindow.isDestroyed()) {
         mainWindow.webContents.send('live-server:statusUpdate', {
             isRunning,
             port,
             folderPath,
             error
         });
     }
}

ipcMain.handle('dialog:openDirectory', async () => { if (!mainWindow) return null; const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] }); if (!canceled && filePaths.length > 0) { return filePaths[0]; } return null; });
ipcMain.handle('fs:readDirectory', async (event, dirPath) => { try { const dirents = await fs.readdir(dirPath, { withFileTypes: true }); return dirents.map(dirent => ({ name: dirent.name, isDirectory: dirent.isDirectory(), isFile: dirent.isFile(), path: path.join(dirPath, dirent.name) })).sort((a, b) => { if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1; return a.name.localeCompare(b.name); }); } catch (error) { console.error(`Erro ao ler diretório [${dirPath}]:`, error); return { error: `Não foi possível ler o diretório '${path.basename(dirPath)}': ${error.code || error.message}` }; } });
ipcMain.handle('fs:readFile', async (event, filePath) => { const fileExtension = path.extname(filePath).toLowerCase(); const fileName = path.basename(filePath); try { if (SUPPORTED_IMAGE_EXTENSIONS.includes(fileExtension)) { const buffer = await fs.readFile(filePath); const mimeType = `image/${fileExtension.substring(1)}`; const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`; console.log(`Lendo imagem: ${fileName} (Data URL criado)`); return { type: 'image', dataUrl: dataUrl, filePath: filePath, fileName: fileName }; } else if (fileExtension === SVG_EXTENSION) { const content = await fs.readFile(filePath, 'utf-8'); console.log(`Lendo SVG: ${fileName}`); return { type: 'svg', content: content, filePath: filePath, fileName: fileName }; } else { try { const content = await fs.readFile(filePath, 'utf-8'); return { type: 'text', content: content, filePath: filePath, fileName: fileName }; } catch (readError) { console.warn(`Falha ao ler ${fileName} como texto UTF-8:`, readError.message); return { type: 'error', error: `Não foi possível ler o arquivo '${fileName}' como texto. Pode ser um formato binário não suportado.`, filePath: filePath, fileName: fileName }; } } } catch (error) { console.error(`Erro geral ao ler arquivo [${filePath}]:`, error); return { type: 'error', error: `Não foi possível ler o arquivo '${fileName}': ${error.code || error.message}`, filePath: filePath, fileName: fileName }; } });
ipcMain.handle('fs:writeFile', async (event, filePath, content) => { try { const fileExtension = path.extname(filePath).toLowerCase(); if (SUPPORTED_IMAGE_EXTENSIONS.includes(fileExtension)) { return { error: "Não é possível salvar imagens editadas neste editor." }; } await fs.writeFile(filePath, content, 'utf-8'); return { success: true }; } catch (error) { console.error(`Erro ao salvar arquivo [${filePath}]:`, error); return { error: `Não foi possível salvar o arquivo '${path.basename(filePath)}': ${error.code || error.message}` }; } });
ipcMain.handle('fs:createFile', async (event, filePath) => { console.log(`[main.js] Recebido pedido para criar arquivo: ${filePath}`); if (!filePath) { console.error("[main.js] Erro: Caminho do arquivo para criar é inválido (null ou vazio)."); return { error: "Caminho do arquivo inválido fornecido." }; } try { console.log(`[main.js] Verificando acesso para: ${filePath}`); await fs.access(filePath, fs.constants.F_OK); console.warn(`[main.js] Arquivo '${filePath}' já existe.`); return { error: `Arquivo '${path.basename(filePath)}' já existe.` }; } catch (accessError) { console.log(`[main.js] Resultado da verificação de acesso: ${accessError.code}`); if (accessError.code === 'ENOENT') { try { console.log(`[main.js] Tentando criar arquivo vazio em: ${filePath}`); await fs.writeFile(filePath, '', 'utf-8'); console.log(`[main.js] Arquivo criado com sucesso: ${filePath}`); return { success: true, path: filePath }; } catch (createError) { console.error(`[main.js] ERRO ao criar arquivo '${filePath}':`, createError); return { error: `Falha ao criar arquivo '${path.basename(filePath)}': ${createError.code || createError.message}` }; } } else { console.error(`[main.js] ERRO ao verificar acesso do arquivo '${filePath}':`, accessError); return { error: `Erro ao verificar arquivo '${path.basename(filePath)}': ${accessError.code || accessError.message}` }; } } });
ipcMain.handle('fs:createDirectory', async (event, dirPath) => { console.log(`[main.js] Recebido pedido para criar diretório: ${dirPath}`); if (!dirPath) { console.error("[main.js] Erro: Caminho do diretório para criar é inválido (null ou vazio)."); return { error: "Caminho do diretório inválido fornecido." }; } try { console.log(`[main.js] Verificando acesso para: ${dirPath}`); await fs.access(dirPath, fs.constants.F_OK); console.warn(`[main.js] Pasta '${dirPath}' já existe.`); return { error: `Pasta '${path.basename(dirPath)}' já existe.` }; } catch (accessError) { console.log(`[main.js] Resultado da verificação de acesso: ${accessError.code}`); if (accessError.code === 'ENOENT') { try { console.log(`[main.js] Tentando criar diretório em: ${dirPath}`); await fs.mkdir(dirPath); console.log(`[main.js] Diretório criado com sucesso: ${dirPath}`); return { success: true, path: dirPath }; } catch (createError) { console.error(`[main.js] ERRO ao criar diretório '${dirPath}':`, createError); return { error: `Falha ao criar pasta '${path.basename(dirPath)}': ${createError.code || createError.message}` }; } } else { console.error(`[main.js] ERRO ao verificar acesso da pasta '${dirPath}':`, accessError); return { error: `Erro ao verificar pasta '${path.basename(dirPath)}': ${accessError.code || accessError.message}` }; } } });
ipcMain.handle('fs:renamePath', async (event, oldPath, newPath) => { try { try { await fs.access(newPath, fs.constants.F_OK); return { error: `Já existe um item chamado '${path.basename(newPath)}'.` }; } catch (accessError) { if (accessError.code !== 'ENOENT') { throw accessError; } } await fs.rename(oldPath, newPath); return { success: true, oldPath, newPath }; } catch (error) { console.error('Erro ao renomear:', oldPath, '->', newPath, error); return { error: `Falha ao renomear '${path.basename(oldPath)}': ${error.code || error.message}` }; } });
ipcMain.handle('fs:deletePath', async (event, targetPath) => { try { const stats = await fs.stat(targetPath); if (stats.isDirectory()) { await fs.rm(targetPath, { recursive: true, force: true }); } else { await fs.unlink(targetPath); } return { success: true, path: targetPath }; } catch (error) { console.error('Erro ao excluir:', targetPath, error); if (error.code === 'ENOENT') { return { error: `Item '${path.basename(targetPath)}' não encontrado.` }; } return { error: `Falha ao excluir '${path.basename(targetPath)}': ${error.code || error.message}` }; } });
ipcMain.handle('search:inProject', async (event, { searchTerm, folderPath, ignoreDirs = ['node_modules', '.git', '.vscode', 'dist', 'build'] }) => { const results = []; const searchedFiles = new Set(); const searchQueue = [folderPath]; if (!searchTerm || !folderPath) { return { error: "Termo de busca ou pasta não fornecidos." }; } const lowerSearchTerm = searchTerm.toLowerCase(); const textExtensions = [ '.txt', '.md', '.html', '.htm', '.css', '.scss', '.less', '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.json', '.xml', '.yaml', '.yml', '.py', '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.php', '.rb', '.go', '.rs', '.swift', '.kt', '.sql', '.sh', '.bash', '.zsh', '.ps1', '.bat', '.cmd', '.gitignore', '.env', '.dockerfile', '.ini', '.toml', '.log', '.svg' ]; while (searchQueue.length > 0) { const currentPath = searchQueue.shift(); if (searchedFiles.has(currentPath)) continue; searchedFiles.add(currentPath); try { const dirents = await fs.readdir(currentPath, { withFileTypes: true }); for (const dirent of dirents) { const fullPath = path.join(currentPath, dirent.name); const baseName = dirent.name; if (dirent.isDirectory()) { if (!baseName.startsWith('.') && !ignoreDirs.includes(baseName)) { searchQueue.push(fullPath); } } else if (dirent.isFile()) { const fileExtension = path.extname(baseName).toLowerCase(); if (fileExtension === '' || textExtensions.includes(fileExtension)) { try { const stats = await fs.stat(fullPath); if (stats.size > 5 * 1024 * 1024) { console.warn(`Aviso: Pulando arquivo grande demais para busca: ${fullPath}`); continue; } const content = await fs.readFile(fullPath, 'utf-8'); const lines = content.split('\n'); lines.forEach((line, index) => { if (line.toLowerCase().includes(lowerSearchTerm)) { results.push({ filePath: fullPath, lineNumber: index + 1, lineContent: line.trim(), fileName: dirent.name }); } }); } catch (readError) { if (readError.code !== 'ERR_INVALID_CHAR') { console.warn(`Aviso: Não foi possível ler o arquivo (busca) ${fullPath}: ${readError.message}`); } } } } } } catch (dirError) { console.warn(`Aviso: Não foi possível ler o diretório (busca) ${currentPath}: ${dirError.message}`); } } return { results }; });
ipcMain.on('command:run', (event, { command, cwd }) => { if (!mainWindow || mainWindow.isDestroyed()) return; if (!command || !cwd) { mainWindow.webContents.send('command:error', 'Comando ou diretório inválido.'); mainWindow.webContents.send('command:exit', 1); return; } console.log(`Executando comando: [${command}] em [${cwd}]`); mainWindow.webContents.send('command:start', command); const isWindows = os.platform() === 'win32'; const shell = isWindows ? 'cmd.exe' : '/bin/sh'; const args = isWindows ? ['/c', command] : ['-c', command]; try { const child = spawn(shell, args, { cwd: cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: { ...process.env }, detached: false }); const sendToRenderer = (channel, data) => { if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.webContents.send(channel, data); } }; child.stdout.on('data', (data) => sendToRenderer('command:output', data.toString())); child.stderr.on('data', (data) => sendToRenderer('command:output', `[STDERR] ${data.toString()}`)); child.on('close', (code) => { console.log(`Comando [${command}] finalizado com código: ${code}`); sendToRenderer('command:exit', code ?? 1); }); child.on('error', (error) => { console.error(`Erro ao spawn do comando [${command}]:`, error); sendToRenderer('command:error', `Falha ao iniciar comando: ${error.message}`); sendToRenderer('command:exit', 1); }); } catch (spawnError) { console.error(`Erro CATCH ao tentar spawn [${command}]:`, spawnError); if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.webContents.send('command:error', `Erro ao tentar executar: ${spawnError.message}`); mainWindow.webContents.send('command:exit', 1); } } });
ipcMain.on('dialog:showErrorBox', (event, title, content) => { if (mainWindow && !mainWindow.isDestroyed()) { dialog.showErrorBox(title || 'Erro', content || 'Ocorreu um erro inesperado.'); } });

ipcMain.handle('clipboard:writeText', async (event, textToWrite) => {
    if (typeof textToWrite === 'string') {
        try {
            clipboard.writeText(textToWrite);
            console.log('[Clipboard] Text written successfully.');
            return { success: true };
        } catch (error) {
            console.error('[Clipboard] Error writing text:', error);
            return { success: false, error: 'Failed to write to clipboard.' };
        }
    } else {
        console.warn('[Clipboard] Invalid text provided to writeText handler.');
        return { success: false, error: 'Invalid text provided.' };
    }
});

ipcMain.handle('live-server:start', async (event, folderPath) => {
    return await startLiveServer(folderPath);
});

ipcMain.handle('live-server:stop', async () => {
    return await stopLiveServer();
});

ipcMain.handle('live-server:getStatus', () => {
    return {
        isRunning: !!liveHttpServer,
        port: liveServerPort,
        folderPath: liveServerFolderPath
    };
});

app.whenReady().then(() => {
    createWindow(); // Ensure createMenu() is not called here
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

    // === IPC Listeners for Custom Window Controls ===
    ipcMain.on('window:minimize', () => {
        if (mainWindow) mainWindow.minimize();
    });

    ipcMain.on('window:maximize', () => {
        if (mainWindow) {
            if (mainWindow.isMaximized()) {
                mainWindow.unmaximize();
            } else {
                mainWindow.maximize();
            }
        }
    });

    ipcMain.on('window:close', () => {
        if (mainWindow) mainWindow.close();
    });
    // =============================================

});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        stopLiveServer().then(() => app.quit()).catch(() => app.quit());
    } else {
    }
});

app.on('will-quit', async (event) => {
    if (liveHttpServer) {
        console.log("App quitting, ensuring live server stops...");
        event.preventDefault();
        try {
            await stopLiveServer();
        } catch (err) {
            console.error("Error stopping live server during quit:", err);
        } finally {
            app.quit();
        }
    }
});