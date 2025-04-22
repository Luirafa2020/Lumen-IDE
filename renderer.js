let monaco;
let editor;
let currentEditorModel = null;
let editorModels = new Map();
let editorViewStates = new Map();
let pathSeparator = '/';
let currentFolderPath = null;
let openFiles = new Map();
let activeFilePath = null;
let isCommandPanelVisible = false;
let contextMenuTarget = null;
let currentSearchTerm = '';
let autosaveTimer = null;
const AUTOSAVE_DELAY = 2000;

let isLiveServerRunning = false;
let currentLiveServerPort = null;
let currentLiveServerFolder = null;

let allProblems = new Map();
let problemsMarkerListener = null;

const sidebarElement = document.getElementById('sidebar');
const openFolderBtn = document.getElementById('open-folder-btn');
const newFileBtn = document.getElementById('new-file-btn');
const newFolderBtn = document.getElementById('new-folder-btn');
const fileTreeElement = document.getElementById('file-tree');
const contentViewerContainer = document.getElementById('content-viewer-container');
const editorContainer = document.getElementById('editor-container');
const editorPlaceholder = document.getElementById('editor-placeholder');
const imageViewerContainer = document.getElementById('image-viewer-container');
const imageViewerImg = document.getElementById('image-viewer-img');
const imageViewerError = document.getElementById('image-viewer-error');
const imageViewerControls = document.getElementById('image-viewer-controls');
const svgToggleViewBtn = document.getElementById('svg-toggle-view-btn');
const currentFolderElement = document.getElementById('current-folder');
const currentFileInfoElement = document.getElementById('current-file-info');
const cursorPositionElement = document.getElementById('cursor-position');
const imageDimensionsElement = document.getElementById('image-dimensions');
const saveStatusElement = document.getElementById('save-status');
const editorTabsContainer = document.getElementById('editor-tabs-container');
const contextMenuElement = document.getElementById('context-menu');
const sidebarTabButtons = document.querySelectorAll('.sidebar-tab-btn');
const sidebarPanels = document.querySelectorAll('.sidebar-panel');
const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const searchResultsContainer = document.getElementById('search-results');
const searchStatusElement = document.getElementById('search-status');
const toggleCommandPanelBtn = document.getElementById('toggle-command-panel-btn');
const closeCommandPanelBtn = document.getElementById('close-command-panel-btn');
const commandPanel = document.getElementById('command-panel');
const commandOutputElement = document.getElementById('command-output');
const commandInputElement = document.getElementById('command-input');

const inputDialogOverlay = document.getElementById('input-dialog-overlay');
const inputDialog = document.getElementById('input-dialog');
const inputDialogLabel = document.getElementById('input-dialog-label');
const inputDialogInput = document.getElementById('input-dialog-input');
const inputDialogOkBtn = document.getElementById('input-dialog-ok');
const inputDialogCancelBtn = document.getElementById('input-dialog-cancel');

const confirmDialogOverlay = document.getElementById('confirm-dialog-overlay');
const confirmDialog = document.getElementById('confirm-dialog');
const confirmDialogMessage = document.getElementById('confirm-dialog-message');
const confirmDialogOkBtn = document.getElementById('confirm-dialog-ok');
const confirmDialogCancelBtn = document.getElementById('confirm-dialog-cancel');

const liveServerBtn = document.getElementById('live-server-btn');
const liveServerStatusElement = document.getElementById('live-server-status');

const problemsPanel = document.getElementById('problems-panel');
const problemsListElement = document.getElementById('problems-list');
const problemsStatusElement = document.getElementById('problems-status');
const problemsCountBadge = document.getElementById('problems-count-badge');

const showNativeErrorDialog = (title, message) => { console.error(`[${title}] ${message}`); window.electronAPI.showErrorDialog(title, message); };
const getFileName = (filePath) => filePath ? filePath.split(pathSeparator).pop() : '';
const getFileExtension = (filePath) => filePath ? filePath.split('.').pop().toLowerCase() : '';
function escapeRegExp(string) { return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

const SUPPORTED_IMAGE_VIEW_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg'];
function isSupportedImageView(filePath) { if (!filePath) return false; const extension = getFileExtension(filePath); return SUPPORTED_IMAGE_VIEW_EXTENSIONS.includes(extension); }
function isSvgFile(filePath) { if (!filePath) return false; return getFileExtension(filePath) === 'svg'; }
function isEditableTextFile(filePath) { if (!filePath) return false; const extension = getFileExtension(filePath); if (extension === 'svg') return true; if (SUPPORTED_IMAGE_VIEW_EXTENSIONS.includes(extension)) return false; return true; }

function getIconClassForFilePath(filePath, isDirectory) {
    const baseClass = 'mdi';
    if (isDirectory) return `${baseClass} mdi-folder`;
    const extension = getFileExtension(filePath);
    switch (extension) {
        case 'html': case 'htm': return `${baseClass} mdi-language-html5`;
        case 'css': return `${baseClass} mdi-language-css3`;
        case 'scss': case 'sass': return `${baseClass} mdi-language-sass`;
        case 'less': return `${baseClass} mdi-language-less`;
        case 'js': case 'mjs': case 'cjs': return `${baseClass} mdi-language-javascript`;
        case 'jsx': return `${baseClass} mdi-react`;
        case 'ts': return `${baseClass} mdi-language-typescript`;
        case 'tsx': return `${baseClass} mdi-react`;
        case 'json': return `${baseClass} mdi-code-json`;
        case 'xml': return `${baseClass} mdi-xml`;
        case 'yaml': case 'yml': return `${baseClass} mdi-language-yaml`;
        case 'env': return `${baseClass} mdi-variable-box`;
        case 'ini': case 'properties': case 'toml': return `${baseClass} mdi-file-cog-outline`;
        case 'sql': return `${baseClass} mdi-database`;
        case 'csv': case 'tsv': return `${baseClass} mdi-file-table-outline`;
        case 'png': case 'jpg': case 'jpeg': case 'gif': case 'webp': case 'bmp': return `${baseClass} mdi-file-image-outline`;
        case 'ico': return `${baseClass} mdi-file-image-outline`;
        case 'svg': return `${baseClass} mdi-svg`;
        case 'md': case 'markdown': return `${baseClass} mdi-language-markdown`;
        case 'pdf': return `${baseClass} mdi-file-pdf-box`;
        case 'doc': case 'docx': return `${baseClass} mdi-file-word-box`;
        case 'xls': case 'xlsx': return `${baseClass} mdi-file-excel-box`;
        case 'ppt': case 'pptx': return `${baseClass} mdi-file-powerpoint-box`;
        case 'txt': return `${baseClass} mdi-file-document-outline`;
        case 'php': return `${baseClass} mdi-language-php`;
        case 'py': case 'pyc': case 'pyd': case 'pyo': return `${baseClass} mdi-language-python`;
        case 'rb': return `${baseClass} mdi-language-ruby`;
        case 'go': return `${baseClass} mdi-language-go`;
        case 'java': case 'jar': return `${baseClass} mdi-language-java`;
        case 'kt': return `${baseClass} mdi-language-kotlin`;
        case 'rs': return `${baseClass} mdi-language-rust`;
        case 'swift': return `${baseClass} mdi-language-swift`;
        case 'cs': return `${baseClass} mdi-language-csharp`;
        case 'c': case 'h': return `${baseClass} mdi-language-c`;
        case 'cpp': case 'hpp': case 'cxx': return `${baseClass} mdi-language-cpp`;
        case 'lua': return `${baseClass} mdi-language-lua`;
        case 'perl': case 'pl': return `${baseClass} mdi-language-perl`;
        case 'r': return `${baseClass} mdi-language-r`;
        case 'dart': return `${baseClass} mdi-language-dart`;
        case 'sh': case 'bash': case 'zsh': case 'fish': return `${baseClass} mdi-bash`;
        case 'ps1': return `${baseClass} mdi-powershell`;
        case 'bat': case 'cmd': return `${baseClass} mdi-console`;
        case 'log': return `${baseClass} mdi-text-box-outline`;
        case 'gitignore': case 'gitattributes': case 'gitmodules': return `${baseClass} mdi-git`;
        case 'dockerfile': case 'dockerignore': return `${baseClass} mdi-docker`;
        case 'zip': case 'rar': case '7z': case 'tar': case 'gz': case 'bz2': return `${baseClass} mdi-zip-box`;
        case 'mp3': case 'wav': case 'ogg': case 'flac': case 'aac': return `${baseClass} mdi-file-music-outline`;
        case 'mp4': case 'avi': case 'mov': case 'mkv': case 'wmv': return `${baseClass} mdi-file-video-outline`;
        case 'ttf': case 'otf': case 'woff': case 'woff2': return `${baseClass} mdi-format-font`;
        default: return `${baseClass} mdi-file-document-outline`;
    }
}

function getLanguageForFilePath(filePath) { const extension = getFileExtension(filePath); if (!isEditableTextFile(filePath) && !isSvgFile(filePath)) return 'plaintext'; switch (extension) { case 'html': case 'htm': return 'html'; case 'css': return 'css'; case 'scss': return 'scss'; case 'less': return 'less'; case 'js': case 'mjs': case 'cjs': return 'javascript'; case 'jsx': return 'javascript'; case 'ts': return 'typescript'; case 'tsx': return 'typescript'; case 'json': return 'json'; case 'md': case 'markdown': return 'markdown'; case 'xml': return 'xml'; case 'svg': return 'xml'; case 'yaml': case 'yml': return 'yaml'; case 'php': return 'php'; case 'py': return 'python'; case 'java': return 'java'; case 'cs': return 'csharp'; case 'c': case 'h': return 'c'; case 'cpp': case 'hpp': case 'cxx': return 'cpp'; case 'rb': return 'ruby'; case 'go': return 'go'; case 'rs': return 'rust'; case 'swift': return 'swift'; case 'kt': return 'kotlin'; case 'sql': return 'sql'; case 'sh': case 'bash': case 'zsh': return 'shell'; case 'bat': case 'cmd': return 'bat'; case 'ps1': return 'powershell'; case 'dockerfile': return 'dockerfile'; case 'gitignore': return 'plaintext'; case 'env': case 'properties': return 'ini'; case 'ini': return 'ini'; case 'toml': return 'toml'; case 'log': return 'log'; case 'csv': case 'tsv': return 'plaintext'; default: return 'plaintext'; } }

function loadMonaco() { return new Promise((resolve, reject) => { if (monaco) { resolve(monaco); return; } const loaderScript = document.createElement('script'); loaderScript.src = 'node_modules/monaco-editor/min/vs/loader.js'; loaderScript.onload = () => { require.config({ paths: { 'vs': 'node_modules/monaco-editor/min/vs' } }); require(['vs/editor/editor.main'], (monacoInstance) => { console.log("Monaco Editor carregado."); monaco = monacoInstance; monaco.editor.setTheme('vs-dark'); resolve(monaco); }, (err) => { console.error("Erro ao carregar módulo principal do Monaco:", err); reject("Falha ao carregar o editor de código."); }); }; loaderScript.onerror = (err) => { console.error("Erro ao carregar loader.js do Monaco:", err); reject("Falha ao carregar script base do editor."); }; document.body.appendChild(loaderScript); }); }
function initializeEditor() { if (!monaco) { showNativeErrorDialog("Erro Crítico", "Monaco Editor não carregado."); return; } if (editor) return; editor = monaco.editor.create(editorContainer, { language: 'plaintext', theme: 'vs-dark', automaticLayout: true, readOnly: true, fontFamily: 'var(--editor-font-family)', fontSize: 14, wordWrap: 'off', minimap: { enabled: true } }); editor.onDidChangeCursorPosition(e => { if (editorContainer.style.display !== 'none') { const pos = e.position; cursorPositionElement.textContent = `Ln ${pos.lineNumber}, Col ${pos.column}`; } else { cursorPositionElement.textContent = ''; } }); editor.onDidChangeModelContent(() => { clearTimeout(autosaveTimer); if (activeFilePath && currentEditorModel) { const fileState = openFiles.get(activeFilePath); if (fileState && (fileState.fileType === 'text' || (fileState.fileType === 'svg' && fileState.svgViewMode === 'source'))) { if (currentEditorModel.originalContent !== undefined) { const currentContent = currentEditorModel.getValue(); const isDirty = currentContent !== currentEditorModel.originalContent; setFileDirty(activeFilePath, isDirty); if (isDirty) { autosaveTimer = setTimeout(() => { console.log(`Autosave triggered for: ${activeFilePath}`); saveFile(activeFilePath); }, AUTOSAVE_DELAY); } } } } });
    initializeProblemsListener();
    console.log("Editor Monaco inicializado."); hideEditorPlaceholder(); }
function showEditorPlaceholder() { if (editorPlaceholder) editorPlaceholder.style.display = 'flex'; }
function hideEditorPlaceholder() { if (editorPlaceholder) editorPlaceholder.style.display = 'none'; }
function showEditor() { editorContainer.style.display = 'block'; imageViewerContainer.style.display = 'none'; hideEditorPlaceholder(); if(editor) editor.layout(); }
function showImageViewer() { editorContainer.style.display = 'none'; imageViewerContainer.style.display = 'flex'; hideEditorPlaceholder(); }

function clearEditor() { clearTimeout(autosaveTimer); if (editor) { editor.setModel(null); editor.updateOptions({ readOnly: true }); } currentEditorModel = null; activeFilePath = null; currentFileInfoElement.textContent = 'Nenhum arquivo aberto'; currentFileInfoElement.title = ''; cursorPositionElement.textContent = ''; imageDimensionsElement.textContent = ''; saveStatusElement.textContent = ''; showEditorPlaceholder(); editorContainer.style.display = 'block'; imageViewerContainer.style.display = 'none'; }
function addEditorTab(filePath) {
    if (openFiles.has(filePath)) { return openFiles.get(filePath).tabElement; }
    const fileName = getFileName(filePath);
    const tab = document.createElement('div');
    tab.className = 'editor-tab';
    tab.dataset.filePath = filePath;
    tab.title = filePath;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', 'false');
    tab.setAttribute('tabindex', '-1');
    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = fileName;
    const dirtyIndicator = document.createElement('span');
    dirtyIndicator.className = 'tab-dirty-indicator';
    dirtyIndicator.setAttribute('aria-hidden', 'true');
    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close-btn';
    closeBtn.innerHTML = '×';
    closeBtn.title = `Fechar ${fileName}`;
    closeBtn.setAttribute('aria-label', `Fechar ${fileName}`);
    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tabElement = e.currentTarget.closest('.editor-tab');
        if (tabElement) { const currentPath = tabElement.dataset.filePath; closeFile(currentPath); }
        else { console.error("Could not find parent tab element for close button."); }
    });
    tab.appendChild(title);
    tab.appendChild(dirtyIndicator);
    tab.appendChild(closeBtn);
    tab.addEventListener('click', (e) => {
        const currentPath = e.currentTarget.dataset.filePath;
        switchToFile(currentPath);
    });
    tab.addEventListener('mousedown', (e) => {
        if (e.button === 1) {
            e.preventDefault();
            e.stopPropagation();
            const currentPath = e.currentTarget.dataset.filePath;
            closeFile(currentPath);
        }
    });
    editorTabsContainer.appendChild(tab);
    const fileState = { tabElement: tab, isDirty: false, fileType: 'text', language: null, dataUrl: null, content: null, fileName: fileName, filePath: filePath };
    openFiles.set(filePath, fileState);
    return tab;
}
function removeEditorTab(filePath) { const fileState = openFiles.get(filePath); if (fileState) { fileState.tabElement.remove(); } openFiles.delete(filePath); const model = editorModels.get(filePath); if (model) { model.dispose(); editorModels.delete(filePath); } editorViewStates.delete(filePath);
    if (allProblems.has(filePath)) {
        allProblems.delete(filePath);
        renderProblemsPanel();
    }
}
function setFileDirty(filePath, isDirty) { const fileState = openFiles.get(filePath); if (!fileState || !(fileState.fileType === 'text' || fileState.fileType === 'svg') || fileState.isDirty === isDirty) return; fileState.isDirty = isDirty; const indicator = fileState.tabElement.querySelector('.tab-dirty-indicator'); if (indicator) { indicator.textContent = isDirty ? '●' : ''; indicator.title = isDirty ? 'Modificado' : ''; } if (filePath === activeFilePath) { updateSaveStatus(); } }
function updateSaveStatus() { const fileState = openFiles.get(activeFilePath); const showDirty = fileState && fileState.isDirty && (fileState.fileType === 'text' || (fileState.fileType === 'svg' && fileState.svgViewMode === 'source')); saveStatusElement.textContent = showDirty ? '* Modificado' : ''; }

