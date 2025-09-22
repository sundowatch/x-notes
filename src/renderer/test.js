console.log('Test script loaded!');
const { ipcRenderer } = require('electron');
const Quill = require('quill');
const hljs = require('highlight.js');
const path = require('path');
const os = require('os');

// State variables
let currentNote = null;
let currentNotePath = null;
let noteTree = null;
let settings = null;
let editor = null;
let createType = 'note'; // 'note' or 'folder'
let contextMenuTarget = null;

// DOM Elements
let explorerEl, editorContainer;
let settingsBtn, settingsModal;
let newNoteBtn, newFolderBtn;
let themeSelect, saveSettingsBtn;

// Basic functionality
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Open DevTools for debugging
    try {
      const { remote } = require('electron');
      if (remote && remote.getCurrentWindow) {
        const currentWindow = remote.getCurrentWindow();
        if (currentWindow && currentWindow.webContents) {
          currentWindow.webContents.openDevTools();
        }
      }
    } catch (e) {
      console.warn('Could not open DevTools:', e);
    }
    
    console.log('DOM fully loaded, initializing app...');
    
    // Get DOM elements first
    explorerEl = document.getElementById('explorer');
    editorContainer = document.querySelector('.editor-container');
    const minimizeBtn = document.getElementById('minimize-btn');
    const maximizeBtn = document.getElementById('maximize-btn');
    const closeBtn = document.getElementById('close-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const newNoteBtn = document.getElementById('new-note-btn');
    const newFolderBtn = document.getElementById('new-folder-btn');
    
    // Debug log for DOM elements
    console.log('DOM elements loaded:');
    console.log('minimizeBtn:', minimizeBtn);
    console.log('maximizeBtn:', maximizeBtn);
    console.log('closeBtn:', closeBtn);
    console.log('newNoteBtn:', newNoteBtn);
    console.log('newFolderBtn:', newFolderBtn);
    console.log('settingsBtn:', settingsBtn);
    
    // Window control buttons
    if (closeBtn) {
      closeBtn.onclick = () => {
        console.log('Close button clicked');
        ipcRenderer.send('window-control', 'close');
      };
    }
    
    if (minimizeBtn) {
      minimizeBtn.onclick = () => {
        console.log('Minimize button clicked');
        ipcRenderer.send('window-control', 'minimize');
      };
    }
    
    if (maximizeBtn) {
      maximizeBtn.onclick = () => {
        console.log('Maximize button clicked');
        ipcRenderer.send('window-control', 'maximize');
      };
    }
    
    // Settings button
    if (settingsBtn) {
      console.log('Setting up settings button');
      settingsBtn.onclick = () => {
        console.log('Settings button clicked');
        if (settingsModal) {
          settingsModal.style.display = 'flex';
          console.log('Settings modal should be visible now');
        } else {
          console.error('Settings modal element not found');
        }
      };
    }
    
    // New Note button
    if (newNoteBtn) {
      console.log('Setting up new note button');
      newNoteBtn.onclick = () => {
        console.log('New note button clicked');
        const createModal = document.getElementById('create-modal');
        const createModalTitle = document.getElementById('create-modal-title');
        
        if (createModal && createModalTitle) {
          createType = 'note';
          createModalTitle.textContent = 'New Note';
          createModal.style.display = 'flex';
          
          // Set default location
          const createLocationSelect = document.getElementById('create-location');
          if (createLocationSelect) {
            populateLocationSelect(noteTree);
          }
        }
      };
    }
    
    // New Folder button
    if (newFolderBtn) {
      console.log('Setting up new folder button');
      newFolderBtn.onclick = () => {
        console.log('New folder button clicked');
        const createModal = document.getElementById('create-modal');
        const createModalTitle = document.getElementById('create-modal-title');
        
        if (createModal && createModalTitle) {
          createType = 'folder';
          createModalTitle.textContent = 'New Folder';
          createModal.style.display = 'flex';
          
          // Set default location
          const createLocationSelect = document.getElementById('create-location');
          if (createLocationSelect) {
            populateLocationSelect(noteTree);
          }
        }
      };
    }
    
    // Close modal when clicking outside
    window.onclick = (e) => {
      if (e.target === settingsModal) {
        settingsModal.style.display = 'none';
      }
    };
    
    // Close buttons in modals
    document.querySelectorAll('.close-modal').forEach(btn => {
      btn.addEventListener('click', () => {
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
          modal.style.display = 'none';
        });
      });
    });
    
    // Save settings
    if (saveSettingsBtn) {
      saveSettingsBtn.onclick = async () => {
        console.log('Save settings clicked');
        try {
          const themeSelect = document.getElementById('theme-select');
          const fontFamilySelect = document.getElementById('font-family');
          const fontSizeInput = document.getElementById('font-size');
          const showLineNumbersCheck = document.getElementById('show-line-numbers');
          const showVerticalLinesCheck = document.getElementById('show-vertical-lines');
          const autoIndentCheck = document.getElementById('auto-indent');
          const copyAsMarkdownCheck = document.getElementById('copy-as-markdown');
          const spacesPerTabInput = document.getElementById('spaces-per-tab');
          
          if (!themeSelect || !fontFamilySelect || !fontSizeInput || 
              !showLineNumbersCheck || !showVerticalLinesCheck || 
              !autoIndentCheck || !copyAsMarkdownCheck || !spacesPerTabInput) {
            console.error('Settings form elements not found');
            return;
          }
          
          const newSettings = {
            theme: themeSelect.value,
            fontFamily: fontFamilySelect.value,
            fontSize: fontSizeInput.value,
            showLineNumbers: showLineNumbersCheck.checked,
            showVerticalLines: showVerticalLinesCheck.checked,
            automaticIndentation: autoIndentCheck.checked,
            copyAsMarkdown: copyAsMarkdownCheck.checked,
            spacesPerTab: parseInt(spacesPerTabInput.value, 10) || 2
          };
          
          console.log('Saving settings:', newSettings);
          await ipcRenderer.invoke('save-settings', newSettings);
          settings = newSettings;
          applySettings(settings);
          settingsModal.style.display = 'none';
          console.log('Settings saved');
        } catch (error) {
          console.error('Error saving settings:', error);
        }
      };
    }
    
    // Load settings and notes
    try {
      console.log('Loading settings...');
      settings = await ipcRenderer.invoke('get-settings');
      console.log('Settings loaded:', settings);
      
      // Apply loaded settings
      applySettings(settings);
      
      // Populate settings form
      updateSettingsForm(settings);
      
      console.log('Loading notes...');
      await loadNotes();
      console.log('Notes loaded');
    } catch (error) {
      console.error('Error loading settings or notes:', error);
    }
    
    // Initialize editor (basic)
    initEditor();
    
  } catch (error) {
    console.error('Error in initialization:', error);
  }
});

