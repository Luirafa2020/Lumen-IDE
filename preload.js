// preload.js (Com Live Server API)
const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');

contextBridge.exposeInMainWorld('electronAPI', {
    // FS & Dialogs (existing)
    openDirectoryDialog: () => ipcRenderer.invoke('dialog:openDirectory'),
    readDirectory: (dirPath) => ipcRenderer.invoke('fs:readDirectory', dirPath),
    readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
    writeFile: (filePath, content) => ipcRenderer.invoke('fs:writeFile', filePath, content),
    createFile: (filePath) => ipcRenderer.invoke('fs:createFile', filePath),
    createDirectory: (dirPath) => ipcRenderer.invoke('fs:createDirectory', dirPath),
    renamePath: (oldPath, newPath) => ipcRenderer.invoke('fs:renamePath', oldPath, newPath),
    deletePath: (targetPath) => ipcRenderer.invoke('fs:deletePath', targetPath),
    getPathSeparator: () => path.sep,

    // Search (existing)
    searchInProject: (options) => ipcRenderer.invoke('search:inProject', options),

    // Command Panel (existing)
    commandRun: (options) => ipcRenderer.send('command:run', options),
    onCommandStart: (callback) => ipcRenderer.on('command:start', (_event, command) => callback(command)),
    onCommandOutput: (callback) => ipcRenderer.on('command:output', (_event, data) => callback(data)),
    onCommandError: (callback) => ipcRenderer.on('command:error', (_event, errorMsg) => callback(errorMsg)),
    onCommandExit: (callback) => ipcRenderer.on('command:exit', (_event, exitCode) => callback(exitCode)),

    // Dialogs (existing)
    showErrorDialog: (title, content) => ipcRenderer.send('dialog:showErrorBox', title, content),

    // --- NEW: Live Server ---
    startLiveServer: (folderPath) => ipcRenderer.invoke('live-server:start', folderPath),
    stopLiveServer: () => ipcRenderer.invoke('live-server:stop'),
    getLiveServerStatus: () => ipcRenderer.invoke('live-server:getStatus'),
    onLiveServerStatusUpdate: (callback) => ipcRenderer.on('live-server:statusUpdate', (_event, status) => callback(status)),

});