// Simple test script for XNotes
console.log('Simple test script loaded!');
const { ipcRenderer } = require('electron');
const Quill = require('quill');
const path = require('path');

// Load Highlight.js and set it up globally
const hljs = require('highlight.js');
window.hljs = hljs; // This is very important - must be globally accessible for Quill's syntax module

// Checkbox functionality has been removed

// State variables
let currentNote = null;
let currentNotePath = null;
let activeDirectoryPath = null; // Active selected folder path
let noteTree = null;
let settings = null;
let editor = null;
let createType = 'note'; // 'note' or 'folder'
let hasUnsavedChanges = false; // Are there unsaved changes?
let unsavedContents = {}; // Store unsaved notes
let autoSaveTimer = null; // Timer for auto-save
const AUTO_SAVE_DELAY = 2500; // 2.5 seconds auto-save delay

// Tab system variables
let openTabs = []; // Array of open tabs
let activeTabIndex = -1; // Index of currently active tab
let nextTabId = 1; // Auto-increment ID for tabs
let originalOpenNote = null; // Reference to original openNote function

// Context menu variables
let contextMenu = null;
let contextTarget = null; // Currently selected item for context menu

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log('DOM loaded, initializing app...');
    
    // Initialize basic functionality
    await initializeApp();
    
    // Save expanded folders when app is closing
    ipcRenderer.on('app-closing', async () => {
      console.log('Application is closing, saving state...');
      
      // Save expanded folders
      const expandedFolders = saveExpandedState();
      await ipcRenderer.invoke('save-expanded-folders', expandedFolders);
      
      // Save tab session (includes active tab info)
      await saveTabSession();
      
      // Save current active tab as last opened note for fallback
      if (activeTabIndex >= 0 && openTabs[activeTabIndex] && openTabs[activeTabIndex].path) {
        const activeTab = openTabs[activeTabIndex];
        console.log('Saving last opened note from active tab:', activeTab.path);
        await ipcRenderer.invoke('save-last-opened-note', activeTab.path);
      } else if (currentNotePath) {
        console.log('Saving last opened note from current path:', currentNotePath);
        await ipcRenderer.invoke('save-last-opened-note', currentNotePath);
      }
    });
    
  } catch (error) {
    console.error('Error initializing app:', error);
  }
});

// Initialize the application
async function initializeApp() {
  // Load settings
  try {
    settings = await ipcRenderer.invoke('get-settings');
    console.log('Settings loaded:', settings);
    
    // Immediately apply theme to prevent flash of wrong theme
    if (settings && settings.theme) {
      document.body.classList.remove('theme-light', 'theme-dark');
      document.body.classList.add(`theme-${settings.theme}`);
      
      // Also update syntax highlighting theme if possible
      const hljsTheme = document.getElementById('hljs-theme');
      if (hljsTheme) {
        const syntaxTheme = settings.theme === 'dark' ? 'github-dark' : 'github';
        hljsTheme.href = `../../node_modules/highlight.js/styles/${syntaxTheme}.css`;
      }
    }
  } catch (error) {
    console.error('Error loading settings:', error);
    settings = { theme: 'light' }; // Default fallback
  }
  
  // Initialize window controls
  initializeWindowControls();
  
  // Initialize editor
  initializeEditor();
  
  // Initialize buttons
  initializeButtons();
  
  // Initialize keyboard shortcuts
  initializeShortcuts();
  
  // Initialize tab system
  initializeTabSystem();
  
  // Load notes
  await loadNotes();
  
  // Load tab session
  await loadTabSession();
  
  // Open last opened note only if no tabs are loaded and no session exists
  if (openTabs.length === 0 && (!settings || !settings.tabSession)) {
    await openLastOpenedNote();
  }
}

// Open the last opened note automatically
async function openLastOpenedNote() {
  try {
    if (!settings || !settings.lastOpenedNote) {
      console.log('No last opened note found');
      return;
    }

    const lastNotePath = settings.lastOpenedNote;
    console.log('Attempting to open last note:', lastNotePath);

    // Check if the file still exists
    const fs = require('fs');
    if (!fs.existsSync(lastNotePath)) {
      console.log('Last opened note no longer exists:', lastNotePath);
      // Clear the invalid path from settings
      await ipcRenderer.invoke('save-last-opened-note', null);
      return;
    }

    // Open the note
    const success = await openNote(lastNotePath);
    if (success) {
      console.log('Last opened note restored successfully:', lastNotePath);
      
      // Show a brief notification
      showStatusMessage('Last note restored', 'info');
    } else {
      console.log('Failed to open last note:', lastNotePath);
      // Clear the invalid path from settings
      await ipcRenderer.invoke('save-last-opened-note', null);
    }
  } catch (error) {
    console.error('Error opening last opened note:', error);
    // Clear the invalid path from settings in case of error
    try {
      await ipcRenderer.invoke('save-last-opened-note', null);
    } catch (clearError) {
      console.error('Error clearing last opened note:', clearError);
    }
  }
}

// Initialize window control buttons
function initializeWindowControls() {
  const minimizeBtn = document.getElementById('minimize-btn');
  const maximizeBtn = document.getElementById('maximize-btn');
  const closeBtn = document.getElementById('close-btn');
  
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
  
  if (closeBtn) {
    closeBtn.onclick = () => {
      console.log('Close button clicked');
      ipcRenderer.send('window-control', 'close');
    };
  }
}

// Initialize the editor
function initializeEditor() {
  const editorElement = document.getElementById('editor');
  if (!editorElement) {
    console.error('Editor element not found');
    return;
  }
  
  // Initialize note title to empty
  const noteTitleEl = document.getElementById('note-title');
  if (noteTitleEl) {
    noteTitleEl.textContent = ''; 
  }
  
  // Initialize creation date to empty
  const creationDateEl = document.getElementById('note-creation-date');
  if (creationDateEl) {
    creationDateEl.textContent = '';
  }
  
  try {
    console.log('Creating Quill editor...');
    console.log('Highlight.js available:', typeof window.hljs);
    
    // First set simple content for editor
    editorElement.innerHTML = '<p>Loading editor...</p>';
    
    // Initialize Quill
    editor = new Quill('#editor', {
      theme: 'snow',
      modules: {
        syntax: {
          highlight: function(text) {
            if (window.hljs) {
              return window.hljs.highlightAuto(text).value;
            }
            return text;
          }
        },
        toolbar: [
          [{ 'header': [1, 2, 3, false] }],
          ['bold', 'italic', 'underline', 'strike'],
          ['blockquote', 'code-block', 'link', 'image'],
          [{ 'list': 'ordered'}, { 'list': 'bullet' }, { 'list': 'check' }],
          [{ 'indent': '-1'}, { 'indent': '+1' }],
          [{ 'color': [] }, { 'background': [] }],
          ['clean']
        ],
        clipboard: {
          matchVisual: false // Disable visual matching for custom copy operation
        }
      }
    });
    
    // Test if editor is working
    try {
      editor.setText('Create or edit your note!');
      console.log('Initial text set in editor');
    } catch (e) {
      console.error('Could not set initial text in editor:', e);
    }
    
    // Customize copy behavior - to preserve list markers
    setupCustomCopyBehavior();
    
    // Configure settings for Markdown format (for list markers and sequence numbers)
    if (window.marked) {
      console.log('Marked library detected, configuring for Markdown support');
      window.marked.setOptions({
        gfm: true,
        breaks: true
      });
    } else {
      console.warn('Marked library not found, some Markdown features may not work properly');
    }
    
    // Track change status
    const statusIndicator = document.createElement('div');
    statusIndicator.className = 'status-indicator';
    statusIndicator.textContent = 'All changes saved';
    document.querySelector('.editor-container').appendChild(statusIndicator);
    
    // Mark as unsaved when changes occur and start auto-save
    editor.on('text-change', debounce((delta, oldContents, source) => {
      console.log('Text changed (source: ' + source + ')');
      
      if (currentNotePath && source === 'user') {  // Only mark for user changes
        // Mark the change
        hasUnsavedChanges = true;
        
        // Temporarily store the content
        try {
          unsavedContents[currentNotePath] = editor.root.innerHTML;
        } catch (e) {
          console.error('Cannot store unsaved changes:', e);
        }
        
        // Update change status - show * mark if user made changes
        updateNoteStatus(true);
        
        // If auto-save is active, restart the timer
        if (settings && settings.autoSave) {
          // Clear previous timer
          if (autoSaveTimer) {
            clearTimeout(autoSaveTimer);
          }
          
          // Start new timer
          autoSaveTimer = setTimeout(async () => {
            console.log('Auto save timer triggered');
            if (hasUnsavedChanges && currentNotePath) {
              await saveCurrentNote();
              
              // Show notification for auto-save
              const statusIndicator = document.querySelector('.status-indicator');
              if (statusIndicator) {
                statusIndicator.textContent = 'Auto-saved';
                statusIndicator.classList.remove('error', 'unsaved');
                statusIndicator.classList.add('saved', 'visible');
                
                setTimeout(() => {
                  statusIndicator.classList.remove('visible');
                }, 1500);
              }
            }
          }, AUTO_SAVE_DELAY);
        }
      }
    }, 500));
    
    console.log('Editor initialized successfully');
  } catch (error) {
    console.error('Error initializing editor:', error);
    
    // Fallback mode - try a simpler initialization
    try {
      console.log('Trying simplified editor initialization...');
      editor = new Quill('#editor', {
        theme: 'snow',
        modules: {
          toolbar: true
        }
      });
      console.log('Simplified editor initialized');
    } catch (fallbackError) {
      console.error('Failed to initialize even simplified editor:', fallbackError);
    }
  }
}

// Initialize UI buttons
function initializeButtons() {
  // Settings button
  const settingsBtn = document.getElementById('settings-btn');
  const settingsModal = document.getElementById('settings-modal');
  
  if (settingsBtn && settingsModal) {
    settingsBtn.onclick = () => {
      settingsModal.style.display = 'flex';
    };
  }
  
  // New note button
  const newNoteBtn = document.getElementById('new-note-btn');
  const createModal = document.getElementById('create-modal');
  const createModalTitle = document.getElementById('create-modal-title');
  
  if (newNoteBtn && createModal && createModalTitle) {
    newNoteBtn.onclick = () => {
      createType = 'note';
      createModalTitle.textContent = 'New Note';
      const nameInput = document.getElementById('create-name');
      if (nameInput) {
        nameInput.value = 'New Note'; // Set default name
      }
      populateLocationSelect();
      createModal.style.display = 'flex';
      
      // Focus and select the text
      setTimeout(() => {
        if (nameInput) {
          nameInput.focus();
          nameInput.select();
        }
      }, 100);
    };
  }
  
  // New folder button
  const newFolderBtn = document.getElementById('new-folder-btn');
  
  if (newFolderBtn && createModal && createModalTitle) {
    newFolderBtn.onclick = () => {
      createType = 'folder';
      createModalTitle.textContent = 'New Folder';
      const nameInput = document.getElementById('create-name');
      if (nameInput) {
        nameInput.value = 'New Folder'; // Set default name
      }
      populateLocationSelect();
      createModal.style.display = 'flex';
      
      // Focus and select the text
      setTimeout(() => {
        if (nameInput) {
          nameInput.focus();
          nameInput.select();
        }
      }, 100);
    };
  }
  
  // Create button
  const createBtn = document.getElementById('create-btn');
  const createNameInput = document.getElementById('create-name');
  const createLocationSelect = document.getElementById('create-location');
  
  // New content creation function - separate function for reusability
  const createNewItem = async () => {
    let name = createNameInput.value.trim();
    const location = createLocationSelect.value;
    
    // If no name provided, use default name based on type
    if (!name) {
      name = createType === 'note' ? 'New Note' : 'New Folder';
      createNameInput.value = name; // Update the input to show the default name
    }
    
    try {
      if (createType === 'note') {
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
        const result = await ipcRenderer.invoke('create-directory', {
          parentDir: location,
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
      alert('An error occurred');
    }
  };
  
  // Button click
  if (createBtn) {
    createBtn.onclick = createNewItem;
  }
  
  // Add keyboard event to input field
  if (createNameInput) {
    createNameInput.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        // Enter key: Create
        e.preventDefault();
        await createNewItem();
      } else if (e.key === 'Escape') {
        // Esc key: Cancel
        e.preventDefault();
        createModal.style.display = 'none';
        createNameInput.value = '';
      }
    });
  }
  
  // Add keyboard event to select field as well
  if (createLocationSelect) {
    createLocationSelect.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        // Enter key: Create
        e.preventDefault();
        await createNewItem();
      } else if (e.key === 'Escape') {
        // Esc key: Cancel
        e.preventDefault();
        createModal.style.display = 'none';
        createNameInput.value = '';
      }
    });
  }
  
  // Save button
  const saveBtn = document.getElementById('save-btn');
  if (saveBtn) {
    saveBtn.onclick = async () => {
      console.log('Save button clicked');
      
      // Show notification if no changes
      if (!hasUnsavedChanges) {
        const statusIndicator = document.querySelector('.status-indicator');
        if (statusIndicator) {
          statusIndicator.textContent = 'No changes to save';
          statusIndicator.classList.add('visible');
          
          setTimeout(() => {
            statusIndicator.classList.remove('visible');
          }, 1500);
        }
        return;
      }
      
      // Save if there are changes
      const success = await saveCurrentNote();
      
      // Give visual feedback if saved successfully
      if (success) {
        // Update button appearance
        const originalIcon = saveBtn.innerHTML;
        saveBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M6 10.5l-3-3-1 1L6 12.5l8-8-1-1z" fill="currentColor"/></svg> Saved!';
        saveBtn.classList.add('saved');
        
        // Reset button appearance after a short time
        setTimeout(() => {
          saveBtn.innerHTML = originalIcon;
          saveBtn.classList.remove('saved');
        }, 1500);
      }
    };
    
    // Set up save button appearance initially
    const updateSaveButton = () => {
      if (hasUnsavedChanges) {
        saveBtn.classList.add('has-changes');
      } else {
        saveBtn.classList.remove('has-changes');
      }
    };
    
    // Update button appearance periodically
    setInterval(updateSaveButton, 500);
  }
  
  // Save settings button
  const saveSettingsBtn = document.getElementById('save-settings-btn');
  
  if (saveSettingsBtn) {
    saveSettingsBtn.onclick = async () => {
      await saveSettings();
    };
  }
  
  // Close modal when clicking outside
  window.onclick = (e) => {
    if (e.target === settingsModal || e.target === createModal) {
      e.target.style.display = 'none';
    }
  };
  
  // Close modals with Esc key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // Close all open modals when Esc key is pressed
      const modals = document.querySelectorAll('.modal');
      modals.forEach(modal => {
        if (modal.style.display === 'flex') {
          modal.style.display = 'none';
          
          // Clear input fields
          const inputs = modal.querySelectorAll('input[type="text"]');
          inputs.forEach(input => {
            input.value = '';
          });
          
          e.preventDefault();
          e.stopPropagation();
        }
      });
    }
  }, true);
  
  // Close buttons in modals
  document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
      const modals = document.querySelectorAll('.modal');
      modals.forEach(modal => {
        modal.style.display = 'none';
      });
    });
  });
  
  // Populate settings form
  updateSettingsForm();
  
  // Initialize context menu
  initializeContextMenu();
}