// Load notes from backend
async function loadNotes() {
  try {
    console.log('Loading notes from backend...');
    const tree = await ipcRenderer.invoke('get-notes');
    
    if (!tree) {
      console.error('No note tree returned from backend');
      return;
    }
    
    noteTree = tree;
    console.log('Note tree received:', noteTree);
    
    if (!explorerEl) {
      console.error('Explorer element not found');
      return;
    }
    
    // Populate explorer
    console.log('Populating explorer...');
    explorerEl.innerHTML = '';
    
    if (!noteTree.children || !Array.isArray(noteTree.children)) {
      console.error('Invalid note tree structure:', noteTree);
      return;
    }
    
    noteTree.children.forEach(child => {
      const childEl = createTreeElement(child);
      explorerEl.appendChild(childEl);
    });
    
    console.log('Explorer populated with notes');
    
    // Debug: Log first few notes paths
    const notePaths = getAllNotePaths(noteTree);
    console.log('Available note paths (first 5):', notePaths.slice(0, 5));
    
  } catch (error) {
    console.error('Error loading notes:', error);
  }
}

// Helper function to get all note paths for debugging
function getAllNotePaths(node) {
  let paths = [];
  
  if (node.type === 'file') {
    paths.push(node.path);
  }
  
  if (node.children && Array.isArray(node.children)) {
    node.children.forEach(child => {
      paths = paths.concat(getAllNotePaths(child));
    });
  }
  
  return paths;
}

