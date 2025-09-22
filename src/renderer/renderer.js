// Log that the script is being loaded
console.log('Renderer.js is being loaded!');

// Try-catch to catch any initial errors
try {
  const { ipcRenderer } = require('electron');
  const Quill = require('quill');
  const hljs = require('highlight.js');
  const path = require('path');
  const os = require('os');
  
  console.log('Modules loaded successfully');
} catch (error) {
  console.error('Error loading modules:', error);
}

// State
let currentNote = null;
let currentNotePath = null;
let noteTree = null;
let settings = null;
let editor = null;
let createType = 'note'; // 'note' or 'folder'
let contextMenuTarget = null;

// DOM Elements
const explorerEl = document.getElementById('explorer');
const editorEl = document.getElementById('editor');
const editorContainer = document.getElementById('editor-container');
const minimizeBtn = document.getElementById('minimize-btn');
const maximizeBtn = document.getElementById('maximize-btn');
const closeBtn = document.getElementById('close-btn');
const newNoteBtn = document.getElementById('new-note-btn');
const newFolderBtn = document.getElementById('new-folder-btn');
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const createModal = document.getElementById('create-modal');
const contextMenu = document.getElementById('context-menu');
const themeSelect = document.getElementById('theme-select');
const fontFamilySelect = document.getElementById('font-family');
const fontSizeInput = document.getElementById('font-size');
const showLineNumbersCheck = document.getElementById('show-line-numbers');
const showVerticalLinesCheck = document.getElementById('show-vertical-lines');
const autoIndentCheck = document.getElementById('auto-indent');
const copyAsMarkdownCheck = document.getElementById('copy-as-markdown');
const spacesPerTabInput = document.getElementById('spaces-per-tab');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const createBtn = document.getElementById('create-btn');
const createNameInput = document.getElementById('create-name');
const createLocationSelect = document.getElementById('create-location');
const createModalTitle = document.getElementById('create-modal-title');
const hljsTheme = document.getElementById('hljs-theme');

// Constants
const NOTES_DIR = path.join(os.homedir(), 'Documents', 'XNotes');

// Initialize the application
async function init() {
  // Load settings
  settings = await ipcRenderer.invoke('get-settings');
  applySettings(settings);
  
  // Initialize editor with Quill
  initEditor();
  
  // Load notes
  await loadNotes();
  
  // Set up event listeners
  setupEventListeners();
}

// Function to convert HTML to Markdown
function htmlToMarkdown(html) {
  // Replace heading tags
  let markdown = html
    .replace(/<h1>(.*?)<\/h1>/g, '# $1\n\n')
    .replace(/<h2>(.*?)<\/h2>/g, '## $1\n\n')
    .replace(/<h3>(.*?)<\/h3>/g, '### $1\n\n')
    .replace(/<h4>(.*?)<\/h4>/g, '#### $1\n\n')
    .replace(/<h5>(.*?)<\/h5>/g, '##### $1\n\n')
    .replace(/<h6>(.*?)<\/h6>/g, '###### $1\n\n');
  
  // Replace formatting
  markdown = markdown
    .replace(/<strong>(.*?)<\/strong>/g, '**$1**')
    .replace(/<b>(.*?)<\/b>/g, '**$1**')
    .replace(/<em>(.*?)<\/em>/g, '*$1*')
    .replace(/<i>(.*?)<\/i>/g, '*$1*')
    .replace(/<u>(.*?)<\/u>/g, '__$1__')
    .replace(/<s>(.*?)<\/s>/g, '~~$1~~')
    .replace(/<strike>(.*?)<\/strike>/g, '~~$1~~');
  
  // Replace lists
  markdown = markdown
    .replace(/<ul>(.*?)<\/ul>/gs, function(match, list) {
      return list.replace(/<li>(.*?)<\/li>/g, '- $1\n');
    })
    .replace(/<ol>(.*?)<\/ol>/gs, function(match, list) {
      let index = 1;
      return list.replace(/<li>(.*?)<\/li>/g, function(match, item) {
        return `${index++}. ${item}\n`;
      });
    });
  
  // Replace blockquote
  markdown = markdown.replace(/<blockquote>(.*?)<\/blockquote>/gs, '> $1\n\n');
  
  // Replace code blocks
  markdown = markdown.replace(/<pre><code class="ql-syntax" spellcheck="false">(.*?)<\/code><\/pre>/gs, 
    '```\n$1\n```\n\n');
  
  // Replace inline code
  markdown = markdown.replace(/<code>(.*?)<\/code>/g, '`$1`');
  
  // Replace paragraphs and line breaks
  markdown = markdown
    .replace(/<p>(.*?)<\/p>/g, '$1\n\n')
    .replace(/<br\s*\/?>/g, '\n');
  
  // Strip remaining HTML tags
  markdown = markdown.replace(/<[^>]*>/g, '');
  
  // Clean up extra whitespace
  markdown = markdown
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  
  return markdown;
}