// Initialize context menu functionality
function initializeContextMenu() {
  contextMenu = document.getElementById('context-menu');
  
  if (!contextMenu) {
    console.error('Context menu element not found');
    return;
  }
  
  console.log('Initializing context menu...');
  
  // Context menu event handlers
  const renameEl = document.getElementById('ctx-rename');
  const duplicateEl = document.getElementById('ctx-duplicate');
  const openNewTabEl = document.getElementById('ctx-open-new-tab');
  const deleteEl = document.getElementById('ctx-delete');
  const newNoteEl = document.getElementById('ctx-new-note');
  const newFolderEl = document.getElementById('ctx-new-folder');
  
  if (renameEl) {
    renameEl.addEventListener('click', handleContextRename);
    console.log('Rename handler added');
  } else {
    console.error('ctx-rename element not found');
  }
  
  if (duplicateEl) {
    duplicateEl.addEventListener('click', handleContextDuplicate);
    console.log('Duplicate handler added');
  } else {
    console.error('ctx-duplicate element not found');
  }
  
  if (openNewTabEl) {
    openNewTabEl.addEventListener('click', handleContextOpenNewTab);
    console.log('Open new tab handler added');
  } else {
    console.error('ctx-open-new-tab element not found');
  }
  
  if (deleteEl) {
    deleteEl.addEventListener('click', handleContextDelete);
    console.log('Delete handler added');
  } else {
    console.error('ctx-delete element not found');
  }
  
  if (newNoteEl) {
    newNoteEl.addEventListener('click', handleContextNewNote);
    console.log('New note handler added');
  } else {
    console.error('ctx-new-note element not found');
  }
  
  if (newFolderEl) {
    newFolderEl.addEventListener('click', handleContextNewFolder);
    console.log('New folder handler added');
  } else {
    console.error('ctx-new-folder element not found');
  }
  
  // Color picker event handlers
  const colorButtons = document.querySelectorAll('.color-option');
  console.log('Found color buttons:', colorButtons.length);
  colorButtons.forEach((btn, index) => {
    btn.addEventListener('click', (e) => {
      const color = e.target.dataset.color;
      console.log('Color clicked:', color);
      handleColorChange(color);
    });
    console.log(`Color button ${index} initialized with color:`, btn.dataset.color);
  });
  
  // Hide context menu when clicking outside
  document.addEventListener('click', (e) => {
    if (!contextMenu.contains(e.target)) {
      hideContextMenu();
    }
  });
  
  // Prevent context menu from closing when clicking inside
  contextMenu.addEventListener('click', (e) => {
    e.stopPropagation();
  });
}

// Show context menu
function showContextMenu(e, target) {
  console.log('showContextMenu called with target:', target);
  e.preventDefault();
  e.stopPropagation();
  
  contextTarget = target;
  console.log('contextTarget set to:', contextTarget);
  
  // Update context menu header with item name and type
  const headerName = document.querySelector('.context-menu-header .item-name');
  const headerType = document.querySelector('.context-menu-header .item-type');
  
  if (headerName && headerType) {
    const isFolder = target.dataset.type === 'directory';
    const itemName = target.querySelector('.tree-name').textContent;
    
    headerName.textContent = itemName;
    headerType.textContent = isFolder ? 'Folder' : 'Note';
    console.log('Updated header:', itemName, isFolder ? 'Folder' : 'Note');
  }
  
  // Show/hide relevant menu items based on item type
  const isFolder = target.dataset.type === 'directory';
  const duplicateItem = document.getElementById('ctx-duplicate');
  const openNewTabItem = document.getElementById('ctx-open-new-tab');
  const colorSection = document.querySelector('.color-section');
  
  // Only show duplicate option for notes
  if (duplicateItem) {
    duplicateItem.style.display = isFolder ? 'none' : 'flex';
  }
  
  // Only show "Open in New Tab" option for notes
  if (openNewTabItem) {
    openNewTabItem.style.display = isFolder ? 'none' : 'flex';
  }
  
  // Show color picker for both folders and notes
  if (colorSection) {
    colorSection.style.display = 'flex'; // Show for both types
  }
  
  // Position and show context menu
  contextMenu.style.left = e.pageX + 'px';
  contextMenu.style.top = e.pageY + 'px';
  contextMenu.style.display = 'block';
  console.log('Context menu displayed at:', e.pageX, e.pageY);
  
  // Adjust position if menu goes off-screen
  const menuRect = contextMenu.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  if (menuRect.right > viewportWidth) {
    contextMenu.style.left = (e.pageX - menuRect.width) + 'px';
  }
  
  if (menuRect.bottom > viewportHeight) {
    contextMenu.style.top = (e.pageY - menuRect.height) + 'px';
  }
}

// Hide context menu
function hideContextMenu() {
  if (contextMenu) {
    contextMenu.style.display = 'none';
    contextTarget = null;
  }
}

// Context menu action handlers
function handleContextRename() {
  console.log('handleContextRename called, contextTarget:', contextTarget);
  if (!contextTarget) return;
  
  // Get required elements before hiding menu (which sets contextTarget to null)
  const nameEl = contextTarget.querySelector('.tree-name');
  const node = {
    path: contextTarget.dataset.path,
    type: contextTarget.dataset.type,
    name: nameEl ? nameEl.textContent : ''
  };
  
  hideContextMenu();
  
  console.log('Found nameEl:', nameEl);
  if (nameEl) {
    console.log('Calling handleRename with node:', node);
    handleRename(node, nameEl);
  }
}

function handleContextDuplicate() {
  console.log('handleContextDuplicate called, contextTarget:', contextTarget);
  if (!contextTarget) return;
  
  // Get required data before hiding menu
  const notePath = contextTarget.dataset.path;
  
  hideContextMenu();
  
  if (notePath) {
    duplicateNote(notePath);
  }
}

function handleContextOpenNewTab() {
  console.log('handleContextOpenNewTab called, contextTarget:', contextTarget);
  if (!contextTarget) return;
  
  // Get required data before hiding menu
  const notePath = contextTarget.dataset.path;
  const isDirectory = contextTarget.dataset.type === 'directory';
  
  hideContextMenu();
  
  // Only open notes in new tab, not directories
  if (notePath && !isDirectory) {
    openNoteInTab(notePath, true);
    console.log('Opened note in new tab:', notePath);
  } else if (isDirectory) {
    showStatusMessage('Cannot open folder in tab', 'warning');
  }
}

function handleContextDelete() {
  console.log('handleContextDelete called, contextTarget:', contextTarget);
  if (!contextTarget) return;
  
  // Get required data before hiding menu
  const node = {
    path: contextTarget.dataset.path,
    type: contextTarget.dataset.type,
    name: contextTarget.querySelector('.tree-name').textContent
  };
  const isFolder = contextTarget.dataset.type === 'directory';
  
  hideContextMenu();
  
  console.log('Calling handleDelete with node:', node, 'isFolder:', isFolder);
  handleDelete(node, isFolder);
}

function handleContextNewNote() {
  console.log('handleContextNewNote called, contextTarget:', contextTarget);
  if (!contextTarget) return;
  
  // Get required data before hiding menu
  let targetDir = contextTarget.dataset.path;
  const targetType = contextTarget.dataset.type;
  console.log('Original targetDir:', targetDir, 'targetType:', targetType);
  
  if (targetType === 'file') {
    targetDir = path.dirname(targetDir);
    console.log('Adjusted targetDir for file:', targetDir);
  }
  
  hideContextMenu();
  
  console.log('Calling createNewItemInDirectory with dir:', targetDir, 'type: note');
  createNewItemInDirectory(targetDir, 'note');
}

function handleContextNewFolder() {
  console.log('handleContextNewFolder called, contextTarget:', contextTarget);
  if (!contextTarget) return;
  
  // Get required data before hiding menu
  let targetDir = contextTarget.dataset.path;
  const targetType = contextTarget.dataset.type;
  console.log('Original targetDir:', targetDir, 'targetType:', targetType);
  
  if (targetType === 'file') {
    targetDir = path.dirname(targetDir);
    console.log('Adjusted targetDir for file:', targetDir);
  }
  
  hideContextMenu();
  
  console.log('Calling createNewItemInDirectory with dir:', targetDir, 'type: folder');
  createNewItemInDirectory(targetDir, 'folder');
}

function handleColorChange(color) {
  console.log('handleColorChange called with color:', color, 'contextTarget:', contextTarget);
  if (!contextTarget) {
    console.log('No context target');
    return;
  }
  
  // Get required elements before hiding menu
  const isFolder = contextTarget.dataset.type === 'directory';
  const targetIcon = isFolder ? 
    contextTarget.querySelector('.folder-icon') : 
    contextTarget.querySelector('.file-icon');
  const itemPath = contextTarget.dataset.path;
  
  hideContextMenu();
  
  // Apply color to icon
  console.log('Found targetIcon:', targetIcon, 'isFolder:', isFolder);
  if (targetIcon) {
    // Remove existing color classes
    targetIcon.classList.remove('color-primary', 'color-success', 'color-warning', 'color-danger', 'color-info', 'color-purple', 'color-orange', 'color-default');
    
    // Add new color class
    if (color !== 'default') {
      targetIcon.classList.add(`color-${color}`);
      console.log('Added color class:', `color-${color}`);
    }
    
    // Save color preference
    if (isFolder) {
      saveFolderColor(itemPath, color);
    } else {
      saveNoteColor(itemPath, color);
    }
  }
}

// Helper function to create new item in specific directory
async function createNewItemInDirectory(dirPath, type) {
  console.log('createNewItemInDirectory called with dirPath:', dirPath, 'type:', type);
  
  // Use the existing create modal instead of prompt
  const createModal = document.getElementById('create-modal');
  const createModalTitle = document.getElementById('create-modal-title');
  const createNameInput = document.getElementById('create-name');
  const createLocationSelect = document.getElementById('create-location');
  
  if (!createModal || !createModalTitle || !createNameInput || !createLocationSelect) {
    console.error('Create modal elements not found');
    return;
  }
  
  // Set up modal for the specific type and directory
  createType = type;
  createModalTitle.textContent = type === 'note' ? 'New Note' : 'New Folder';
  
  // Populate location select and set the target directory
  populateLocationSelect();
  
  // Set the target directory as selected
  for (let option of createLocationSelect.options) {
    if (option.value === dirPath) {
      createLocationSelect.value = dirPath;
      break;
    }
  }
  
  // Set default name based on type
  const defaultName = type === 'note' ? 'New Note' : 'New Folder';
  createNameInput.value = defaultName;
  
  // Show modal
  createModal.style.display = 'flex';
  
  // Focus on name input and select all text after a short delay
  setTimeout(() => {
    createNameInput.focus();
    createNameInput.select(); // Select all text so user can easily replace it
  }, 100);
}