// Create tree element recursively
function createTreeElement(node) {
  console.log('Creating tree element for:', node.name);
  const containerEl = document.createElement('div');
  containerEl.className = 'tree-node';
  containerEl.dataset.path = node.path;
  containerEl.dataset.type = node.type;
  
  if (node.type === 'directory') {
    // Directory node
    const headerEl = document.createElement('div');
    headerEl.className = 'tree-header';
    
    const expandEl = document.createElement('div');
    expandEl.className = 'tree-expander';
    expandEl.innerHTML = '<img src="../../assets/icons/folder.png" class="tree-icon folder-icon" alt="folder">';
    
    const nameEl = document.createElement('div');
    nameEl.className = 'tree-name';
    nameEl.textContent = node.name;
    nameEl.title = node.name;
    
    headerEl.appendChild(expandEl);
    headerEl.appendChild(nameEl);
    containerEl.appendChild(headerEl);
    
    // Children container
    const childrenEl = document.createElement('div');
    childrenEl.className = 'tree-children';
    containerEl.appendChild(childrenEl);
    
    // Add expand/collapse functionality
    headerEl.addEventListener('click', (e) => {
      e.stopPropagation();
      containerEl.classList.toggle('expanded');
    });
    
    // Populate children if any
    if (node.children && node.children.length > 0) {
      node.children.forEach(child => {
        const childEl = createTreeElement(child);
        childrenEl.appendChild(childEl);
      });
    }
  } else {
    // File node
    const headerEl = document.createElement('div');
    headerEl.className = 'tree-header';
    
    const iconEl = document.createElement('div');
    iconEl.className = 'tree-icon';
    iconEl.innerHTML = '<img src="../../assets/icons/file.png" class="tree-icon file-icon" alt="file">';
    
    // Remove .html extension from display name
    let displayName = node.name;
    if (displayName.endsWith('.html')) {
      displayName = displayName.substring(0, displayName.length - 5);
    }
    
    const nameEl = document.createElement('div');
    nameEl.className = 'tree-name';
    nameEl.textContent = displayName;
    nameEl.title = displayName;
    
    headerEl.appendChild(iconEl);
    headerEl.appendChild(nameEl);
    containerEl.appendChild(headerEl);
    
    // Add click to open note
    nameEl.addEventListener('click', async () => {
      console.log('Note clicked:', node.path);
      try {
        const success = await openNote(node.path);
        if (!success) {
          console.error('Failed to open note:', node.path);
          alert(`Failed to open note: ${node.name}`);
        }
      } catch (error) {
        console.error('Error when opening note:', error);
        alert(`Error opening note: ${error.message}`);
      }
    });
  }
  
  return containerEl;
}

// Open a note
async function openNote(notePath) {
  try {
    console.log('Opening note:', notePath);
    
    // Highlight the current note in the explorer
    const allNotes = document.querySelectorAll('.tree-node');
    allNotes.forEach(noteEl => {
      if (noteEl.dataset.path === notePath) {
        noteEl.classList.add('active');
      } else {
        noteEl.classList.remove('active');
      }
    });
    
    // Load note content
    console.log('Invoking read-note for:', notePath);
    const noteContent = await ipcRenderer.invoke('read-note', notePath);
    console.log('Note content retrieved:', typeof noteContent, 'length:', noteContent?.length || 0);
    
    // Store current note info
    currentNote = noteContent;
    currentNotePath = notePath;
    
    // Update editor content
    if (editor) {
      // Clear editor first
      editor.setText('');
      
      // Then set content
      if (noteContent) {
        editor.root.innerHTML = noteContent;
        console.log('Editor content updated with note content');
      } else {
        console.warn('Note content was empty or undefined');
      }
      
      // Focus editor
      editor.focus();
    } else {
      console.error('Editor not initialized');
    }
    
    // Expand all parent folders
    expandParentFolders(notePath);
    
    return true;
  } catch (error) {
    console.error('Error opening note:', error);
    return false;
  }
}