async function closeFile(filePath) {
    clearTimeout(autosaveTimer);
    const fileState = openFiles.get(filePath);
    if (!fileState) return;
    if ((fileState.fileType === 'text' || (fileState.fileType === 'svg' && fileState.svgViewMode === 'source')) && fileState.isDirty) {
        const discard = await showConfirmDialog(`"${getFileName(filePath)}" foi modificado.\n\nDeseja fechar e descartar as alterações?`);
        if (!discard) { console.log("Close file cancelled by user confirmation."); return; }
         console.log("Closing dirty file after user confirmation.");
    }
    const wasActive = (filePath === activeFilePath);
    removeEditorTab(filePath);
    if (wasActive) {
        const remainingTabs = Array.from(openFiles.keys());
        if (remainingTabs.length > 0) { switchToFile(remainingTabs[remainingTabs.length - 1]); }
        else { clearEditor(); }
    }
}

async function openFile(filePath) { if (!isSupportedImageView(filePath) && !isEditableTextFile(filePath)) { showNativeErrorDialog('Aviso', `Não é possível abrir "${getFileName(filePath)}" no Lumen IDE.`); return; } if (openFiles.has(filePath)) { switchToFile(filePath); return; } console.log(`Abrindo arquivo: ${filePath}`); if (!editor) initializeEditor(); if (!editor && !isSupportedImageView(filePath)) return; try { const result = await window.electronAPI.readFile(filePath); if (result.type === 'error') { throw new Error(result.error); } addEditorTab(filePath); const fileState = openFiles.get(filePath); fileState.fileType = result.type; fileState.filePath = result.filePath; fileState.fileName = result.fileName; if (result.type === 'text') { fileState.content = result.content; fileState.language = getLanguageForFilePath(filePath); fileState.dataUrl = null; const modelUri = monaco.Uri.file(filePath); let model = monaco.editor.getModel(modelUri); if (!model) model = monaco.editor.createModel(result.content, fileState.language, modelUri); model.originalContent = result.content; editorModels.set(filePath, model);
             updateProblemsForModel(model.uri);
        } else if (result.type === 'image') { fileState.dataUrl = result.dataUrl; fileState.content = null; fileState.language = null; editorModels.set(filePath, null);
        } else if (result.type === 'svg') { fileState.content = result.content; fileState.language = 'xml'; fileState.dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(result.content)}`; fileState.svgViewMode = 'rendered'; const modelUri = monaco.Uri.file(filePath); let model = monaco.editor.getModel(modelUri); if (!model) model = monaco.editor.createModel(result.content, 'xml', modelUri); model.originalContent = result.content; editorModels.set(filePath, model);
             updateProblemsForModel(model.uri);
        } switchToFile(filePath); } catch (error) { console.error(`Erro ao abrir arquivo ${filePath}:`, error); showNativeErrorDialog('Erro ao Abrir Arquivo', `Não foi possível abrir "${getFileName(filePath)}": ${error.message}`); removeEditorTab(filePath); if (activeFilePath === filePath) clearEditor(); } }
function switchToFile(filePath) {
    clearTimeout(autosaveTimer);
    const fileState = openFiles.get(filePath);
    if (!fileState) { console.warn("Tentativa de mudar para arquivo não aberto:", filePath); return; }
    if (filePath === activeFilePath && !fileState.forceSwitch) return;
    if (activeFilePath && editorContainer.style.display !== 'none') { const previousViewState = editor?.saveViewState(); if (previousViewState) editorViewStates.set(activeFilePath, previousViewState); }
    const previouslyActiveTab = activeFilePath ? openFiles.get(activeFilePath)?.tabElement : null;
    if (previouslyActiveTab) { previouslyActiveTab.classList.remove('active'); previouslyActiveTab.setAttribute('aria-selected', 'false'); previouslyActiveTab.setAttribute('tabindex', '-1'); }
    activeFilePath = filePath;
    fileState.tabElement.classList.add('active');
    fileState.tabElement.setAttribute('aria-selected', 'true');
    fileState.tabElement.setAttribute('tabindex', '0');
    fileState.tabElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    fileState.forceSwitch = false;
    cursorPositionElement.textContent = '';
    imageDimensionsElement.textContent = '';
    if (fileState.fileType === 'image' || (fileState.fileType === 'svg' && fileState.svgViewMode === 'rendered')) {
        imageViewerImg.onload = () => { imageDimensionsElement.textContent = `${imageViewerImg.naturalWidth}x${imageViewerImg.naturalHeight}`; imageViewerImg.onload = null; };
        imageViewerImg.onerror = () => { imageViewerError.textContent = `Erro ao carregar ${fileState.fileType}.`; imageViewerError.style.display = 'block'; imageViewerImg.style.display = 'none'; imageDimensionsElement.textContent = ''; imageViewerImg.onerror = null; };
        imageViewerImg.src = fileState.dataUrl;
        imageViewerImg.alt = `Visualização de ${fileState.fileName}`;
        imageViewerImg.style.display = 'block';
        imageViewerError.style.display = 'none';
        if (fileState.fileType === 'svg') { svgToggleViewBtn.textContent = 'Ver Código Fonte'; svgToggleViewBtn.style.display = 'inline-block'; } else { svgToggleViewBtn.style.display = 'none'; }
        showImageViewer();
        currentFileInfoElement.textContent = `${fileState.fileName}`; currentFileInfoElement.title = filePath;
        updateSaveStatus();
    } else if (fileState.fileType === 'text' || (fileState.fileType === 'svg' && fileState.svgViewMode === 'source')) {
        if (!editor) initializeEditor();
        if (!editor) { showNativeErrorDialog("Erro", "Editor não inicializado."); return; }
        currentEditorModel = editorModels.get(filePath);
        if (!currentEditorModel) {
            if (fileState.fileType === 'svg') {
                const modelUri = monaco.Uri.file(filePath);
                currentEditorModel = monaco.editor.createModel(fileState.content, 'xml', modelUri);
                currentEditorModel.originalContent = fileState.content;
                editorModels.set(filePath, currentEditorModel);
                updateProblemsForModel(modelUri);
                console.log("Modelo SVG recriado para modo source.");
            } else {
                console.error("Modelo não encontrado e não é SVG:", filePath);
                showNativeErrorDialog('Erro Interno', `Modelo do editor não encontrado para ${fileState.fileName}.`);
                clearEditor();
                return;
            }
        }
        editor.setModel(currentEditorModel);
        const savedViewState = editorViewStates.get(filePath);
        if (savedViewState) { editor.restoreViewState(savedViewState); }
        else { editor.revealLine(1); }
        editor.updateOptions({ readOnly: false });
        editor.focus();

        if (fileState.fileType === 'svg') { svgToggleViewBtn.textContent = 'Ver Imagem'; svgToggleViewBtn.style.display = 'inline-block'; }
        else { svgToggleViewBtn.style.display = 'none'; }
        showEditor();
        currentFileInfoElement.textContent = `${fileState.fileName}`; currentFileInfoElement.title = filePath;
        updateSaveStatus();
        const currentPos = editor.getPosition();
        if (currentPos) {
            cursorPositionElement.textContent = `Ln ${currentPos.lineNumber}, Col ${currentPos.column}`;
        }
    } else {
        console.error("Tipo de arquivo desconhecido ou estado inválido:", fileState);
        clearEditor();
        showNativeErrorDialog("Erro", `Estado Inválido - Não foi possível determinar como exibir ${fileState.fileName}.`);
    }
    selectFileTreeItem(filePath);
}
async function saveFile(filePathToSave = activeFilePath) {
    if (!filePathToSave) return false;
    const fileState = openFiles.get(filePathToSave);
    if (!fileState) { showNativeErrorDialog('Erro ao Salvar', `Estado inválido para o arquivo ${getFileName(filePathToSave)}.`); return false; }
    if (fileState.fileType === 'image' || (fileState.fileType === 'svg' && fileState.svgViewMode === 'rendered')) { console.warn("Tentativa de salvar arquivo não textual/editável:", filePathToSave); return false; }
    const model = editorModels.get(filePathToSave);
    if (!model) { showNativeErrorDialog('Erro ao Salvar', `Modelo do editor não encontrado para ${getFileName(filePathToSave)}.`); return false; }
    if (!fileState.isDirty) { if (filePathToSave === activeFilePath) { saveStatusElement.textContent = 'Salvo!'; setTimeout(() => { if (activeFilePath === filePathToSave && !openFiles.get(filePathToSave)?.isDirty) saveStatusElement.textContent = ''; }, 1500); } return true; }
    console.log(`Salvando arquivo: ${filePathToSave}`);
    const currentContent = model.getValue();
    if (filePathToSave === activeFilePath) saveStatusElement.textContent = 'Salvando...';
    try {
        const result = await window.electronAPI.writeFile(filePathToSave, currentContent);
        if (result.error) throw new Error(result.error);
        if (result.success) {
            model.originalContent = currentContent;
            setFileDirty(filePathToSave, false);
            clearTimeout(autosaveTimer);
            if (filePathToSave === activeFilePath) {
                saveStatusElement.textContent = 'Salvo!';
                setTimeout(() => { if (activeFilePath === filePathToSave && !openFiles.get(filePathToSave)?.isDirty) saveStatusElement.textContent = ''; }, 2000);
            }
            return true;
        } else { throw new Error("Resultado inesperado do backend ao salvar."); }
    } catch (error) {
        console.error(`Erro ao salvar arquivo ${filePathToSave}:`, error);
        showNativeErrorDialog('Erro ao Salvar', `Não foi possível salvar "${getFileName(filePathToSave)}": ${error.message}`);
        if (filePathToSave === activeFilePath) saveStatusElement.textContent = 'Erro ao salvar!';
        return false;
    }
}

async function saveFileAs() {
    if (!activeFilePath) return false;
    const fileState = openFiles.get(activeFilePath);
    if (!fileState) { 
        showNativeErrorDialog('Erro ao Salvar', 'Nenhum arquivo aberto para salvar.'); 
        return false; 
    }
    if (fileState.fileType === 'image' || (fileState.fileType === 'svg' && fileState.svgViewMode === 'rendered')) {
        showNativeErrorDialog('Erro ao Salvar', 'Não é possível salvar imagens no modo de visualização.');
        return false;
    }

    try {
        const result = await window.electronAPI.showSaveDialog({
            defaultPath: activeFilePath,
            filters: [
                { name: 'Todos os Arquivos', extensions: ['*'] }
            ]
        });

        if (result.canceled || !result.filePath) {
            console.log('Operação "Salvar Como" cancelada pelo usuário');
            return false;
        }

        const newPath = result.filePath;
        const model = editorModels.get(activeFilePath);
        if (!model) {
            showNativeErrorDialog('Erro ao Salvar', 'Modelo do editor não encontrado.');
            return false;
        }

        const currentContent = model.getValue();
        saveStatusElement.textContent = 'Salvando...';

        const writeResult = await window.electronAPI.writeFile(newPath, currentContent);
        if (writeResult.error) throw new Error(writeResult.error);

        // Se o arquivo foi salvo com sucesso, atualizamos o estado
        await updateStateForRename(activeFilePath, newPath);
        saveStatusElement.textContent = 'Salvo!';
        setTimeout(() => {
            if (activeFilePath === newPath && !openFiles.get(newPath)?.isDirty) {
                saveStatusElement.textContent = '';
            }
        }, 2000);

        return true;
    } catch (error) {
        console.error('Erro ao salvar como:', error);
        showNativeErrorDialog('Erro ao Salvar Como', `Não foi possível salvar o arquivo: ${error.message}`);
        saveStatusElement.textContent = 'Erro ao salvar!';
        return false;
    }
}

let draggedItemPath = null;

function handleDragStartLogic(event, path, targetElement) {
     if (!currentFolderPath) { event.preventDefault(); return; }
    console.log(`handleDragStartLogic: Event fired for path: ${path}`, event);
    draggedItemPath = path;
    event.dataTransfer.setData('text/plain', path);
    event.dataTransfer.effectAllowed = 'move';
    targetElement.classList.add('dragging');
}

function handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const targetElement = event.currentTarget;
    const targetPath = targetElement.dataset.filePath;
    const isTargetDirectory = targetElement.dataset.isDirectory === 'true';
    const isRootDropPanel = targetElement.id === 'file-tree-panel';
    let addDragOverClass = false;
    if (draggedItemPath && (isTargetDirectory || isRootDropPanel)) {
        const effectiveTargetPath = isRootDropPanel ? currentFolderPath : targetPath;
        if (draggedItemPath === effectiveTargetPath) { addDragOverClass = false; }
        else if (effectiveTargetPath.startsWith(draggedItemPath + pathSeparator)) { addDragOverClass = false; }
        else if ((draggedItemPath.substring(0, draggedItemPath.lastIndexOf(pathSeparator)) || currentFolderPath) === effectiveTargetPath) { addDragOverClass = false; }
        else if (!isTargetDirectory && !isRootDropPanel) { addDragOverClass = false; }
        else { addDragOverClass = true; }
    }
     if (addDragOverClass) {
         if (isRootDropPanel) { targetElement.classList.add('drag-over-root'); }
         else { targetElement.classList.add('drag-over'); }
     } else {
         if (isRootDropPanel) { targetElement.classList.remove('drag-over-root'); }
         else { targetElement.classList.remove('drag-over'); }
     }
}

function handleDragLeave(event) {
    const targetElement = event.currentTarget;
     if (targetElement.id === 'file-tree-panel') { targetElement.classList.remove('drag-over-root'); }
     else { targetElement.classList.remove('drag-over'); }
}

async function handleDrop(event) {
    event.preventDefault();
    const targetElement = event.currentTarget;
    const isRootDrop = targetElement.id === 'file-tree-panel';
    const targetPath = isRootDrop ? currentFolderPath : targetElement.dataset.filePath;
    if(isRootDrop) { targetElement.classList.remove('drag-over-root'); }
    else { targetElement.classList.remove('drag-over'); }
    const sourcePath = event.dataTransfer.getData('text/plain');
    if (!sourcePath || !targetPath || !draggedItemPath || sourcePath !== draggedItemPath) {
        console.error("Drop error: Missing source or target path, or mismatch.", { sourcePath, targetPath, draggedItemPath });
        draggedItemPath = null; return;
    }
    if (sourcePath === targetPath) { console.log("Drop prevented: Cannot drop item onto itself."); draggedItemPath = null; return; }
    if (targetPath.startsWith(sourcePath + pathSeparator)) { console.log("Drop prevented: Cannot drop a folder into itself or a descendant."); draggedItemPath = null; return; }
     const sourceParentPath = sourcePath.substring(0, sourcePath.lastIndexOf(pathSeparator)) || currentFolderPath;
     if (sourceParentPath === targetPath) { console.log("Drop ignored: Item is already in the target directory."); draggedItemPath = null; return; }
    const sourceFileName = getFileName(sourcePath);
    const newPath = targetPath + pathSeparator + sourceFileName;
    console.log(`Drop detected: Move "${sourcePath}" to "${newPath}"`);
    try {
        const result = await window.electronAPI.renamePath(sourcePath, newPath);
        if (result.error) { throw new Error(result.error); }
        console.log(`Move successful: ${sourcePath} -> ${newPath}`);
        await updateStateForRename(sourcePath, newPath);
        const originalParentPath = sourcePath.substring(0, sourcePath.lastIndexOf(pathSeparator)) || currentFolderPath;
        refreshSubTree(originalParentPath);
        refreshSubTree(targetPath);
    } catch (error) {
        console.error(`Error moving item from ${sourcePath} to ${newPath}:`, error);
        showNativeErrorDialog('Erro ao Mover', `Não foi possível mover "${sourceFileName}": ${error.message}`);
        const originalParentPath = sourcePath.substring(0, sourcePath.lastIndexOf(pathSeparator)) || currentFolderPath;
        refreshSubTree(originalParentPath);
        refreshSubTree(targetPath);
    } finally {
        draggedItemPath = null;
         document.querySelectorAll('.drag-over, .drag-over-root').forEach(el => el.classList.remove('drag-over', 'drag-over-root'));
         document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
    }
}

function handleDragEnd(event) {
    const listItem = event.target.closest('li[draggable="true"]');
    if (listItem) {
         console.log('Drag End for:', listItem.dataset.filePath);
         listItem.classList.remove('dragging');
    } else {
         console.log('Drag End (listItem not found)');
    }
    document.querySelectorAll('.drag-over, .drag-over-root').forEach(el => el.classList.remove('drag-over', 'drag-over-root'));
    draggedItemPath = null;
}

function renderTreeItem(item, parentElement, depth = 0) {
    const listItem = document.createElement('li');
    listItem.dataset.filePath = item.path;
    listItem.dataset.isDirectory = item.isDirectory;
    listItem.dataset.depth = depth;
    listItem.title = item.path;
    listItem.classList.add(item.isDirectory ? 'type-directory' : 'type-file');
    listItem.setAttribute('draggable', 'true');
    if (item.isDirectory) {
        listItem.addEventListener('dragover', handleDragOver);
        listItem.addEventListener('dragleave', handleDragLeave);
        listItem.addEventListener('drop', handleDrop);
    }
    const itemContent = document.createElement('div');
    itemContent.className = 'tree-item-content';
    const expandIconContainer = document.createElement('span');
    expandIconContainer.className = 'expand-icon-container';
    if (item.isDirectory) {
        const expandIcon = document.createElement('span');
        expandIcon.className = 'expand-icon';
        expandIcon.setAttribute('aria-hidden', 'true');
        expandIconContainer.appendChild(expandIcon);
        listItem.setAttribute('aria-expanded', 'false');
    }
    itemContent.appendChild(expandIconContainer);
    const typeIcon = document.createElement('i');
    typeIcon.className = 'tree-icon ' + getIconClassForFilePath(item.path, item.isDirectory);
    typeIcon.setAttribute('aria-hidden', 'true');
    itemContent.appendChild(typeIcon);
    const nameSpan = document.createElement('span');
    nameSpan.className = 'item-name';
    nameSpan.textContent = item.name;
    itemContent.appendChild(nameSpan);
    listItem.appendChild(itemContent);
    listItem.style.setProperty('--depth', depth);
    listItem.addEventListener('click', (e) => {
        e.stopPropagation();
        handleTreeItemClick(item, listItem);
    });
    listItem.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showContextMenu(e, 'tree-item', item);
        selectFileTreeItem(item.path);
    });
    parentElement.appendChild(listItem);
    if (item.isDirectory) {
        const subList = document.createElement('ul');
        subList.style.display = 'none';
        listItem.appendChild(subList);
    }
}

async function handleTreeItemClick(item, listItemElement) { selectFileTreeItem(item.path); if (item.isFile) { if (isEditableTextFile(item.path) || isSupportedImageView(item.path)) { openFile(item.path); } else { showNativeErrorDialog('Aviso', `Não é possível abrir "${getFileName(item.path)}" no Lumen IDE.`); } } else if (item.isDirectory) { const subList = listItemElement.querySelector('ul'); if (!subList) return; const isExpanded = listItemElement.classList.contains('expanded'); if (isExpanded) { subList.style.display = 'none'; listItemElement.classList.remove('expanded'); listItemElement.setAttribute('aria-expanded', 'false'); } else { if (subList.children.length === 0 || subList.dataset.needsRefresh === 'true') { listItemElement.classList.add('loading'); subList.innerHTML = '<li class="placeholder">Carregando...</li>'; subList.style.display = 'block'; try { const subItemsResult = await window.electronAPI.readDirectory(item.path); listItemElement.classList.remove('loading'); subList.innerHTML = ''; if (subItemsResult.error) throw new Error(subItemsResult.error); const subItems = subItemsResult; if (subItems.length === 0) { const emptyMsg = document.createElement('li'); emptyMsg.textContent = '(Vazio)'; emptyMsg.classList.add('placeholder'); emptyMsg.style.paddingLeft = `calc(var(--tree-indentation) * (${parseInt(listItemElement.dataset.depth ?? '0') + 1}))`; subList.appendChild(emptyMsg); } else { subItems.forEach(subItem => renderTreeItem(subItem, subList, parseInt(listItemElement.dataset.depth ?? '0') + 1)); } subList.dataset.needsRefresh = 'false'; listItemElement.classList.add('expanded'); listItemElement.setAttribute('aria-expanded', 'true'); subList.style.display = 'block'; } catch (error) { listItemElement.classList.remove('loading'); console.error(`Erro ao expandir diretório ${item.path}:`, error); subList.innerHTML = `<li class="placeholder error">Erro ao carregar</li>`; showNativeErrorDialog('Erro ao Ler Pasta', `Não foi possível ler "${item.name}": ${error.message}`); subList.style.display = 'none'; } } else { subList.style.display = 'block'; listItemElement.classList.add('expanded'); listItemElement.setAttribute('aria-expanded', 'true'); } } } }
function selectFileTreeItem(filePath) { fileTreeElement.querySelectorAll('li.selected').forEach(el => el.classList.remove('selected')); const itemToSelect = fileTreeElement.querySelector(`li[data-file-path="${CSS.escape(filePath)}"]`); if (itemToSelect) { itemToSelect.classList.add('selected'); } }

async function refreshTree(folderPath = currentFolderPath, targetElement = fileTreeElement, depth = 0) { if (!folderPath) return; const isRoot = (targetElement === fileTreeElement); targetElement.innerHTML = '<li class="placeholder" style="padding-left: 15px;">Carregando...</li>'; try { const itemsResult = await window.electronAPI.readDirectory(folderPath); targetElement.innerHTML = ''; if (itemsResult.error) throw new Error(itemsResult.error); const items = itemsResult; if (items.length === 0) { const emptyMsgText = isRoot ? 'Pasta vazia. Clique direito ou use botões para criar.' : '(Vazio)'; const emptyMsg = document.createElement('li'); emptyMsg.textContent = emptyMsgText; emptyMsg.classList.add('placeholder'); emptyMsg.style.paddingLeft = `calc(var(--tree-indentation) * ${depth + 1})`; targetElement.appendChild(emptyMsg); } else { items.forEach(item => renderTreeItem(item, targetElement, depth)); } } catch (error) { console.error("Erro ao recarregar árvore/sub-árvore:", error); const errorMsg = `<li class="placeholder error" style="padding-left: 15px;">Erro: ${error.message.length > 50 ? error.message.substring(0, 50) + '...' : error.message}</li>`; targetElement.innerHTML = errorMsg; if (isRoot) showNativeErrorDialog('Erro na Árvore', `Não foi possível carregar arquivos: ${error.message}`); } }
function refreshSubTree(folderPath) { if (!folderPath || folderPath === '') { console.warn("Tentativa de refreshSubTree com path inválido."); return; } console.log(`Solicitado refresh para a pasta: ${folderPath}`); if (folderPath === currentFolderPath) { refreshTree(currentFolderPath, fileTreeElement, 0); } else { const parentLiElement = fileTreeElement.querySelector(`li[data-file-path="${CSS.escape(folderPath)}"]`); if (parentLiElement && parentLiElement.dataset.isDirectory === 'true') { const subListElement = parentLiElement.querySelector('ul'); if (subListElement) { const depth = parseInt(parentLiElement.dataset.depth || '0') + 1; refreshTree(folderPath, subListElement, depth); if (!parentLiElement.classList.contains('expanded')) { parentLiElement.classList.add('expanded'); parentLiElement.setAttribute('aria-expanded', 'true'); subListElement.style.display = 'block'; } } else { console.warn(`Sub-lista não encontrada para ${folderPath} ao tentar refreshSubTree.`); } } else { console.warn(`Elemento LI não encontrado ou não é diretório para ${folderPath} ao tentar refreshSubTree.`); const grandParentPath = folderPath.includes(pathSeparator) ? folderPath.substring(0, folderPath.lastIndexOf(pathSeparator)) : currentFolderPath; refreshSubTree(grandParentPath || currentFolderPath); } } }

async function loadDirectory(folderPath) {
    console.log(`Carregando diretório raiz: ${folderPath}`);
    if (isLiveServerRunning && currentLiveServerFolder !== folderPath) { console.log("Pasta diferente aberta, parando Live Server anterior..."); await stopLiveServer(); }
    currentFolderPath = folderPath;
    const folderName = getFileName(folderPath);
    currentFolderElement.textContent = `${folderName}`;
    currentFolderElement.title = folderPath;
    clearTimeout(autosaveTimer);
    const openPaths = Array.from(openFiles.keys());
    for (const path of openPaths) { removeEditorTab(path); }
    clearEditor();
    editorModels.forEach(model => model.dispose());
    editorModels.clear();
    editorViewStates.clear();
    allProblems.clear();
    renderProblemsPanel();
    await refreshTree(folderPath);
    newFileBtn.disabled = false;
    newFolderBtn.disabled = false;
    liveServerBtn.disabled = false;
}

function showInputDialog(labelText, defaultValue = '') { console.log('[showInputDialog] Called. Label:', labelText, 'Default:', defaultValue); return new Promise((resolve) => { inputDialogLabel.textContent = labelText; inputDialogInput.value = defaultValue; inputDialogOverlay.style.display = 'flex'; inputDialogInput.focus(); inputDialogInput.select(); console.log('[showInputDialog] Dialog displayed, input focused.'); let resolved = false; const handleOk = () => { console.log('[showInputDialog] handleOk triggered.'); if(resolved) { console.log('[showInputDialog] handleOk ignored (already resolved).'); return; } resolved = true; const value = inputDialogInput.value; console.log(`[showInputDialog] OK clicked. Input value: "${value}"`); cleanup(); console.log('[showInputDialog] Resolving promise with value:', value); resolve(value); }; const handleCancel = () => { console.log('[showInputDialog] handleCancel triggered.'); if(resolved) { console.log('[showInputDialog] handleCancel ignored (already resolved).'); return; } resolved = true; console.log('[showInputDialog] Cancel clicked or Escape pressed.'); cleanup(); console.log('[showInputDialog] Resolving promise with null.'); resolve(null); }; const handleKeydown = (e) => { if (e.key === 'Enter' || e.key === 'Escape') { console.log(`[showInputDialog] handleKeydown triggered. Key: ${e.key}`); } if (e.key === 'Enter') { handleOk(); } else if (e.key === 'Escape') { handleCancel(); } }; const handleOverlayClick = (e) => { console.log('[showInputDialog] handleOverlayClick triggered. Target:', e.target); if (e.target === inputDialogOverlay) { console.log('[showInputDialog] Overlay background clicked, calling handleCancel.'); handleCancel(); } }; const cleanup = () => { console.log('[showInputDialog] cleanup called.'); inputDialogOkBtn.removeEventListener('click', handleOk); inputDialogCancelBtn.removeEventListener('click', handleCancel); inputDialogInput.removeEventListener('keydown', handleKeydown); inputDialogOverlay.removeEventListener('click', handleOverlayClick); inputDialogOverlay.style.display = 'none'; inputDialogInput.value = ''; console.log('[showInputDialog] Event listeners removed, dialog hidden.'); }; console.log('[showInputDialog] Adding event listeners...'); inputDialogOkBtn.addEventListener('click', handleOk); inputDialogCancelBtn.addEventListener('click', handleCancel); inputDialogInput.addEventListener('keydown', handleKeydown); inputDialogOverlay.addEventListener('click', handleOverlayClick); console.log('[showInputDialog] Event listeners added.'); }); }

function showConfirmDialog(message) {
    console.log('[showConfirmDialog] Called. Message:', message);
    return new Promise((resolve) => {
        confirmDialogMessage.textContent = message;
        confirmDialogOverlay.style.display = 'flex';
        confirmDialogOkBtn.focus();
        console.log('[showConfirmDialog] Dialog displayed.');
        let resolved = false;
        const handleOk = () => { console.log('[showConfirmDialog] handleOk triggered.'); if(resolved) return; resolved = true; console.log('[showConfirmDialog] OK clicked.'); cleanup(); console.log('[showConfirmDialog] Resolving promise with true.'); resolve(true); };
        const handleCancel = () => { console.log('[showConfirmDialog] handleCancel triggered.'); if(resolved) return; resolved = true; console.log('[showConfirmDialog] Cancel clicked or Escape pressed.'); cleanup(); console.log('[showConfirmDialog] Resolving promise with false.'); resolve(false); };
        const handleKeydown = (e) => { if (!confirmDialog.contains(document.activeElement)) return; if (e.key === 'Enter' || e.key === ' ') { console.log(`[showConfirmDialog] handleKeydown triggered. Key: ${e.key} on focused:`, document.activeElement); if (document.activeElement === confirmDialogOkBtn) handleOk(); else if (document.activeElement === confirmDialogCancelBtn) handleCancel(); e.preventDefault(); } else if (e.key === 'Escape') { console.log('[showConfirmDialog] handleKeydown triggered. Key: Escape'); handleCancel(); } else if (e.key === 'Tab') { console.log('[showConfirmDialog] handleKeydown triggered. Key: Tab'); } };
        const handleOverlayClick = (e) => { console.log('[showConfirmDialog] handleOverlayClick triggered. Target:', e.target); if (e.target === confirmDialogOverlay) { console.log('[showConfirmDialog] Overlay background clicked, calling handleCancel.'); handleCancel(); } };
        const cleanup = () => { console.log('[showConfirmDialog] cleanup called.'); confirmDialogOkBtn.removeEventListener('click', handleOk); confirmDialogCancelBtn.removeEventListener('click', handleCancel); confirmDialogOverlay.removeEventListener('keydown', handleKeydown, true); confirmDialogOverlay.removeEventListener('click', handleOverlayClick); confirmDialogOverlay.style.display = 'none'; console.log('[showConfirmDialog] Event listeners removed, dialog hidden.'); };
        console.log('[showConfirmDialog] Adding event listeners...'); confirmDialogOkBtn.addEventListener('click', handleOk); confirmDialogCancelBtn.addEventListener('click', handleCancel); confirmDialogOverlay.addEventListener('keydown', handleKeydown, true); confirmDialogOverlay.addEventListener('click', handleOverlayClick); console.log('[showConfirmDialog] Event listeners added.');
    });
}

function showContextMenu(event, type, item) {
    contextMenuElement.innerHTML = '';
    const menuItems = document.createElement('ul');
    let targetPathForMenu = null;

    if (type === 'tree-item' && item && item.path) {
        contextMenuTarget = item.path;
        targetPathForMenu = item.path;
        const isDirectory = item.isDirectory === 'true' || item.isDirectory === true;

        if (isDirectory) {
            menuItems.appendChild(createMenuItem('Novo Arquivo...', 'new-file'));
            menuItems.appendChild(createMenuItem('Nova Pasta...', 'new-folder'));
            menuItems.appendChild(createMenuItem('---'));
        }
        menuItems.appendChild(createMenuItem('Renomear...', 'rename'));
        menuItems.appendChild(createMenuItem('Excluir', 'delete'));
        menuItems.appendChild(createMenuItem('---'));

        menuItems.appendChild(createMenuItem('Copiar Caminho', 'copy-path'));
        if (currentFolderPath) {
             menuItems.appendChild(createMenuItem('Copiar Caminho Relativo', 'copy-relative-path'));
        }
        menuItems.appendChild(createMenuItem('---'));

    } else if (type === 'tree-empty' && currentFolderPath) {
        contextMenuTarget = currentFolderPath;
        targetPathForMenu = currentFolderPath;

        menuItems.appendChild(createMenuItem('Novo Arquivo...', 'new-file'));
        menuItems.appendChild(createMenuItem('Nova Pasta...', 'new-folder'));
         menuItems.appendChild(createMenuItem('---'));
         menuItems.appendChild(createMenuItem('Copiar Caminho', 'copy-path'));

    } else {
        return;
    }

    if (currentFolderPath) {
         menuItems.appendChild(createMenuItem('Recarregar Pasta Pai', 'refresh-parent'));
    }


    if (menuItems.children.length > 0) {
        contextMenuElement.appendChild(menuItems);
    } else {
        return;
    }


    contextMenuElement.style.left = `${event.clientX}px`;
    contextMenuElement.style.top = `${event.clientY}px`;
    contextMenuElement.style.display = 'block';

    const closeMenuHandler = (e) => {
        if (!contextMenuElement.contains(e.target)) {
            hideContextMenu();
            document.removeEventListener('click', closeMenuHandler, true);
            document.removeEventListener('contextmenu', closeMenuHandler, true);
        }
    };
    setTimeout(() => {
        document.addEventListener('click', closeMenuHandler, true);
        document.addEventListener('contextmenu', closeMenuHandler, true);
    }, 50);
}

function hideContextMenu() { contextMenuElement.style.display = 'none'; contextMenuTarget = null; }
function createMenuItem(label, command, disabled = false) { const li = document.createElement('li'); li.setAttribute('role', 'menuitem'); if (label === '---') { li.className = 'separator'; li.setAttribute('aria-hidden', 'true'); return li; } li.textContent = label; if (disabled) { li.classList.add('disabled'); li.setAttribute('aria-disabled', 'true'); } else { li.dataset.command = command; li.setAttribute('tabindex', '-1'); li.addEventListener('click', () => { if (contextMenuTarget !== null || ['refresh-parent'].includes(command)) { handleContextMenuCommand(command, contextMenuTarget); } hideContextMenu(); }); } return li; }

async function handleContextMenuCommand(command, targetPath) {
    console.log(`Context menu command received: ${command}, Target: ${targetPath}`);

    if (command === 'refresh-parent') {
         let dirToRefreshParent = currentFolderPath;
         if (targetPath && targetPath !== currentFolderPath && targetPath.includes(pathSeparator)) {
             dirToRefreshParent = targetPath.substring(0, targetPath.lastIndexOf(pathSeparator)) || currentFolderPath;
         }
         console.log(`[Renderer] Refreshing parent directory: ${dirToRefreshParent}`);
         refreshSubTree(dirToRefreshParent);
         return;
    }

    if (!targetPath && command !== 'copy-path' && command !== 'copy-relative-path') {
         showNativeErrorDialog('Erro', 'Alvo inválido ou nenhuma pasta aberta.');
         return;
    }
    if (!currentFolderPath && !['copy-path', 'copy-relative-path'].includes(command)) {
         showNativeErrorDialog('Erro', 'Nenhuma Pasta Aberta.');
         return;
    }

    let parentDirForAction = targetPath;
    let targetName = targetPath ? getFileName(targetPath) : 'raiz';
    let isTargetDirectory = false;
    const targetElement = targetPath ? fileTreeElement.querySelector(`li[data-file-path="${CSS.escape(targetPath)}"]`) : null;
    let dirToRefreshAfterAction = currentFolderPath;

    if (targetElement) {
        isTargetDirectory = targetElement.dataset.isDirectory === 'true';
        parentDirForAction = targetPath.includes(pathSeparator) ? targetPath.substring(0, targetPath.lastIndexOf(pathSeparator)) : currentFolderPath;
        if (['new-file', 'new-folder'].includes(command) && isTargetDirectory) {
            parentDirForAction = targetPath;
        }
         dirToRefreshAfterAction = (['new-file', 'new-folder'].includes(command) && isTargetDirectory) ? targetPath : parentDirForAction;
    } else if (targetPath === currentFolderPath && ['new-file', 'new-folder'].includes(command)) {
        isTargetDirectory = true;
        parentDirForAction = currentFolderPath;
        targetName = getFileName(currentFolderPath) || 'Raiz';
        dirToRefreshAfterAction = currentFolderPath;
    } else if (!targetPath && (command === 'copy-path' || command === 'copy-relative-path')) {
        targetPath = currentFolderPath;
        targetName = getFileName(currentFolderPath) || 'Raiz';
        isTargetDirectory = true;
        parentDirForAction = currentFolderPath;
        dirToRefreshAfterAction = currentFolderPath;
    } else if (!targetElement && !['new-file', 'new-folder', 'copy-path', 'copy-relative-path'].includes(command)) {
         showNativeErrorDialog('Erro', `Alvo Inválido ou Desatualizado: "${targetPath}"`);
         return;
    }


    if (!dirToRefreshAfterAction || dirToRefreshAfterAction === '') dirToRefreshAfterAction = currentFolderPath;
    if (!parentDirForAction || parentDirForAction === '') parentDirForAction = currentFolderPath;

    console.log(`Determined - Action Parent Dir: ${parentDirForAction}, Dir to Refresh: ${dirToRefreshAfterAction}, Target Path: ${targetPath}, Target Name: ${targetName}, Is Directory: ${isTargetDirectory}`);

    try {
        let result;
        switch (command) {
            case 'new-file':
                const newFileName = await showInputDialog(`Novo arquivo em "${getFileName(parentDirForAction) || 'raiz'}":`, 'novo-arquivo.txt');
                if (newFileName?.trim()) {
                    const newFilePath = parentDirForAction + pathSeparator + newFileName.trim();
                    result = await window.electronAPI.createFile(newFilePath);
                    if (result.error) throw new Error(result.error);
                    refreshSubTree(dirToRefreshAfterAction);
                    if (isEditableTextFile(newFilePath) || isSupportedImageView(newFilePath)) {
                       await openFile(newFilePath);
                    }
                } else { console.log("[handleContextMenuCommand] File creation skipped (dialog cancelled)."); }
                break;
            case 'new-folder':
                const newFolderName = await showInputDialog(`Nova pasta em "${getFileName(parentDirForAction) || 'raiz'}":`, 'nova-pasta');
                 if (newFolderName?.trim()) {
                    const newDirPath = parentDirForAction + pathSeparator + newFolderName.trim();
                    result = await window.electronAPI.createDirectory(newDirPath);
                    if (result.error) throw new Error(result.error);
                    refreshSubTree(dirToRefreshAfterAction);
                } else { console.log("[handleContextMenuCommand] Folder creation skipped (dialog cancelled)."); }
                break;
            case 'rename':
                 const actualParentDirRename = targetPath.substring(0, targetPath.lastIndexOf(pathSeparator)) || currentFolderPath;
                 dirToRefreshAfterAction = actualParentDirRename || currentFolderPath;
                 const newName = await showInputDialog(`Renomear "${targetName}":`, targetName);
                 if (newName?.trim() && newName.trim() !== targetName) {
                     const newPath = actualParentDirRename + pathSeparator + newName.trim();
                     result = await window.electronAPI.renamePath(targetPath, newPath);
                     if (result.error) throw new Error(result.error);
                     await updateStateForRename(targetPath, newPath);
                     refreshSubTree(dirToRefreshAfterAction);
                 } else { console.log("[handleContextMenuCommand] Rename skipped (dialog cancelled or name unchanged)."); }
                 break;
            case 'delete':
                 const confirmDelete = await showConfirmDialog(`Tem certeza que deseja excluir ${isTargetDirectory ? 'pasta' : 'arquivo'} "${targetName}"?\nEsta ação NÃO pode ser desfeita!`);
                 if (confirmDelete) {
                    const actualParentDirDel = targetPath.substring(0, targetPath.lastIndexOf(pathSeparator)) || currentFolderPath;
                    dirToRefreshAfterAction = actualParentDirDel || currentFolderPath;
                    await closeTabsForPath(targetPath, isTargetDirectory);
                    result = await window.electronAPI.deletePath(targetPath);
                    if (result.error) throw new Error(result.error);
                    refreshSubTree(dirToRefreshAfterAction);
                } else { console.log("[handleContextMenuCommand] Deletion cancelled by user."); }
                break;

            case 'copy-path':
                if (!targetPath) { throw new Error("Nenhum caminho de destino especificado para copiar."); }
                console.log(`Copiando caminho absoluto: ${targetPath}`);
                result = await window.electronAPI.writeToClipboard(targetPath);
                if (!result || !result.success) { throw new Error(result.error || "Falha ao copiar para a área de transferência."); }
                console.log("Caminho absoluto copiado.");
                break;

            case 'copy-relative-path':
                if (!targetPath) { throw new Error("Nenhum caminho de destino especificado para copiar."); }
                if (!currentFolderPath) { throw new Error("Nenhuma pasta raiz aberta para calcular o caminho relativo."); }

                let relativePath = targetPath;

                const normalizedTargetPath = targetPath.replace(/\\/g, pathSeparator);
                const normalizedCurrentFolder = currentFolderPath.replace(/\\/g, pathSeparator);

                if (normalizedTargetPath.startsWith(normalizedCurrentFolder)) {
                    relativePath = normalizedTargetPath.substring(normalizedCurrentFolder.length);
                    if (relativePath.startsWith(pathSeparator)) {
                        relativePath = relativePath.substring(pathSeparator.length);
                    }
                    if (relativePath === '') {
                        relativePath = '.';
                    }
                } else {
                     console.warn(`[handleContextMenuCommand] Caminho de destino (${targetPath}) não começa com a pasta atual (${currentFolderPath}). Não foi possível calcular o caminho relativo corretamente. Copiando caminho absoluto como fallback.`);
                }

                console.log(`Copiando caminho relativo: ${relativePath}`);
                result = await window.electronAPI.writeToClipboard(relativePath);
                 if (!result || !result.success) { throw new Error(result.error || "Falha ao copiar para a área de transferência."); }
                 console.log("Caminho relativo copiado.");
                break;

            default:
                console.warn(`Comando de menu não implementado: ${command}`);
        }
    } catch (error) {
        console.error(`[Renderer] Erro ao executar comando '${command}' em '${targetPath || 'raiz'}':`, error);
        showNativeErrorDialog(`Erro - ${command}`, `Falha ao executar operação: ${error.message}`);
        if (['new-file', 'new-folder', 'rename', 'delete'].includes(command)) {
            refreshSubTree(dirToRefreshAfterAction);
        }
    }
}


async function updateStateForRename(oldPath, newPath) {
    const isDirectory = !(oldPath.includes('.') || newPath.includes('.'));
    console.log(`Updating state for rename/move: ${oldPath} -> ${newPath}`);

    if (isDirectory) {
        const prefix = oldPath + pathSeparator;
        const affectedProblemPaths = Array.from(allProblems.keys()).filter(p => p.startsWith(prefix));
        for (const p of affectedProblemPaths) {
            const problems = allProblems.get(p);
            if (problems) {
                const newSubPath = newPath + pathSeparator + p.substring(prefix.length);
                allProblems.delete(p);
                allProblems.set(newSubPath, problems);
            }
        }

        const affectedOpenPaths = Array.from(openFiles.keys()).filter(p => p.startsWith(prefix));
        console.log(`Updating directory state for tabs: ${affectedOpenPaths.join(', ')}`);
        for (const p of affectedOpenPaths) {
            const newSubPath = newPath + pathSeparator + p.substring(prefix.length);
            await updateSingleRenamedFileState(p, newSubPath);
        }
        if (openFiles.has(oldPath)) {
            await updateSingleRenamedFileState(oldPath, newPath);
        }
    } else {
        if (allProblems.has(oldPath)) {
            const problems = allProblems.get(oldPath);
            allProblems.delete(oldPath);
            allProblems.set(newPath, problems);
        }
        await updateSingleRenamedFileState(oldPath, newPath);
    }

    const selectedItem = fileTreeElement.querySelector('li.selected');
    if (selectedItem && selectedItem.dataset.filePath === oldPath) {
        selectFileTreeItem(newPath);
    }

    renderProblemsPanel();
}

async function updateSingleRenamedFileState(oldPath, newPath) {
    if (!openFiles.has(oldPath)) { console.warn(`[updateSingle] Estado não encontrado para oldPath: ${oldPath}`); return; }
    console.log(`[updateSingle] Start: ${oldPath} -> ${newPath}`);
    const fileState = openFiles.get(oldPath);
    const oldModel = editorModels.get(oldPath);
    const viewState = editorViewStates.get(oldPath);
    const wasActive = (activeFilePath === oldPath);
    let newModel = null;

    if (wasActive && editor && editor.getModel() === oldModel) {
        console.log(`[updateSingle] Desvinculando modelo do editor ativo: ${oldPath}`);
        editor.setModel(null);
        currentEditorModel = null;
    }

    fileState.tabElement.dataset.filePath = newPath;
    fileState.tabElement.title = newPath;
    const newFileName = getFileName(newPath);
    fileState.tabElement.querySelector('.tab-title').textContent = newFileName;
    fileState.tabElement.querySelector('.tab-close-btn').title = `Fechar ${newFileName}`;
    fileState.tabElement.querySelector('.tab-close-btn').setAttribute('aria-label', `Fechar ${newFileName}`);

    fileState.filePath = newPath;
    fileState.fileName = newFileName;
    const oldLanguage = fileState.language;
    fileState.language = getLanguageForFilePath(newPath);
    const oldFileType = fileState.fileType;

    let newFileType = 'text';
    if (isSvgFile(newPath)) { newFileType = 'svg'; }
    else if (isSupportedImageView(newPath)) { newFileType = 'image'; fileState.svgViewMode = undefined; }
    else if (isEditableTextFile(newPath)) { newFileType = 'text'; fileState.svgViewMode = undefined; }
    else { newFileType = 'unsupported'; fileState.svgViewMode = undefined; }
    fileState.fileType = newFileType;
    console.log(`[updateSingle] Novo tipo de arquivo determinado: ${newFileType}`);

    openFiles.delete(oldPath);
    editorModels.delete(oldPath);
    editorViewStates.delete(oldPath);
    console.log(`[updateSingle] Estado antigo removido dos mapas para: ${oldPath}`);

    if (newFileType === 'unsupported') {
        console.warn(`[updateSingle] Renomeado/Movido para tipo não suportado: ${newPath}, fechando aba.`);
        fileState.tabElement.remove();
        oldModel?.dispose();
        if (wasActive) {
            const remainingTabs = Array.from(openFiles.keys());
            if (remainingTabs.length > 0) { switchToFile(remainingTabs[remainingTabs.length - 1]); }
            else { clearEditor(); }
        }
        console.log(`[updateSingle] Processamento interrompido para tipo não suportado: ${newPath}`);
        return;
    }

    if (oldModel && (newFileType === 'text' || newFileType === 'svg')) {
        const newModelUri = monaco.Uri.file(newPath);
        const existingModelForNewPath = monaco.editor.getModel(newModelUri);

        if (existingModelForNewPath && existingModelForNewPath !== oldModel) {
            console.warn("[updateSingle] Modelo para novo caminho já existe. Usando existente, descartando antigo.");
            newModel = existingModelForNewPath;
            oldModel.dispose();
        }
        else if (!existingModelForNewPath) {
             try {
                const currentContent = oldModel.getValue();
                oldModel.dispose(); console.log(`[updateSingle] Modelo antigo descartado para: ${oldPath}`);
                newModel = monaco.editor.createModel(currentContent, fileState.language, newModelUri);
                newModel.originalContent = oldModel.originalContent;
                console.log(`[updateSingle] Novo modelo criado para: ${newPath}`);
             } catch (createError) {
                 console.error(`[updateSingle] Erro ao criar novo modelo para ${newPath}:`, createError);
                 showNativeErrorDialog("Erro ao Renomear/Mover", `Falha ao atualizar o editor para ${newFileName}.`);
                 newModel = null;
             }
        } else {
            console.warn("[updateSingle] URI do modelo existente coincide com URI antigo - estado inconsistente?");
            oldModel.dispose();
            newModel = null;
        }
    } else if (oldModel) {
        oldModel.dispose();
        console.log(`[updateSingle] Modelo antigo descartado para ${oldPath} pois novo tipo é ${newFileType}`);
    }

    openFiles.set(newPath, fileState);
    if (newModel) { editorModels.set(newPath, newModel); console.log(`[updateSingle] Novo modelo adicionado ao mapa para: ${newPath}`); }
    if (viewState) { editorViewStates.set(newPath, viewState); console.log(`[updateSingle] View state adicionado ao mapa para: ${newPath}`); }
    console.log(`[updateSingle] Novo estado adicionado aos mapas para: ${newPath}`);

    if (wasActive && editor) {
        console.log(`[updateSingle] Reconectando/atualizando view para arquivo ativo renomeado/movido: ${newPath}`);
        activeFilePath = newPath;

        if (newModel && (newFileType === 'text' || (newFileType === 'svg' && fileState.svgViewMode === 'source'))) {
            currentEditorModel = newModel;
            editor.setModel(currentEditorModel);
            if (viewState) {
                editor.restoreViewState(viewState);
                console.log(`[updateSingle] View state restaurado para: ${newPath}`);
            } else {
                editor.revealLine(1);
            }
            editor.focus();
            currentFileInfoElement.textContent = `${newFileName}`; currentFileInfoElement.title = newPath; updateSaveStatus();
            const currentPos = editor.getPosition(); if (currentPos) cursorPositionElement.textContent = `Ln ${currentPos.lineNumber}, Col ${currentPos.column}`;
            imageDimensionsElement.textContent = '';
            console.log(`[updateSingle] Editor reconectado e focado para: ${newPath}`);
        }
        else if (newFileType === 'image' || (newFileType === 'svg' && fileState.svgViewMode === 'rendered')) {
             console.log(`[updateSingle] Arquivo ativo renomeado/movido para ${newFileType}, alternando para visualizador via switchToFile.`);
             currentFileInfoElement.textContent = `${newFileName}`; currentFileInfoElement.title = newPath; imageDimensionsElement.textContent = ''; cursorPositionElement.textContent = ''; updateSaveStatus();
             fileState.forceSwitch = true;
             switchToFile(newPath);
        }
        else {
            console.warn(`[updateSingle] Não é possível reconectar modelo para ${newPath}, tipo ${newFileType} ou modelo é nulo.`);
            clearEditor();
        }
    } else if (wasActive) {
        console.error("[updateSingle] wasActive é true, mas a instância do editor não existe!");
        clearEditor();
    }

    if (newModel) {
       updateProblemsForModel(newModel.uri);
    }

    console.log(`[updateSingle] End: ${oldPath} -> ${newPath}.`);
}

async function closeTabsForPath(targetPath, isDirectory) {
    const prefix = targetPath + pathSeparator;
    const pathsToClose = Array.from(openFiles.keys()).filter(p =>
        p === targetPath || (isDirectory && p.startsWith(prefix))
    );

    if (pathsToClose.length > 0) {
        console.log(`Fechando abas para exclusão/renomeação de diretório: ${pathsToClose.join(', ')}`);
        let activeTabNeedsSwitching = false;

        const pathsIterator = [...pathsToClose];

        for (const p of pathsIterator) {
            if (p === activeFilePath) {
                activeTabNeedsSwitching = true;
                if (editor) {
                    clearTimeout(autosaveTimer);
                    editor.setModel(null);
                    currentEditorModel = null;
                    activeFilePath = null;
                    console.log(`[closeTabsForPath] Editor model detached for active tab (${p}) being closed.`);
                }
            }
            removeEditorTab(p);
            console.log(`[closeTabsForPath] Tab and state removed for: ${p}`);
        }

        if (activeTabNeedsSwitching) {
             const remainingTabs = Array.from(openFiles.keys());
            if (remainingTabs.length > 0) {
                console.log("[closeTabsForPath] Alternando para a última aba restante após fechar a ativa.");
                switchToFile(remainingTabs[remainingTabs.length - 1]);
            } else {
                console.log("[closeTabsForPath] Nenhuma aba restante após fechar a ativa. Clearing editor.");
                clearEditor();
            }
        }
    }
}

async function performSearch() { const searchTerm = searchInput.value.trim(); if (!searchTerm) { showNativeErrorDialog('Pesquisa', 'Digite um termo para pesquisar.'); return; } if (!currentFolderPath) { showNativeErrorDialog('Pesquisa', 'Abra uma pasta antes de pesquisar.'); return; } console.log(`Iniciando busca por "${searchTerm}" em ${currentFolderPath}`); searchStatusElement.textContent = `Buscando por "${searchTerm}"...`; searchResultsContainer.innerHTML = ''; searchButton.disabled = true; currentSearchTerm = searchTerm; try { const result = await window.electronAPI.searchInProject({ searchTerm, folderPath: currentFolderPath }); searchButton.disabled = false; if (result.error) throw new Error(result.error); searchStatusElement.textContent = `${result.results.length} resultado(s) para "${searchTerm}"`; if (result.results.length === 0) { searchResultsContainer.innerHTML = '<li>Nenhum resultado encontrado.</li>'; } else { const resultsByFile = result.results.reduce((acc, match) => { if (!acc[match.filePath]) acc[match.filePath] = []; acc[match.filePath].push(match); return acc; }, {}); for (const filePath in resultsByFile) { const matches = resultsByFile[filePath]; const fileLi = document.createElement('li'); fileLi.classList.add('search-result-file-group'); const fileNameSpan = document.createElement('span'); fileNameSpan.className = 'search-result-filepath'; fileNameSpan.textContent = getFileName(filePath); fileNameSpan.title = filePath; const canOpenFile = isEditableTextFile(filePath) || isSupportedImageView(filePath); if (canOpenFile) { fileNameSpan.addEventListener('click', () => openFile(filePath)); fileNameSpan.style.cursor = 'pointer'; } else { fileNameSpan.style.cursor = 'default'; fileNameSpan.title += ' (não pode ser aberto)'; } fileLi.appendChild(fileNameSpan); const matchesUl = document.createElement('ul'); matches.forEach(match => { const matchLi = document.createElement('li'); matchLi.className = 'search-result-item'; matchLi.title = `Linha ${match.lineNumber}`; const lineSpan = document.createElement('span'); lineSpan.className = 'search-result-line'; const regex = new RegExp(`(${escapeRegExp(currentSearchTerm)})`, 'gi'); lineSpan.innerHTML = match.lineContent.replace(regex, '<span class="match">$1</span>'); matchLi.appendChild(lineSpan); if (canOpenFile) { matchLi.style.cursor = 'pointer'; matchLi.addEventListener('click', () => { openFile(match.filePath).then(() => { if (editor && activeFilePath === match.filePath && editorContainer.style.display !== 'none') { editor.revealLineInCenter(match.lineNumber, monaco.editor.ScrollType.Smooth); editor.setPosition({ lineNumber: match.lineNumber, column: 1 }); editor.focus(); } }); }); } else { matchLi.style.cursor = 'default'; } matchesUl.appendChild(matchLi); }); fileLi.appendChild(matchesUl); searchResultsContainer.appendChild(fileLi); } } } catch (error) { console.error("Erro na busca:", error); searchStatusElement.textContent = `Erro na busca: ${error.message}`; searchResultsContainer.innerHTML = `<li class="error">Falha ao buscar: ${error.message}</li>`; showNativeErrorDialog('Erro na Busca', `Ocorreu um erro: ${error.message}`); searchButton.disabled = false; } }

function appendCommandOutput(text) { if (commandOutputElement) { commandOutputElement.textContent += text; commandOutputElement.parentElement.scrollTop = commandOutputElement.parentElement.scrollHeight; } }
function clearCommandOutput() { if (commandOutputElement) commandOutputElement.textContent = ''; }
function runCommandFromInput() { const command = commandInputElement.value.trim(); if (!command) return; if (!currentFolderPath) { showNativeErrorDialog('Erro ao Executar', 'Abra uma pasta para definir o diretório de trabalho.'); return; } appendCommandOutput(`\n${currentFolderPath}> ${command}\n`); commandInputElement.disabled = true; window.electronAPI.commandRun({ command: command, cwd: currentFolderPath }); commandInputElement.value = ''; }
function showCommandPanel() { commandPanel.classList.add('visible'); isCommandPanelVisible = true; commandInputElement.focus(); toggleCommandPanelBtn.classList.add('active'); }
function hideCommandPanel() { commandPanel.classList.remove('visible'); isCommandPanelVisible = false; toggleCommandPanelBtn.classList.remove('active'); editor?.focus(); }
function toggleCommandPanel() { if (isCommandPanelVisible) hideCommandPanel(); else showCommandPanel(); }

function showSidebarPanel(targetPanelId) { sidebarTabButtons.forEach(btn => btn.classList.remove('active')); sidebarPanels.forEach(panel => panel.classList.remove('active')); const targetButton = document.querySelector(`.sidebar-tab-btn[data-target="${targetPanelId}"]`); const targetPanel = document.getElementById(targetPanelId); if (targetButton && targetPanel) { targetButton.classList.add('active'); targetPanel.classList.add('active'); if (targetPanelId === 'search-panel') searchInput.focus(); else if (targetPanelId === 'problems-panel') { } } }

function updateLiveServerUI(status) {
    isLiveServerRunning = status.isRunning;
    currentLiveServerPort = status.port;
    currentLiveServerFolder = status.folderPath;
    if (status.isRunning && status.port) {
        liveServerBtn.classList.add('active');
        liveServerBtn.title = `Parar Live Server (Porta: ${status.port})`;
        liveServerBtn.innerHTML = `<i class="mdi mdi-stop-circle-outline"></i> Parar (${status.port})`;
        liveServerStatusElement.textContent = `Rodando em http://localhost:${status.port}`;
        liveServerStatusElement.title = `Servindo a pasta: ${status.folderPath}`;
        liveServerStatusElement.style.color = '';
    } else {
        liveServerBtn.classList.remove('active');
        liveServerBtn.title = "Iniciar Live Server (Requer pasta aberta)";
        liveServerBtn.innerHTML = `<i class="mdi mdi-play-circle-outline"></i> Go Live`;
        liveServerStatusElement.textContent = '';
        liveServerStatusElement.title = '';
        liveServerBtn.disabled = !currentFolderPath;
         if (status.error) {
             liveServerStatusElement.textContent = `Erro: ${status.error}`;
             liveServerStatusElement.style.color = 'var(--error-color)';
             setTimeout(() => { if (!isLiveServerRunning) { liveServerStatusElement.textContent = ''; liveServerStatusElement.style.color = ''; } }, 5000);
         } else { liveServerStatusElement.style.color = ''; }
    }
}