// Function to convert HTML to Markdown
function htmlToMarkdown(html) {
  // Replace heading tags
  let markdown = html
    .replace(/<h1>(.*?)<\/h1>/g, '# $1\n\n')
    .replace(/<h2>(.*?)<\/h2>/g, '## $1\n\n')
    .replace(/<h3>(.*?)<\/h3>/g, '### $1\n\n')
    .replace(/<h4>(.*?)<\/h4>/g, '#### $1\n\n')
    .replace(/<h5>(.*?)<\/h5>/g, '##### $1\n\n')
    .replace(/<h6>(.*?)<\/h6>/g, '###### $1\n\n');
  
  // Replace formatting
  markdown = markdown
    .replace(/<strong>(.*?)<\/strong>/g, '**$1**')
    .replace(/<b>(.*?)<\/b>/g, '**$1**')
    .replace(/<em>(.*?)<\/em>/g, '*$1*')
    .replace(/<i>(.*?)<\/i>/g, '*$1*')
    .replace(/<u>(.*?)<\/u>/g, '__$1__')
    .replace(/<s>(.*?)<\/s>/g, '~~$1~~')
    .replace(/<strike>(.*?)<\/strike>/g, '~~$1~~');
  
  // Replace lists
  markdown = markdown
    .replace(/<ul>(.*?)<\/ul>/gs, function(match, list) {
      return list.replace(/<li>(.*?)<\/li>/g, '- $1\n');
    })
    .replace(/<ol>(.*?)<\/ol>/gs, function(match, list) {
      let index = 1;
      return list.replace(/<li>(.*?)<\/li>/g, function(match, item) {
        return `${index++}. ${item}\n`;
      });
    });
  
  // Replace blockquote
  markdown = markdown.replace(/<blockquote>(.*?)<\/blockquote>/gs, '> $1\n\n');
  
  // Replace code blocks
  markdown = markdown.replace(/<pre><code class="ql-syntax" spellcheck="false">(.*?)<\/code><\/pre>/gs, 
    '```\n$1\n```\n\n');
  
  // Replace inline code
  markdown = markdown.replace(/<code>(.*?)<\/code>/g, '`$1`');
  
  // Replace paragraphs and line breaks
  markdown = markdown
    .replace(/<p>(.*?)<\/p>/g, '$1\n\n')
    .replace(/<br\s*\/?>/g, '\n');
  
  // Strip remaining HTML tags
  markdown = markdown.replace(/<[^>]*>/g, '');
  
  // Clean up extra whitespace
  markdown = markdown
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  
  return markdown;
}