// Helper function to expand all parent folders of a note
function expandParentFolders(notePath) {
  try {
    const parts = notePath.split('/');
    parts.pop(); // Remove filename
    
    // Build paths for each parent folder
    let currentPath = '';
    for (const part of parts) {
      if (!part) continue;
      currentPath += '/' + part;
      
      // Find the folder element and expand it
      const folderEl = document.querySelector(`.tree-node[data-path="${currentPath}"]`);
      if (folderEl) {
        folderEl.classList.add('expanded');
      }
    }
  } catch (error) {
    console.error('Error expanding parent folders:', error);
  }
}

// Initialize editor
function initEditor() {
  try {
    console.log('Initializing editor...');
    
    // Get editor element
    const editorEl = document.getElementById('editor');
    if (!editorEl) {
      console.error('Editor element not found in DOM');
      return;
    }
    
    console.log('Editor element found, initializing Quill...');
    
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
          [{ 'indent': '-1'}, { 'indent': '+1' }],
          [{ 'color': [] }, { 'background': [] }],
          ['clean']
        ]
      }
    });
    
    console.log('Quill editor created:', editor);
    console.log('Editor root:', editor.root);
    
    // Auto save on change
    editor.on('text-change', debounce((delta, oldContents, source) => {
      console.log('Text changed in editor (source: ' + source + ')');
      if (currentNotePath) {
        saveCurrentNote();
      }
    }, 1000));
    
    // Check if we can access the editor's content
    try {
      console.log('Testing editor content access:', editor.root.innerHTML.substring(0, 20));
    } catch (err) {
      console.error('Could not access editor content:', err);
    }
    
    console.log('Editor initialized successfully');
  } catch (error) {
    console.error('Error initializing editor:', error);
  }
}

// Save current note
async function saveCurrentNote() {
  if (!currentNotePath || !editor) return;
  
  try {
    console.log('Saving note:', currentNotePath);
    const content = editor.root.innerHTML;
    await ipcRenderer.invoke('save-note', {
      path: currentNotePath,
      content: content
    });
    console.log('Note saved');
  } catch (error) {
    console.error('Error saving note:', error);
  }
}