async function startLiveServer() {
    if (!currentFolderPath) { showNativeErrorDialog("Live Server", "Abra uma pasta primeiro."); return; }
    if (isLiveServerRunning) { console.warn("Tentativa de iniciar Live Server quando já está rodando."); return; }
    console.log(`Solicitando início do Live Server para: ${currentFolderPath}`);
    liveServerBtn.disabled = true; liveServerStatusElement.textContent = "Iniciando...";
    try {
        const result = await window.electronAPI.startLiveServer(currentFolderPath);
        if (!result.success) { throw new Error(result.error || "Falha desconhecida ao iniciar."); }
        console.log(`Live Server iniciado com sucesso na porta ${result.port}`);
    } catch (error) {
        console.error("Erro ao iniciar Live Server:", error);
        showNativeErrorDialog("Erro Live Server", `Não foi possível iniciar: ${error.message}`);
        updateLiveServerUI({ isRunning: false, port: null, folderPath: currentFolderPath, error: error.message });
    } finally {
         liveServerBtn.disabled = !currentFolderPath;
    }
}

async function stopLiveServer() {
    if (!isLiveServerRunning) { console.warn("Tentativa de parar Live Server quando não está rodando."); return; }
    console.log("Solicitando parada do Live Server...");
    liveServerBtn.disabled = true; liveServerStatusElement.textContent = "Parando...";
    try {
        const result = await window.electronAPI.stopLiveServer();
        if (!result.success) { throw new Error(result.error || "Falha desconhecida ao parar."); }
        console.log("Live Server parado com sucesso.");
    } catch (error) {
        console.error("Erro ao parar Live Server:", error);
        showNativeErrorDialog("Erro Live Server", `Não foi possível parar: ${error.message}`);
         updateLiveServerUI({ isRunning: false, port: currentLiveServerPort, folderPath: currentLiveServerFolder, error: error.message });
    } finally {
        liveServerBtn.disabled = !currentFolderPath;
    }
}