// Helper function to duplicate a note
async function duplicateNote(notePath) {
  try {
    const result = await ipcRenderer.invoke('duplicate-note', notePath);
    
    if (result.success) {
      await loadNotes();
      alert('Note duplicated successfully');
    } else {
      alert(`Error duplicating note: ${result.error}`);
    }
  } catch (error) {
    console.error('Error duplicating note:', error);
    alert('An error occurred while duplicating');
  }
}

// Helper function to save folder color preference
async function saveFolderColor(folderPath, color) {
  try {
    await ipcRenderer.invoke('save-folder-color', { folderPath, color });
    console.log(`Saved folder ${folderPath} color to ${color}`);
  } catch (error) {
    console.error('Error saving folder color:', error);
  }
}

// Helper function to save note color preference
async function saveNoteColor(notePath, color) {
  try {
    await ipcRenderer.invoke('save-note-color', { notePath, color });
    console.log(`Saved note ${notePath} color to ${color}`);
  } catch (error) {
    console.error('Error saving note color:', error);
  }
}

// Helper function to show status messages
function showStatusMessage(message, type = 'info') {
  const statusIndicator = document.querySelector('.status-indicator');
  if (statusIndicator) {
    statusIndicator.textContent = message;
    statusIndicator.classList.remove('visible', 'saved', 'error', 'unsaved');
    statusIndicator.classList.add('visible', type);
    
    setTimeout(() => {
      statusIndicator.classList.remove('visible');
    }, 3000);
  }
}

// Load notes tree
async function loadNotes() {
  try {
    console.log('Loading notes...');
    
    // Reload settings to ensure color information is up to date
    try {
      settings = await ipcRenderer.invoke('get-settings');
      console.log('Settings reloaded for color consistency');
    } catch (error) {
      console.error('Error reloading settings:', error);
    }
    
    // Save the expanded state of folders before reloading
    const expandedFolders = saveExpandedState();
    
    const tree = await ipcRenderer.invoke('get-notes');
    
    if (!tree) {
      console.error('No note tree returned');
      return;
    }
    
    noteTree = tree;
    console.log('Notes tree loaded');
    
    // Populate explorer
    const explorerEl = document.getElementById('explorer');
    
    if (!explorerEl) {
      console.error('Explorer element not found');
      return;
    }
    
    // Clear explorer
    explorerEl.innerHTML = '';
    
    // Populate with notes
    if (noteTree.children && noteTree.children.length > 0) {
      noteTree.children.forEach(child => {
        const childEl = createTreeElement(child);
        explorerEl.appendChild(childEl);
      });
    } else {
      console.log('No notes found');
    }
    
    // Check if it's initial load or reload
    // If initial load, use saved folder state from settings
    // Otherwise use newly opened/closed folders
    const foldersToRestore = expandedFolders.length > 0 ? 
      expandedFolders : 
      (settings && settings.expandedFolders && settings.expandedFolders.length > 0 ? 
        settings.expandedFolders : []);
    
    // Restore the expanded state of folders
    restoreExpandedState(foldersToRestore);
    
  } catch (error) {
    console.error('Error loading notes:', error);
  }
}

// Save expanded state of folders
function saveExpandedState() {
  const expandedFolders = [];
  document.querySelectorAll('.tree-node.expanded').forEach(node => {
    if (node.dataset.path) {
      expandedFolders.push(node.dataset.path);
    }
  });
  return expandedFolders;
}

// Restore expanded state of folders
function restoreExpandedState(expandedFolders) {
  if (!expandedFolders || expandedFolders.length === 0) return;
  
  expandedFolders.forEach(path => {
    const folderNode = document.querySelector(`.tree-node[data-path="${path}"]`);
    if (folderNode) {
      folderNode.classList.add('expanded');
    }
  });
  
  // Also ensure current note's folder path is expanded
  if (currentNotePath) {
    const folderPath = currentNotePath.substring(0, currentNotePath.lastIndexOf('/'));
    const openParentFolders = (path) => {
      if (!path) return;
      
      const folderElement = document.querySelector(`.tree-node[data-path="${path}"]`);
      if (folderElement) {
        folderElement.classList.add('expanded');
        
        const parentPath = path.substring(0, path.lastIndexOf('/'));
        if (parentPath && parentPath !== path) {
          openParentFolders(parentPath);
        }
      }
    };
    
    openParentFolders(folderPath);
  }
}

// Create tree element (for file explorer)
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
    
    const arrowEl = document.createElement('span');
    arrowEl.className = 'arrow';
    headerEl.appendChild(arrowEl);
    
    const expandEl = document.createElement('div');
    expandEl.className = 'tree-expander';
    expandEl.innerHTML = '<svg class="tree-icon folder-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M10,4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V8C22,6.89 21.1,6 20,6H12L10,4Z" /></svg>';
    
    // Apply saved folder color if exists
    const folderIcon = expandEl.querySelector('.folder-icon');
    if (settings && settings.folderColors && settings.folderColors[node.path]) {
      const savedColor = settings.folderColors[node.path];
      folderIcon.classList.add(`color-${savedColor}`);
    }
    
    const nameEl = document.createElement('div');
    nameEl.className = 'tree-name';
    nameEl.textContent = node.name;
    nameEl.title = node.name;
    
    headerEl.appendChild(expandEl);
    headerEl.appendChild(nameEl);
    
    // Create action buttons for directory (rename and delete)
    const actionsEl = document.createElement('div');
    actionsEl.className = 'tree-item-actions';
    
    // Rename button (blue)
    const renameBtn = document.createElement('div');
    renameBtn.className = 'item-action rename';
    renameBtn.title = 'Rename';
    renameBtn.innerHTML = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z" /></svg>';
    actionsEl.appendChild(renameBtn);
    
    // Delete button (red)
    const deleteBtn = document.createElement('div');
    deleteBtn.className = 'item-action delete';
    deleteBtn.title = 'Delete';
    deleteBtn.innerHTML = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z" /></svg>';
    actionsEl.appendChild(deleteBtn);
    
    headerEl.appendChild(actionsEl);
    containerEl.appendChild(headerEl);
    
    // Children container
    const childrenEl = document.createElement('div');
    childrenEl.className = 'tree-children';
    containerEl.appendChild(childrenEl);
    
    // Add expand/collapse functionality
    headerEl.addEventListener('click', (e) => {
      if (e.target.closest('.item-action')) return; // Don't expand if clicking on action buttons
      
      e.stopPropagation();
      containerEl.classList.toggle('expanded');
      
      // Update active directory when folder is selected
      activeDirectoryPath = node.path;
      console.log('Active directory set to:', activeDirectoryPath);
    });
    
    // Add rename functionality
    renameBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleRename(node, nameEl);
    });
    
    // Add delete functionality
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleDelete(node, true);
    });
    
    // Add context menu functionality for folders
    headerEl.addEventListener('contextmenu', (e) => {
      showContextMenu(e, containerEl);
    });
    
    // Populate children if any
    if (node.children && node.children.length > 0) {
      node.children.forEach(child => {
        const childEl = createTreeElement(child);
        childrenEl.appendChild(childEl);
      });
    }
  } else {
    // File node - daha basit ve doğrudan yapı
    const noteEl = document.createElement('div');
    noteEl.className = 'tree-item'; // Use tree-item class directly
    noteEl.dataset.path = node.path; // Yol bilgisini ekle
    noteEl.dataset.type = 'file'; // Tip bilgisini de ekle
    
    const iconEl = document.createElement('div');
    iconEl.className = 'tree-expander'; // Use same class as folder icon for consistent alignment
    iconEl.innerHTML = '<svg class="tree-icon file-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" /></svg>';
    
    // Apply saved note color if exists
    const fileIcon = iconEl.querySelector('.file-icon');
    if (settings && settings.noteColors && settings.noteColors[node.path]) {
      const savedColor = settings.noteColors[node.path];
      fileIcon.classList.add(`color-${savedColor}`);
    }
    
    // Remove .html extension from display name
    let displayName = node.name;
    if (displayName.endsWith('.html')) {
      displayName = displayName.substring(0, displayName.length - 5);
    }
    
    const nameEl = document.createElement('div');
    nameEl.className = 'tree-name';
    nameEl.textContent = displayName;
    nameEl.title = displayName;
    
    // Create action buttons for note (rename and delete)
    const actionsEl = document.createElement('div');
    actionsEl.className = 'tree-item-actions';
    
    // Rename button (blue)
    const renameBtn = document.createElement('div');
    renameBtn.className = 'item-action rename';
    renameBtn.title = 'Rename';
    renameBtn.innerHTML = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z" /></svg>';
    actionsEl.appendChild(renameBtn);
    
    // Delete button (red)
    const deleteBtn = document.createElement('div');
    deleteBtn.className = 'item-action delete';
    deleteBtn.title = 'Delete';
    deleteBtn.innerHTML = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z" /></svg>';
    actionsEl.appendChild(deleteBtn);
    
    actionsEl.appendChild(renameBtn);
    actionsEl.appendChild(deleteBtn);
    
    noteEl.appendChild(iconEl);
    noteEl.appendChild(nameEl);
    noteEl.appendChild(actionsEl);
    containerEl.appendChild(noteEl);
    
    // Add single click handler to note element
    noteEl.addEventListener('click', async (e) => {
      if (e.target.closest('.item-action')) return; // Don't open note if clicking on action buttons
      
      e.stopPropagation(); // Prevent event bubbling
      
      // Clear all active classes
      document.querySelectorAll('.active').forEach(el => {
        el.classList.remove('active');
      });
      
      // Add active class only to clicked element
      noteEl.classList.add('active');
      
      console.log('Note clicked, opening in current tab:', node.path);
      
      // Check if note is already open in a tab
      const existingTabIndex = openTabs.findIndex(tab => tab.path === node.path);
      
      if (existingTabIndex !== -1) {
        // Switch to existing tab
        await switchToTab(existingTabIndex);
      } else {
        // Open in current active tab (replace current content)
        if (activeTabIndex >= 0 && openTabs[activeTabIndex]) {
          // Update current tab with new note
          const currentTab = openTabs[activeTabIndex];
          currentTab.path = node.path;
          currentTab.title = node.name.replace('.html', '');
          currentTab.hasUnsavedChanges = false;
          
          // Load the note content
          await originalOpenNote(node.path);
          
          // Update tab bar to reflect changes
          updateTabBar();
          saveTabSession();
        } else {
          // No active tab, create new one
          await openNoteInTab(node.path, true);
        }
      }
    });
    
    // Add middle mouse button handler for opening in new tab
    noteEl.addEventListener('mousedown', async (e) => {
      if (e.button === 1) { // Middle mouse button
        e.preventDefault();
        e.stopPropagation();
        
        console.log('Middle mouse button clicked on note:', node.path);
        openNoteInTab(node.path, true);
      }
    });
    
    // Add rename functionality
    renameBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleRename(node, nameEl);
    });
    
    // Add delete functionality
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleDelete(node, false);
    });
    
    // Add context menu functionality for notes
    noteEl.addEventListener('contextmenu', (e) => {
      showContextMenu(e, noteEl);
    });
  }
  
  return containerEl;
}

