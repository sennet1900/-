
import { Book, Annotation, Persona, EngineConfig } from '../types';

interface BackupData {
  version: number;
  timestamp: number;
  library: Book[];
  annotations: Annotation[];
  customPersonas: Persona[];
  engineConfig: Partial<EngineConfig>;
}

const BACKUP_VERSION = 1;
const GIST_FILENAME = "soulreader_backup.json";
const GIST_DESCRIPTION = "SoulReader App Data Backup";

// --- Local Backup Utilities ---

export const createBackupData = (): BackupData => {
  const library = JSON.parse(localStorage.getItem('sr_library') || '[]');
  const annotations = JSON.parse(localStorage.getItem('sr_annotations') || '[]');
  const customPersonas = JSON.parse(localStorage.getItem('sr_custom_personas') || '[]');
  const engineConfig = JSON.parse(localStorage.getItem('sr_engine_config') || '{}');

  return {
    version: BACKUP_VERSION,
    timestamp: Date.now(),
    library,
    annotations,
    customPersonas,
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
  link.download = `soulreader_backup_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const restoreFromJSON = async (jsonString: string): Promise<boolean> => {
  try {
    const data: BackupData = JSON.parse(jsonString);
    
    // Basic Validation
    if (!data.library || !Array.isArray(data.library)) throw new Error("Invalid Library Data");
    if (!data.annotations || !Array.isArray(data.annotations)) throw new Error("Invalid Annotations Data");

    // Restore to LocalStorage
    localStorage.setItem('sr_library', JSON.stringify(data.library));
    localStorage.setItem('sr_annotations', JSON.stringify(data.annotations));
    localStorage.setItem('sr_custom_personas', JSON.stringify(data.customPersonas || []));
    
    // Merge config but keep existing sensitive keys if new one is empty (optional safety)
    const currentConfig = JSON.parse(localStorage.getItem('sr_engine_config') || '{}');
    const newConfig = { ...currentConfig, ...data.engineConfig };
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