function initializeProblemsListener() {
    if (!monaco || problemsMarkerListener) return;

    problemsMarkerListener = monaco.editor.onDidChangeMarkers((uris) => {
        console.log("Markers changed for URIs:", uris.map(u => u.toString()));
        let problemsChanged = false;
        uris.forEach(uri => {
            if (updateProblemsForModel(uri)) {
                problemsChanged = true;
            }
        });
        if (problemsChanged) {
            renderProblemsPanel();
        }
    });
    console.log("Problems marker listener initialized.");
}

function updateProblemsForModel(modelUri) {
    if (!monaco || !modelUri) return false;

    const model = monaco.editor.getModel(modelUri);
    const filePath = modelUri.fsPath;

    if (!model || !editorModels.has(filePath)) {
        if (allProblems.has(filePath)) {
            allProblems.delete(filePath);
            console.log(`Cleared problems for removed/unmanaged model: ${filePath}`);
            return true;
        }
        return false;
    }

    const markers = monaco.editor.getModelMarkers({ resource: modelUri });
    const relevantMarkers = markers.filter(m => m.severity >= monaco.MarkerSeverity.Info);

    const newProblems = relevantMarkers.map(marker => ({
        filePath: filePath,
        fileName: getFileName(filePath),
        severity: marker.severity,
        message: marker.message,
        startLineNumber: marker.startLineNumber,
        startColumn: marker.startColumn,
        endLineNumber: marker.endLineNumber,
        endColumn: marker.endColumn,
        source: marker.source || 'Linter',
    }));

    const existingProblems = allProblems.get(filePath) || [];
    const changed = newProblems.length !== existingProblems.length ||
                    JSON.stringify(newProblems) !== JSON.stringify(existingProblems);

    if (changed) {
        console.log(`Problems updated for ${filePath}: ${newProblems.length} problems.`);
        if (newProblems.length > 0) {
            allProblems.set(filePath, newProblems);
        } else {
            allProblems.delete(filePath);
        }
        return true;
    }

    return false;
}


