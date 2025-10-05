import React, { useState } from 'react';
import { Plus, Trash2, RefreshCw, Settings, Download, Upload, PlayCircle } from 'lucide-react';

export default function EmoteReplacer() {
  const [mappings, setMappings] = useState([]);
  const [newMapping, setNewMapping] = useState({ originalId: '', replacementId: '', name: '' });
  const [emotesetUrl, setEmotesetUrl] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [apiToken, setApiToken] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [loadingPreset, setLoadingPreset] = useState(false);

  const addMapping = () => {
    if (newMapping.originalId && newMapping.replacementId) {
      const existingMapping = mappings.find(m => m.originalId === newMapping.originalId);
      
      if (existingMapping) {
        const confirmReplace = window.confirm(
          `This emote ID is already mapped!\n\n` +
          `Existing: ${existingMapping.originalId} → ${existingMapping.replacementId}\n` +
          `${existingMapping.name ? `(${existingMapping.name})` : ''}\n\n` +
          `Do you want to replace it with the new mapping?`
        );
        
        if (confirmReplace) {
          setMappings([
            ...mappings.filter(m => m.originalId !== newMapping.originalId),
            { ...newMapping, id: Date.now() }
          ]);
        }
      } else {
        setMappings([...mappings, { ...newMapping, id: Date.now() }]);
      }
      
      setNewMapping({ originalId: '', replacementId: '', name: '' });
    }
  };

  const removeMapping = (id) => {
    const mapping = mappings.find(m => m.id === id);
    if (mapping && mapping.preset) {
      alert('Cannot delete preset mappings! You can only delete custom mappings you added.');
      return;
    }
    setMappings(mappings.filter(m => m.id !== id));
  };

  const importHalloweenPreset = async () => {
    setLoadingPreset(true);
    try {
      const response = await fetch('/halloween-preset.json');
      
      if (!response.ok) {
        throw new Error('Halloween preset file not found. Make sure halloween-preset.json is in the public folder.');
      }
      
      const halloweenData = await response.json();
      
      const halloweenMappings = halloweenData.map((m, idx) => ({
        originalId: m.originalId,
        replacementId: m.replacementId,
        name: m.name || 'Halloween 2024',
        preset: true,
        id: Date.now() + idx
      }));
      
      const existingOriginalIds = new Set(mappings.map(m => m.originalId));
      const newMappings = halloweenMappings.filter(m => !existingOriginalIds.has(m.originalId));
      
      if (newMappings.length === 0) {
        alert('All Halloween emotes are already in your library!');
      } else {
        setMappings([...mappings, ...newMappings]);
        alert(`Added ${newMappings.length} Halloween emote mappings!`);
      }
    } catch (error) {
      alert('Error loading Halloween preset: ' + error.message);
      console.error('Halloween preset error:', error);
    } finally {
      setLoadingPreset(false);
    }
  };

  const importWinterPreset = async () => {
    setLoadingPreset(true);
    try {
      const response = await fetch('/winter-preset.json');
      
      if (!response.ok) {
        throw new Error('Winter preset file not found. Make sure winter-preset.json is in the public folder.');
      }
      
      const winterData = await response.json();
      
      const winterMappings = winterData.map((m, idx) => ({
        originalId: m.originalId,
        replacementId: m.replacementId,
        name: m.name || 'Winter 2024',
        preset: true,
        id: Date.now() + idx
      }));
      
      const existingOriginalIds = new Set(mappings.map(m => m.originalId));
      const newMappings = winterMappings.filter(m => !existingOriginalIds.has(m.originalId));
      
      if (newMappings.length === 0) {
        alert('All Winter emotes are already in your library!');
      } else {
        setMappings([...mappings, ...newMappings]);
        alert(`Added ${newMappings.length} Winter emote mappings!`);
      }
    } catch (error) {
      alert('Error loading Winter preset: ' + error.message);
      console.error('Winter preset error:', error);
    } finally {
      setLoadingPreset(false);
    }
  };

  const exportMappings = () => {
    const dataStr = JSON.stringify(mappings, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'emote-mappings.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const importMappings = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const imported = JSON.parse(e.target.result);
          setMappings(imported);
        } catch (error) {
          alert('Error importing mappings: ' + error.message);
        }
      };
      reader.readAsText(file);
    }
  };

  const extractEmotesetId = (url) => {
    const match = url.match(/emote-sets?\/([A-Z0-9]+)/i);
    return match ? match[1] : url.trim();
  };

  const extractEmoteId = (input) => {
    if (!input) return '';
    const match = input.match(/emotes\/([A-Z0-9]+)/i);
    return match ? match[1] : input.trim();
  };

  const analyzeEmoteset = async () => {
    const id = extractEmotesetId(emotesetUrl);
    setAnalyzing(true);
    
    try {
      const response = await fetch(`https://7tv.io/v3/emote-sets/${id}`);
      
      if (!response.ok) {
        throw new Error(`API returned status ${response.status}. Check if the emoteset ID is correct.`);
      }
      
      const data = await response.json();
      
      if (!data.emotes || !Array.isArray(data.emotes)) {
        throw new Error('Invalid emoteset response. The emoteset might not exist or the URL is incorrect.');
      }
      
      const matches = data.emotes.filter(emote => 
        mappings.some(m => m.originalId === emote.id)
      );
      
      setAnalysis({
        emotesetId: id,
        total: data.emotes.length,
        matches: matches.map(emote => {
          const mapping = mappings.find(m => m.originalId === emote.id);
          return {
            currentName: emote.name,
            currentId: emote.id,
            replacementId: mapping.replacementId,
            mappingName: mapping.name
          };
        }),
        setName: data.name
      });
    } catch (error) {
      alert('Error analyzing emoteset: ' + error.message);
      console.error('Full error:', error);
    }
    
    setAnalyzing(false);
  };

  const replaceEmotes = async () => {
    if (!apiToken) {
      alert('Please enter your 7TV API token in Settings');
      return;
    }

    if (!analysis || analysis.matches.length === 0) {
      alert('No emotes to replace');
      return;
    }

    setReplacing(true);
    const results = [];
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    for (let i = 0; i < analysis.matches.length; i++) {
      const match = analysis.matches[i];
      try {
        console.log(`[${i + 1}/${analysis.matches.length}] Replacing: ${match.currentName} (${match.currentId}) → ${match.replacementId}`);
        
        const mutation = `
          mutation ChangeEmoteInSet($id: ObjectID!, $action: ListItemAction!, $emote_id: ObjectID!, $name: String) {
            emoteSet(id: $id) {
              emotes(id: $emote_id, action: $action, name: $name) {
                id
              }
            }
          }
        `;
        
        const removeResponse = await fetch('https://7tv.io/v3/gql', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            query: mutation,
            variables: {
              id: analysis.emotesetId,
              action: 'REMOVE',
              emote_id: match.currentId,
              name: match.currentName
            }
          })
        });

        const removeData = await removeResponse.json();

        if (removeData.errors) {
          throw new Error(removeData.errors[0].message);
        }

        await delay(200);

        const addResponse = await fetch('https://7tv.io/v3/gql', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            query: mutation,
            variables: {
              id: analysis.emotesetId,
              action: 'ADD',
              emote_id: match.replacementId,
              name: match.currentName
            }
          })
        });

        const addData = await addResponse.json();

        if (addData.errors) {
          throw new Error(addData.errors[0].message);
        }

        results.push({ success: true, name: match.currentName });
        await delay(500);
        
      } catch (error) {
        console.error(`Error replacing ${match.currentName}:`, error);
        results.push({ success: false, name: match.currentName, error: error.message });
        
        if (error.message.includes('rate') || error.message.includes('limit')) {
          console.log('Rate limit hit, waiting 3 seconds...');
          await delay(3000);
        }
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    
    let message = `Replacement complete!\n\nSuccess: ${successCount}\nFailed: ${failCount}`;
    
    if (failCount > 0) {
      const failedEmotes = results.filter(r => !r.success);
      message += '\n\nFailed emotes:\n' + failedEmotes.map(r => `- ${r.name}: ${r.error}`).join('\n');
    }
    
    alert(message);
    
    if (failCount > 0) {
      console.error('Failed replacements:', results.filter(r => !r.success));
    }

    setReplacing(false);
    
    if (successCount > 0) {
      setAnalysis(null);
      setEmotesetUrl('');
    }
  };

  const EmotePreview = ({ emoteId, label }) => {
    const [error, setError] = useState(false);
    
    if (!emoteId || error) {
      return (
        <div className="w-32 h-32 bg-gray-700 rounded flex items-center justify-center text-gray-400 text-xs">
          {label}
        </div>
      );
    }
    
    return (
      <div className="flex flex-col items-center gap-2">
        <img 
          src={`https://cdn.7tv.app/emote/${emoteId}/4x.webp`}
          alt={label}
          className="w-32 h-32 object-contain bg-gray-800 rounded"
          onError={() => setError(true)}
        />
        <span className="text-xs text-gray-400">{label}</span>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">7TV Seasonal Emote Replacer</h1>
            <p className="text-gray-400">Create mappings once, apply to all your channel sets</p>
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 bg-gray-800 hover:bg-gray-700 rounded"
          >
            <Settings size={20} />
          </button>
        </div>

        {showSettings && (
          <div className="bg-gray-800 p-6 rounded-lg mb-6">
            <h3 className="text-lg font-semibold mb-3">API Settings</h3>
            <div>
              <label className="block text-sm text-gray-400 mb-2">7TV API Token</label>
              <input
                type="password"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                placeholder="Enter your 7TV API token"
                className="w-full px-4 py-2 bg-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <p className="text-xs text-gray-500 mt-2">
                Get your token from <a href="https://7tv.app/settings" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">7TV Settings</a>
              </p>
            </div>
          </div>
        )}

        <div className="bg-gray-800 p-6 rounded-lg mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Emote Mappings Library</h2>
            <div className="flex gap-2">
              <button
                onClick={importHalloweenPreset}
                disabled={loadingPreset}
                className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded transition"
              >
                🎃 {loadingPreset ? 'Loading...' : 'Halloween'}
              </button>
              <button
                onClick={importWinterPreset}
                disabled={loadingPreset}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded transition"
              >
                ❄️ {loadingPreset ? 'Loading...' : 'Winter'}
              </button>
              <label className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded cursor-pointer transition">
                <Upload size={20} />
                Import
                <input
                  type="file"
                  accept=".json"
                  onChange={importMappings}
                  className="hidden"
                />
              </label>
              <button
                onClick={exportMappings}
                disabled={mappings.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded transition"
              >
                <Download size={20} />
                Export
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Original Emote ID</label>
              <input
                type="text"
                value={newMapping.originalId}
                onChange={(e) => setNewMapping({...newMapping, originalId: extractEmoteId(e.target.value)})}
                placeholder="Paste emote URL or ID"
                className="w-full px-4 py-2 bg-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm text-gray-400 mb-2">Seasonal Replacement ID</label>
              <input
                type="text"
                value={newMapping.replacementId}
                onChange={(e) => setNewMapping({...newMapping, replacementId: extractEmoteId(e.target.value)})}
                placeholder="Paste emote URL or ID"
                className="w-full px-4 py-2 bg-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm text-gray-400 mb-2">Description (optional)</label>
            <input
              type="text"
              value={newMapping.name}
              onChange={(e) => setNewMapping({...newMapping, name: e.target.value})}
              placeholder="e.g., Halloween 2024, Christmas 2024"
              className="w-full px-4 py-2 bg-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div className="flex gap-4 mb-6">
            <EmotePreview emoteId={newMapping.originalId} label="Original" />
            <div className="flex items-center">
              <div className="text-4xl text-gray-600">→</div>
            </div>
            <EmotePreview emoteId={newMapping.replacementId} label="Seasonal" />
          </div>

          <button
            onClick={addMapping}
            disabled={!newMapping.originalId || !newMapping.replacementId}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded transition"
          >
            <Plus size={20} />
            Add to Library
          </button>
        </div>

        {mappings.length > 0 && (
          <div className="bg-gray-800 p-6 rounded-lg mb-6">
            <h2 className="text-xl font-semibold mb-4">Your Mappings ({mappings.length})</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {mappings.map((mapping) => (
                <div key={mapping.id} className="bg-gray-700 p-4 rounded flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <img 
                      src={`https://cdn.7tv.app/emote/${mapping.originalId}/4x.webp`}
                      alt="Original"
                      className="w-16 h-16 object-contain bg-gray-800 rounded"
                      onError={(e) => e.target.style.display = 'none'}
                    />
                    <span className="text-2xl text-gray-500">→</span>
                    <img 
                      src={`https://cdn.7tv.app/emote/${mapping.replacementId}/4x.webp`}
                      alt="Replacement"
                      className="w-16 h-16 object-contain bg-gray-800 rounded"
                      onError={(e) => e.target.style.display = 'none'}
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        {mapping.name && <div className="font-semibold text-sm">{mapping.name}</div>}
                        {mapping.preset && <span className="text-xs bg-orange-600 px-2 py-1 rounded">🎃 Preset</span>}
                      </div>
                      <div className="text-xs text-gray-400 font-mono">
                        {mapping.originalId.slice(0, 8)}... → {mapping.replacementId.slice(0, 8)}...
                      </div>
                    </div>
                  </div>
                  {!mapping.preset && (
                    <button
                      onClick={() => removeMapping(mapping.id)}
                      className="p-2 text-red-400 hover:bg-red-900/30 rounded transition"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-gray-800 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Apply to Emoteset</h2>
          
          {mappings.length === 0 ? (
            <div className="bg-blue-900/30 border border-blue-700 rounded p-4">
              <p className="text-blue-200">
                Add at least one emote mapping above to start replacing emotes in your sets.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-2">7TV Emoteset URL or ID</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={emotesetUrl}
                    onChange={(e) => setEmotesetUrl(e.target.value)}
                    placeholder="https://7tv.app/emote-sets/... or just the ID"
                    className="flex-1 px-4 py-2 bg-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <button
                    onClick={analyzeEmoteset}
                    disabled={analyzing || !emotesetUrl}
                    className="flex items-center gap-2 px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded transition"
                  >
                    <RefreshCw size={20} className={analyzing ? 'animate-spin' : ''} />
                    Analyze
                  </button>
                </div>
              </div>

              {analysis && (
                <div className="mt-6">
                  <div className="bg-gray-700 p-4 rounded mb-4">
                    <h3 className="font-semibold mb-2">"{analysis.setName}"</h3>
                    <p className="text-gray-400">
                      Found {analysis.matches.length} matching emote{analysis.matches.length !== 1 ? 's' : ''} out of {analysis.total} total
                    </p>
                  </div>

                  {analysis.matches.length > 0 ? (
                    <>
                      <div className="space-y-3 mb-4">
                        {analysis.matches.map((match, idx) => (
                          <div key={idx} className="bg-gray-700 p-3 rounded flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <img 
                                src={`https://cdn.7tv.app/emote/${match.currentId}/4x.webp`}
                                alt={match.currentName}
                                className="w-12 h-12 object-contain bg-gray-800 rounded"
                              />
                              <div>
                                <div className="font-semibold">{match.currentName}</div>
                                <div className="text-xs text-gray-400">{match.mappingName || 'Seasonal variant'}</div>
                              </div>
                              <span className="text-xl text-gray-500">→</span>
                              <img 
                                src={`https://cdn.7tv.app/emote/${match.replacementId}/4x.webp`}
                                alt="Replacement"
                                className="w-12 h-12 object-contain bg-gray-800 rounded"
                              />
                            </div>
                          </div>
                        ))}
                      </div>

                      <button
                        onClick={replaceEmotes}
                        disabled={replacing || !apiToken}
                        className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded transition font-semibold"
                      >
                        <PlayCircle size={20} className={replacing ? 'animate-pulse' : ''} />
                        {replacing ? 'Replacing...' : `Replace ${analysis.matches.length} Emote${analysis.matches.length !== 1 ? 's' : ''}`}
                      </button>
                      
                      {!apiToken && (
                        <p className="text-sm text-yellow-400 mt-2 text-center">
                          ⚠️ Please add your API token in Settings to enable replacements
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="bg-blue-900/30 border border-blue-700 rounded p-4">
                      <p className="text-blue-200">
                        No matching emotes found in this set. The emotes in your library don't appear in this emoteset.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}