// Open a note
async function openNote(notePath) {
  try {
    console.log('Opening note:', notePath);
    
    // If auto-save is active and there are unsaved changes in previous note, save it
    if (settings && settings.autoSave && currentNotePath && hasUnsavedChanges && editor) {
      console.log('Auto saving before switching notes');
      await saveCurrentNote();
    }
    // If auto-save is not active or saving failed, store changes temporarily
    else if (currentNotePath && hasUnsavedChanges && editor) {
      try {
        // Store content temporarily
        unsavedContents[currentNotePath] = editor.root.innerHTML;
        console.log('Stored unsaved changes for:', currentNotePath);
      } catch (e) {
        console.error('Cannot store unsaved changes:', e);
      }
    }
    
    // Load new note
    const response = await ipcRenderer.invoke('read-note', notePath);
    
    console.log('Note content received, type:', typeof response);
    
    let noteContent, noteMetadata;
    
    // Check if the response is an object with content and metadata
    if (response && typeof response === 'object') {
      if (response.error) {
        console.error('Error reading note:', response.error);
        return false;
      }
      
      noteContent = response.content;
      noteMetadata = response.metadata;
    } else {
      // Backward compatibility with older versions that don't return metadata
      noteContent = response;
    }
    
    // Update state
    currentNotePath = notePath;
    currentNote = noteContent;
    
    // Update note title in the UI
    const noteTitleEl = document.getElementById('note-title');
    if (noteTitleEl) {
      // Extract note name from path and remove .html extension
      const fileName = notePath.split('/').pop();
      const displayName = fileName.endsWith('.html') ? 
                          fileName.substring(0, fileName.length - 5) : 
                          fileName;
      noteTitleEl.textContent = displayName;
    }
    
    // Update creation date if available
    const creationDateEl = document.getElementById('note-creation-date');
    if (creationDateEl) {
      if (noteMetadata && noteMetadata.creationDate) {
        // Format the creation date with time
        const date = new Date(noteMetadata.creationDate);
        const formattedDate = date.toLocaleDateString('tr-TR', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
        const formattedTime = date.toLocaleTimeString('tr-TR', {
          hour: '2-digit',
          minute: '2-digit'
        });
        creationDateEl.textContent = `${formattedDate} ${formattedTime}`;
      } else {
        // Try to get file stats from the path
        try {
          const stats = await ipcRenderer.invoke('get-file-stats', notePath);
          if (stats && stats.birthtime) {
            const date = new Date(stats.birthtime);
            const formattedDate = date.toLocaleDateString('tr-TR', {
              year: 'numeric',
              month: 'short',
              day: 'numeric'
            });
            const formattedTime = date.toLocaleTimeString('tr-TR', {
              hour: '2-digit',
              minute: '2-digit'
            });
            creationDateEl.textContent = `${formattedDate} ${formattedTime}`;
          } else {
            creationDateEl.textContent = '';
          }
        } catch (error) {
          console.error('Could not get file stats:', error);
          creationDateEl.textContent = '';
        }
      }
    }
    
    // Set the folder containing the note as active folder
    if (notePath) {
      const lastSlashIndex = notePath.lastIndexOf('/');
      if (lastSlashIndex > 0) {
        activeDirectoryPath = notePath.substring(0, lastSlashIndex);
        console.log('Active directory set to:', activeDirectoryPath);
      }
    }
    
    // Update editor content
    if (editor) {
      // Check if there's previously unsaved content
      if (unsavedContents[notePath]) {
        console.log('Restoring unsaved content for:', notePath);
        hasUnsavedChanges = true;
        // Show * mark because there are changes
        updateNoteStatus(true);
        
        try {
          // First clear editor
          editor.setText('');
          
          // Then set HTML content from unsaved changes
          editor.root.innerHTML = unsavedContents[notePath];
          return true;
        } catch (e) {
          console.error('Cannot restore unsaved content:', e);
          // Use saved content in case of error
        }
      } else {
        // If no unsaved changes
        console.log('Updating editor with content, length:', (noteContent || '').length);
        hasUnsavedChanges = false;
        // Don't show * mark when note is first opened - only show if there are changes
        
        try {
          // First clear editor
          editor.setText('');
          
          // Then set HTML content
          if (noteContent && noteContent.length > 0) {
            editor.clipboard.dangerouslyPasteHTML(0, noteContent);
            console.log('Editor content updated with HTML paste');
          } else {
            console.warn('Note content was empty');
          }
          
          // Remove old * mark when note changes
          updateNoteStatus(false);
        } catch (editorError) {
          console.error('Error updating editor content:', editorError);
        }
      }
    } else {
      console.error('Editor not initialized, cannot update content');
      return false;
    }
    
    // Highlight active note - first clear all active classes
    document.querySelectorAll('.active').forEach(el => {
      el.classList.remove('active');
    });
    
    // Only add active class to active note
    try {
      // Add active class directly to clicked note element only
      const noteElement = document.querySelector(`.tree-item[data-path="${notePath}"]`);
      if (noteElement) {
        console.log('Found note element, adding active class:', notePath);
        noteElement.classList.add('active');
        
        // Find the folder path where the note is located
        const dirPath = notePath.substring(0, notePath.lastIndexOf('/'));
        
        // Open this folder and all parent folders (add expanded class)
        const openParentFolders = (path) => {
          if (!path) return;
          
          const folderElement = document.querySelector(`.tree-node[data-path="${path}"]`);
          if (folderElement) {
            // Open folder
            folderElement.classList.add('expanded');
            
            // Recursion to open parent folder as well
            const parentPath = path.substring(0, path.lastIndexOf('/'));
            if (parentPath && parentPath !== path) {
              openParentFolders(parentPath);
            }
          }
        };
        
        // Open the folder containing the note and parent folders
        openParentFolders(dirPath);
      } else {
        console.warn('Note element not found for path:', notePath);
      }
    } catch (e) {
      console.error('Error highlighting active note:', e);
    }
    
    // Save this note as the last opened note
    try {
      await ipcRenderer.invoke('save-last-opened-note', notePath);
      console.log('Last opened note saved:', notePath);
    } catch (error) {
      console.error('Error saving last opened note:', error);
    }
    
    return true;
  } catch (error) {
    console.error('Error opening note:', error);
    return false;
  }
}

// Save current note
async function saveCurrentNote() {
  if (!currentNotePath || !editor) {
    console.warn('Cannot save note: missing path or editor');
    return false;
  }
  
  try {
    console.log('Saving note to:', currentNotePath);
    let content = '';
    
    try {
      content = editor.root.innerHTML;
      console.log('Content prepared from editor, length:', content.length);
    } catch (contentError) {
      console.error('Error getting editor content:', contentError);
      return false;
    }
    
    const result = await ipcRenderer.invoke('save-note', {
      path: currentNotePath,
      content: content
    });
    
    if (result && result.success) {
      console.log('Note saved successfully');
      
      // Clear unsaved changes status
      hasUnsavedChanges = false;
      
      // If there's unsaved content, remove it
      if (unsavedContents[currentNotePath]) {
        delete unsavedContents[currentNotePath];
      }

      // Update UI status
      updateNoteStatus(false);

      // Update status indicator
      const statusIndicator = document.querySelector('.status-indicator');
      if (statusIndicator) {
        statusIndicator.textContent = 'Saved';
        statusIndicator.classList.remove('unsaved');
        statusIndicator.classList.add('visible', 'saved');
        
        setTimeout(() => {
          statusIndicator.classList.remove('visible');
        }, 2000);
      }
      
      return true;
    } else {
      console.error('Error saving note:', result ? result.error : 'Unknown error');
      return false;
    }
  } catch (error) {
    console.error('Error in save process:', error);
    return false;
  }
}

// Populate location select in create modal
function populateLocationSelect() {
  if (!noteTree) {
    console.error('Note tree not loaded');
    return;
  }
  
  const createLocationSelect = document.getElementById('create-location');
  if (!createLocationSelect) {
    console.error('Location select element not found');
    return;
  }
  
  const createNameInput = document.getElementById('create-name');
  if (createNameInput && createType === 'note') {
    createNameInput.value = 'New Note'; // Default name
  }
  
  createLocationSelect.innerHTML = '';
  
  // Add root directory option
  const rootOption = document.createElement('option');
  rootOption.value = noteTree.path;
  rootOption.textContent = 'XNotes';
  createLocationSelect.appendChild(rootOption);
  
  // Add all directories recursively
  addDirectoriesToSelect(noteTree, 1);
  
  // Set active directory as selected if available
  if (activeDirectoryPath) {
    for (let i = 0; i < createLocationSelect.options.length; i++) {
      if (createLocationSelect.options[i].value === activeDirectoryPath) {
        createLocationSelect.selectedIndex = i;
        break;
      }
    }
  } else if (currentNotePath) {
    // If no active directory but we have an open note, use its directory
    const noteDir = currentNotePath.substring(0, currentNotePath.lastIndexOf('/'));
    for (let i = 0; i < createLocationSelect.options.length; i++) {
      if (createLocationSelect.options[i].value === noteDir) {
        createLocationSelect.selectedIndex = i;
        break;
      }
    }
  }
  
  function addDirectoriesToSelect(node, level) {
    if (node.type !== 'directory') return;
    
    if (node.path !== noteTree.path) {
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

// Update settings form with current settings
function updateSettingsForm() {
  if (!settings) return;
  
  const themeSelect = document.getElementById('theme-select');
  const fontFamilySelect = document.getElementById('font-family');
  const fontSizeInput = document.getElementById('font-size');
  const autoSaveCheck = document.getElementById('auto-save');
  const showLineNumbersCheck = document.getElementById('show-line-numbers');
  const showVerticalLinesCheck = document.getElementById('show-vertical-lines');
  const autoIndentCheck = document.getElementById('auto-indent');
  const copyAsMarkdownCheck = document.getElementById('copy-as-markdown');
  const spacesPerTabInput = document.getElementById('spaces-per-tab');
  
  if (themeSelect) themeSelect.value = settings.theme || 'light';
  if (fontFamilySelect) fontFamilySelect.value = settings.fontFamily || 'Arial';
  if (fontSizeInput) fontSizeInput.value = settings.fontSize || '0.9rem';
  if (autoSaveCheck) autoSaveCheck.checked = settings.autoSave === true;
  if (showLineNumbersCheck) showLineNumbersCheck.checked = settings.showLineNumbers !== false;
  if (showVerticalLinesCheck) showVerticalLinesCheck.checked = settings.showVerticalLines !== false;
  if (autoIndentCheck) autoIndentCheck.checked = settings.automaticIndentation !== false;
  if (copyAsMarkdownCheck) copyAsMarkdownCheck.checked = settings.copyAsMarkdown !== false;
  if (spacesPerTabInput) spacesPerTabInput.value = settings.spacesPerTab || 2;
}

// Save settings
async function saveSettings() {
  const themeSelect = document.getElementById('theme-select');
  const fontFamilySelect = document.getElementById('font-family');
  const fontSizeInput = document.getElementById('font-size');
  const autoSaveCheck = document.getElementById('auto-save');
  const showLineNumbersCheck = document.getElementById('show-line-numbers');
  const showVerticalLinesCheck = document.getElementById('show-vertical-lines');
  const autoIndentCheck = document.getElementById('auto-indent');
  const copyAsMarkdownCheck = document.getElementById('copy-as-markdown');
  const spacesPerTabInput = document.getElementById('spaces-per-tab');
  
  if (!themeSelect || !fontFamilySelect || !fontSizeInput || !autoSaveCheck ||
      !showLineNumbersCheck || !showVerticalLinesCheck || 
      !autoIndentCheck || !copyAsMarkdownCheck || !spacesPerTabInput) {
    console.error('Settings form elements not found');
    return;
  }
  
  const newSettings = {
    theme: themeSelect.value,
    fontFamily: fontFamilySelect.value,
    fontSize: fontSizeInput.value,
    autoSave: autoSaveCheck.checked,
    showLineNumbers: showLineNumbersCheck.checked,
    showVerticalLines: showVerticalLinesCheck.checked,
    automaticIndentation: autoIndentCheck.checked,
    copyAsMarkdown: copyAsMarkdownCheck.checked,
    spacesPerTab: parseInt(spacesPerTabInput.value, 10) || 2
  };
  
  try {
    await ipcRenderer.invoke('save-settings', newSettings);
    settings = newSettings;
    applySettings();
    
    const settingsModal = document.getElementById('settings-modal');
    if (settingsModal) {
      settingsModal.style.display = 'none';
    }
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

// Apply settings
function applySettings() {
  if (!settings) return;
  
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
  
  // Auto Save ayarı değiştiğinde mevcut durumu kontrol et
  console.log('Applying auto save setting:', settings.autoSave);
  
  // If auto-save is disabled, clear the timer
  if (!settings.autoSave && autoSaveTimer) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
  }
  
  // Apply line numbers setting
  const editorContainer = document.querySelector('.editor-container');
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
  
  // "Copy as Markdown" ayarının durumunu güncelle
  const copyAsMarkdownCheck = document.getElementById('copy-as-markdown');
  if (copyAsMarkdownCheck) {
    copyAsMarkdownCheck.checked = settings.copyAsMarkdown !== false;
    
    // Ayar değiştiğinde bir bilgilendirme mesajı göster
    const statusIndicator = document.querySelector('.status-indicator');
    if (statusIndicator) {
      statusIndicator.textContent = settings.copyAsMarkdown !== false ? 
        'Copy as Markdown enabled: Lists will be copied with * and numbers' :
        'Copy as plain text enabled: Lists will still have * and numbers';
      statusIndicator.classList.remove('unsaved', 'saved');
      statusIndicator.classList.add('visible');
      
      setTimeout(() => {
        statusIndicator.classList.remove('visible');
      }, 3000);
    }
  }
}

// Custom copy behavior
function setupCustomCopyBehavior() {
  const editorElement = document.getElementById('editor');
  if (!editorElement) return;

  // Listen for copy event
  editorElement.addEventListener('copy', function(e) {
    if (!editor) return;

    // Check copy behavior from settings - default to enabling Markdown
    const shouldCopyAsMarkdown = settings && settings.copyAsMarkdown !== false;
    
    try {
      const selection = editor.getSelection();
      if (!selection) return;

      // Get selected content
      const selectedContent = editor.getContents(selection.index, selection.length);
      if (!selectedContent || !selectedContent.ops) return;

      // Convert selected content to HTML
      const tempContainer = document.createElement('div');
      const tempQuill = new Quill(tempContainer);
      tempQuill.setContents(selectedContent);

      // Get HTML content
      const html = tempContainer.querySelector('.ql-editor').innerHTML;

      // Prepare HTML for proper copying
      const processedHTML = processHTML(html);

      // Create Markdown text
      const markdown = convertToMarkdown(processedHTML);

      // Copy to clipboard
      e.preventDefault();
      e.clipboardData.setData('text/html', processedHTML);

      // Copy as plain text or Markdown based on settings
      if (shouldCopyAsMarkdown) {
        e.clipboardData.setData('text/plain', markdown);
        console.log('Copied:', markdown);
      } else {
        // Copy as plain text while preserving list markers
        const plainText = convertToFormattedPlainText(processedHTML);
        e.clipboardData.setData('text/plain', plainText);
        console.log('Copied as plain text with formatting:', plainText);
      }

      // Show a temporary message for informational purposes
      const statusIndicator = document.querySelector('.status-indicator');
      if (statusIndicator) {
        statusIndicator.textContent = shouldCopyAsMarkdown ? 
          'Copied' :
          'Copied as plain text with preserved formatting';
        statusIndicator.classList.remove('unsaved', 'saved');
        statusIndicator.classList.add('visible');
        
        setTimeout(() => {
          statusIndicator.classList.remove('visible');
        }, 1500);
      }
      
      console.log('Custom copy completed');
    } catch (err) {
      console.error('Error during custom copy:', err);
      // Allow default copy behavior in case of error
    }
  });
}

// Turn HTML into well-formed HTML for copying
function convertToFormattedPlainText(html) {
  // Process HTML to handle lists and formatting
  // This function will convert HTML lists to plain text with proper markers
  function processOrderedLists(html, indent = '') {
    return html.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/g, function(match, listContent) {
      let counter = 1;
      let result = '';

      // Process each list item
      result += listContent.replace(/<li[^>]*>([\s\S]*?)<\/li>/g, function(match, content) {
        // Check for nested lists
        let itemContent = content;

        // Process nested ordered lists
        if (/<ol[^>]*>/.test(itemContent)) {
          itemContent = itemContent.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/g, function(subMatch, subContent) {
            return '\n' + processOrderedLists(subMatch, indent + '    ');
          });
        }

        // Process nested unordered lists
        if (/<ul[^>]*>/.test(itemContent)) {
          itemContent = itemContent.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/g, function(subMatch, subContent) {
            return '\n' + processUnorderedLists(subMatch, indent + '    ');
          });
        }
        
        // Clean other HTML tags
        const cleanText = itemContent
          .replace(/<p[^>]*>([\s\S]*?)<\/p>/g, '$1')
          .replace(/<br\s*\/?>/g, '\n' + indent + '    ')
          .replace(/<[^>]*>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&');
        
        return indent + counter++ + '. ' + cleanText.trim() + '\n';
      });
      
      return result;
    });
  }

  // Process nested unordered lists
  function processUnorderedLists(html, indent = '') {
    return html.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/g, function(match, listContent) {
      let result = '';

      // Process each list item
      result += listContent.replace(/<li[^>]*>([\s\S]*?)<\/li>/g, function(match, content) {
        // Check for nested lists
        let itemContent = content;

        // Process nested ordered lists
        if (/<ol[^>]*>/.test(itemContent)) {
          itemContent = itemContent.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/g, function(subMatch, subContent) {
            return '\n' + processOrderedLists(subMatch, indent + '    ');
          });
        }

        // Process nested unordered lists
        if (/<ul[^>]*>/.test(itemContent)) {
          itemContent = itemContent.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/g, function(subMatch, subContent) {
            return '\n' + processUnorderedLists(subMatch, indent + '    ');
          });
        }

        // Clean other HTML tags
        const cleanText = itemContent
          .replace(/<p[^>]*>([\s\S]*?)<\/p>/g, '$1')
          .replace(/<br\s*\/?>/g, '\n' + indent + '    ')
          .replace(/<[^>]*>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&');
        
        return indent + '* ' + cleanText.trim() + '\n';
      });
      
      return result;
    });
  }
  
  // Process the HTML content
  let plainText = processOrderedLists(html);
  plainText = processUnorderedLists(plainText);

  // Clean other HTML tags
  plainText = plainText
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/g, '$1\n\n')
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/g, '$1\n\n')
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/g, '$1\n\n')
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/g, '$1\n\n')
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/g, '$1\n\n')
    .replace(/<h5[^>]*>([\s\S]*?)<\/h5>/g, '$1\n\n')
    .replace(/<h6[^>]*>([\s\S]*?)<\/h6>/g, '$1\n\n')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"');
  
  // Clean multiple newlines
  plainText = plainText.replace(/\n{3,}/g, '\n\n');
  
  return plainText.trim();
}
function processHTML(html) {
  // Format HTML to ensure proper list structure
  let processedHtml = html;
  
  // Fix list items
  processedHtml = processedHtml.replace(/<li[^>]*>([\s\S]*?)<\/li>/g, function(match, content) {
    // Check for nested lists
    if (/<(ol|ul)[^>]*>/.test(content)) {
      // Special handling for list items containing nested lists
      return match; // Keep original, nested lists will be processed in later steps
    }

    // For normal list items without nested lists
    return '<li>' + content + '</li>';
  });

  // Clean empty paragraphs (may occur within list items)
  processedHtml = processedHtml.replace(/<p>\s*<\/p>/g, '');

  // Process checkboxes
  const { processCheckboxesInHTML } = require('./checkbox-functions');
  processedHtml = processCheckboxesInHTML(processedHtml);
  
  return processedHtml;
}