function renderProblemsPanel() {
    if (!problemsListElement || !problemsStatusElement || !problemsCountBadge) return;

    problemsListElement.innerHTML = '';
    let totalProblems = 0;
    let totalErrors = 0;
    let totalWarnings = 0;

    if (allProblems.size === 0) {
        problemsStatusElement.textContent = 'Nenhum problema detectado.';
        problemsListElement.innerHTML = '<li class="no-problems">Nenhum problema encontrado nos arquivos abertos.</li>';
        problemsCountBadge.textContent = '0';
        problemsCountBadge.style.display = 'none';
        problemsCountBadge.className = 'badge';
        return;
    }

    const sortedFilePaths = Array.from(allProblems.keys()).sort((a, b) => a.localeCompare(b));

    sortedFilePaths.forEach(filePath => {
        const problems = allProblems.get(filePath);
        if (!problems || problems.length === 0) return;

        const fileGroupLi = document.createElement('li');
        fileGroupLi.className = 'problem-file-group';

        const fileNameSpan = document.createElement('span');
        fileNameSpan.textContent = getFileName(filePath);
        fileNameSpan.title = filePath;
        fileGroupLi.appendChild(fileNameSpan);

        const problemsUl = document.createElement('ul');

        problems.sort((a, b) => a.startLineNumber - b.startLineNumber || a.startColumn - b.startColumn);

        problems.forEach(problem => {
            totalProblems++;
            const problemLi = document.createElement('li');
            problemLi.className = 'problem-item';
            problemLi.dataset.filePath = problem.filePath;
            problemLi.dataset.line = problem.startLineNumber;
            problemLi.dataset.column = problem.startColumn;
            problemLi.title = `Ir para ${getFileName(problem.filePath)} linha ${problem.startLineNumber}`;

            const icon = document.createElement('i');
            icon.className = 'problem-icon mdi';
            let severityClass = '';
            let severityIcon = '';

            switch (problem.severity) {
                case monaco.MarkerSeverity.Error:
                    severityClass = 'error';
                    severityIcon = 'mdi-close-circle-outline';
                    totalErrors++;
                    break;
                case monaco.MarkerSeverity.Warning:
                    severityClass = 'warning';
                    severityIcon = 'mdi-alert-outline';
                    totalWarnings++;
                    break;
                case monaco.MarkerSeverity.Info:
                    severityClass = 'info';
                    severityIcon = 'mdi-information-outline';
                    break;
                case monaco.MarkerSeverity.Hint:
                default:
                    severityClass = 'hint';
                    severityIcon = 'mdi-lightbulb-on-outline';
                    break;
            }
            icon.classList.add(severityClass, severityIcon);
            problemLi.appendChild(icon);

            const messageSpan = document.createElement('span');
            messageSpan.className = 'problem-message';
            messageSpan.textContent = problem.message;
            problemLi.appendChild(messageSpan);

            const locationSpan = document.createElement('span');
            locationSpan.className = 'problem-location';
            locationSpan.textContent = `[Ln ${problem.startLineNumber}, Col ${problem.startColumn}]`;
            problemLi.appendChild(locationSpan);

            problemLi.addEventListener('click', () => {
                navigateToProblem(
                    problem.filePath,
                    problem.startLineNumber,
                    problem.startColumn
                );
            });

            problemsUl.appendChild(problemLi);
        });

        fileGroupLi.appendChild(problemsUl);
        problemsListElement.appendChild(fileGroupLi);
    });

    let statusText = '';
    if (totalErrors > 0 && totalWarnings > 0) {
        statusText = `${totalErrors} Erro(s), ${totalWarnings} Aviso(s)`;
    } else if (totalErrors > 0) {
        statusText = `${totalErrors} Erro(s)`;
    } else if (totalWarnings > 0) {
        statusText = `${totalWarnings} Aviso(s)`;
    } else {
         const infoHintCount = totalProblems - totalErrors - totalWarnings;
         if (infoHintCount > 0) statusText = `${infoHintCount} Problema(s) Informativo(s)`;
         else statusText = 'Nenhum problema detectado.';
    }
    problemsStatusElement.textContent = statusText;

    problemsCountBadge.textContent = totalProblems.toString();
    problemsCountBadge.style.display = totalProblems > 0 ? 'inline-block' : 'none';

    problemsCountBadge.className = 'badge';
    if (totalErrors > 0) {
        problemsCountBadge.classList.add('errors');
    } else if (totalWarnings > 0) {
        problemsCountBadge.classList.add('warnings');
    }

}

