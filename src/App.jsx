import React, { useState } from 'react';
import { Plus, Trash2, RefreshCw, Settings, Download, Upload, PlayCircle, User, X, AlertCircle } from 'lucide-react';

export default function EmoteReplacer() {
  const [mappings, setMappings] = useState([]);
  const [newMapping, setNewMapping] = useState({ originalId: '', replacementId: '', name: '' });
  const [apiToken, setApiToken] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [loadingPreset, setLoadingPreset] = useState(false);

  // Modal/notification system
  const [modal, setModal] = useState({ show: false, title: '', message: '', type: 'info', onConfirm: null });
  const [notification, setNotification] = useState({ show: false, message: '', type: 'info' });

  // Option 1: Replace in existing set
  const [replaceSetUrl, setReplaceSetUrl] = useState('');
  const [replaceAnalysis, setReplaceAnalysis] = useState(null);
  const [replacing, setReplacing] = useState(false);
  const [analyzingReplace, setAnalyzingReplace] = useState(false);
  const [replaceProgress, setReplaceProgress] = useState({ current: 0, total: 0 });

  // Option 2: Import to existing set
  const [importSourceUrl, setImportSourceUrl] = useState('');
  const [importTargetUrl, setImportTargetUrl] = useState('');
  const [applySeasonalOnImport, setApplySeasonalOnImport] = useState(false);
  const [importSourceData, setImportSourceData] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [failedEmotes, setFailedEmotes] = useState([]);

  // Username search
  const [username, setUsername] = useState('');
  const [userSets, setUserSets] = useState([]);
  const [loadingUserSets, setLoadingUserSets] = useState(false);

  // Helper functions for modals
  const showNotification = (message, type = 'info') => {
    setNotification({ show: true, message, type });
    setTimeout(() => setNotification({ show: false, message: '', type: 'info' }), 5000);
  };

  const showConfirm = (title, message, onConfirm) => {
    setModal({ show: true, title, message, type: 'confirm', onConfirm });
  };

  const showAlert = (title, message) => {
    setModal({ show: true, title, message, type: 'alert', onConfirm: null });
  };

  const closeModal = () => {
    setModal({ show: false, title: '', message: '', type: 'info', onConfirm: null });
  };

  const addMapping = () => {
    if (newMapping.originalId && newMapping.replacementId) {
      const existingMapping = mappings.find(m => m.originalId === newMapping.originalId);
      
      if (existingMapping) {
        showConfirm(
          'Replace Existing Mapping?',
          `This emote ID is already mapped!\n\nExisting: ${existingMapping.originalId} → ${existingMapping.replacementId}\n${existingMapping.name ? `(${existingMapping.name})` : ''}\n\nDo you want to replace it with the new mapping?`,
          () => {
            setMappings([
              ...mappings.filter(m => m.originalId !== newMapping.originalId),
              { ...newMapping, id: Date.now() }
            ]);
            setNewMapping({ originalId: '', replacementId: '', name: '' });
          }
        );
      } else {
        setMappings([...mappings, { ...newMapping, id: Date.now() }]);
        setNewMapping({ originalId: '', replacementId: '', name: '' });
      }
    }
  };

  const removeMapping = (id) => {
    setMappings(mappings.filter(m => m.id !== id));
  };

  const importHalloweenPreset = async () => {
    setLoadingPreset(true);
    try {
      const response = await fetch('/halloween-preset.json');
      
      if (!response.ok) {
        throw new Error('Halloween preset file not found.');
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
        showNotification('All Halloween emotes are already in your library!', 'info');
      } else {
        setMappings([...mappings, ...newMappings]);
        showNotification(`Added ${newMappings.length} Halloween emote mappings!`, 'success');
      }
    } catch (error) {
      showNotification('Error loading Halloween preset: ' + error.message, 'error');
    } finally {
      setLoadingPreset(false);
    }
  };

  const importWinterPreset = async () => {
    setLoadingPreset(true);
    try {
      const response = await fetch('/winter-preset.json');
      
      if (!response.ok) {
        throw new Error('Winter preset file not found.');
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
        showNotification('All Winter emotes are already in your library!', 'info');
      } else {
        setMappings([...mappings, ...newMappings]);
        showNotification(`Added ${newMappings.length} Winter emote mappings!`, 'success');
      }
    } catch (error) {
      showNotification('Error loading Winter preset: ' + error.message, 'error');
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
          showNotification('Mappings imported successfully!', 'success');
        } catch (error) {
          showNotification('Error importing mappings: ' + error.message, 'error');
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

  const analyzeForReplace = async () => {
    if (!apiToken) {
      showNotification('Please enter your 7TV API token', 'error');
      return;
    }

    const id = extractEmotesetId(replaceSetUrl);
    setAnalyzingReplace(true);
    
    try {
      console.log('Fetching emote set:', id);
      const response = await fetch(`https://7tv.io/v3/emote-sets/${id}`);
      
      if (!response.ok) {
        throw new Error(`API returned status ${response.status}. Check if the emoteset ID is correct.`);
      }
      
      const data = await response.json();
      
      // LOG THE ENTIRE RESPONSE
      console.log('Full API Response:', JSON.stringify(data, null, 2));
      console.log('Response keys:', Object.keys(data));
      
      // Try to find emotes in various possible locations
      let emotes = null;
      let foundLocation = 'not found';
      
      // Check all possible locations
      if (data.emotes && Array.isArray(data.emotes)) {
        emotes = data.emotes;
        foundLocation = 'data.emotes';
      } else if (data.data?.emotes && Array.isArray(data.data.emotes)) {
        emotes = data.data.emotes;
        foundLocation = 'data.data.emotes';
      } else if (data.emote_set?.emotes && Array.isArray(data.emote_set.emotes)) {
        emotes = data.emote_set.emotes;
        foundLocation = 'data.emote_set.emotes';
      } else if (Array.isArray(data)) {
        emotes = data;
        foundLocation = 'data (direct array)';
      }
      
      console.log('Emotes found at:', foundLocation);
      console.log('Number of emotes:', emotes?.length || 0);
      
      if (!emotes || !Array.isArray(emotes) || emotes.length === 0) {
        console.error('Could not find emotes array in response');
        console.error('Available keys:', Object.keys(data));
        throw new Error(`Invalid emoteset response. Could not find emotes array. Response keys: ${Object.keys(data).join(', ')}`);
      }
      
      // Log first emote structure to understand format
      if (emotes.length > 0) {
        console.log('First emote structure:', JSON.stringify(emotes[0], null, 2));
        console.log('First emote keys:', Object.keys(emotes[0]));
      }
      
      // Filter and match emotes - try multiple property paths
      const matches = emotes.filter(emote => {
        // Try multiple ways to get the emote ID
        const emoteId = emote.id || 
                        emote.emote?.id || 
                        emote.data?.id ||
                        emote.emote_id;
        
        console.log('Checking emote ID:', emoteId);
        return emoteId && mappings.some(m => m.originalId === emoteId);
      });
      
      console.log('Matches found:', matches.length);
      
      setReplaceAnalysis({
        emotesetId: id,
        total: emotes.length,
        matches: matches.map(emote => {
          // Try multiple ways to get emote properties
          const emoteId = emote.id || 
                          emote.emote?.id || 
                          emote.data?.id ||
                          emote.emote_id;
          
          const emoteName = emote.name || 
                            emote.emote?.name || 
                            emote.data?.name ||
                            'Unknown';
          
          const mapping = mappings.find(m => m.originalId === emoteId);
          
          return {
            currentName: emoteName,
            currentId: emoteId,
            replacementId: mapping.replacementId,
            mappingName: mapping.name
          };
        }),
        setName: data.name || data.data?.name || 'Emote Set'
      });
      
      if (matches.length === 0) {
        showNotification('No matching emotes found in this set', 'info');
      } else {
        showNotification(`Found ${matches.length} emote(s) to replace`, 'success');
      }
      
    } catch (error) {
      console.error('Full error:', error);
      console.error('Error stack:', error.stack);
      showNotification('Error analyzing emoteset: ' + error.message, 'error');
    }
    
    setAnalyzingReplace(false);
  };

  const replaceEmotes = async () => {
    if (!apiToken) {
      showNotification('Please enter your 7TV API token', 'error');
      return;
    }

    if (!replaceAnalysis || replaceAnalysis.matches.length === 0) {
      showNotification('No emotes to replace', 'error');
      return;
    }

    setReplacing(true);
    setReplaceProgress({ current: 0, total: replaceAnalysis.matches.length });
    const results = [];
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    for (let i = 0; i < replaceAnalysis.matches.length; i++) {
      const match = replaceAnalysis.matches[i];
      
      // Update progress
      setReplaceProgress({ current: i + 1, total: replaceAnalysis.matches.length });
      
      try {
        console.log(`[${i + 1}/${replaceAnalysis.matches.length}] Replacing: ${match.currentName}`);
        
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
              id: replaceAnalysis.emotesetId,
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
              id: replaceAnalysis.emotesetId,
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
    
    showAlert('Replacement Complete', message);

    setReplacing(false);
    setReplaceProgress({ current: 0, total: 0 });
    
    if (successCount > 0) {
      setReplaceAnalysis(null);
      setReplaceSetUrl('');
    }
  };

  const analyzeSourceForImport = async () => {
    const id = extractEmotesetId(importSourceUrl);
    if (!id) {
      showNotification('Please enter a valid source emote set URL or ID', 'error');
      return;
    }

    try {
      const response = await fetch(`https://7tv.io/v3/emote-sets/${id}`);
      
      if (!response.ok) {
        throw new Error('Could not fetch source emote set.');
      }
      
      const data = await response.json();
      
      if (!data.emotes || !Array.isArray(data.emotes)) {
        throw new Error('Invalid emote set response.');
      }

      setImportSourceData({
        id: data.id,
        name: data.name,
        emotes: data.emotes.map(e => ({
          id: e.id,
          name: e.name
        }))
      });

      if (applySeasonalOnImport && mappings.length > 0) {
        const willReplace = data.emotes.filter(emote => 
          mappings.some(m => m.originalId === emote.id)
        );
        
        if (willReplace.length > 0) {
          showNotification(`Found ${willReplace.length} emote(s) that will be replaced with seasonal variants.`, 'info');
        }
      }
    } catch (error) {
      showNotification('Error analyzing source set: ' + error.message, 'error');
    }
  };

  const importToExistingSet = async (emotesToImport = null) => {
    if (!apiToken) {
      showNotification('Please enter your 7TV API token', 'error');
      return;
    }

    if (!importSourceData) {
      showNotification('Please analyze a source emote set first', 'error');
      return;
    }

    const targetId = extractEmotesetId(importTargetUrl);
    if (!targetId) {
      showNotification('Please enter a valid target emote set URL or ID', 'error');
      return;
    }

    const emotesArray = emotesToImport || importSourceData.emotes;

    if (!emotesToImport) {
      // First time - check for existing emotes
      try {
        const targetResponse = await fetch(`https://7tv.io/v3/emote-sets/${targetId}`);
        if (targetResponse.ok) {
          const targetData = await targetResponse.json();
          const existingEmoteIds = new Set(targetData.emotes.map(e => e.id));
          
          const newEmotes = emotesArray.filter(emote => {
            const emoteIdToCheck = applySeasonalOnImport 
              ? (mappings.find(m => m.originalId === emote.id)?.replacementId || emote.id)
              : emote.id;
            return !existingEmoteIds.has(emoteIdToCheck);
          });

          if (newEmotes.length < emotesArray.length) {
            const skipped = emotesArray.length - newEmotes.length;
            showConfirm(
              'Some Emotes Already Exist',
              `${skipped} emote(s) already exist in the target set and will be skipped.\n\nProceed with importing ${newEmotes.length} new emotes?${applySeasonalOnImport ? '\n\n⚠️ Seasonal replacements will be applied!' : ''}`,
              () => startImport(newEmotes, targetId)
            );
            return;
          }
        }
      } catch (error) {
        console.error('Error checking existing emotes:', error);
      }

      showConfirm(
        'Confirm Import',
        `Import ${emotesArray.length} emotes into target set?${applySeasonalOnImport ? '\n\n⚠️ Seasonal replacements will be applied!' : ''}`,
        () => startImport(emotesArray, targetId)
      );
    } else {
      startImport(emotesArray, targetId);
    }
  };

  const startImport = async (emotesArray, targetId) => {
    closeModal();
    setImporting(true);
    setImportProgress({ current: 0, total: emotesArray.length });
    setFailedEmotes([]);
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const mutation = `
      mutation ChangeEmoteInSet($id: ObjectID!, $action: ListItemAction!, $emote_id: ObjectID!, $name: String) {
        emoteSet(id: $id) {
          emotes(id: $emote_id, action: $action, name: $name) {
            id
          }
        }
      }
    `;

    const results = [];
    let processed = 0;

    for (const emote of emotesArray) {
      processed++;
      setImportProgress({ current: processed, total: emotesArray.length });
      
      let emoteIdToAdd = emote.id;
      let emoteName = emote.name;
      let wasReplaced = false;

      if (applySeasonalOnImport) {
        const mapping = mappings.find(m => m.originalId === emote.id);
        if (mapping) {
          emoteIdToAdd = mapping.replacementId;
          wasReplaced = true;
        }
      }

      // Convert German special characters to ASCII equivalents
      // ä → ae, ö → oe, ü → ue, ß → ss (and uppercase variants)
      const convertedName = emoteName
        .replace(/ä/g, 'ae')
        .replace(/ö/g, 'oe')
        .replace(/ü/g, 'ue')
        .replace(/Ä/g, 'Ae')
        .replace(/Ö/g, 'Oe')
        .replace(/Ü/g, 'Ue')
        .replace(/ß/g, 'ss');

      try {
        const addResponse = await fetch('https://7tv.io/v3/gql', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            query: mutation,
            variables: {
              id: targetId,
              action: 'ADD',
              emote_id: emoteIdToAdd,
              name: convertedName
            }
          })
        });

        const addData = await addResponse.json();

        if (addData.errors) {
          throw new Error(addData.errors[0].message);
        }

        results.push({ 
          success: true, 
          name: convertedName,
          originalName: emoteName,
          id: emoteIdToAdd,
          replaced: wasReplaced,
          converted: emoteName !== convertedName
        });
        
        await delay(400);

      } catch (error) {
        console.error(`Error adding ${emoteName}:`, error);
        results.push({ 
          success: false, 
          name: emoteName,
          id: emoteIdToAdd,
          error: error.message 
        });

        if (error.message.includes('rate') || error.message.includes('limit')) {
          await delay(3000);
        }
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    const replacedCount = results.filter(r => r.success && r.replaced).length;
    const convertedCount = results.filter(r => r.success && r.converted).length;
    const failed = results.filter(r => !r.success);
    
    setFailedEmotes(failed.map(r => ({ id: r.id, name: r.name })));

    let message = `Import complete!\n\nSuccess: ${successCount}\nFailed: ${failCount}`;
    
    if (applySeasonalOnImport && replacedCount > 0) {
      message += `\n🎃 Seasonal replacements applied: ${replacedCount}`;
    }
    
    if (convertedCount > 0) {
      message += `\n🔤 German characters converted: ${convertedCount}`;
      const convertedExamples = results
        .filter(r => r.success && r.converted)
        .slice(0, 3)
        .map(r => `  ${r.originalName} → ${r.name}`)
        .join('\n');
      if (convertedExamples) {
        message += `\n${convertedExamples}`;
        if (convertedCount > 3) {
          message += `\n  ... and ${convertedCount - 3} more`;
        }
      }
    }
    
    if (failCount > 0) {
      message += '\n\nFailed emotes:\n' + failed.slice(0, 10).map(r => `- ${r.name}: ${r.error}`).join('\n');
      if (failed.length > 10) {
        message += `\n... and ${failed.length - 10} more`;
      }
    }
    
    showAlert('Import Complete', message);

    setImporting(false);
    setImportProgress({ current: 0, total: 0 });

    if (successCount > 0 && failCount === 0) {
      setImportSourceData(null);
      setImportSourceUrl('');
      setImportTargetUrl('');
    }
  };

  const retryFailedEmotes = () => {
    if (failedEmotes.length === 0) return;
    
    const emotesToRetry = failedEmotes.map(f => ({ id: f.id, name: f.name }));
    setFailedEmotes([]);
    
    showConfirm(
      'Retry Failed Emotes',
      `Retry importing ${emotesToRetry.length} failed emote(s)?`,
      () => {
        const targetId = extractEmotesetId(importTargetUrl);
        startImport(emotesToRetry, targetId);
      }
    );
  };

  const fetchSetsByUsername = async () => {
    if (!username.trim()) {
      showNotification('Please enter a Twitch username', 'error');
      return;
    }

    setLoadingUserSets(true);
    try {
      const ivrResponse = await fetch(`https://api.ivr.fi/v2/twitch/user?login=${encodeURIComponent(username.trim())}`);
      
      if (!ivrResponse.ok) {
        throw new Error('Failed to fetch from IVR API');
      }
      
      const ivrData = await ivrResponse.json();
      
      if (!ivrData || ivrData.length === 0 || !ivrData[0]?.id) {
        throw new Error(`Twitch user "${username.trim()}" not found.`);
      }
      
      const twitchUser = ivrData[0];
      const twitchUserId = twitchUser.id;
      
      const userIdQuery = `{users{userByConnection(platform:TWITCH,platformId:"${twitchUserId}"){id}}}`;
      
      const userIdResponse = await fetch('https://7tv.io/v4/gql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: userIdQuery })
      });
      
      const userIdData = await userIdResponse.json();
      
      if (userIdData.errors) {
        throw new Error(userIdData.errors[0].message);
      }
      
      const seventvUserId = userIdData?.data?.users?.userByConnection?.id;
      
      if (!seventvUserId) {
        throw new Error(`Twitch user "${twitchUser.displayName || twitchUser.login}" does not have a 7TV account.`);
      }
      
      const emoteSetsQuery = `
        {
          users {
            user(id: "${seventvUserId}") {
              ownedEmoteSets {
                id
                name
                capacity
                kind
              }
            }
          }
        }
      `;
      
      const emoteSetsResponse = await fetch('https://7tv.io/v4/gql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: emoteSetsQuery })
      });
      
      const emoteSetsData = await emoteSetsResponse.json();
      
      if (emoteSetsData.errors) {
        throw new Error(emoteSetsData.errors[0].message);
      }
      
      const userData = emoteSetsData?.data?.users?.user;
      
      if (!userData) {
        throw new Error('Failed to get user data');
      }
      
      let activeSetIds = new Set();
      const emoteCounts = {};
      
      try {
        const v3Response = await fetch(`https://7tv.io/v3/users/${seventvUserId}`);
        if (v3Response.ok) {
          const v3Data = await v3Response.json();
          if (v3Data.connections && Array.isArray(v3Data.connections)) {
            v3Data.connections.forEach(connection => {
              if (connection.emote_set_id) {
                activeSetIds.add(connection.emote_set_id);
              }
            });
          }
        }
        
        const ownedSets = userData.ownedEmoteSets || [];
        for (const set of ownedSets) {
          try {
            const setResponse = await fetch(`https://7tv.io/v3/emote-sets/${set.id}`);
            if (setResponse.ok) {
              const setData = await setResponse.json();
              emoteCounts[set.id] = setData.emotes?.length || 0;
            }
          } catch (error) {
            emoteCounts[set.id] = 0;
          }
        }
      } catch (error) {
        console.error('Failed to fetch additional data:', error);
      }
      
      const ownedSets = userData.ownedEmoteSets || [];
      
      if (ownedSets.length === 0) {
        showNotification(`Found "${twitchUser.displayName || twitchUser.login}" but they have no emote sets.`, 'info');
        setUserSets([]);
      } else {
        const formattedSets = ownedSets.map(set => ({
          id: set.id,
          name: set.name,
          capacity: set.capacity || 'Unknown',
          emoteCount: emoteCounts[set.id] || 0,
          kind: set.kind,
          isActive: activeSetIds.has(set.id)
        }));
        
        setUserSets(formattedSets);
        const activeCount = formattedSets.filter(s => s.isActive).length;
        showNotification(`Found ${ownedSets.length} emote set(s) for "${twitchUser.displayName || twitchUser.login}"${activeCount > 0 ? ` (${activeCount} currently active)` : ''}`, 'success');
      }
      
    } catch (error) {
      showNotification('Error: ' + error.message, 'error');
      setUserSets([]);
    }
    setLoadingUserSets(false);
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
      {/* Modal */}
      {modal.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-semibold">{modal.title}</h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <p className="text-gray-300 whitespace-pre-line mb-6">{modal.message}</p>
            <div className="flex justify-end gap-3">
              {modal.type === 'confirm' ? (
                <>
                  <button
                    onClick={closeModal}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      modal.onConfirm();
                      closeModal();
                    }}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded transition"
                  >
                    Confirm
                  </button>
                </>
              ) : (
                <button
                  onClick={closeModal}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded transition"
                >
                  OK
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Notification */}
      {notification.show && (
        <div className="fixed top-4 right-4 z-50 animate-fade-in">
          <div className={`px-6 py-4 rounded-lg shadow-lg flex items-center gap-3 ${
            notification.type === 'success' ? 'bg-green-600' :
            notification.type === 'error' ? 'bg-red-600' :
            'bg-blue-600'
          }`}>
            <AlertCircle size={20} />
            <span>{notification.message}</span>
            <button onClick={() => setNotification({ show: false, message: '', type: 'info' })}>
              <X size={18} />
            </button>
          </div>
        </div>
      )}

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
            <h3 className="text-lg font-semibold mb-3">Settings</h3>
            <p className="text-sm text-gray-400 mb-2">Additional configuration options</p>
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
                        {mapping.preset && <span className="text-xs bg-orange-600 px-2 py-1 rounded">Preset</span>}
                      </div>
                      <div className="text-xs text-gray-400 font-mono">
                        {mapping.originalId.slice(0, 8)}... → {mapping.replacementId.slice(0, 8)}...
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => removeMapping(mapping.id)}
                    className="p-2 text-red-400 hover:bg-red-900/30 rounded transition"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-gray-800 p-6 rounded-lg mb-6">
          <h2 className="text-xl font-semibold mb-4">🔍 Get Set IDs from Twitch Username</h2>
          
          <div className="bg-blue-900/30 border border-blue-700 rounded p-4 mb-4">
            <p className="text-blue-200 text-sm">
              Enter any Twitch username to find their 7TV emote sets.
            </p>
          </div>

          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter Twitch username (e.g., niena, felikah)"
              className="flex-1 px-4 py-2 bg-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={fetchSetsByUsername}
              disabled={loadingUserSets}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded transition"
            >
              <User size={20} className={loadingUserSets ? 'animate-pulse' : ''} />
              {loadingUserSets ? 'Loading...' : 'Search'}
            </button>
          </div>

          {userSets.length > 0 && (
            <div className="bg-gray-700 p-4 rounded">
              <h3 className="font-semibold mb-3">Found {userSets.length} Emote Set(s):</h3>
              <div className="space-y-2">
                {userSets.map((set) => (
                  <div key={set.id} className={`bg-gray-800 p-3 rounded flex justify-between items-center ${set.isActive ? 'ring-2 ring-green-500' : ''}`}>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <a 
                          href={`https://7tv.app/emote-sets/${set.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-blue-400 hover:text-blue-300 hover:underline"
                        >
                          {set.name}
                        </a>
                        {set.isActive && (
                          <span className="text-xs bg-green-600 px-2 py-1 rounded">✓ Active</span>
                        )}
                        {set.kind === 'PERSONAL' && (
                          <span className="text-xs bg-purple-600 px-2 py-1 rounded">Personal</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 font-mono">{set.id}</div>
                      <div className="text-xs text-gray-500">
                        Emotes: {set.emoteCount}/{set.capacity}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(set.id);
                        showNotification('Set ID copied to clipboard!', 'success');
                      }}
                      className="px-3 py-1 bg-purple-600 hover:bg-purple-700 rounded text-sm transition"
                    >
                      Copy ID
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="bg-gray-800 p-6 rounded-lg mb-6">
          <h2 className="text-xl font-semibold mb-3">🔑 API Configuration</h2>
          <div className="mb-4">
            <label className="block text-sm text-gray-400 mb-2">7TV API Token</label>
            <input
              type="password"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder="Enter your 7TV API token"
              className="w-full px-4 py-2 bg-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 mb-2"
            />
            <details className="text-xs text-gray-500">
              <summary className="cursor-pointer hover:text-gray-400">How to get your token?</summary>
              <div className="mt-2 p-2 bg-gray-700 rounded">
                <p className="mb-2"><strong>Chrome/Edge:</strong></p>
                <p className="mb-2">1. Press F12 → Storage → Local Storage → "7tv-token"</p>
                <p className="mb-2"><strong>Firefox:</strong></p>
                <p>1. Press F12 → Storage → Local Storage → "7tv-token"</p>
                <p>2. Copy the string value (Array item #1)</p>
              </div>
            </details>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Option 1: Replace in existing set */}
          <div className="bg-gray-800 p-6 rounded-lg">
            <h2 className="text-xl font-semibold mb-4">1️⃣ Replace in current active Set</h2>
            <p className="text-sm text-gray-400 mb-4">Change emotes to seasonal variants in an existing set</p>

            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">Set Link / ID</label>
              <input
                type="text"
                value={replaceSetUrl}
                onChange={(e) => setReplaceSetUrl(e.target.value)}
                placeholder="Set URL or ID"
                className="w-full px-4 py-2 bg-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-orange-500 mb-2"
              />
              <button
                onClick={analyzeForReplace}
                disabled={analyzingReplace || !replaceSetUrl || mappings.length === 0 || !apiToken}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded transition"
              >
                <RefreshCw size={20} className={analyzingReplace ? 'animate-spin' : ''} />
                Analyze
              </button>
            </div>

            {replaceAnalysis && (
              <div className="mt-4">
                <div className="bg-gray-700 p-3 rounded mb-3">
                  <p className="text-sm">
                    Found {replaceAnalysis.matches.length} of {replaceAnalysis.total} emotes to replace
                  </p>
                </div>
                <button
                  onClick={replaceEmotes}
                  disabled={replacing || replaceAnalysis.matches.length === 0}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded transition"
                >
                  <PlayCircle size={20} className={replacing ? 'animate-pulse' : ''} />
                  {replacing 
                    ? `Replacing ${replaceProgress.current} of ${replaceProgress.total}...` 
                    : 'Replace'}
                </button>
              </div>
            )}
          </div>

          {/* Option 2: Import to existing */}
          <div className="bg-gray-800 p-6 rounded-lg">
            <h2 className="text-xl font-semibold mb-4">2️⃣ Import to Set</h2>
            <p className="text-sm text-gray-400 mb-4">Import emotes from one set into another existing set</p>

            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">Source Set Link / ID</label>
              <input
                type="text"
                value={importSourceUrl}
                onChange={(e) => setImportSourceUrl(e.target.value)}
                placeholder="Source set URL or ID"
                className="w-full px-4 py-2 bg-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
              />
              
              <label className="block text-sm text-gray-400 mb-2">Target Set Link / ID</label>
              <input
                type="text"
                value={importTargetUrl}
                onChange={(e) => setImportTargetUrl(e.target.value)}
                placeholder="Target set URL or ID"
                className="w-full px-4 py-2 bg-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 mb-2"
              />

              {mappings.length > 0 && (
                <label className="flex items-center gap-2 mb-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applySeasonalOnImport}
                    onChange={(e) => setApplySeasonalOnImport(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Apply seasonal</span>
                </label>
              )}

              <button
                onClick={analyzeSourceForImport}
                disabled={!importSourceUrl}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded transition mb-2"
              >
                <RefreshCw size={20} />
                Analyze
              </button>
            </div>

            {importSourceData && (
              <div className="mt-4">
                <div className="bg-gray-700 p-3 rounded mb-3">
                  <p className="text-sm">
                    {importSourceData.emotes.length} emotes ready
                  </p>
                </div>
                <button
                  onClick={() => importToExistingSet()}
                  disabled={importing || !importTargetUrl || !apiToken}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded transition"
                >
                  <PlayCircle size={20} className={importing ? 'animate-pulse' : ''} />
                  {importing ? `Importing... ${importProgress.current}/${importProgress.total}` : 'Import'}
                </button>
                {failedEmotes.length > 0 && !importing && (
                  <button
                    onClick={retryFailedEmotes}
                    className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded transition"
                  >
                    <RefreshCw size={20} />
                    Retry {failedEmotes.length} Failed Emote{failedEmotes.length !== 1 ? 's' : ''}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <footer className="mt-8 text-center text-gray-500 text-sm">
          <p>
            🔒 Your API token is stored locally and never sent anywhere except directly to 7TV's API. 
            <br />
            <a 
              href="https://github.com/Lostency/seventv-replacer" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline"
            >
              View source code on GitHub
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
}