// Initialize editor
function initEditor() {
  // Initialize Quill editor with syntax highlighting
  editor = new Quill('#editor', {
    theme: 'snow',
    modules: {
      syntax: true,
      toolbar: [
        [{ 'header': [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        ['blockquote', 'code-block', 'link', 'image'],
        [{ 'list': 'ordered'}, { 'list': 'bullet' }, { 'list': 'check' }],
        [{ 'script': 'sub'}, { 'script': 'super' }],
        [{ 'indent': '-1'}, { 'indent': '+1' }],
        [{ 'color': [] }, { 'background': [] }],
        ['clean']
      ]
    },
  });
  
  // Add copy event listener to handle markdown conversion
  document.addEventListener('copy', function(e) {
    if (settings.copyAsMarkdown && document.activeElement.closest('#editor-container')) {
      const selection = editor.getSelection();
      if (selection) {
        // Get only the selected content
        const range = selection;
        const format = 'text/html';
        const selectedContent = editor.getContents(range.index, range.length);
        const tempContainer = document.createElement('div');
        const tempQuill = new Quill(tempContainer);
        tempQuill.setContents(selectedContent);
        
        const selectedHtml = tempContainer.querySelector('.ql-editor').innerHTML;
        const markdown = htmlToMarkdown(selectedHtml);
        
        e.clipboardData.setData('text/plain', markdown);
        e.preventDefault();
      }
    }
  });
}

// Load notes from filesystem
async function loadNotes() {
  // Reload settings to ensure color information is up to date
  try {
    settings = await ipcRenderer.invoke('get-settings');
    console.log('Settings reloaded for color consistency');
  } catch (error) {
    console.error('Error reloading settings:', error);
  }
  
  noteTree = await ipcRenderer.invoke('get-notes');
  renderExplorer(noteTree);
  
  // Re-setup drag and drop for the new elements
  setupDragAndDrop();
}

// Render the explorer with note tree
function renderExplorer(tree) {
  explorerEl.innerHTML = '';
  
  // Instead of showing the root folder directly, show its children
  if (tree && tree.children) {
    tree.children.forEach(child => {
      const childEl = createTreeElement(child);
      explorerEl.appendChild(childEl);
    });
  }
  
  // Populate location select in create modal
  populateLocationSelect(tree);
}

// Create tree element recursively
function createTreeElement(node) {
  const containerEl = document.createElement('div');
  containerEl.className = 'tree-node';
  containerEl.dataset.path = node.path;
  containerEl.dataset.type = node.type;
  containerEl.draggable = true; // Make element draggable
  
  if (node.type === 'directory') {
    // Directory node
    const headerEl = document.createElement('div');
    headerEl.className = 'tree-header';
    
    const expandEl = document.createElement('div');
    expandEl.className = 'tree-expander';
    expandEl.innerHTML = '<svg class="tree-icon folder-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M10,4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V8C22,6.89 21.1,6 20,6H12L10,4Z" /></svg>';

    const arrowEl = document.createElement('span');
    arrowEl.className = 'arrow';
    
    const nameEl = document.createElement('div');
    nameEl.className = 'tree-name';
    nameEl.textContent = node.name;
    nameEl.title = node.name;
    
    headerEl.appendChild(arrowEl);
    headerEl.appendChild(expandEl);
    headerEl.appendChild(nameEl);
    containerEl.appendChild(headerEl);
    
    // Add expand/collapse functionality
    headerEl.addEventListener('click', (e) => {
      e.stopPropagation();
      containerEl.classList.toggle('expanded');
      // No need to change folder icon on expand/collapse
    });
    
    // Add context menu
    headerEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showContextMenu(e, node);
    });
    
    // Children container
    const childrenEl = document.createElement('div');
    childrenEl.className = 'tree-children';
    
    // Process children
    if (node.children && node.children.length > 0) {
      // Sort children: directories first, then files, alphabetically
      const sortedChildren = [...node.children].sort((a, b) => {
        if (a.type === b.type) {
          return a.name.localeCompare(b.name);
        }
        return a.type === 'directory' ? -1 : 1;
      });
      
      sortedChildren.forEach(child => {
        const childEl = createTreeElement(child);
        childrenEl.appendChild(childEl);
      });
    }
    
    containerEl.appendChild(childrenEl);
    
  } else {
    // File node
    const nameEl = document.createElement('div');
    nameEl.className = 'tree-item';
    
    // Add file icon
    const fileIcon = document.createElement('div');
    fileIcon.className = 'tree-expander';
    fileIcon.innerHTML = '<svg class="tree-icon file-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" /></svg>';
    nameEl.appendChild(fileIcon);
    
    // Add file name
    const nameSpan = document.createElement('span');
    nameSpan.textContent = path.basename(node.name, '.html');
    nameEl.appendChild(nameSpan);
    
    nameEl.title = path.basename(node.name, '.html');
    
    nameEl.addEventListener('click', async () => {
      await openNote(node.path);
    });
    
    nameEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showContextMenu(e, node);
    });
    
    containerEl.appendChild(nameEl);
  }
  
  return containerEl;
}

// Open a note in the editor
async function openNote(filePath) {
  try {
    const content = await ipcRenderer.invoke('read-note', filePath);
    
    // Extract content from HTML if necessary
    let htmlContent = content;
    if (content.includes('<body')) {
      const bodyMatch = content.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      if (bodyMatch && bodyMatch[1]) {
        htmlContent = bodyMatch[1].trim();
      }
    }
    
    // Set editor content
    editor.enable();
    editor.root.innerHTML = htmlContent;
    
    // Update current note info
    currentNotePath = filePath;
    currentNote = {
      path: filePath,
      name: path.basename(filePath, '.html')
    };
    
    // Highlight the selected note
    const allItems = document.querySelectorAll('.tree-item');
    allItems.forEach(item => item.classList.remove('active'));
    
    const selectedItem = Array.from(allItems).find(item => {
      const parentNode = item.closest('.tree-node');
      return parentNode && parentNode.dataset.path === filePath;
    });
    
    if (selectedItem) {
      selectedItem.classList.add('active');
      
      // Expand parent folders
      let parent = selectedItem.closest('.tree-node').parentElement;
      while (parent && parent.classList.contains('tree-children')) {
        const parentNode = parent.closest('.tree-node');
        if (parentNode) {
          parentNode.classList.add('expanded');
          const expander = parentNode.querySelector('.tree-expander svg path');
          if (expander) {
            expander.setAttribute('d', 'M4 4v8l4-4-4-4z');
          }
        }
        parent = parentNode.parentElement;
      }
    }
    
    // Set up auto-save
    setupAutoSave();
    
  } catch (error) {
    console.error('Error opening note:', error);
  }
}

