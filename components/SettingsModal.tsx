
import React, { useState, useRef } from 'react';
import { EngineConfig } from '../types';
import { downloadBackupFile, restoreFromJSON, uploadToGitHubGist, downloadFromGitHubGist } from '../services/backupService';

interface SettingsModalProps {
  config: EngineConfig;
  onSave: (config: EngineConfig) => void;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ config, onSave, onClose }) => {
  const [formData, setFormData] = useState<EngineConfig>({
    ...config,
    provider: config.provider || 'gemini',
    githubToken: config.githubToken || '',
    backupGistId: config.backupGistId || '',
    autoMemoryThreshold: config.autoMemoryThreshold || 100 // Default 100
  });
  
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [statusMsg, setStatusMsg] = useState<{ type: 'info' | 'error' | 'success', text: string } | null>(null);
  const [syncStatus, setSyncStatus] = useState<{ type: 'info' | 'error' | 'success', text: string } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const fontInputRef = useRef<HTMLInputElement>(null);
  const noteFontInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  const handleProviderChange = (provider: 'gemini' | 'openai') => {
    let defaultUrl = '';
    if (provider === 'gemini') defaultUrl = 'https://generativelanguage.googleapis.com';
    else defaultUrl = 'https://api.siliconflow.cn/v1';

    setFormData(prev => ({ ...prev, provider, baseUrl: defaultUrl, model: '' }));
    setAvailableModels([]);
    setStatusMsg(null);
  };

  const handleFetchModels = async () => {
    const trimmedApiKey = formData.apiKey.trim();
    const trimmedBaseUrl = formData.baseUrl.trim();

    if (!trimmedApiKey || !trimmedBaseUrl) {
      setStatusMsg({ type: 'error', text: 'Endpoint and API Key are required.' });
      return;
    }

    setIsFetchingModels(true);
    setStatusMsg({ type: 'info', text: 'Connecting to custom endpoint...' });
    
    try {
      let url = trimmedBaseUrl;
      if (url.endsWith('/')) url = url.slice(0, -1);
      
      let targetUrl = '';
      let headers: any = {};

      if (formData.provider === 'gemini') {
        targetUrl = `${url}/v1beta/models?key=${trimmedApiKey}`;
      } else {
        if (!url.endsWith('/v1')) url += '/v1';
        targetUrl = `${url}/models`;
        headers = { 'Authorization': `Bearer ${trimmedApiKey}` };
      }
      
      const res = await fetch(targetUrl, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      const data = await res.json();
      let models: string[] = [];

      if (formData.provider === 'gemini') {
        if (data.models && Array.isArray(data.models)) {
          models = data.models.map((m: any) => m.name.replace('models/', ''));
        }
      } else {
        if (data.data && Array.isArray(data.data)) {
          models = data.data.map((m: any) => m.id);
        }
      }

      setAvailableModels(models);
      setStatusMsg({ type: 'success', text: `Found ${models.length} models.` });
      setFormData(prev => ({ ...prev, apiKey: trimmedApiKey, baseUrl: trimmedBaseUrl }));
      
      if (!models.includes(formData.model) && models.length > 0) {
        setFormData(prev => ({ ...prev, model: models[0] }));
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: `Connection Failed: ${err.message}` });
      if (formData.provider === 'gemini') {
        setAvailableModels(['gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-1.5-flash']);
      } else {
        setAvailableModels(['deepseek-ai/DeepSeek-V3', 'deepseek-ai/DeepSeek-R1', 'Qwen/Qwen2.5-72B-Instruct']);
      }
    } finally {
      setIsFetchingModels(false);
    }
  };

  const handleFontUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const fontName = file.name.split('.')[0];
      setFormData(prev => ({
        ...prev,
        customFontName: fontName,
        customFontData: reader.result as string
      }));
      setStatusMsg({ type: 'success', text: `Book Font "${fontName}" uploaded.` });
    };
    reader.readAsDataURL(file);
  };

  const handleNoteFontUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const fontName = file.name.split('.')[0];
      setFormData(prev => ({
        ...prev,
        customNoteFontName: fontName,
        customNoteFontData: reader.result as string
      }));
      setStatusMsg({ type: 'success', text: `Annotation Font "${fontName}" uploaded.` });
    };
    reader.readAsDataURL(file);
  };

  const handleBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setFormData(prev => ({
        ...prev,
        customBgImage: reader.result as string,
        theme: 'custom'
      }));
      setStatusMsg({ type: 'success', text: 'Atmosphere image uploaded.' });
    };
    reader.readAsDataURL(file);
  };

  const handleLocalRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (event) => {
       try {
         const content = event.target?.result as string;
         await restoreFromJSON(content);
         setSyncStatus({ type: 'success', text: 'Restore successful! Reloading...' });
         setTimeout(() => window.location.reload(), 1500);
       } catch (err) {
         setSyncStatus({ type: 'error', text: 'Invalid backup file.' });
       }
    };
    reader.readAsText(file);
  };

  const handleGitHubUpload = async () => {
    if (!formData.githubToken) {
      setSyncStatus({ type: 'error', text: 'GitHub Token required.' });
      return;
    }
    setIsSyncing(true);
    setSyncStatus({ type: 'info', text: 'Uploading to GitHub...' });
    try {
      const result = await uploadToGitHubGist(formData.githubToken, formData.backupGistId);
      setFormData(prev => ({ ...prev, backupGistId: result.gistId }));
      setSyncStatus({ type: 'success', text: 'Uploaded successfully!' });
    } catch (err: any) {
      setSyncStatus({ type: 'error', text: `Upload failed: ${err.message}` });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleGitHubDownload = async () => {
    if (!formData.githubToken || !formData.backupGistId) {
       setSyncStatus({ type: 'error', text: 'Token and Gist ID required.' });
       return;
    }
    setIsSyncing(true);
    setSyncStatus({ type: 'info', text: 'Downloading from Cloud...' });
    try {
      await downloadFromGitHubGist(formData.githubToken, formData.backupGistId);
      setSyncStatus({ type: 'success', text: 'Cloud restore successful! Reloading...' });
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: any) {
      setSyncStatus({ type: 'error', text: `Download failed: ${err.message}` });
    } finally {
       setIsSyncing(false);
    }
  };

  const handleSave = () => {
    const cleanedConfig = {
      ...formData,
      apiKey: formData.apiKey.trim(),
      baseUrl: formData.baseUrl.trim(),
      githubToken: formData.githubToken?.trim(),
      backupGistId: formData.backupGistId?.trim()
    };
    onSave(cleanedConfig);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-md">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh] overflow-hidden border border-stone-100">
        <div className="p-6 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
          <div>
            <h2 className="text-xl font-bold text-stone-900">Engine & Soul Settings</h2>
            <p className="text-xs text-stone-500 italic">Configure your connection and aesthetics.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-stone-200 rounded-full text-stone-400">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-8 custom-scrollbar">
          
          {/* API Connection */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
               <i className="fa-solid fa-plug text-amber-600 text-xs"></i>
               <label className="text-xs font-semibold text-stone-400 uppercase tracking-wider">AI Provider</label>
            </div>
            
            <div className="flex p-1 bg-stone-100 rounded-xl mb-4">
               <button 
                 onClick={() => handleProviderChange('gemini')}
                 className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${formData.provider === 'gemini' ? 'bg-white shadow text-amber-600' : 'text-stone-400'}`}
               >
                 Google Gemini
               </button>
               <button 
                 onClick={() => handleProviderChange('openai')}
                 className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${formData.provider === 'openai' ? 'bg-white shadow text-amber-600' : 'text-stone-400'}`}
               >
                 OpenAI / SiliconFlow
               </button>
            </div>

            <div className="space-y-4">
              <input 
                type="text" value={formData.baseUrl}
                onChange={(e) => setFormData({...formData, baseUrl: e.target.value})}
                placeholder={formData.provider === 'gemini' ? "https://generativelanguage.googleapis.com" : "https://api.siliconflow.cn"}
                className="w-full bg-stone-50 border border-stone-200 rounded-xl py-3 px-4 text-xs font-mono"
              />
              <input 
                type="password" value={formData.apiKey}
                onChange={(e) => setFormData({...formData, apiKey: e.target.value})}
                placeholder={formData.provider === 'gemini' ? "API Key (AIza...)" : "API Key (sk-...)"}
                className="w-full bg-stone-50 border border-stone-200 rounded-xl py-3 px-4 text-xs font-mono"
              />
              <button 
                onClick={handleFetchModels} disabled={isFetchingModels || !formData.apiKey}
                className="w-full py-3 bg-white border-2 border-dashed border-stone-200 text-stone-500 hover:border-amber-500 hover:text-amber-600 rounded-xl text-xs font-bold"
              >
                {isFetchingModels ? <i className="fa-solid fa-spinner animate-spin"></i> : 'Connect & Fetch Models'}
              </button>
              {statusMsg && (
                <div className={`text-[10px] px-4 py-2 rounded-xl border ${statusMsg.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                  {statusMsg.text}
                </div>
              )}
            </div>
          </section>

          {/* Backup & Sync */}
          <section className="space-y-4">
             <div className="flex items-center gap-2">
                 <i className="fa-solid fa-cloud-arrow-up text-amber-600 text-xs"></i>
                 <label className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Backup & Cloud Sync</label>
            </div>
            
            <div className="p-4 bg-stone-50 rounded-2xl border border-stone-100 space-y-4">
              {/* Local */}
              <div className="grid grid-cols-2 gap-3">
                 <button 
                   onClick={downloadBackupFile}
                   className="py-2 bg-white border border-stone-200 rounded-xl text-[10px] font-bold text-stone-600 hover:bg-amber-50 hover:border-amber-200 hover:text-amber-600 transition-all flex items-center justify-center gap-2"
                 >
                   <i className="fa-solid fa-file-export"></i> Export JSON
                 </button>
                 <button 
                   onClick={() => backupInputRef.current?.click()}
                   className="py-2 bg-white border border-stone-200 rounded-xl text-[10px] font-bold text-stone-600 hover:bg-amber-50 hover:border-amber-200 hover:text-amber-600 transition-all flex items-center justify-center gap-2"
                 >
                   <i className="fa-solid fa-file-import"></i> Import JSON
                 </button>
                 <input type="file" ref={backupInputRef} onChange={handleLocalRestore} accept=".json" className="hidden" />
              </div>

              {/* GitHub */}
              <div className="pt-2 border-t border-stone-200/50 space-y-3">
                <div className="flex items-center justify-between text-[10px] font-bold text-stone-400 uppercase">
                  <span>GitHub Cloud (Gist)</span>
                  <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer" className="text-amber-600 hover:underline">Get Token</a>
                </div>
                <input 
                  type="password" 
                  value={formData.githubToken}
                  onChange={(e) => setFormData({...formData, githubToken: e.target.value})}
                  placeholder="GitHub Personal Access Token"
                  className="w-full bg-white border border-stone-200 rounded-xl py-2 px-3 text-[10px] font-mono"
                />
                <input 
                   type="text" 
                   value={formData.backupGistId}
                   onChange={(e) => setFormData({...formData, backupGistId: e.target.value})}
                   placeholder="Gist ID (Auto-filled after upload)"
                   className="w-full bg-white border border-stone-200 rounded-xl py-2 px-3 text-[10px] font-mono text-stone-500"
                 />
                 <div className="grid grid-cols-2 gap-3">
                   <button 
                     onClick={handleGitHubUpload}
                     disabled={isSyncing || !formData.githubToken}
                     className="py-2 bg-stone-800 text-white rounded-xl text-[10px] font-bold hover:bg-stone-900 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                   >
                     {isSyncing ? <i className="fa-solid fa-spinner animate-spin"></i> : <i className="fa-solid fa-cloud-arrow-up"></i>}
                     Upload to Cloud
                   </button>
                   <button 
                     onClick={handleGitHubDownload}
                     disabled={isSyncing || !formData.githubToken || !formData.backupGistId}
                     className="py-2 bg-white border border-stone-200 text-stone-600 rounded-xl text-[10px] font-bold hover:bg-stone-50 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                   >
                     {isSyncing ? <i className="fa-solid fa-spinner animate-spin"></i> : <i className="fa-solid fa-cloud-arrow-down"></i>}
                     Download
                   </button>
                 </div>
                 {syncStatus && (
                    <div className={`text-[10px] px-3 py-1.5 rounded-lg border text-center ${syncStatus.type === 'error' ? 'bg-red-50 text-red-600' : syncStatus.type === 'success' ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
                      {syncStatus.text}
                    </div>
                  )}
              </div>
            </div>
          </section>

          {/* Soul Behavior */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
                 <i className="fa-solid fa-brain text-amber-600 text-xs"></i>
                 <label className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Soul Behavior</label>
            </div>
            <div className="p-4 bg-stone-50 rounded-2xl space-y-5 border border-stone-100">
              
              {/* Memory Config (NEW) */}
              <div className="space-y-3 pb-3 border-b border-stone-200/50">
                 <div className="flex items-center justify-between">
                   <div>
                     <div className="text-sm font-bold text-stone-800">Auto-Memory (长期记忆)</div>
                     <div className="text-[10px] text-stone-500">Auto-summarize annotations into memory</div>
                   </div>
                   <div className="text-amber-600 font-bold text-xs bg-amber-50 px-2 py-1 rounded">
                      {formData.autoMemoryThreshold > 0 ? `Every ${formData.autoMemoryThreshold}` : 'Disabled'}
                   </div>
                 </div>
                 <div className="space-y-2">
                   <div className="flex justify-between text-[10px] text-stone-400 uppercase">
                     <span>Annotations Threshold</span>
                     <span>{formData.autoMemoryThreshold}</span>
                   </div>
                   <input 
                      type="range" min="0" max="200" step="10"
                      value={formData.autoMemoryThreshold}
                      onChange={(e) => setFormData({...formData, autoMemoryThreshold: parseInt(e.target.value)})}
                      className="w-full accent-amber-500 h-1.5 bg-stone-200 rounded-lg appearance-none cursor-pointer"
                   />
                   <div className="flex justify-between text-[9px] text-stone-300">
                      <span>Off (0)</span>
                      <span>200</span>
                   </div>
                 </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold text-stone-800">Autonomous Reading</div>
                    <div className="text-[10px] text-stone-500">Allow partner to read spontaneously</div>
                  </div>
                  <button 
                    onClick={() => setFormData({...formData, autonomousReading: !formData.autonomousReading})}
                    className={`w-10 h-6 rounded-full transition-colors relative ${formData.autonomousReading ? 'bg-amber-500' : 'bg-stone-300'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${formData.autonomousReading ? 'left-5' : 'left-1'}`} />
                  </button>
                </div>
                {formData.autonomousReading && (
                  <div className="pt-2 border-t border-stone-200/50 animate-fadeIn">
                     <div className="flex justify-between text-[10px] font-bold text-stone-400 uppercase mb-2">
                       <span>Annotations per Page</span>
                       <span className="text-amber-600">{formData.autoAnnotationCount || 2}</span>
                     </div>
                     <input 
                       type="range" min="1" max="5" step="1"
                       value={formData.autoAnnotationCount || 2}
                       onChange={(e) => setFormData({...formData, autoAnnotationCount: parseInt(e.target.value)})}
                       className="w-full accent-amber-500 h-1.5 bg-stone-200 rounded-lg appearance-none cursor-pointer"
                     />
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Model Selection */}
          <section className="space-y-4">
            <div className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Model Selection</div>
            {availableModels.length > 0 ? (
               <div className="grid grid-cols-2 gap-2">
                 {availableModels.map(m => (
                   <button 
                    key={m} onClick={() => setFormData({...formData, model: m})}
                    className={`p-2 rounded-xl border text-left text-[10px] truncate ${formData.model === m ? 'border-amber-500 bg-amber-50' : 'border-stone-100 bg-white'}`}
                   >
                     {m}
                   </button>
                 ))}
               </div>
            ) : (
              <div className="text-[10px] text-stone-400 italic">
                {formData.model ? `Current: ${formData.model}` : "Fetch models to see options..."}
              </div>
            )}
          </section>

          {/* Custom Aesthetics */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
                 <i className="fa-solid fa-wand-magic-sparkles text-amber-600 text-xs"></i>
                 <label className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Atmosphere & Typography</label>
            </div>
            
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-stone-400 uppercase">氛围背景图 (Atmosphere)</label>
              <div 
                onClick={() => bgInputRef.current?.click()}
                className="h-20 rounded-2xl border-2 border-dashed border-stone-200 bg-stone-50 flex flex-col items-center justify-center cursor-pointer hover:border-amber-500 transition-all overflow-hidden"
              >
                {formData.customBgImage ? (
                  <img src={formData.customBgImage} className="w-full h-full object-cover opacity-60" />
                ) : (
                  <><i className="fa-solid fa-image text-stone-300 mb-1"></i><span className="text-[9px] text-stone-400">导入背景图片</span></>
                )}
              </div>
              <input type="file" ref={bgInputRef} onChange={handleBgUpload} accept="image/*" className="hidden" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-stone-400 uppercase">正文字体 (Book)</label>
                <div 
                  onClick={() => fontInputRef.current?.click()}
                  className="h-24 rounded-2xl border-2 border-dashed border-stone-200 bg-stone-50 flex flex-col items-center justify-center cursor-pointer hover:border-amber-500 transition-all text-center px-2"
                >
                  <i className="fa-solid fa-book-open text-stone-300 mb-1"></i>
                  <span className="text-[9px] text-stone-400">{formData.customFontName || '点击导入 .ttf'}</span>
                </div>
                <input type="file" ref={fontInputRef} onChange={handleFontUpload} accept=".ttf,.otf,.woff,.woff2" className="hidden" />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-stone-400 uppercase">批注字体 (Annotation)</label>
                <div 
                  onClick={() => noteFontInputRef.current?.click()}
                  className="h-24 rounded-2xl border-2 border-dashed border-stone-200 bg-stone-50 flex flex-col items-center justify-center cursor-pointer hover:border-amber-500 transition-all text-center px-2"
                >
                  <i className="fa-solid fa-pen-fancy text-stone-300 mb-1"></i>
                  <span className="text-[9px] text-stone-400">{formData.customNoteFontName || '点击导入 .ttf'}</span>
                </div>
                <input type="file" ref={noteFontInputRef} onChange={handleNoteFontUpload} accept=".ttf,.otf,.woff,.woff2" className="hidden" />
              </div>
            </div>
          </section>
        </div>

        <div className="p-6 bg-stone-50 border-t border-stone-100 flex gap-4">
          <button onClick={onClose} className="flex-1 py-3 text-stone-500 font-bold text-xs">Cancel</button>
          <button 
            onClick={handleSave}
            className="flex-[2] py-3 bg-stone-900 text-white rounded-2xl font-bold text-xs shadow-xl"
          >
            Save & Sync Engine
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
