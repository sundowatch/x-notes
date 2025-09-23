// Tree Management Module
// Contains functions for managing the notes tree

export async function loadNotes() {
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

    // Restore the expanded state of folders
    restoreExpandedState(expandedFolders);

    // Apply saved colors to folders and notes
    applySavedColors();

  } catch (error) {
    console.error('Error loading notes:', error);
  }
}

function applySavedColors() {
  if (!settings) return;

  // Apply folder colors
  if (settings.folderColors) {
    Object.entries(settings.folderColors).forEach(([path, color]) => {
      const folderIcon = document.querySelector(`.tree-node[data-path="${path}"] .folder-icon`);
      if (folderIcon) {
        folderIcon.classList.add(`color-${color}`);
      }
    });
  }

  // Apply note colors
  if (settings.noteColors) {
    Object.entries(settings.noteColors).forEach(([path, color]) => {
      const fileIcon = document.querySelector(`.tree-item[data-path="${path}"] .file-icon`);
      if (fileIcon) {
        fileIcon.classList.add(`color-${color}`);
      }
    });
  }
}

export function createTreeElement(node) {
  // ...existing code for createTreeElement...
}