// Set up auto-save functionality
function setupAutoSave() {
  if (!currentNotePath) return;
  
  // Save on editor changes
  editor.on('text-change', debounce(() => {
    saveCurrentNote();
  }, 1000));
}

// Save current note
async function saveCurrentNote() {
  if (!currentNotePath || !editor) return;
  
  const content = editor.root.innerHTML;
  const htmlContent = `<!DOCTYPE html><html><head><title>${currentNote.name}</title></head><body>${content}</body></html>`;
  
  try {
    await ipcRenderer.invoke('save-note', {
      filePath: currentNotePath,
      content: htmlContent
    });
  } catch (error) {
    console.error('Error saving note:', error);
  }
}

// Set up event listeners
function setupEventListeners() {
  // Window controls
  minimizeBtn.addEventListener('click', () => {
    ipcRenderer.send('window-control', 'minimize');
  });
  
  maximizeBtn.addEventListener('click', () => {
    ipcRenderer.send('window-control', 'maximize');
  });
  
  closeBtn.addEventListener('click', () => {
    ipcRenderer.send('window-control', 'close');
  });
  
  // New note button
  newNoteBtn.addEventListener('click', () => {
    createType = 'note';
    createModalTitle.textContent = 'New Note';
    
    // Set the default location to current folder or parent folder of the current note
    setDefaultLocation();
    
    showModal(createModal);
  });
  
  // New folder button
  newFolderBtn.addEventListener('click', () => {
    createType = 'folder';
    createModalTitle.textContent = 'New Folder';
    
    // Set the default location to current folder or parent folder of the current note
    setDefaultLocation();
    
    showModal(createModal);
  });
  
  // Helper function to set the default location in the create modal
  function setDefaultLocation() {
    if (currentNotePath) {
      const parentDir = path.dirname(currentNotePath);
      if (createLocationSelect.querySelector(`option[value="${parentDir}"]`)) {
        createLocationSelect.value = parentDir;
      } else {
        createLocationSelect.value = NOTES_DIR;
      }
    } else {
      createLocationSelect.value = NOTES_DIR;
    }
  }
  
  // Settings button
  settingsBtn.addEventListener('click', () => {
    // Update settings form with current values
    updateSettingsForm();
    showModal(settingsModal);
  });
  
  // Close modals when clicking outside
  window.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      settingsModal.style.display = 'none';
    } else if (e.target === createModal) {
      createModal.style.display = 'none';
    }
  });
  
  // Close buttons in modals
  document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
      settingsModal.style.display = 'none';
      createModal.style.display = 'none';
    });
  });
  
  // Save settings button
  saveSettingsBtn.addEventListener('click', async () => {
    const newSettings = {
      theme: themeSelect.value,
      fontFamily: fontFamilySelect.value,
      fontSize: fontSizeInput.value,
      showLineNumbers: showLineNumbersCheck.checked,
      showVerticalLines: showVerticalLinesCheck.checked,
      automaticIndentation: autoIndentCheck.checked,
      copyAsMarkdown: copyAsMarkdownCheck.checked,
      spacesPerTab: parseInt(spacesPerTabInput.value, 10)
    };
    
    await ipcRenderer.invoke('save-settings', newSettings);
    settings = newSettings;
    applySettings(settings);
    settingsModal.style.display = 'none';
  });
  
  // Create button
  createBtn.addEventListener('click', async () => {
    const name = createNameInput.value.trim();
    const location = createLocationSelect.value;
    
    if (!name) {
      alert('Please enter a name');
      return;
    }
    
    if (createType === 'note') {
      const result = await ipcRenderer.invoke('create-note', {
        dirPath: location,
        name: name
      });
      
      if (result.success) {
        await loadNotes();
        await openNote(result.path);
      }
    } else {
      const result = await ipcRenderer.invoke('create-directory', {
        parentDir: location,
        name: name
      });
      
      if (result.success) {
        await loadNotes();
      }
    }
    
    createNameInput.value = '';
    createModal.style.display = 'none';
  });
  
  // Context menu items
  document.getElementById('ctx-new-note').addEventListener('click', async () => {
    if (!contextMenuTarget) return;
    
    let targetPath = contextMenuTarget.path;
    if (contextMenuTarget.type === 'file') {
      targetPath = path.dirname(targetPath);
    }
    
    createType = 'note';
    createModalTitle.textContent = 'New Note';
    createLocationSelect.value = targetPath;
    showModal(createModal);
    hideContextMenu();
  });
  
  document.getElementById('ctx-new-folder').addEventListener('click', async () => {
    if (!contextMenuTarget) return;
    
    let targetPath = contextMenuTarget.path;
    if (contextMenuTarget.type === 'file') {
      targetPath = path.dirname(targetPath);
    }
    
    createType = 'folder';
    createModalTitle.textContent = 'New Folder';
    createLocationSelect.value = targetPath;
    showModal(createModal);
    hideContextMenu();
  });
  
  document.getElementById('ctx-delete').addEventListener('click', async () => {
    if (!contextMenuTarget) return;
    
    const confirmMsg = `Are you sure you want to delete "${contextMenuTarget.name}"?`;
    if (confirm(confirmMsg)) {
      await ipcRenderer.invoke('delete-item', contextMenuTarget.path);
      await loadNotes();
      
      if (currentNotePath === contextMenuTarget.path) {
        currentNotePath = null;
        currentNote = null;
        editor.setText('');
        editor.disable();
      }
    }
    
    hideContextMenu();
  });
  
  // Hide context menu on outside click
  document.addEventListener('click', () => {
    hideContextMenu();
  });
}

