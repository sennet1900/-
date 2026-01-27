
import { Book, Annotation, Persona, EngineConfig } from '../types';

interface BackupData {
  version: number;
  timestamp: number;
  library: Book[];
  annotations: Annotation[];
  activePersonas: Persona[]; // Changed from customPersonas to capture ALL personas including evolved memories
  engineConfig: Partial<EngineConfig>;
}

const BACKUP_VERSION = 2; // Incremented version
const GIST_FILENAME = "soulreader_backup.json";
const GIST_DESCRIPTION = "SoulReader App Data Backup (Full)";

// --- Local Backup Utilities ---

export const createBackupData = (): BackupData => {
  // 1. Library: Includes imported books AND Writing Studio creations (with writingMetadata)
  const library = JSON.parse(localStorage.getItem('sr_library') || '[]');
  
  // 2. Annotations: Includes user notes, AI replies, and chat history
  const annotations = JSON.parse(localStorage.getItem('sr_annotations') || '[]');
  
  // 3. Personas: Use 'sr_active_personas' to capture current state of ALL personas
  // This ensures we save 'longTermMemory', avatar changes, and system instruction tweaks for default roles too.
  const activePersonas = JSON.parse(localStorage.getItem('sr_active_personas') || '[]');
  
  // Fallback: If active_personas is empty (fresh load), try custom + default manually (rare edge case)
  const finalPersonas = activePersonas.length > 0 ? activePersonas : JSON.parse(localStorage.getItem('sr_custom_personas') || '[]');

  const engineConfig = JSON.parse(localStorage.getItem('sr_engine_config') || '{}');

  return {
    version: BACKUP_VERSION,
    timestamp: Date.now(),
    library,
    annotations,
    activePersonas: finalPersonas,
    engineConfig
  };
};

export const downloadBackupFile = () => {
  const data = createBackupData();
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  // Add timestamp to filename
  const dateStr = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  link.download = `soulreader_full_backup_${dateStr}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// Helper function to merge lists, keeping local items if IDs conflict
const mergeLists = <T extends { id: string }>(localList: T[], backupList: T[]): T[] => {
    const map = new Map<string, T>();
    
    // 1. Load local items first (Precedence: Local)
    localList.forEach(item => {
        if (item && item.id) map.set(item.id, item);
    });

    // 2. Add backup items ONLY if they don't exist locally
    backupList.forEach(item => {
        if (item && item.id && !map.has(item.id)) {
            map.set(item.id, item);
        }
    });

    return Array.from(map.values());
};

export const restoreFromJSON = async (jsonString: string): Promise<boolean> => {
  try {
    const data: any = JSON.parse(jsonString);
    
    // Basic Validation
    if (!data.library || !Array.isArray(data.library)) throw new Error("无效的书籍数据 (Invalid Library Data)");
    if (!data.annotations || !Array.isArray(data.annotations)) throw new Error("无效的批注数据 (Invalid Annotations Data)");

    // --- Restore Library (Books & Writing Studio) ---
    // MERGE LOGIC: Keep local books, add new ones from backup
    const currentLibrary: Book[] = JSON.parse(localStorage.getItem('sr_library') || '[]');
    const backupLibrary: Book[] = data.library;
    const mergedLibrary = mergeLists(currentLibrary, backupLibrary);
    localStorage.setItem('sr_library', JSON.stringify(mergedLibrary));

    // --- Restore Annotations ---
    // MERGE LOGIC: Keep local annotations, add new ones from backup
    const currentAnnotations: Annotation[] = JSON.parse(localStorage.getItem('sr_annotations') || '[]');
    const backupAnnotations: Annotation[] = data.annotations;
    const mergedAnnotations = mergeLists(currentAnnotations, backupAnnotations);
    localStorage.setItem('sr_annotations', JSON.stringify(mergedAnnotations));

    // --- Restore Personas ---
    // Handle migration from V1 backups (which used 'customPersonas') to V2 (which uses 'activePersonas')
    let personasToRestore: Persona[] = [];
    if (data.activePersonas && Array.isArray(data.activePersonas)) {
        personasToRestore = data.activePersonas;
    } else if (data.customPersonas && Array.isArray(data.customPersonas)) {
        personasToRestore = data.customPersonas;
    }
    
    if (personasToRestore.length > 0) {
        const currentPersonas: Persona[] = JSON.parse(localStorage.getItem('sr_active_personas') || '[]');
        const mergedPersonas = mergeLists(currentPersonas, personasToRestore);
        localStorage.setItem('sr_active_personas', JSON.stringify(mergedPersonas));
    }

    // --- Restore Config ---
    // MERGE LOGIC: Keep local config dominant, only add missing keys from backup
    const currentConfig = JSON.parse(localStorage.getItem('sr_engine_config') || '{}');
    const newConfig = { ...data.engineConfig, ...currentConfig }; // Local (currentConfig) overwrites backup keys
    localStorage.setItem('sr_engine_config', JSON.stringify(newConfig));

    return true;
  } catch (e) {
    console.error("Restore Failed", e);
    throw e;
  }
};

// --- GitHub Cloud Sync Utilities ---

export const uploadToGitHubGist = async (token: string, existingGistId?: string): Promise<{ gistId: string, url: string }> => {
  const backupData = createBackupData();
  const content = JSON.stringify(backupData, null, 2);

  const headers = {
    'Authorization': `token ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };

  const body = {
    description: GIST_DESCRIPTION,
    public: false, // Create secret gist by default for privacy
    files: {
      [GIST_FILENAME]: {
        content: content
      }
    }
  };

  let url = 'https://api.github.com/gists';
  let method = 'POST';

  // If we have an ID, try to update it first
  if (existingGistId) {
    url = `https://api.github.com/gists/${existingGistId}`;
    method = 'PATCH';
  }

  const response = await fetch(url, {
    method,
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    if (response.status === 404 && existingGistId) {
       // ID invalid or deleted, retry as new
       return uploadToGitHubGist(token, undefined);
    }
    const err = await response.json();
    throw new Error(err.message || "GitHub Upload Failed");
  }

  const result = await response.json();
  return { gistId: result.id, url: result.html_url };
};

export const downloadFromGitHubGist = async (token: string, gistId: string): Promise<boolean> => {
  const headers = {
    'Authorization': `token ${token}`,
    'Accept': 'application/vnd.github.v3+json',
  };

  const response = await fetch(`https://api.github.com/gists/${gistId}`, { headers });
  
  if (!response.ok) {
    throw new Error("Failed to fetch Gist. Check ID and Token.");
  }

  const result = await response.json();
  const file = result.files[GIST_FILENAME];

  if (!file || !file.content) {
    throw new Error("Backup file not found in this Gist.");
  }

  if (file.truncated) {
    // If truncated, fetch raw url
    const rawRes = await fetch(file.raw_url);
    const rawContent = await rawRes.text();
    return restoreFromJSON(rawContent);
  } else {
    return restoreFromJSON(file.content);
  }
};