async function navigateToProblem(filePath, lineNumber, columnNumber) {
    console.log(`Navigating to problem: ${filePath} L${lineNumber} C${columnNumber}`);
    try {
        if (!openFiles.has(filePath) || openFiles.get(filePath).fileType === 'image' || (openFiles.get(filePath).fileType === 'svg' && openFiles.get(filePath).svgViewMode === 'rendered') ) {
            await openFile(filePath);
            const fileState = openFiles.get(filePath);
            if (fileState?.fileType === 'svg' && fileState.svgViewMode !== 'source') {
                fileState.svgViewMode = 'source';
                fileState.forceSwitch = true;
                switchToFile(filePath);
            }
        } else {
            switchToFile(filePath);
        }

        await new Promise(resolve => setTimeout(resolve, 50));

        if (editor && activeFilePath === filePath && editorContainer.style.display !== 'none' && editor.getModel() === editorModels.get(filePath)) {
            editor.revealLineInCenter(lineNumber, monaco.editor.ScrollType.Smooth);
            editor.setPosition({ lineNumber: lineNumber, column: columnNumber });
            editor.focus();
        } else {
             console.warn(`Could not navigate to problem: Editor not ready or wrong file active. Target: ${filePath}, Active: ${activeFilePath}`);
             if (editor && editorContainer.style.display !== 'none') editor.focus();
        }
    } catch (error) {
        console.error("Error navigating to problem:", error);
        showNativeErrorDialog("Erro de Navegação", `Não foi possível ir para o problema em ${getFileName(filePath)}: ${error.message}`);
    }
}