// Show modal
function showModal(modal) {
  modal.style.display = 'flex';
}

// Show context menu
function showContextMenu(event, node) {
  contextMenuTarget = node;
  
  const { clientX, clientY } = event;
  contextMenu.style.top = `${clientY}px`;
  contextMenu.style.left = `${clientX}px`;
  contextMenu.style.display = 'block';
}

// Hide context menu
function hideContextMenu() {
  contextMenu.style.display = 'none';
  contextMenuTarget = null;
}

// Update settings form with current values
function updateSettingsForm() {
  themeSelect.value = settings.theme || 'light';
  fontFamilySelect.value = settings.fontFamily || 'Arial';
  fontSizeInput.value = settings.fontSize || '0.9rem';
  showLineNumbersCheck.checked = settings.showLineNumbers !== false;
  showVerticalLinesCheck.checked = settings.showVerticalLines !== false;
  autoIndentCheck.checked = settings.automaticIndentation !== false;
  copyAsMarkdownCheck.checked = settings.copyAsMarkdown !== false;
  spacesPerTabInput.value = settings.spacesPerTab || 2;
}

// Apply settings to the UI
function applySettings(settings) {
  // Apply theme
  document.body.classList.remove('theme-light', 'theme-dark');
  document.body.classList.add(`theme-${settings.theme}`);
  
  // Apply syntax highlighting theme
  const syntaxTheme = settings.theme === 'dark' ? 'github-dark' : 'github';
  hljsTheme.href = `../../node_modules/highlight.js/styles/${syntaxTheme}.css`;
  
  // Apply font family
  document.documentElement.style.setProperty('--font-family', settings.fontFamily);
  
  // Apply font size
  document.documentElement.style.setProperty('--font-size', settings.fontSize);
  
  // Apply line numbers setting
  if (settings.showLineNumbers) {
    document.querySelector('#editor-container').classList.add('show-line-numbers');
  } else {
    document.querySelector('#editor-container').classList.remove('show-line-numbers');
  }
  
  // Apply vertical lines setting
  if (settings.showVerticalLines) {
    document.querySelector('#editor-container').classList.add('show-vertical-lines');
  } else {
    document.querySelector('#editor-container').classList.remove('show-vertical-lines');
  }
  
  // Apply editor settings
  if (editor) {
    // Editor specific settings can be applied here
    // Apply automatic indentation setting
    editor.keyboard.addBinding({
      key: 'Tab',
      shiftKey: false,
      handler: function() {
        if (settings.automaticIndentation) {
          const spaces = ' '.repeat(settings.spacesPerTab);
          editor.insertText(spaces);
          return false;
        }
        return true; // Let Quill handle the default tab behavior
      }
    });
  }
}

