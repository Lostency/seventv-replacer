import React, { useState } from 'react';
import { Plus, Trash2, RefreshCw, Settings, Download, Upload, PlayCircle, User } from 'lucide-react';

export default function EmoteReplacer() {
  const [mappings, setMappings] = useState([]);
  const [newMapping, setNewMapping] = useState({ originalId: '', replacementId: '', name: '' });
  const [apiToken, setApiToken] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [loadingPreset, setLoadingPreset] = useState(false);

  // Option 1: Replace in existing set
  const [replaceSetUrl, setReplaceSetUrl] = useState('');
  const [replaceAnalysis, setReplaceAnalysis] = useState(null);
  const [replacing, setReplacing] = useState(false);
  const [analyzingReplace, setAnalyzingReplace] = useState(false);

  // Option 2: Create new set from source
  const [sourceSetUrl, setSourceSetUrl] = useState('');
  const [newSetName, setNewSetName] = useState('');
  const [applySeasonalOnCreate, setApplySeasonalOnCreate] = useState(false);
  const [sourceSetData, setSourceSetData] = useState(null);
  const [creating, setCreating] = useState(false);

  // Option 3: Import to existing set
  const [importSourceUrl, setImportSourceUrl] = useState('');
  const [importTargetUrl, setImportTargetUrl] = useState('');
  const [applySeasonalOnImport, setApplySeasonalOnImport] = useState(false);
  const [importSourceData, setImportSourceData] = useState(null);
  const [importing, setImporting] = useState(false);

  // Username search
  const [username, setUsername] = useState('');
  const [userSets, setUserSets] = useState([]);
  const [loadingUserSets, setLoadingUserSets] = useState(false);

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
        alert('All Halloween emotes are already in your library!');
      } else {
        setMappings([...mappings, ...newMappings]);
        alert(`Added ${newMappings.length} Halloween emote mappings!`);
      }
    } catch (error) {
      alert('Error loading Halloween preset: ' + error.message);
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
        alert('All Winter emotes are already in your library!');
      } else {
        setMappings([...mappings, ...newMappings]);
        alert(`Added ${newMappings.length} Winter emote mappings!`);
      }
    } catch (error) {
      alert('Error loading Winter preset: ' + error.message);
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

  // Option 1: Analyze and replace in existing set
  const analyzeForReplace = async () => {
    if (!apiToken) {
      alert('Please enter your 7TV API token in Settings');
      return;
    }

    const id = extractEmotesetId(replaceSetUrl);
    setAnalyzingReplace(true);
    
    try {
      const response = await fetch(`https://7tv.io/v3/emote-sets/${id}`);
      
      if (!response.ok) {
        throw new Error(`API returned status ${response.status}. Check if the emoteset ID is correct.`);
      }
      
      const data = await response.json();
      
      if (!data.emotes || !Array.isArray(data.emotes)) {
        throw new Error('Invalid emoteset response.');
      }
      
      const matches = data.emotes.filter(emote => 
        mappings.some(m => m.originalId === emote.id)
      );
      
      setReplaceAnalysis({
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
    }
    
    setAnalyzingReplace(false);
  };

  const replaceEmotes = async () => {
    if (!apiToken) {
      alert('Please enter your 7TV API token in Settings');
      return;
    }

    if (!replaceAnalysis || replaceAnalysis.matches.length === 0) {
      alert('No emotes to replace');
      return;
    }

    setReplacing(true);
    const results = [];
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    for (let i = 0; i < replaceAnalysis.matches.length; i++) {
      const match = replaceAnalysis.matches[i];
      try {
        console.log(`[${i + 1}/${replaceAnalysis.matches.length}] Replacing: ${match.currentName} (${match.currentId}) → ${match.replacementId}`);
        
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

    setReplacing(false);
    
    if (successCount > 0) {
      setReplaceAnalysis(null);
      setReplaceSetUrl('');
    }
  };

  // Option 2: Create new set from source
  const analyzeSourceForCreate = async () => {
    const id = extractEmotesetId(sourceSetUrl);
    if (!id) {
      alert('Please enter a valid emote set URL or ID');
      return;
    }

    try {
      const response = await fetch(`https://7tv.io/v3/emote-sets/${id}`);
      
      if (!response.ok) {
        throw new Error('Could not fetch source emote set. Check the URL/ID.');
      }
      
      const data = await response.json();
      
      if (!data.emotes || !Array.isArray(data.emotes)) {
        throw new Error('Invalid emote set response.');
      }

      setSourceSetData({
        id: data.id,
        name: data.name,
        emotes: data.emotes.map(e => ({
          id: e.id,
          name: e.name
        }))
      });

      if (applySeasonalOnCreate && mappings.length > 0) {
        const willReplace = data.emotes.filter(emote => 
          mappings.some(m => m.originalId === emote.id)
        );
        
        if (willReplace.length > 0) {
          alert(`Found ${willReplace.length} emote(s) that will be replaced with seasonal variants.`);
        }
      }
    } catch (error) {
      alert('Error analyzing source set: ' + error.message);
    }
  };

  const createNewSetFromSource = async () => {
    if (!apiToken) {
      alert('Please enter your 7TV API token in Settings');
      return;
    }

    if (!sourceSetData) {
      alert('Please analyze a source emote set first');
      return;
    }

    if (!newSetName.trim()) {
      alert('Please enter a name for the new emote set');
      return;
    }

    const confirmMsg = `Create new set "${newSetName}" with ${sourceSetData.emotes.length} emotes?${applySeasonalOnCreate ? '\n\n⚠️ Seasonal replacements will be applied!' : ''}`;

    if (!confirm(confirmMsg)) return;

    setCreating(true);
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    try {
      console.log('Creating new emote set...');
      
      const createQuery = `
        mutation CreateEmoteSet($name: String!) {
          createEmoteSet(name: $name) {
            id
            name
          }
        }
      `;

      const createResponse = await fetch('https://7tv.io/v3/gql', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: createQuery,
          variables: { name: newSetName }
        })
      });

      const createData = await createResponse.json();

      if (createData.errors) {
        throw new Error(createData.errors[0].message);
      }

      const newSetId = createData.data.createEmoteSet.id;
      console.log('Created set:', newSetId);
      await delay(500);

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

      for (const emote of sourceSetData.emotes) {
        processed++;
        let emoteIdToAdd = emote.id;
        let emoteName = emote.name;
        let wasReplaced = false;

        if (applySeasonalOnCreate) {
          const mapping = mappings.find(m => m.originalId === emote.id);
          if (mapping) {
            emoteIdToAdd = mapping.replacementId;
            wasReplaced = true;
            console.log(`[${processed}/${sourceSetData.emotes.length}] Replacing: ${emoteName} (${emote.id}) → ${mapping.replacementId}`);
          } else {
            console.log(`[${processed}/${sourceSetData.emotes.length}] Adding: ${emoteName}`);
          }
        } else {
          console.log(`[${processed}/${sourceSetData.emotes.length}] Adding: ${emoteName}`);
        }

        try {
          const response = await fetch('https://7tv.io/v3/gql', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              query: mutation,
              variables: {
                id: newSetId,
                action: 'ADD',
                emote_id: emoteIdToAdd,
                name: emoteName
              }
            })
          });

          const data = await response.json();

          if (data.errors) {
            throw new Error(data.errors[0].message);
          }

          results.push({ 
            success: true, 
            name: emoteName, 
            replaced: wasReplaced 
          });
          
          await delay(400);

        } catch (error) {
          console.error(`Error adding ${emoteName}:`, error);
          results.push({ 
            success: false, 
            name: emoteName, 
            error: error.message 
          });

          if (error.message.includes('rate') || error.message.includes('limit')) {
            console.log('Rate limit hit, waiting 3 seconds...');
            await delay(3000);
          }
        }
      }

      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      const replacedCount = results.filter(r => r.success && r.replaced).length;
      
      let message = `Set created!\n\nSuccess: ${successCount}\nFailed: ${failCount}`;
      
      if (applySeasonalOnCreate && replacedCount > 0) {
        message += `\n🎃 Seasonal replacements applied: ${replacedCount}`;
      }
      
      if (failCount > 0) {
        const failedEmotes = results.filter(r => !r.success);
        message += '\n\nFailed emotes:\n' + failedEmotes.slice(0, 10).map(r => `- ${r.name}: ${r.error}`).join('\n');
        if (failedEmotes.length > 10) {
          message += `\n... and ${failedEmotes.length - 10} more`;
        }
      }
      
      alert(message);

      if (successCount > 0) {
        setSourceSetData(null);
        setSourceSetUrl('');
        setNewSetName('');
      }

    } catch (error) {
      alert('Error creating set: ' + error.message);
      console.error('Creation error:', error);
    }

    setCreating(false);
  };

  // Option 3: Import to existing set
  const analyzeSourceForImport = async () => {
    const id = extractEmotesetId(importSourceUrl);
    if (!id) {
      alert('Please enter a valid source emote set URL or ID');
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
          alert(`Found ${willReplace.length} emote(s) that will be replaced with seasonal variants.`);
        }
      }
    } catch (error) {
      alert('Error analyzing source set: ' + error.message);
    }
  };

  const importToExistingSet = async () => {
    if (!apiToken) {
      alert('Please enter your 7TV API token in Settings');
      return;
    }

    if (!importSourceData) {
      alert('Please analyze a source emote set first');
      return;
    }

    const targetId = extractEmotesetId(importTargetUrl);
    if (!targetId) {
      alert('Please enter a valid target emote set URL or ID');
      return;
    }

    const confirmMsg = `Import ${importSourceData.emotes.length} emotes into target set?${applySeasonalOnImport ? '\n\n⚠️ Seasonal replacements will be applied!' : ''}`;

    if (!confirm(confirmMsg)) return;

    setImporting(true);
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    try {
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

      for (const emote of importSourceData.emotes) {
        processed++;
        let emoteIdToAdd = emote.id;
        let emoteName = emote.name;
        let wasReplaced = false;

        if (applySeasonalOnImport) {
          const mapping = mappings.find(m => m.originalId === emote.id);
          if (mapping) {
            emoteIdToAdd = mapping.replacementId;
            wasReplaced = true;
            console.log(`[${processed}/${importSourceData.emotes.length}] Replacing: ${emoteName} (${emote.id}) → ${mapping.replacementId}`);
          } else {
            console.log(`[${processed}/${importSourceData.emotes.length}] Adding: ${emoteName}`);
          }
        } else {
          console.log(`[${processed}/${importSourceData.emotes.length}] Adding: ${emoteName}`);
        }

        try {
          const response = await fetch('https://7tv.io/v3/gql', {
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
                name: emoteName
              }
            })
          });

          const data = await response.json();

          if (data.errors) {
            throw new Error(data.errors[0].message);
          }

          results.push({ 
            success: true, 
            name: emoteName, 
            replaced: wasReplaced 
          });
          
          await delay(400);

        } catch (error) {
          console.error(`Error adding ${emoteName}:`, error);
          results.push({ 
            success: false, 
            name: emoteName, 
            error: error.message 
          });

          if (error.message.includes('rate') || error.message.includes('limit')) {
            console.log('Rate limit hit, waiting 3 seconds...');
            await delay(3000);
          }
        }
      }

      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      const replacedCount = results.filter(r => r.success && r.replaced).length;
      
      let message = `Import complete!\n\nSuccess: ${successCount}\nFailed: ${failCount}`;
      
      if (applySeasonalOnImport && replacedCount > 0) {
        message += `\n🎃 Seasonal replacements applied: ${replacedCount}`;
      }
      
      if (failCount > 0) {
        const failedEmotes = results.filter(r => !r.success);
        message += '\n\nFailed emotes:\n' + failedEmotes.slice(0, 10).map(r => `- ${r.name}: ${r.error}`).join('\n');
        if (failedEmotes.length > 10) {
          message += `\n... and ${failedEmotes.length - 10} more`;
        }
      }
      
      alert(message);

      if (successCount > 0) {
        setImportSourceData(null);
        setImportSourceUrl('');
        setImportTargetUrl('');
      }

    } catch (error) {
      alert('Error during import: ' + error.message);
      console.error('Import error:', error);
    }

    setImporting(false);
  };

  // Get sets by Twitch username
  const fetchSetsByUsername = async () => {
    if (!username.trim()) {
      alert('Please enter a Twitch username');
      return;
    }

    setLoadingUserSets(true);
    try {
      console.log('Step 1: Looking up Twitch user via IVR:', username.trim());
      
      // Step 1: Get Twitch User ID from IVR API
      const ivrResponse = await fetch(`https://api.ivr.fi/v2/twitch/user?login=${encodeURIComponent(username.trim())}`);
      
      if (!ivrResponse.ok) {
        throw new Error('Failed to fetch from IVR API');
      }
      
      const ivrData = await ivrResponse.json();
      console.log('IVR API response:', ivrData);
      
      if (!ivrData || ivrData.length === 0 || !ivrData[0]?.id) {
        throw new Error(`Twitch user "${username.trim()}" not found. Check the spelling and try again.`);
      }
      
      const twitchUser = ivrData[0];
      const twitchUserId = twitchUser.id;
      console.log('Found Twitch user:', twitchUser.displayName || twitchUser.login, 'ID:', twitchUserId);
      
      // Step 2: Get 7TV User ID from Twitch ID using v4 GraphQL
      console.log('Step 2: Getting 7TV user ID...');
      
      const userIdQuery = `{users{userByConnection(platform:TWITCH,platformId:"${twitchUserId}"){id}}}`;
      
      const userIdResponse = await fetch('https://7tv.io/v4/gql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: userIdQuery })
      });
      
      if (!userIdResponse.ok) {
        throw new Error('Failed to query 7TV GraphQL API');
      }
      
      const userIdData = await userIdResponse.json();
      console.log('7TV user ID response:', userIdData);
      
      if (userIdData.errors) {
        throw new Error(userIdData.errors[0].message);
      }
      
      const seventvUserId = userIdData?.data?.users?.userByConnection?.id;
      
      if (!seventvUserId) {
        throw new Error(`Twitch user "${twitchUser.displayName || twitchUser.login}" does not have a 7TV account.`);
      }
      
      console.log('Found 7TV user ID:', seventvUserId);
      
      // Step 3: Get all owned emote sets
      console.log('Step 3: Fetching owned emote sets...');
      
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
      
      if (!emoteSetsResponse.ok) {
        throw new Error('Failed to fetch emote sets');
      }
      
      const emoteSetsData = await emoteSetsResponse.json();
      console.log('Emote sets response:', emoteSetsData);
      
      if (emoteSetsData.errors) {
        throw new Error(emoteSetsData.errors[0].message);
      }
      
      const userData = emoteSetsData?.data?.users?.user;
      
      if (!userData) {
        throw new Error('Failed to get user data');
      }
      
      // Step 4: Get active emote set and emote counts from v3 API
      console.log('Step 4: Checking active emote sets and fetching emote counts...');
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
          console.log('Active set IDs:', Array.from(activeSetIds));
        }
        
        // Fetch emote counts for each set from v3 API
        const ownedSets = userData.ownedEmoteSets || [];
        for (const set of ownedSets) {
          try {
            const setResponse = await fetch(`https://7tv.io/v3/emote-sets/${set.id}`);
            if (setResponse.ok) {
              const setData = await setResponse.json();
              emoteCounts[set.id] = setData.emotes?.length || 0;
            }
          } catch (error) {
            console.error(`Failed to fetch emote count for ${set.id}:`, error);
            emoteCounts[set.id] = 0;
          }
        }
      } catch (error) {
        console.error('Failed to fetch additional data:', error);
      }
      
      // Format the owned emote sets
      const ownedSets = userData.ownedEmoteSets || [];
      
      if (ownedSets.length === 0) {
        alert(`Found "${twitchUser.displayName || twitchUser.login}" but they have no emote sets.`);
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
        alert(`Found ${ownedSets.length} emote set(s) for "${twitchUser.displayName || twitchUser.login}"${activeCount > 0 ? ` (${activeCount} currently active)` : ''}`);
      }
      
    } catch (error) {
      console.error('Error fetching user sets:', error);
      alert('Error: ' + error.message);
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
              Enter any Twitch username to find their 7TV emote sets. The app will automatically look up their Twitch ID and find their 7TV profile.
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
                        alert('Set ID copied to clipboard!');
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Option 1: Replace in existing set */}
          <div className="bg-gray-800 p-6 rounded-lg">
            <h2 className="text-xl font-semibold mb-4">1️⃣ Replace in Set</h2>
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
                disabled={analyzingReplace || !replaceSetUrl || mappings.length === 0}
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
                  {replacing ? 'Replacing...' : 'Replace'}
                </button>
              </div>
            )}
          </div>

          {/* Option 2: Create new set */}
          <div className="bg-gray-800 p-6 rounded-lg">
            <h2 className="text-xl font-semibold mb-4">2️⃣ Create New Set</h2>
            <p className="text-sm text-gray-400 mb-4">Create a new set from a source with optional seasonal changes</p>
            
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">Source Set Link / ID</label>
              <input
                type="text"
                value={sourceSetUrl}
                onChange={(e) => setSourceSetUrl(e.target.value)}
                placeholder="Source set URL or ID"
                className="w-full px-4 py-2 bg-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
              />
              
              <label className="block text-sm text-gray-400 mb-2">New Set Name</label>
              <input
                type="text"
                value={newSetName}
                onChange={(e) => setNewSetName(e.target.value)}
                placeholder="Enter new set name"
                className="w-full px-4 py-2 bg-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 mb-2"
              />

              {mappings.length > 0 && (
                <label className="flex items-center gap-2 mb-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applySeasonalOnCreate}
                    onChange={(e) => setApplySeasonalOnCreate(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Apply seasonal</span>
                </label>
              )}

              <button
                onClick={analyzeSourceForCreate}
                disabled={!sourceSetUrl}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded transition mb-2"
              >
                <RefreshCw size={20} />
                Analyze
              </button>
            </div>

            {sourceSetData && (
              <div className="mt-4">
                <div className="bg-gray-700 p-3 rounded mb-3">
                  <p className="text-sm">
                    {sourceSetData.emotes.length} emotes ready
                  </p>
                </div>
                <button
                  onClick={createNewSetFromSource}
                  disabled={creating || !newSetName.trim()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded transition"
                >
                  <PlayCircle size={20} className={creating ? 'animate-pulse' : ''} />
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            )}
          </div>

          {/* Option 3: Import to existing */}
          <div className="bg-gray-800 p-6 rounded-lg">
            <h2 className="text-xl font-semibold mb-4">3️⃣ Import to Set</h2>
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
                  onClick={importToExistingSet}
                  disabled={importing || !importTargetUrl}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded transition"
                >
                  <PlayCircle size={20} className={importing ? 'animate-pulse' : ''} />
                  {importing ? 'Importing...' : 'Import'}
                </button>
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