openFolderBtn.addEventListener('click', async () => { try { const folderPath = await window.electronAPI.openDirectoryDialog(); if (folderPath) await loadDirectory(folderPath); } catch (error) { console.error("Erro ao abrir diálogo:", error); showNativeErrorDialog('Erro', `Falha ao selecionar pasta: ${error.message}`); } });
fileTreeElement.addEventListener('contextmenu', (e) => { if (e.target === fileTreeElement) { e.preventDefault(); e.stopPropagation(); showContextMenu(e, 'tree-empty', { path: currentFolderPath, isDirectory: true }); } });
newFileBtn.addEventListener('click', () => { if(!newFileBtn.disabled) handleContextMenuCommand('new-file', currentFolderPath); });
newFolderBtn.addEventListener('click', () => { if(!newFolderBtn.disabled) handleContextMenuCommand('new-folder', currentFolderPath); });
window.addEventListener('keydown', (e) => { const isCtrlOrMeta = e.ctrlKey || e.metaKey; if (isCtrlOrMeta && e.key === 's') { e.preventDefault(); saveFile(); } else if (isCtrlOrMeta && e.key === 'o') { e.preventDefault(); openFolderBtn.click(); } else if (isCtrlOrMeta && e.key === '`') { e.preventDefault(); toggleCommandPanel(); } else if (isCtrlOrMeta && e.key === 'w') { e.preventDefault(); if (activeFilePath) closeFile(activeFilePath); } else if (isCtrlOrMeta && e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); showSidebarPanel('search-panel'); } else if (isCtrlOrMeta && e.shiftKey && e.key.toLowerCase() === 'e') { e.preventDefault(); showSidebarPanel('file-tree-panel');
    } else if (isCtrlOrMeta && e.shiftKey && e.key.toLowerCase() === 'm') {
         e.preventDefault(); showSidebarPanel('problems-panel');
    } else if (e.key === 'Escape') { if (inputDialogOverlay.style.display === 'flex') {} else if (confirmDialogOverlay.style.display === 'flex') {} else if (contextMenuElement.style.display === 'block') { hideContextMenu(); } else if (isCommandPanelVisible) { hideCommandPanel(); } } });