// Populate location select in create modal
function populateLocationSelect(tree) {
  createLocationSelect.innerHTML = '';
  
  // Add NOTES_DIR as root
  const rootOption = document.createElement('option');
  rootOption.value = NOTES_DIR;
  rootOption.textContent = 'XNotes';
  createLocationSelect.appendChild(rootOption);
  
  // Add all directories recursively
  addDirectoriesToSelect(tree, 1);
  
  function addDirectoriesToSelect(node, level) {
    if (node.type !== 'directory') return;
    
    if (node.path !== NOTES_DIR) {
      const option = document.createElement('option');
      option.value = node.path;
      option.textContent = '─'.repeat(level) + ' ' + node.name;
      createLocationSelect.appendChild(option);
    }
    
    if (node.children) {
      node.children
        .filter(child => child.type === 'directory')
        .forEach(child => addDirectoriesToSelect(child, level + 1));
    }
  }
}

// Debounce function
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Add drag-and-drop functionality for notes and folders
function setupDragAndDrop() {
  const explorerEl = document.getElementById('explorer');
  if (!explorerEl) {
    console.error('Explorer element not found');
    return;
  }

  // Clear any existing event listeners to prevent duplicate handlers
  const newExplorerEl = explorerEl.cloneNode(true);
  explorerEl.parentNode.replaceChild(newExplorerEl, explorerEl);
  const explorerElement = document.getElementById('explorer'); // Re-get the element

  // State for reordering
  let dragState = {
    isDragging: false,
    draggedElement: null,
    draggedPath: null,
    isReorderMode: false,
    originalParent: null,
    ghostElement: null
  };

  // Clear any existing event listeners and state
  function clearDragState() {
    if (dragState.ghostElement) {
      dragState.ghostElement.remove();
      dragState.ghostElement = null;
    }
    dragState.isDragging = false;
    dragState.draggedElement = null;
    dragState.draggedPath = null;
    dragState.isReorderMode = false;
    dragState.originalParent = null;
    
    // Remove all drag styling
    const dragOverElements = explorerElement.querySelectorAll('.drag-over, .reorder-target');
    dragOverElements.forEach(el => {
      el.classList.remove('drag-over', 'reorder-target');
    });
  }

  // Create ghost element for reordering
  function createGhostElement() {
    const ghost = document.createElement('div');
    ghost.className = 'reorder-ghost';
    ghost.style.cssText = `
      height: 2px;
      background-color: #007acc;
      margin: 2px 0;
      border-radius: 1px;
      opacity: 0.7;
      pointer-events: none;
    `;
    return ghost;
  }

  // Get the parent folder element that contains children
  function getParentFolderElement(target) {
    if (target.dataset.type === 'directory') {
      return target.querySelector('.tree-children');
    }
    return target.closest('.tree-children');
  }

  // Check if we're hovering over a folder's content area (not just the folder title)
  function isHoveringOverFolderContent(target) {
    const folderNode = target.closest('.tree-node[data-type="directory"]');
    if (!folderNode) return false;
    
    const childrenContainer = folderNode.querySelector('.tree-children');
    return childrenContainer && childrenContainer.contains(target);
  }

  explorerElement.addEventListener('dragstart', (e) => {
    const target = e.target.closest('.tree-node');
    if (target && target.dataset.path) {
      console.log('Dragstart - Element:', target);
      console.log('Dragstart - Path:', target.dataset.path);
      console.log('Dragstart - Type:', target.dataset.type);
      
      dragState.isDragging = true;
      dragState.draggedElement = target;
      dragState.draggedPath = target.dataset.path;
      dragState.originalParent = target.parentElement;
      
      e.dataTransfer.setData('text/plain', target.dataset.path);
      e.dataTransfer.effectAllowed = 'move';
      target.style.opacity = '0.5';
      target.classList.add('dragging');
      console.log('Drag started for:', target.dataset.path);
    } else {
      console.log('Dragstart failed - no valid target found');
    }
  });

  explorerElement.addEventListener('dragend', (e) => {
    const target = e.target.closest('.tree-node');
    if (target) {
      target.style.opacity = '';
      target.classList.remove('dragging');
    }
    clearDragState();
  });

  explorerElement.addEventListener('dragover', (e) => {
    e.preventDefault();
    
    if (!dragState.isDragging) return;
    
    const target = e.target.closest('.tree-node');
    if (!target) return;

    // Clear existing hover timer if we move to a different target
    if (dragState.hoverTimer && dragState.currentHoverTarget !== target) {
      clearTimeout(dragState.hoverTimer);
      dragState.hoverTimer = null;
      dragState.isReorderMode = false;
      // Remove any previous ghost elements
      if (dragState.ghostElement) {
        dragState.ghostElement.remove();
        dragState.ghostElement = null;
      }
    }
    
    dragState.currentHoverTarget = target;

    if (dragState.isReorderMode) {
      // In reorder mode - show insertion point
      e.dataTransfer.dropEffect = 'move';
      
      let parentContainer;
      
      // Check if target is a directory and we're hovering over its content area
      if (target.dataset.type === 'directory') {
        const childrenContainer = target.querySelector('.tree-children');
        if (childrenContainer && isHoveringOverFolderContent(target)) {
          parentContainer = childrenContainer;
        }
      } else {
        // Target is a file, get its parent container
        parentContainer = getParentFolderElement(target);
      }
      
      if (parentContainer) {
        // Remove existing ghost
        if (dragState.ghostElement) {
          dragState.ghostElement.remove();
        }
        
        // Create new ghost element
        dragState.ghostElement = createGhostElement();
        
        if (target.dataset.type === 'directory' && isHoveringOverFolderContent(target)) {
          // Dropping into a folder - add to the beginning
          const childrenContainer = target.querySelector('.tree-children');
          if (childrenContainer.children.length > 0) {
            childrenContainer.insertBefore(dragState.ghostElement, childrenContainer.firstChild);
          } else {
            childrenContainer.appendChild(dragState.ghostElement);
          }
        } else {
          // Dropping relative to another item
          const rect = target.getBoundingClientRect();
          const midpoint = rect.top + rect.height / 2;
          
          if (e.clientY < midpoint) {
            // Insert before
            target.parentElement.insertBefore(dragState.ghostElement, target);
          } else {
            // Insert after
            const nextSibling = target.nextElementSibling;
            if (nextSibling) {
              target.parentElement.insertBefore(dragState.ghostElement, nextSibling);
            } else {
              target.parentElement.appendChild(dragState.ghostElement);
            }
          }
        }
        
        target.classList.add('reorder-target');
      }
    } else {
      // Normal mode - immediately activate reorder mode
      if (target.dataset.type === 'directory') {
        e.dataTransfer.dropEffect = 'move';
        // Immediately switch to reorder mode for directories
        console.log('Switching to reorder mode');
        dragState.isReorderMode = true;
        target.classList.remove('drag-over');
        target.classList.add('reorder-mode');
      } else {
        // Hovering over a file - immediately activate reorder mode
        console.log('Switching to reorder mode');
        dragState.isReorderMode = true;
        // Remove any drag-over styling
        const dragOverElements = explorerElement.querySelectorAll('.drag-over');
        dragOverElements.forEach(el => el.classList.remove('drag-over'));
      }
    }
  });

  explorerElement.addEventListener('dragleave', (e) => {
    const target = e.target.closest('.tree-node');
    if (target) {
      target.classList.remove('drag-over', 'reorder-target');
    }
    
    // Clear hover timer when leaving an element
    if (dragState.hoverTimer) {
      clearTimeout(dragState.hoverTimer);
      dragState.hoverTimer = null;
    }
  });

  // Update the UI after moving an item
  async function updateUIAfterMove() {
    try {
      await loadNotes(); // Reload the notes tree
      console.log('UI updated after move');
    } catch (error) {
      console.error('Error updating UI after move:', error);
    }
  }

  // Modify the drop event to handle both move and reorder
  explorerElement.addEventListener('drop', async (e) => {
    e.preventDefault();
    
    const draggedPath = e.dataTransfer.getData('text/plain');
    const target = e.target.closest('.tree-node');
    
    console.log('Drop event triggered');
    console.log('Dragged path:', draggedPath);
    console.log('Target element:', target);
    console.log('Is reorder mode:', dragState.isReorderMode);
    
    // Remove drag over styling
    if (target) {
      target.classList.remove('drag-over', 'reorder-target', 'reorder-mode');
    }

    if (draggedPath && target) {
      if (dragState.isReorderMode) {
        // Handle reordering (with possible move)
        console.log('Performing reorder operation');
        
        let targetDirectory = null;
        let newIndex = 0;
        
        try {
          // Determine target directory and index
          if (target.dataset.type === 'directory' && isHoveringOverFolderContent(target)) {
            // Dropping into a folder
            targetDirectory = target.dataset.path;
            newIndex = 0; // Add at beginning
          } else {
            // Dropping relative to another item
            const targetParent = getParentFolderElement(target);
            
            if (targetParent) {
              // Find the directory path from the parent container
              const parentNode = targetParent.closest('.tree-node[data-type="directory"]');
              if (parentNode) {
                targetDirectory = parentNode.dataset.path;
              } else {
                // Root directory
                targetDirectory = path.dirname(target.dataset.path);
              }
              
              // Calculate index based on ghost position
              if (dragState.ghostElement) {
                const ghostIndex = Array.from(targetParent.children).indexOf(dragState.ghostElement);
                newIndex = Array.from(targetParent.children)
                  .slice(0, ghostIndex)
                  .filter(child => child.classList.contains('tree-node')).length;
              }
            }
          }
          
          const currentDirectory = path.dirname(draggedPath);
          const itemName = path.basename(draggedPath);
          
          console.log('Target directory:', targetDirectory);
          console.log('Current directory:', currentDirectory);
          console.log('New index:', newIndex);
          
          if (targetDirectory && targetDirectory !== currentDirectory) {
            // Move to different directory with ordering
            const newPath = path.join(targetDirectory, itemName);
            
            console.log(`Move and reorder: ${draggedPath} to ${newPath} at index ${newIndex}`);
            
            // First move the item
            const moveResult = await ipcRenderer.invoke('move-item', { 
              sourcePath: draggedPath, 
              targetPath: newPath 
            });
            
            if (moveResult.success) {
              // Then set its order in the new location
              const reorderResult = await ipcRenderer.invoke('reorder-item', {
                itemPath: newPath,
                newIndex: newIndex
              });
              
              if (reorderResult.success) {
                await updateUIAfterMove();
                console.log('Item moved and reordered successfully');
              } else {
                console.error('Error setting item order:', reorderResult.error);
                // Item was moved but ordering failed
                await updateUIAfterMove();
              }
            } else {
              console.error('Error moving item:', moveResult.error);
              alert('Error moving item: ' + moveResult.error);
            }
          } else if (targetDirectory) {
            // Reorder within same directory
            const result = await ipcRenderer.invoke('reorder-item', {
              itemPath: draggedPath,
              newIndex: newIndex
            });
            
            if (result.success) {
              await updateUIAfterMove();
              console.log('Item reordered successfully');
            } else {
              console.error('Error reordering item:', result.error);
              alert('Error reordering item: ' + result.error);
            }
          }
        } catch (error) {
          console.error('Error in reorder operation:', error);
          alert('Error in reorder operation: ' + error.message);
        }
      } else if (target.dataset.type === 'directory') {
        // Handle regular folder move (simple drop without reordering)
        const targetPath = target.dataset.path;
        
        console.log('Valid drop detected');
        console.log('Source:', draggedPath);
        console.log('Target directory:', targetPath);
        
        // Don't allow dropping on self or children
        if (draggedPath === targetPath || targetPath.startsWith(draggedPath)) {
          console.log('Cannot drop on self or children');
          return;
        }

        const itemName = path.basename(draggedPath);
        const newPath = path.join(targetPath, itemName);

        console.log(`Move item from ${draggedPath} to ${newPath}`);

        try {
          const result = await ipcRenderer.invoke('move-item', { 
            sourcePath: draggedPath, 
            targetPath: newPath 
          });
          
          console.log('Move result:', result);
          
          if (result.success) {
            await updateUIAfterMove(); // Update the UI after the move
            console.log('Item moved successfully');
          } else {
            console.error('Error moving item:', result.error);
            alert('Error moving item: ' + result.error);
          }
        } catch (error) {
          console.error('Error moving item:', error);
          alert('Error moving item: ' + error.message);
        }
      }
    } else {
      console.log('Drop conditions not met:');
      console.log('- Has dragged path:', !!draggedPath);
      console.log('- Has target:', !!target);
    }
    
    clearDragState();
  });
}