// Convert HTML to Markdown
function convertToMarkdown(html) {
  // Analyze the nested list structure first to handle nested lists properly
  let markdown = html;

  // Process checkboxes
  markdown = markdown.replace(/<div class="checkbox-blot">[\s\S]*?<\/div>/g, function(match) {
    // Determine if checked or unchecked
    const isChecked = match.includes('checkbox checked');
    
    // Extract content
    let content = '';
    const contentMatch = match.match(/<div class="checkbox-content">([\s\S]*?)<\/div>/);
    if (contentMatch && contentMatch[1]) {
      content = contentMatch[1].trim();
    }

    // Return in Markdown format
    return `\n${isChecked ? '- [x]' : '- [ ]'} ${content}\n`;
  });

  // Process nested ordered lists
  function processOrderedLists(html, indent = '') {
    return html.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/g, function(match, listContent) {
      let counter = 1;
      let result = '\n';

      // Process each list item
      result += listContent.replace(/<li[^>]*>([\s\S]*?)<\/li>/g, function(match, content) {
        // Check for nested lists
        let itemContent = content;

        // Process nested ordered lists
        if (/<ol[^>]*>/.test(itemContent)) {
          itemContent = itemContent.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/g, function(subMatch, subContent) {
            return '\n' + processOrderedLists(subMatch, indent + '    ');
          });
        }

        // Process nested unordered lists
        if (/<ul[^>]*>/.test(itemContent)) {
          itemContent = itemContent.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/g, function(subMatch, subContent) {
            return '\n' + processUnorderedLists(subMatch, indent + '    ');
          });
        }

        // Other HTML tags cleaning before finalizing content
        const cleanContent = itemContent
          .replace(/<p[^>]*>([\s\S]*?)<\/p>/g, '$1')  // Remove paragraph tags
          .trim();
          
        return indent + counter++ + '. ' + cleanContent.replace(/<[^>]*>/g, '').trim() + '\n';
      });
      
      return result;
    });
  }

  // Process nested unordered lists
  function processUnorderedLists(html, indent = '') {
    return html.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/g, function(match, listContent) {
      let result = '\n';

      // Process each list item
      result += listContent.replace(/<li[^>]*>([\s\S]*?)<\/li>/g, function(match, content) {
        // Check for nested lists
        let itemContent = content;

        // Process nested ordered lists
        if (/<ol[^>]*>/.test(itemContent)) {
          itemContent = itemContent.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/g, function(subMatch, subContent) {
            return '\n' + processOrderedLists(subMatch, indent + '    ');
          });
        }

        // Process nested unordered lists
        if (/<ul[^>]*>/.test(itemContent)) {
          itemContent = itemContent.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/g, function(subMatch, subContent) {
            return '\n' + processUnorderedLists(subMatch, indent + '    ');
          });
        }

        // Other HTML tags cleaning before finalizing content
        const cleanContent = itemContent
          .replace(/<p[^>]*>([\s\S]*?)<\/p>/g, '$1')  // Remove paragraph tags
          .trim();
          
        return indent + '* ' + cleanContent.replace(/<[^>]*>/g, '').trim() + '\n';
      });
      
      return result;
    });
  }

  // Process ordered lists - preliminary processing
  const hasOrderedLists = /<ol[^>]*>/.test(markdown);
  if (hasOrderedLists) {
    markdown = processOrderedLists(markdown);
  }

  // Process unordered lists - preliminary processing
  const hasUnorderedLists = /<ul[^>]*>/.test(markdown);
  if (hasUnorderedLists) {
    markdown = processUnorderedLists(markdown);
  }

  // Other formatting processing (bold, italic, etc.)
  markdown = markdown
    // Paragraphs
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/g, '$1\n\n')
    // Line breaks
    .replace(/<br\s*\/?>/g, '\n')
    // Headings
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/g, '# $1\n\n')
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/g, '## $1\n\n')
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/g, '### $1\n\n')
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/g, '#### $1\n\n')
    .replace(/<h5[^>]*>([\s\S]*?)<\/h5>/g, '##### $1\n\n')
    .replace(/<h6[^>]*>([\s\S]*?)<\/h6>/g, '###### $1\n\n')
    // Bold and italic
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/g, '**$1**')
    .replace(/<b[^>]*>([\s\S]*?)<\/b>/g, '**$1**')
    .replace(/<em[^>]*>([\s\S]*?)<\/em>/g, '*$1*')
    .replace(/<i[^>]*>([\s\S]*?)<\/i>/g, '*$1*')
    // Code blocks
    .replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/g, '```\n$1\n```\n')
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/g, '`$1`')
    // Blockquotes
    .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/g, '> $1\n')
    // Links
    .replace(/<a[^>]*href=["'](.*?)["'][^>]*>([\s\S]*?)<\/a>/g, '[$2]($1)')
    // Images
    .replace(/<img[^>]*src=["'](.*?)["'][^>]*alt=["'](.*?)["'][^>]*>/g, '![$2]($1)')
    .replace(/<img[^>]*alt=["'](.*?)["'][^>]*src=["'](.*?)["'][^>]*>/g, '![$1]($2)')
    .replace(/<img[^>]*src=["'](.*?)["'][^>]*>/g, '![]($1)')
    // Horizontal rules
    .replace(/<hr[^>]*>/g, '---\n\n')
    // Other HTML tags
    .replace(/<[^>]*>/g, '')
    // Fix HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    // Clean up multiple spaces
    .replace(/\n{3,}/g, '\n\n')
    // Clean up extra spaces at list beginnings
    .replace(/\n\n(\s*[*\d]\.)/g, '\n$1');
  
  return markdown.trim();
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

// Initialize keyboard shortcuts
function initializeShortcuts() {
  console.log('Initializing keyboard shortcuts');

  // Show a message indicating that keyboard shortcuts have been added
  setTimeout(() => {
    const statusIndicator = document.querySelector('.status-indicator');
    if (statusIndicator) {
      statusIndicator.textContent = 'Keyboard shortcuts enabled! Ctrl+S to save, Ctrl+N for new note';
      statusIndicator.classList.remove('unsaved', 'saved');
      statusIndicator.classList.add('visible');
      
      setTimeout(() => {
        statusIndicator.classList.remove('visible');
      }, 5000);
    }
  }, 1500);
  
  // Keydown event listener
  document.addEventListener('keydown', async (e) => {
    console.log('Key pressed:', e.key, 'Ctrl:', e.ctrlKey, 'Shift:', e.shiftKey, 'Alt:', e.altKey);
    
    // Ctrl + S = Save current note
    if (e.ctrlKey && e.key === 's' && !e.shiftKey && !e.altKey) {
      e.preventDefault(); // Prevent default browser behavior
      console.log('Ctrl+S pressed: Save note');
      
      if (currentNotePath && hasUnsavedChanges) {
        await saveCurrentNote();
      }
    }

    // Ctrl + N = New note
    else if (e.ctrlKey && e.key === 'n' && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      console.log('Ctrl+N pressed: New note');

      // Open new note modal
      createType = 'note';
      const createModal = document.getElementById('create-modal');
      const createModalTitle = document.getElementById('create-modal-title');
      
      if (createModal && createModalTitle) {
        createModalTitle.textContent = 'New Note';
        populateLocationSelect();
        createModal.style.display = 'flex';
        
        // Focus on input field
        setTimeout(() => {
          const createNameInput = document.getElementById('create-name');
          if (createNameInput) {
            createNameInput.focus();
            createNameInput.select();
          }
        }, 100);
      }
    }

    // Ctrl + Shift + N = New folder
    else if (e.ctrlKey && e.shiftKey && e.key === 'N' && !e.altKey) {
      e.preventDefault();
      console.log('Ctrl+Shift+N pressed: New folder');

      // Open new folder modal
      createType = 'folder';
      const createModal = document.getElementById('create-modal');
      const createModalTitle = document.getElementById('create-modal-title');
      
      if (createModal && createModalTitle) {
        createModalTitle.textContent = 'New Folder';
        populateLocationSelect();
        createModal.style.display = 'flex';

        // Focus on input field
        setTimeout(() => {
          const createNameInput = document.getElementById('create-name');
          if (createNameInput) {
            createNameInput.focus();
            createNameInput.select();
          }
        }, 100);
      }
    }

    // Next and previous note shortcuts removed
  });
}

// Update note status in explorer (add * for unsaved notes)
function updateNoteStatus(hasChanges = false) {
  if (!currentNotePath) return;

  // Get the file name for the note by taking the part after the last / and removing .html
  const fileName = currentNotePath.split('/').pop().replace('.html', '');
  
  console.log(`Updating note status for '${fileName}', hasChanges:`, hasChanges);

  // Find all notes in the explorer
  const allNoteElements = document.querySelectorAll('.tree-item[data-path]');
  allNoteElements.forEach(noteEl => {
    if (noteEl.dataset.path === currentNotePath) {
      const nameEl = noteEl.querySelector('.tree-name');
      if (nameEl) {
        // Update name based on change status
        if (hasChanges) {
          // If name doesn't already end with *, add it
          if (!nameEl.textContent.endsWith('*')) {
            nameEl.textContent = `${fileName} *`;
            // Add visual indicator to note element
            noteEl.classList.add('has-changes');
          }
        } else {
          // Remove * and has-changes class
          nameEl.textContent = fileName;
          noteEl.classList.remove('has-changes');
        }
      }
    }
  });
}

// Handle rename for notes and folders
async function handleRename(node, nameEl) {
  // Create input element to replace the name element
  const inputEl = document.createElement('input');
  inputEl.className = 'rename-input';
  inputEl.value = node.type === 'file' ? 
    node.name.replace('.html', '') : node.name;
  inputEl.title = 'Enter new name and press Enter';
  
  // Store original name for cancel
  const originalName = nameEl.textContent;
  
  // Replace name element with input
  const parent = nameEl.parentNode;
  parent.replaceChild(inputEl, nameEl);
  
  // Prevent focus events from bubbling to note editor
  inputEl.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  
  // Prevent other mouse events from bubbling
  inputEl.addEventListener('mousedown', (e) => {
    e.stopPropagation();
  });
  
  // Focus and select all text
  setTimeout(() => {
    inputEl.focus();
    inputEl.select();
  }, 10);
  
  // Handle keypress events
  inputEl.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const newName = inputEl.value.trim();
      
      if (!newName) {
        // Empty name, revert
        parent.replaceChild(nameEl, inputEl);
        return;
      }
      
      if (newName === originalName) {
        // No change, revert
        parent.replaceChild(nameEl, inputEl);
        return;
      }
      
      // Rename the item
      try {
        let result;
        if (node.type === 'directory') {
          result = await ipcRenderer.invoke('rename-directory', {
            path: node.path,
            newName: newName
          });
        } else {
          result = await ipcRenderer.invoke('rename-note', {
            path: node.path,
            newName: newName
          });
        }
        
        if (result && result.success) {
          // Reload notes
          await loadNotes();
          
          // If this was the current open note, update the note title
          if (currentNotePath === node.path) {
            const noteTitleEl = document.getElementById('note-title');
            if (noteTitleEl) {
              noteTitleEl.textContent = newName;
            }
            
            // Update current note path
            currentNotePath = result.newPath;
          }
        } else {
          alert('Error renaming: ' + (result ? result.error : 'Unknown error'));
          // Revert to original name
          parent.replaceChild(nameEl, inputEl);
        }
      } catch (error) {
        console.error('Error renaming:', error);
        alert('Error renaming: ' + error.message);
        // Revert to original name
        parent.replaceChild(nameEl, inputEl);
      }
    } else if (e.key === 'Escape') {
      // Cancel rename
      parent.replaceChild(nameEl, inputEl);
    }
  });
  
  // Handle click outside to cancel
  function handleClickOutside(e) {
    if (!inputEl.contains(e.target)) {
      parent.replaceChild(nameEl, inputEl);
      document.removeEventListener('click', handleClickOutside);
    }
    // Prevent any focus changes when clicking outside
    e.stopPropagation();
  }
  
  // Delay adding the event listener to prevent immediate triggering
  setTimeout(() => {
    document.addEventListener('click', handleClickOutside, true);
  }, 100);
}

// Handle delete for notes and folders
async function handleDelete(node, isDirectory) {
  let message;
  
  if (isDirectory) {
    message = `Bu klasörü ve içindeki tüm notları silmek istediğinizden emin misiniz?\n\n"${node.name}" klasörü ve içeriği kalıcı olarak silinecek.`;
  } else {
    message = `"${node.name.replace('.html', '')}" notunu silmek istediğinizden emin misiniz?`;
  }
  
  if (confirm(message)) {
    try {
      let result;
      
      if (isDirectory) {
        result = await ipcRenderer.invoke('delete-directory', {
          path: node.path,
          recursive: true
        });
      } else {
        result = await ipcRenderer.invoke('delete-note', {
          path: node.path
        });
      }
      
      if (result && result.success) {
        // If this was the current open note, clear the editor
        if (currentNotePath === node.path) {
          currentNotePath = null;
          currentNote = null;
          editor.setText('');
          
          const noteTitleEl = document.getElementById('note-title');
          if (noteTitleEl) {
            noteTitleEl.textContent = '';
          }
          
          const creationDateEl = document.getElementById('note-creation-date');
          if (creationDateEl) {
            creationDateEl.textContent = '';
          }
        }
        
        // Reload notes
        await loadNotes();
      } else {
        alert('Error deleting: ' + (result ? result.error : 'Unknown error'));
      }
    } catch (error) {
      console.error('Error deleting:', error);
      alert('Error deleting: ' + error.message);
    }
  }
}

// Flag to prevent duplicate drag and drop setup
let dragAndDropSetup = false;

// Add drag-and-drop functionality for notes and folders
function setupDragAndDrop() {
  // Only setup once to prevent duplicate event listeners
  if (dragAndDropSetup) {
    console.log('Drag and drop already setup, skipping...');
    return;
  }
  
  const explorerEl = document.getElementById('explorer');
  if (!explorerEl) {
    console.error('Explorer element not found');
    return;
  }

  console.log('Setting up drag and drop for the first time...');
  dragAndDropSetup = true;

  // Don't clone the element as it removes all event listeners
  // Instead, just use the existing element
  const explorerElement = explorerEl;

  // State for reordering
  let dragState = {
    isDragging: false,
    draggedElement: null,
    draggedPath: null,
    isReorderMode: false,
    originalParent: null,
    ghostElement: null,
    dropTarget: null,
    dropPosition: null,
    hoverTimer: null
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
    dragState.dropTarget = null;
    dragState.dropPosition = null;
    
    // Remove all drag styling
    const dragOverElements = explorerElement.querySelectorAll('.drag-over, .reorder-target, .drop-zone, .reorder-mode');
    dragOverElements.forEach(el => {
      el.classList.remove('drag-over', 'reorder-target', 'drop-zone', 'reorder-mode');
    });
    
    // Clear hover timer
    if (dragState.hoverTimer) {
      clearTimeout(dragState.hoverTimer);
      dragState.hoverTimer = null;
    }
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
    if (!target || target === dragState.draggedElement) return;

    // Immediately switch to reorder mode
    if (!dragState.isReorderMode) {
      console.log('Switching to reorder mode');
      dragState.isReorderMode = true;
      
      // Remove any existing drag-over styling
      const dragOverElements = explorerEl.querySelectorAll('.drag-over, .drop-zone');
      dragOverElements.forEach(el => {
        el.classList.remove('drag-over', 'drop-zone');
      });
    }

    if (dragState.isReorderMode) {
      // Clear previous styling
      const previousTargets = explorerEl.querySelectorAll('.reorder-target');
      previousTargets.forEach(el => el.classList.remove('reorder-target'));
      
      // Remove existing ghost
      if (dragState.ghostElement) {
        dragState.ghostElement.remove();
        dragState.ghostElement = null;
      }
      
      e.dataTransfer.dropEffect = 'move';
      
      let parentContainer;
      let insertPosition = 'after';
      
      // Determine drop target and position
      if (target.dataset.type === 'directory') {
        const targetRect = target.getBoundingClientRect();
        const targetHeaderHeight = 30; // Approximate header height
        
        if (e.clientY < targetRect.top + targetHeaderHeight) {
          // Dropping before the folder
          parentContainer = target.parentElement;
          insertPosition = 'before';
        } else {
          // Dropping inside the folder
          const childrenContainer = target.querySelector('.tree-children');
          if (childrenContainer) {
            parentContainer = childrenContainer;
            insertPosition = 'first';
            // Ensure folder is expanded
            target.classList.add('expanded');
          } else {
            // Folder has no children container, drop after
            parentContainer = target.parentElement;
            insertPosition = 'after';
          }
        }
      } else {
        // Target is a file
        parentContainer = target.parentElement;
        
        const rect = target.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        
        insertPosition = e.clientY < midpoint ? 'before' : 'after';
      }
      
      if (parentContainer) {
        // Create new ghost element with improved styling
        dragState.ghostElement = document.createElement('div');
        dragState.ghostElement.className = 'reorder-ghost';
        
        // Position the ghost element
        switch (insertPosition) {
          case 'first':
            if (parentContainer.children.length > 0) {
              parentContainer.insertBefore(dragState.ghostElement, parentContainer.firstChild);
            } else {
              parentContainer.appendChild(dragState.ghostElement);
            }
            break;
          case 'before':
            parentContainer.insertBefore(dragState.ghostElement, target);
            break;
          case 'after':
            const nextSibling = target.nextElementSibling;
            if (nextSibling) {
              parentContainer.insertBefore(dragState.ghostElement, nextSibling);
            } else {
              parentContainer.appendChild(dragState.ghostElement);
            }
            break;
        }
        
        // Add visual feedback to target
        target.classList.add('reorder-target');
        
        // Store position info for drop handler
        dragState.dropPosition = insertPosition;
        dragState.dropTarget = target;
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

  // Modify the drop event to handle both move and reorder
  explorerElement.addEventListener('drop', async (e) => {
    e.preventDefault();
    
    const draggedPath = e.dataTransfer.getData('text/plain');
    const target = dragState.dropTarget || e.target.closest('.tree-node');
    const position = dragState.dropPosition || 'after';
    
    console.log('Drop event triggered');
    console.log('Dragged path:', draggedPath);
    console.log('Target element:', target);
    console.log('Drop position:', position);
    console.log('Is reorder mode:', dragState.isReorderMode);
    
    // Remove drag over styling
    const allTargets = explorerEl.querySelectorAll('.drag-over, .reorder-target, .drop-zone');
    allTargets.forEach(el => {
      el.classList.remove('drag-over', 'reorder-target', 'drop-zone', 'reorder-mode');
    });

    if (draggedPath && target && target !== dragState.draggedElement) {
      if (dragState.isReorderMode) {
        // Handle reordering (with possible move)
        console.log('Performing reorder operation');
        
        let targetDirectory = null;
        let newIndex = 0;
        
        try {
          // Determine target directory and index based on position
          switch (position) {
            case 'first':
              // Dropping into a folder (at the beginning)
              targetDirectory = target.dataset.path;
              newIndex = 0;
              break;
              
            case 'before':
            case 'after':
              // Dropping relative to another item
              const targetParent = target.parentElement;
              
              if (targetParent.classList.contains('tree-children')) {
                // Inside a folder
                const parentNode = targetParent.closest('.tree-node[data-type="directory"]');
                if (parentNode) {
                  targetDirectory = parentNode.dataset.path;
                } else {
                  // Root directory case
                  const explorerEl = document.getElementById('explorer');
                  targetDirectory = noteTree.path; // Use root path
                }
              } else {
                // At root level
                targetDirectory = noteTree.path;
              }
              
              // Calculate index based on position
              const siblings = Array.from(targetParent.children)
                .filter(child => child.classList.contains('tree-node'));
              const targetIndex = siblings.indexOf(target);
              
              newIndex = position === 'before' ? targetIndex : targetIndex + 1;
              break;
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
                await loadNotes();
                console.log('Item moved and reordered successfully');
                
                // Show success feedback
                showStatusMessage('Item moved and reordered successfully', 'success');
              } else {
                console.error('Error setting item order:', reorderResult.error);
                // Item was moved but ordering failed
                await loadNotes();
                showStatusMessage('Item moved but ordering failed', 'warning');
              }
            } else {
              console.error('Error moving item:', moveResult.error);
              showStatusMessage('Error moving item: ' + moveResult.error, 'error');
            }
          } else if (targetDirectory) {
            // Reorder within same directory
            const result = await ipcRenderer.invoke('reorder-item', {
              itemPath: draggedPath,
              newIndex: newIndex
            });
            
            if (result.success) {
              await loadNotes();
              console.log('Item reordered successfully');
              showStatusMessage('Item reordered successfully', 'success');
            } else {
              console.error('Error reordering item:', result.error);
              showStatusMessage('Error reordering item: ' + result.error, 'error');
            }
          }
        } catch (error) {
          console.error('Error in reorder operation:', error);
          showStatusMessage('Error in reorder operation: ' + error.message, 'error');
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
          showStatusMessage('Cannot move item into itself', 'warning');
          clearDragState();
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
            await loadNotes(); // Reload the tree
            console.log('Item moved successfully');
            showStatusMessage('Item moved successfully', 'success');
          } else {
            console.error('Error moving item:', result.error);
            showStatusMessage('Error moving item: ' + result.error, 'error');
          }
        } catch (error) {
          console.error('Error moving item:', error);
          showStatusMessage('Error moving item: ' + error.message, 'error');
        }
      }
    } else {
      console.log('Drop conditions not met:');
      console.log('- Has dragged path:', !!draggedPath);
      console.log('- Has target:', !!target);
      console.log('- Target is not dragged element:', target !== dragState.draggedElement);
    }
    
    clearDragState();
  });

  // Helper function to show status messages
  function showStatusMessage(message, type = 'info') {
    const statusIndicator = document.querySelector('.status-indicator');
    if (statusIndicator) {
      statusIndicator.textContent = message;
      statusIndicator.classList.remove('visible', 'saved', 'error', 'unsaved');
      statusIndicator.classList.add('visible', type);
      
      setTimeout(() => {
        statusIndicator.classList.remove('visible');
      }, 3000);
    }
  }
}

// Call the setup function after DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  setupDragAndDrop();
});

// ==================== TAB SYSTEM ====================

// Global drag state for tab reordering
let globalDragState = {
  isMouseDown: false,
  isDragging: false,
  dragStartX: 0,
  dragStartY: 0,
  draggedTab: null,
  draggedIndex: -1
};

const DRAG_THRESHOLD = 5; // minimum pixels to start drag

// Global mouse handlers for tab dragging
function handleGlobalMouseMove(e) {
  if (!globalDragState.isMouseDown || !globalDragState.draggedTab) return;
  
  const deltaX = Math.abs(e.clientX - globalDragState.dragStartX);
  const deltaY = Math.abs(e.clientY - globalDragState.dragStartY);
  
  console.log('Global mouse move - deltaX:', deltaX, 'deltaY:', deltaY);
  
  if (!globalDragState.isDragging && (deltaX > DRAG_THRESHOLD || deltaY > DRAG_THRESHOLD)) {
    globalDragState.isDragging = true;
    globalDragState.draggedTab.classList.add('dragging');
    
    // Create a visual clone that follows the mouse
    const tabRect = globalDragState.draggedTab.getBoundingClientRect();
    globalDragState.draggedTab.style.position = 'relative';
    globalDragState.draggedTab.style.zIndex = '1000';
    globalDragState.draggedTab.style.pointerEvents = 'none';
    
    console.log('Started dragging tab:', globalDragState.draggedIndex, 'deltaX:', deltaX);
  }
  
  if (globalDragState.isDragging) {
    // Move the tab with the mouse
    const offsetX = e.clientX - globalDragState.dragStartX;
    const offsetY = e.clientY - globalDragState.dragStartY;
    
    globalDragState.draggedTab.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
    globalDragState.draggedTab.style.opacity = '0.8';
    
    // Find the tab we're hovering over
    const tabList = document.querySelector('.tab-list');
    if (!tabList) return;
    
    const rect = tabList.getBoundingClientRect();
    const relativeX = e.clientX - rect.left;
    
    // Find which tab position we're over
    const allTabs = Array.from(tabList.children);
    let targetIndex = -1;
    
    for (let i = 0; i < allTabs.length; i++) {
      const tabRect = allTabs[i].getBoundingClientRect();
      const tabCenter = tabRect.left + tabRect.width / 2 - rect.left;
      
      if (relativeX < tabCenter) {
        targetIndex = i;
        break;
      }
    }
    
    if (targetIndex === -1) {
      targetIndex = allTabs.length - 1;
    }
    
    // Clear previous hover effects
    allTabs.forEach(tab => tab.classList.remove('drag-over'));
    
    // Add hover effect to target tab (but not to the dragged tab itself)
    if (allTabs[targetIndex] && allTabs[targetIndex] !== globalDragState.draggedTab) {
      allTabs[targetIndex].classList.add('drag-over');
      console.log('Hovering over tab at index:', targetIndex);
    }
  }
}

function handleGlobalMouseUp(e) {
  console.log('Global mouse up - isMouseDown:', globalDragState.isMouseDown, 'isDragging:', globalDragState.isDragging);
  
  if (!globalDragState.isMouseDown) return;
  
  if (globalDragState.isDragging) {
    console.log('Completing drag operation');
    
    // Reset visual styles first
    globalDragState.draggedTab.style.transform = '';
    globalDragState.draggedTab.style.opacity = '';
    globalDragState.draggedTab.style.position = '';
    globalDragState.draggedTab.style.zIndex = '';
    globalDragState.draggedTab.style.pointerEvents = '';
    
    // Find target position
    const tabList = document.querySelector('.tab-list');
    if (tabList) {
      const rect = tabList.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      
      const allTabs = Array.from(tabList.children);
      let targetIndex = -1;
      
      for (let i = 0; i < allTabs.length; i++) {
        const tabRect = allTabs[i].getBoundingClientRect();
        const tabCenter = tabRect.left + tabRect.width / 2 - rect.left;
        
        if (relativeX < tabCenter) {
          targetIndex = i;
          break;
        }
      }
      
      if (targetIndex === -1) {
        targetIndex = allTabs.length - 1;
      }
      
      console.log('Drop tab at position:', targetIndex, 'from:', globalDragState.draggedIndex);
      
      // Perform reorder if different position
      if (targetIndex !== globalDragState.draggedIndex) {
        reorderTabs(globalDragState.draggedIndex, targetIndex);
        console.log('Tab reordered successfully');
      }
      
      // Clean up
      allTabs.forEach(tab => tab.classList.remove('drag-over'));
      globalDragState.draggedTab.classList.remove('dragging');
    }
    
    console.log('Drag completed');
  } else {
    // Just a click, switch to tab
    if (!e.target.closest('.tab-close')) {
      switchToTab(globalDragState.draggedIndex);
    }
  }
  
  // Reset drag state
  globalDragState.isMouseDown = false;
  globalDragState.isDragging = false;
  globalDragState.draggedTab = null;
  globalDragState.draggedIndex = -1;
}

// Initialize tab system
function initializeTabSystem() {
  console.log('Initializing tab system...');
  
  // Add global mouse event listeners for tab dragging
  document.addEventListener('mousemove', handleGlobalMouseMove);
  document.addEventListener('mouseup', handleGlobalMouseUp);
  
  // Initialize tab controls
  initializeTabControls();
  
  // Initialize tab list drag & drop
  initializeTabListDragDrop();
  
  // Initialize empty state
  updateTabBar();
}

// Initialize tab list drag & drop
function initializeTabListDragDrop() {
  const tabList = document.querySelector('.tab-list');
  if (!tabList) {
    console.error('Tab list not found');
    return;
  }
  
  // Add global dragover and drop events to tab list
  tabList.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  });
  
  tabList.addEventListener('drop', (e) => {
    e.preventDefault();
    console.log('Global tab list drop event');
    
    // Find the tab element we dropped on
    const targetTab = e.target.closest('.tab');
    if (targetTab) {
      const draggedIndex = parseInt(e.dataTransfer.getData('text/plain'));
      const targetIndex = parseInt(targetTab.dataset.tabIndex);
      
      console.log('Global drop - Dragged:', draggedIndex, 'Target:', targetIndex);
      
      if (!isNaN(draggedIndex) && !isNaN(targetIndex) && draggedIndex !== targetIndex) {
        reorderTabs(draggedIndex, targetIndex);
      }
    }
    
    // Clean up drag styles
    document.querySelectorAll('.tab').forEach(el => {
      el.classList.remove('drag-over', 'dragging');
    });
  });
  
  // Prevent tab dragging from interfering with scroll
  tabList.addEventListener('wheel', (e) => {
    // Allow horizontal scrolling with mouse wheel
    if (e.deltaY !== 0) {
      e.preventDefault();
      tabList.scrollLeft += e.deltaY;
    }
  });
}

// Initialize tab control buttons
function initializeTabControls() {
  const scrollLeftBtn = document.querySelector('.tab-scroll-left');
  const scrollRightBtn = document.querySelector('.tab-scroll-right');
  const newTabBtn = document.querySelector('.new-tab-btn');
  
  if (scrollLeftBtn) {
    scrollLeftBtn.addEventListener('click', () => scrollTabs('left'));
  }
  
  if (scrollRightBtn) {
    scrollRightBtn.addEventListener('click', () => scrollTabs('right'));
  }
  
  if (newTabBtn) {
    newTabBtn.addEventListener('click', () => openNewTab());
  }
}

// Scroll tabs left or right
function scrollTabs(direction) {
  const tabList = document.querySelector('.tab-list');
  if (!tabList) return;
  
  const scrollAmount = 150;
  const currentScroll = tabList.scrollLeft;
  
  if (direction === 'left') {
    tabList.scrollLeft = Math.max(0, currentScroll - scrollAmount);
  } else {
    tabList.scrollLeft = currentScroll + scrollAmount;
  }
  
  // Update scroll button states
  updateScrollButtons();
}

// Update scroll button states
function updateScrollButtons() {
  const tabList = document.querySelector('.tab-list');
  const scrollLeftBtn = document.querySelector('.tab-scroll-left');
  const scrollRightBtn = document.querySelector('.tab-scroll-right');
  
  if (!tabList || !scrollLeftBtn || !scrollRightBtn) return;
  
  const canScrollLeft = tabList.scrollLeft > 0;
  const canScrollRight = tabList.scrollLeft < (tabList.scrollWidth - tabList.clientWidth);
  
  scrollLeftBtn.disabled = !canScrollLeft;
  scrollRightBtn.disabled = !canScrollRight;
}

// Open a new empty tab
function openNewTab() {
  // Create new tab object
  const newTab = {
    id: nextTabId++,
    title: 'New Note',
    path: null,
    content: '',
    hasUnsavedChanges: false,
    isModified: false
  };
  
  // Add to tabs array
  openTabs.push(newTab);
  activeTabIndex = openTabs.length - 1;
  
  // Update UI
  updateTabBar();
  switchToTab(activeTabIndex);
  
  // Save tab session
  saveTabSession();
  
  console.log('New tab opened:', newTab);
}

// Open note in new tab
function openNoteInTab(notePath, shouldSwitchToTab = true) {
  // Check if note is already open in a tab
  const existingTabIndex = openTabs.findIndex(tab => tab.path === notePath);
  
  if (existingTabIndex !== -1) {
    // Switch to existing tab
    if (shouldSwitchToTab) {
      activeTabIndex = existingTabIndex;
      updateTabBar();
      switchToTab(activeTabIndex);
    }
    return existingTabIndex;
  }
  
  // Get note title from path
  let noteTitle = path.basename(notePath);
  // Remove .html extension if present
  if (noteTitle.endsWith('.html')) {
    noteTitle = noteTitle.substring(0, noteTitle.length - 5);
  }
  // Remove .md extension if present
  if (noteTitle.endsWith('.md')) {
    noteTitle = noteTitle.substring(0, noteTitle.length - 3);
  }
  
  // Create new tab
  const newTab = {
    id: nextTabId++,
    title: noteTitle,
    path: notePath,
    content: '',
    hasUnsavedChanges: false,
    isModified: false
  };
  
  // Add to tabs array
  openTabs.push(newTab);
  const newTabIndex = openTabs.length - 1;
  
  if (shouldSwitchToTab) {
    activeTabIndex = newTabIndex;
  }
  
  // Update UI
  updateTabBar();
  
  if (shouldSwitchToTab) {
    switchToTab(activeTabIndex);
  }
  
  // Save tab session
  saveTabSession();
  
  console.log('Note opened in new tab:', newTab);
  return newTabIndex;
}

// Close tab by index
function closeTab(tabIndex) {
  if (tabIndex < 0 || tabIndex >= openTabs.length) {
    return;
  }
  
  const tab = openTabs[tabIndex];
  
  // Check for unsaved changes
  if (tab.hasUnsavedChanges) {
    const confirmed = confirm(`Tab "${tab.title}" has unsaved changes. Close anyway?`);
    if (!confirmed) {
      return;
    }
  }
  
  // Remove tab from array
  openTabs.splice(tabIndex, 1);
  
  // Adjust active tab index
  if (activeTabIndex === tabIndex) {
    // If closing active tab, switch to adjacent tab
    if (openTabs.length === 0) {
      activeTabIndex = -1;
      clearEditor();
    } else if (activeTabIndex >= openTabs.length) {
      activeTabIndex = openTabs.length - 1;
      switchToTab(activeTabIndex);
    } else {
      switchToTab(activeTabIndex);
    }
  } else if (activeTabIndex > tabIndex) {
    // Adjust index if closed tab was before active tab
    activeTabIndex--;
  }
  
  // Update UI
  updateTabBar();
  
  // Save tab session
  saveTabSession();
  
  console.log('Tab closed:', tab);
}

// Switch to tab by index
async function switchToTab(tabIndex) {
  if (tabIndex < 0 || tabIndex >= openTabs.length) {
    return;
  }
  
  // Save current tab content if switching from another tab
  if (activeTabIndex !== -1 && activeTabIndex !== tabIndex && editor) {
    const currentTab = openTabs[activeTabIndex];
    if (currentTab) {
      currentTab.content = editor.getContents();
      currentTab.hasUnsavedChanges = hasUnsavedChanges;
    }
  }
  
  activeTabIndex = tabIndex;
  const tab = openTabs[tabIndex];
  
  // Update UI first to show correct active state
  updateTabBar();
  
  // Load tab content
  if (tab.path) {
    // Load note file using async function
    await loadNoteFromTab(tab);
  } else {
    // New empty tab
    loadEmptyNote(tab.title);
  }
  
  // Update active note in explorer
  updateActiveNoteInExplorer(tab.path);
  
  // Save session to persist active tab change
  saveTabSession();
  
  console.log('Switched to tab:', tab);
}

// Load note from tab
async function loadNoteFromTab(tab) {
  try {
    if (tab.content && typeof tab.content === 'object') {
      // Use cached content (Delta format)
      editor.setContents(tab.content);
      
      // Update current note tracking
      currentNote = tab.title;
      currentNotePath = tab.path;
      hasUnsavedChanges = tab.hasUnsavedChanges;
    } else {
      // Load from file using original function to avoid recursion
      const success = await originalOpenNote(tab.path);
      if (success) {
        // Update tab with loaded content
        tab.content = editor.getContents();
      }
    }
    
    // Update note title
    const noteTitleEl = document.getElementById('note-title');
    if (noteTitleEl) {
      noteTitleEl.textContent = tab.title;
    }

    // Update active note in explorer
    updateActiveNoteInExplorer(tab.path);
    
    // Ensure tab bar is updated with correct active state
    updateTabBar();
    
  } catch (error) {
    console.error('Error loading note from tab:', error);
    showStatusMessage('Error loading note: ' + error.message, 'error');
  }
}

// Load empty note for new tab
function loadEmptyNote(title) {
  if (editor) {
    editor.setContents([{ insert: '\n' }]);
  }
  
  currentNote = title;
  currentNotePath = null;
  hasUnsavedChanges = false;
  
  // Update note title
  const noteTitleEl = document.getElementById('note-title');
  if (noteTitleEl) {
    noteTitleEl.textContent = title;
  }
  
  // Clear creation date
  const creationDateEl = document.getElementById('note-creation-date');
  if (creationDateEl) {
    creationDateEl.textContent = '';
  }
  
  // Clear active note in explorer since this is a new note
  updateActiveNoteInExplorer(null);
}

// Clear editor when no tabs are open
function clearEditor() {
  if (editor) {
    editor.setContents([{ insert: '\n' }]);
  }
  
  currentNote = null;
  currentNotePath = null;
  hasUnsavedChanges = false;
  
  // Clear UI
  const noteTitleEl = document.getElementById('note-title');
  if (noteTitleEl) {
    noteTitleEl.textContent = '';
  }
  
  const creationDateEl = document.getElementById('note-creation-date');
  if (creationDateEl) {
    creationDateEl.textContent = '';
  }
}

// Update tab bar UI
function updateTabBar() {
  const tabList = document.querySelector('.tab-list');
  if (!tabList) return;
  
  // Clear existing tabs
  tabList.innerHTML = '';
  
  // Create tab elements
  openTabs.forEach((tab, index) => {
    const tabElement = createTabElement(tab, index);
    tabList.appendChild(tabElement);
  });
  
  // Force update active states
  setTimeout(() => {
    const allTabs = tabList.querySelectorAll('.tab');
    allTabs.forEach((tabEl, index) => {
      const isActive = index === activeTabIndex;
      if (isActive) {
        tabEl.classList.add('active');
      } else {
        tabEl.classList.remove('active');
      }
    });
  }, 0);
  
  // Update scroll buttons
  setTimeout(() => {
    updateScrollButtons();
  }, 0);
}

// Create tab element
function createTabElement(tab, index) {
  const tabElement = document.createElement('div');
  tabElement.className = `tab ${index === activeTabIndex ? 'active' : ''}`;
  tabElement.dataset.tabIndex = index;
  // Removed draggable="true" - using mouse events instead
  
  // Tab icon
  const icon = document.createElement('div');
  icon.className = 'tab-icon';
  icon.innerHTML = tab.path ? 
    '<svg viewBox="0 0 24 24"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/></svg>' :
    '<svg viewBox="0 0 24 24"><path d="M19,3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3M19,19H5V5H19V19Z"/></svg>';
  
  // Tab title
  const title = document.createElement('div');
  title.className = 'tab-title';
  title.textContent = tab.title + (tab.hasUnsavedChanges ? ' •' : '');
  title.title = tab.path || 'New Note';
  
  // Tab close button
  const closeBtn = document.createElement('button');
  closeBtn.className = 'tab-close';
  closeBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/></svg>';
  closeBtn.title = 'Close tab';
  
  // Event listeners
  tabElement.addEventListener('click', (e) => {
    if (!e.target.closest('.tab-close')) {
      switchToTab(index);
    }
  });
  
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeTab(index);
  });
  
  // Middle mouse button to close
  tabElement.addEventListener('mousedown', (e) => {
    if (e.button === 1) { // Middle mouse button
      e.preventDefault();
      closeTab(index);
    }
  });
  
  // Tab reordering with mouse events (global handlers manage the dragging)
  tabElement.addEventListener('mousedown', (e) => {
    if (e.button === 1) { // Middle mouse button to close
      e.preventDefault();
      closeTab(index);
      return;
    }
    
    if (e.button === 0 && !e.target.closest('.tab-close')) { // Left mouse button
      globalDragState.isMouseDown = true;
      globalDragState.isDragging = false;
      globalDragState.dragStartX = e.clientX;
      globalDragState.dragStartY = e.clientY;
      globalDragState.draggedTab = tabElement;
      globalDragState.draggedIndex = index;
      
      console.log('Mouse down on tab:', index, 'at position:', e.clientX, e.clientY);
      
      // Prevent text selection during drag
      e.preventDefault();
      e.stopPropagation();
    }
  });
  
  // Remove the old local handlers - we're using global ones now
  
  // Assemble tab
  tabElement.appendChild(icon);
  tabElement.appendChild(title);
  tabElement.appendChild(closeBtn);
  
  return tabElement;
}