sidebarTabButtons.forEach(button => button.addEventListener('click', () => showSidebarPanel(button.dataset.target)));
searchButton.addEventListener('click', performSearch);
searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') performSearch(); });
toggleCommandPanelBtn.addEventListener('click', toggleCommandPanel);
closeCommandPanelBtn.addEventListener('click', hideCommandPanel);
commandInputElement.addEventListener('keypress', (e) => { if (e.key === 'Enter') runCommandFromInput(); });
window.electronAPI.onCommandStart(command => { commandInputElement.disabled = true; });
window.electronAPI.onCommandOutput(data => appendCommandOutput(data));
window.electronAPI.onCommandError(errorMsg => appendCommandOutput(`\n[ERRO] ${errorMsg}\n`));
window.electronAPI.onCommandExit(exitCode => { appendCommandOutput(`\n[Processo finalizado com código: ${exitCode}]\n`); commandInputElement.disabled = false; commandInputElement.focus(); });
document.addEventListener('click', (e) => { if (contextMenuElement.style.display === 'block' && !contextMenuElement.contains(e.target)) hideContextMenu(); }, false);
svgToggleViewBtn.addEventListener('click', () => { if (!activeFilePath) return; const fileState = openFiles.get(activeFilePath); if (!fileState || fileState.fileType !== 'svg') return; fileState.svgViewMode = (fileState.svgViewMode === 'rendered') ? 'source' : 'rendered'; fileState.forceSwitch = true; switchToFile(activeFilePath); });
liveServerBtn.addEventListener('click', () => { if (isLiveServerRunning) { stopLiveServer(); } else { startLiveServer(); } });
window.electronAPI.onLiveServerStatusUpdate((status) => { console.log("[Renderer] Recebido Live Server Status Update:", status); updateLiveServerUI(status); });

document.addEventListener('DOMContentLoaded', async () => {
    try {
        pathSeparator = await window.electronAPI.getPathSeparator(); console.log("Separador de caminho:", pathSeparator);
        newFileBtn.disabled = true; newFolderBtn.disabled = true; liveServerBtn.disabled = true;
        await loadMonaco();
        initializeEditor();
        clearEditor();
        renderProblemsPanel();
        showSidebarPanel('file-tree-panel');
        const fileTreePanel = document.getElementById('file-tree-panel');
        const fileTreeUL = document.getElementById('file-tree');
        if (fileTreePanel) {
             fileTreePanel.addEventListener('dragover', handleDragOver);
             fileTreePanel.addEventListener('dragleave', handleDragLeave);
             fileTreePanel.addEventListener('drop', handleDrop);
        }
        if (fileTreeUL) {
            fileTreeUL.addEventListener('dragstart', (event) => {
                const listItem = event.target.closest('li[draggable="true"]');
                if (!listItem) { console.log("dragstart ignored: not on a draggable li"); return; }
                const itemPath = listItem.dataset.filePath;
                if(itemPath) { handleDragStartLogic(event, itemPath, listItem); }
                else { console.error("Draggable LI found, but missing filePath dataset!", listItem); }
            });
             fileTreeUL.addEventListener('dragend', (event) => { handleDragEnd(event); });
        } else { console.error("Could not find #file-tree element to attach delegated listeners."); }
        const initialStatus = await window.electronAPI.getLiveServerStatus(); console.log("Initial Live Server Status:", initialStatus); updateLiveServerUI(initialStatus);
        console.log("Lumen IDE inicializado com sucesso.");
    } catch (error) {
        console.error("Falha crítica na inicialização do Renderer:", error);
        const errorHtml = `<div style="color:red; padding: 30px; font-family: sans-serif;"><h1>Erro Fatal na Interface</h1><p>Não foi possível carregar componentes essenciais. Verifique o console (Ctrl+Shift+I).</p><pre>${error.stack || error}</pre></div>`;
        try { document.body.innerHTML = errorHtml; } catch { console.error("Falha ao exibir erro na UI:\n" + errorHtml); }
    }
});
// === Custom Title Bar Logic ===
    const minimizeBtn = document.getElementById('minimize-btn');
    const maximizeBtn = document.getElementById('maximize-btn');
    const closeBtn = document.getElementById('close-btn');

    if (minimizeBtn) {
        minimizeBtn.addEventListener('click', () => {
            window.electronAPI.windowMinimize();
        });
    }

    if (maximizeBtn) {
        maximizeBtn.addEventListener('click', () => {
            window.electronAPI.windowMaximize(); // This will toggle maximize/restore in main.js
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            window.electronAPI.windowClose();
        });
    }

    // Listen for maximize/unmaximize events from the main process to update the button icon
    window.electronAPI.onWindowMaximized(() => {
        if (maximizeBtn) {
            maximizeBtn.title = 'Restaurar';
            maximizeBtn.setAttribute('aria-label', 'Restaurar');
            const icon = maximizeBtn.querySelector('i');
            if (icon) {
                icon.classList.remove('mdi-window-maximize');
                icon.classList.add('mdi-window-restore');
            }
        }
    });

    window.electronAPI.onWindowUnmaximized(() => {
        if (maximizeBtn) {
            maximizeBtn.title = 'Maximizar';
            maximizeBtn.setAttribute('aria-label', 'Maximizar');
            const icon = maximizeBtn.querySelector('i');
            if (icon) {
                icon.classList.remove('mdi-window-restore');
                icon.classList.add('mdi-window-maximize');
            }
        }
    });
    // === End Custom Title Bar Logic ===

// Title bar menu handling
document.querySelectorAll('.menu-item').forEach(menuItem => {
    menuItem.addEventListener('mouseenter', () => {
        // Close other open menus
        document.querySelectorAll('.menu-item').forEach(item => {
            if (item !== menuItem) {
                item.classList.remove('active');
            }
        });
        menuItem.classList.add('active');
    });
});

// Handle dropdown menu item clicks
document.querySelectorAll('.menu-dropdown-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = item.dataset.action;
        handleMenuAction(action);
    });
});

// Close menus when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.menu-item')) {
        document.querySelectorAll('.menu-item').forEach(item => {
            item.classList.remove('active');
        });
    }
});

function handleMenuAction(action) {
    switch(action) {
        case 'new-file':
            if (currentFolderPath) {
                handleContextMenuCommand('new-file', currentFolderPath);
            }
            break;
        case 'open-folder':
            openFolderBtn.click();
            break;
        case 'save':
            saveFile();
            break;
        case 'save-as':
            saveFileAs();
            break;
        case 'undo':
            if (editor && !editor.getOption(monaco.editor.EditorOption.readOnly)) {
                editor.trigger('keyboard', 'undo', null);
            }
            break;
        case 'redo':
            if (editor && !editor.getOption(monaco.editor.EditorOption.readOnly)) {
                editor.trigger('keyboard', 'redo', null);
            }
            break;
        case 'cut':
            if (editor && !editor.getOption(monaco.editor.EditorOption.readOnly)) {
                editor.trigger('keyboard', 'cut', null);
            }
            break;
        case 'copy':
            if (editor) {
                editor.trigger('keyboard', 'copy', null);
            }
            break;
        case 'paste':
            if (editor && !editor.getOption(monaco.editor.EditorOption.readOnly)) {
                editor.trigger('keyboard', 'paste', null);
            }
            break;
        case 'toggle-sidebar':
            const sidebarStyle = getComputedStyle(sidebar);
            if (sidebarStyle.display === 'none') {
                sidebar.style.display = 'flex';
            } else {
                sidebar.style.display = 'none';
            }
            if (editor) editor.layout();
            break;
        case 'toggle-terminal':
            toggleCommandPanel();
            break;
        case 'toggle-problems':
            showSidebarPanel('problems-panel');
            break;
    }
    // Close all menus after action
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.remove('active');
    });
}