// Initialize the app when the DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log('DOM fully loaded, initializing app...');
    
    // Setup drag and drop functionality
    setupDragAndDrop();
    
    // Debug log for DOM elements
    console.log('Checking DOM elements:');
    console.log('minimizeBtn:', minimizeBtn);
    console.log('maximizeBtn:', maximizeBtn);
    console.log('closeBtn:', closeBtn);
    console.log('newNoteBtn:', newNoteBtn);
    console.log('newFolderBtn:', newFolderBtn);
    console.log('settingsBtn:', settingsBtn);
    
    // Direct setup of critical event listeners
    if (closeBtn) {
      console.log('Setting up close button listener directly');
      closeBtn.onclick = () => {
        console.log('Close button clicked!');
        ipcRenderer.send('window-control', 'close');
      };
    }
    
    if (minimizeBtn) {
      minimizeBtn.onclick = () => {
        console.log('Minimize button clicked!');
        ipcRenderer.send('window-control', 'minimize');
      };
    }
    
    if (maximizeBtn) {
      maximizeBtn.onclick = () => {
        console.log('Maximize button clicked!');
        ipcRenderer.send('window-control', 'maximize');
      };
    }
    
    await init();
    console.log('App initialization completed');
  } catch (error) {
    console.error('Error during initialization:', error);
  }
});