// Update active note in explorer
function updateActiveNoteInExplorer(notePath) {
  // Clear all active classes in explorer
  document.querySelectorAll('.tree-item.active, .tree-node.active').forEach(el => {
    el.classList.remove('active');
  });
  
  // If notePath is provided, set the corresponding note as active in explorer
  if (notePath) {
    const noteElement = document.querySelector(`.tree-item[data-path="${notePath}"]`);
    if (noteElement) {
      noteElement.classList.add('active');
      console.log('Updated active note in explorer:', notePath);
    } else {
      console.log('Note not found in explorer:', notePath);
    }
  }
}

// Reorder tabs by moving tab from one index to another
function reorderTabs(fromIndex, toIndex) {
  console.log('reorderTabs called with:', fromIndex, toIndex);
  
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || 
      fromIndex >= openTabs.length || toIndex >= openTabs.length) {
    console.log('Invalid reorder parameters, skipping');
    return;
  }
  
  console.log(`Reordering tab from ${fromIndex} to ${toIndex}`);
  console.log('Before reorder - tabs:', openTabs.map(t => t.title));
  console.log('Before reorder - activeTabIndex:', activeTabIndex);
  
  // Remove tab from old position
  const [movedTab] = openTabs.splice(fromIndex, 1);
  console.log('Moved tab:', movedTab.title);
  
  // Insert tab at new position
  openTabs.splice(toIndex, 0, movedTab);
  console.log('After reorder - tabs:', openTabs.map(t => t.title));
  
  // Update active tab index
  if (activeTabIndex === fromIndex) {
    // The active tab was moved
    activeTabIndex = toIndex;
  } else if (activeTabIndex > fromIndex && activeTabIndex <= toIndex) {
    // Active tab was shifted left
    activeTabIndex--;
  } else if (activeTabIndex < fromIndex && activeTabIndex >= toIndex) {
    // Active tab was shifted right
    activeTabIndex++;
  }
  
  console.log('New activeTabIndex:', activeTabIndex);
  
  // Update UI
  updateTabBar();
  
  // Save tab session
  saveTabSession();
  
  console.log('Tab reordering completed. New active index:', activeTabIndex);
}