// Populate location select in create modal
function populateLocationSelect(tree) {
  const createLocationSelect = document.getElementById('create-location');
  if (!createLocationSelect) {
    console.error('Location select element not found');
    return;
  }
  
  console.log('Populating location select');
  createLocationSelect.innerHTML = '';
  
  // Add root directory option
  const rootOption = document.createElement('option');
  rootOption.value = tree.path;
  rootOption.textContent = 'XNotes';
  createLocationSelect.appendChild(rootOption);
  
  // Add all directories recursively
  addDirectoriesToSelect(tree, 1);
  
  function addDirectoriesToSelect(node, level) {
    if (node.type !== 'directory') return;
    
    if (node.path !== tree.path) {
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

// Set up create button
document.addEventListener('DOMContentLoaded', () => {
  const createBtn = document.getElementById('create-btn');
  const createModal = document.getElementById('create-modal');
  
  if (createBtn) {
    createBtn.onclick = async () => {
      console.log('Create button clicked, type:', createType);
      
      const createNameInput = document.getElementById('create-name');
      const createLocationSelect = document.getElementById('create-location');
      
      if (!createNameInput || !createLocationSelect) {
        console.error('Create form elements not found');
        return;
      }
      
      const name = createNameInput.value.trim();
      const location = createLocationSelect.value;
      
      if (!name) {
        alert('Please enter a name');
        return;
      }
      
      try {
        if (createType === 'note') {
          console.log('Creating note:', name, 'at', location);
          const result = await ipcRenderer.invoke('create-note', {
            dirPath: location,
            name: name
          });
          
          if (result.success) {
            await loadNotes();
            await openNote(result.path);
            createModal.style.display = 'none';
            createNameInput.value = '';
          } else {
            alert(`Error creating note: ${result.error}`);
          }
        } else if (createType === 'folder') {
          console.log('Creating folder:', name, 'at', location);
          const result = await ipcRenderer.invoke('create-folder', {
            dirPath: location,
            name: name
          });
          
          if (result.success) {
            await loadNotes();
            createModal.style.display = 'none';
            createNameInput.value = '';
          } else {
            alert(`Error creating folder: ${result.error}`);
          }
        }
      } catch (error) {
        console.error('Error creating item:', error);
        alert('An error occurred while creating the item');
      }
    };
  }
});

// Apply settings to the UI
function applySettings(settings) {
  if (!settings) return;
  
  console.log('Applying settings:', settings);
  
  // Apply theme
  document.body.classList.remove('theme-light', 'theme-dark');
  document.body.classList.add(`theme-${settings.theme}`);
  
  // Apply syntax highlighting theme
  const hljsTheme = document.getElementById('hljs-theme');
  if (hljsTheme) {
    const syntaxTheme = settings.theme === 'dark' ? 'github-dark' : 'github';
    hljsTheme.href = `../../node_modules/highlight.js/styles/${syntaxTheme}.css`;
  }
  
  // Apply font family
  document.documentElement.style.setProperty('--font-family', settings.fontFamily);
  
  // Apply font size
  document.documentElement.style.setProperty('--font-size', settings.fontSize);
  
  // Apply line numbers setting
  const editorContainer = document.querySelector('#editor-container');
  if (editorContainer) {
    if (settings.showLineNumbers) {
      editorContainer.classList.add('show-line-numbers');
    } else {
      editorContainer.classList.remove('show-line-numbers');
    }
    
    // Apply vertical lines setting
    if (settings.showVerticalLines) {
      editorContainer.classList.add('show-vertical-lines');
    } else {
      editorContainer.classList.remove('show-vertical-lines');
    }
  }
  
  // Apply editor settings
  if (editor) {
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

// Update settings form with current settings
function updateSettingsForm(settings) {
  if (!settings) return;
  
  console.log('Updating settings form with:', settings);
  
  const themeSelect = document.getElementById('theme-select');
  const fontFamilySelect = document.getElementById('font-family');
  const fontSizeInput = document.getElementById('font-size');
  const showLineNumbersCheck = document.getElementById('show-line-numbers');
  const showVerticalLinesCheck = document.getElementById('show-vertical-lines');
  const autoIndentCheck = document.getElementById('auto-indent');
  const copyAsMarkdownCheck = document.getElementById('copy-as-markdown');
  const spacesPerTabInput = document.getElementById('spaces-per-tab');
  
  if (themeSelect) themeSelect.value = settings.theme || 'light';
  if (fontFamilySelect) fontFamilySelect.value = settings.fontFamily || 'Arial';
  if (fontSizeInput) fontSizeInput.value = settings.fontSize || '0.9rem';
  if (showLineNumbersCheck) showLineNumbersCheck.checked = settings.showLineNumbers !== false;
  if (showVerticalLinesCheck) showVerticalLinesCheck.checked = settings.showVerticalLines !== false;
  if (autoIndentCheck) autoIndentCheck.checked = settings.automaticIndentation !== false;
  if (copyAsMarkdownCheck) copyAsMarkdownCheck.checked = settings.copyAsMarkdown !== false;
  if (spacesPerTabInput) spacesPerTabInput.value = settings.spacesPerTab || 2;
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