// Override existing openNote function to work with tabs
originalOpenNote = openNote;
openNote = async function(notePath) {
  // If tabs are enabled and we have tabs open, open in current tab or new tab
  if (openTabs.length > 0) {
    // Check if this is a switch to existing tab
    const existingTabIndex = openTabs.findIndex(tab => tab.path === notePath);
    
    if (existingTabIndex !== -1) {
      // Switch to existing tab
      activeTabIndex = existingTabIndex;
      updateTabBar();
      switchToTab(activeTabIndex);
      return true;
    }
    
    // If we have an active tab and it's empty, use it
    if (activeTabIndex !== -1) {
      const activeTab = openTabs[activeTabIndex];
      if (!activeTab.path && !activeTab.hasUnsavedChanges) {
        // Use current empty tab
        activeTab.path = notePath;
        activeTab.title = path.basename(notePath, '.md');
        const success = await originalOpenNote(notePath);
        if (success) {
          activeTab.content = editor.getContents();
          updateTabBar();
          // Save tab session after opening
          saveTabSession();
        }
        return success;
      }
    }
    
    // Open in new tab
    const tabIndex = openNoteInTab(notePath, true);
    const success = await originalOpenNote(notePath);
    if (success) {
      // Save tab session after opening
      saveTabSession();
    }
    return success;
  } else {
    // No tabs open, open normally and create first tab
    const success = await originalOpenNote(notePath);
    if (success) {
      openNoteInTab(notePath, false);
      // Save tab session after opening
      saveTabSession();
    }
    return success;
  }
};

// Save tab session to settings
async function saveTabSession() {
  try {
    if (!settings) return;
    
    // Create tab session data
    const tabSession = {
      openTabs: openTabs.map(tab => ({
        id: tab.id,
        title: tab.title,
        path: tab.path,
        hasUnsavedChanges: tab.hasUnsavedChanges
      })),
      activeTabIndex: activeTabIndex,
      nextTabId: nextTabId
    };
    
    // Save to settings
    settings.tabSession = tabSession;
    await ipcRenderer.invoke('save-settings', settings);
    
    console.log('Tab session saved - activeTabIndex:', activeTabIndex, 'tab:', openTabs[activeTabIndex]?.title);
  } catch (error) {
    console.error('Error saving tab session:', error);
  }
}

// Load tab session from settings
async function loadTabSession() {
  try {
    if (!settings || !settings.tabSession) {
      console.log('No tab session found');
      return;
    }
    
    const tabSession = settings.tabSession;
    console.log('Loading tab session with', tabSession.openTabs.length, 'tabs, active:', tabSession.activeTabIndex);
    
    // Restore tab data
    openTabs = tabSession.openTabs.map(tab => ({
      ...tab,
      content: '',
      isModified: false
    }));
    activeTabIndex = tabSession.activeTabIndex;
    nextTabId = tabSession.nextTabId || (Math.max(...openTabs.map(t => t.id)) + 1);
    
    // Validate activeTabIndex
    if (activeTabIndex >= openTabs.length) {
      console.warn('Active tab index out of bounds, resetting to 0');
      activeTabIndex = 0;
    }
    
    // Switch to active tab first
    if (activeTabIndex >= 0 && activeTabIndex < openTabs.length) {
      await switchToTab(activeTabIndex);
    } else if (openTabs.length > 0) {
      // Fallback to first tab
      activeTabIndex = 0;
      await switchToTab(activeTabIndex);
    }
    
    // Update UI after switching to ensure correct active state
    updateTabBar();
    
    console.log('Tab session restored successfully');
  } catch (error) {
    console.error('Error loading tab session:', error);
  }
}