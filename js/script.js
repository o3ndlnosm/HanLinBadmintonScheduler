// 全域變數
let players = [];
let readyPlayers = [];
let restingPlayers = [];
let courts = [[], [], []];
let courtEnabled = [true, true, true]; // 各場地的啟用狀態
let historyMatches = [];
let lastPairings = new Set();
let pairingHistory = {};
// 保留記錄各場地上次的組合（供其他用途）
let lastCombinationByCourt = {};
// 存放所有歷史比賽的組合（每筆為四人陣容，陣列形式）
let historyMatchesArr = [];
// 存放所有歷史比賽的時間記錄（與historyMatchesArr對應）
let historyMatchTimes = [];
// 存放所有歷史比賽的比分記錄（與historyMatchesArr對應）
// 用於檢測固定循環組合的變數
let readyPlayersCycleCount = 0;
let lastReadyPlayersNames = [];
// 手動排場模式
let isManualMode = false;
// 儲存下一場已決定的配對
let nextMatchDecision = null;

// 狀態保存與恢復功能
const GAME_STATE_KEY = 'hanlin_badminton_game_state';
const SAVE_VERSION = '1.0'; // 用於版本控制，避免格式不相容

// 保存遊戲狀態到localStorage
function saveGameState() {
  try {
    const gameState = {
      version: SAVE_VERSION,
      timestamp: new Date().toISOString(),
      players: players,
      readyPlayers: readyPlayers,
      restingPlayers: restingPlayers,
      courts: courts,
      historyMatches: historyMatches,
      historyMatchesArr: historyMatchesArr,
      historyMatchTimes: historyMatchTimes,
      pairingHistory: pairingHistory,
      lastCombinationByCourt: lastCombinationByCourt,
      isManualMode: isManualMode,
      nextMatchDecision: nextMatchDecision,
      readyPlayersCycleCount: readyPlayersCycleCount,
      lastReadyPlayersNames: lastReadyPlayersNames
    };
    
    localStorage.setItem(GAME_STATE_KEY, JSON.stringify(gameState));
    console.log('🔄【狀態保存】遊戲狀態已自動保存');
  } catch (error) {
    console.error('❌【狀態保存失敗】', error);
  }
}

// 從localStorage載入遊戲狀態
function loadGameState() {
  try {
    const savedState = localStorage.getItem(GAME_STATE_KEY);
    if (!savedState) return null;
    
    const gameState = JSON.parse(savedState);
    
    // 版本檢查
    if (gameState.version !== SAVE_VERSION) {
      console.warn('⚠️【版本不符】清除舊版本保存狀態');
      localStorage.removeItem(GAME_STATE_KEY);
      return null;
    }
    
    return gameState;
  } catch (error) {
    console.error('❌【狀態載入失敗】', error);
    localStorage.removeItem(GAME_STATE_KEY);
    return null;
  }
}

// 恢復遊戲狀態
function restoreGameState(gameState) {
  try {
    players = gameState.players || [];
    readyPlayers = gameState.readyPlayers || [];
    restingPlayers = gameState.restingPlayers || [];
    courts = gameState.courts || [[], [], []];
    historyMatches = gameState.historyMatches || [];
    historyMatchesArr = gameState.historyMatchesArr || [];
    historyMatchTimes = gameState.historyMatchTimes || [];
    pairingHistory = gameState.pairingHistory || {};
    lastCombinationByCourt = gameState.lastCombinationByCourt || {};
    isManualMode = gameState.isManualMode || false;
    nextMatchDecision = gameState.nextMatchDecision || null;
    readyPlayersCycleCount = gameState.readyPlayersCycleCount || 0;
    lastReadyPlayersNames = gameState.lastReadyPlayersNames || [];
    
    // 更新界面
    updateLists();
    updateCourtsDisplay();
    
    // 更新手動模式狀態
    if (isManualMode) {
      document.getElementById('manualMode').checked = true;
    }
    
    console.log('✅【狀態恢復】遊戲狀態已成功恢復');
    console.log(`📊【恢復詳情】選手:${players.length}人, 預備:${readyPlayers.length}人, 進行場地:${courts.filter(c => c.length > 0).length}個`);
    
    return true;
  } catch (error) {
    console.error('❌【狀態恢復失敗】', error);
    return false;
  }
}

// 清除保存的遊戲狀態
function clearGameState() {
  localStorage.removeItem(GAME_STATE_KEY);
  console.log('🗑️【狀態清除】保存的遊戲狀態已清除');
}

// 檢查是否有保存的遊戲狀態
function hasSavedGameState() {
  return localStorage.getItem(GAME_STATE_KEY) !== null;
}


// 時間格式化函數
function formatTime(date) {
  if (!date) return "";
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

// 計算時間差的函數，返回分鐘和秒數
function getMinutesDiff(startTime, endTime) {
  if (!startTime || !endTime) return { minutes: 0, seconds: 0 };

  const diffMs = endTime - startTime;
  const minutes = Math.floor(diffMs / 60000);
  const seconds = Math.floor((diffMs % 60000) / 1000);

  // 如果時間差小於1分鐘，但大於0，仍返回實際時間
  return {
    minutes: minutes,
    seconds: seconds,
    totalSeconds: Math.floor(diffMs / 1000),
  };
}

// 語音相關變數
let speechSynthesis = window.speechSynthesis;
let voices = [];
let selectedVoice = null;
let isVoiceEnabled = true;
// 語音隊列系統
let speechQueue = [];
let isSpeaking = false;
// 保持語音播放的計時器
let keepAliveTimer = null;

// 初始化語音功能
function initVoice() {
  // 檢查瀏覽器是否支援語音合成
  if (!("speechSynthesis" in window)) {
    document.getElementById("enableVoice").disabled = true;
    alert("您的瀏覽器不支援語音合成功能");
    return;
  }

  // 獲取所有可用的語音
  function loadVoices() {
    voices = speechSynthesis.getVoices();
    if (voices.length === 0) {
      // 某些裝置可能需要額外等待時間
      setTimeout(loadVoices, 1000);
      return;
    }

    const voiceSelect = document.getElementById("voiceSelect");
    voiceSelect.innerHTML = "";

    // 篩選中文語音選項
    const chineseVoices = voices.filter(
      (voice) =>
        voice.lang.includes("zh") ||
        voice.lang.includes("cmn") ||
        voice.lang.includes("yue")
    );

    // 如果找不到中文語音，則顯示所有語音
    const voicesToShow = chineseVoices.length > 0 ? chineseVoices : voices;

    voicesToShow.forEach((voice) => {
      const option = document.createElement("option");
      option.value = voice.name;
      option.textContent = `${voice.name} (${voice.lang})`;
      if (voice.default) {
        option.selected = true;
        selectedVoice = voice;
      }
      voiceSelect.appendChild(option);
    });

    // 如果沒有預設語音，選擇第一個
    if (!selectedVoice && voicesToShow.length > 0) {
      selectedVoice = voicesToShow[0];
      voiceSelect.value = selectedVoice.name;
    }
  }

  // Chrome 需要等待 voiceschanged 事件
  if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = loadVoices;
  } else {
    // 非Chrome瀏覽器可能沒有voiceschanged事件
    loadVoices();
  }

  // 初次加載語音
  loadVoices();

  // 語音選擇變更時設定選定的語音
  document
    .getElementById("voiceSelect")
    .addEventListener("change", function () {
      const selectedName = this.value;
      selectedVoice = voices.find((voice) => voice.name === selectedName);
    });

  // 語音啟用/停用切換
  document
    .getElementById("enableVoice")
    .addEventListener("change", function () {
      isVoiceEnabled = this.checked;
    });

  // 測試語音按鈕
  document
    .getElementById("testVoiceBtn")
    .addEventListener("click", function () {
      testVoice();
    });
}

// 檢測是否為 iOS 設備
function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

// 檢測是否為 Android 設備
function isAndroid() {
  return /Android/.test(navigator.userAgent);
}

// 解決移動設備上語音中斷的問題
function keepAliveVoice() {
  if (keepAliveTimer) {
    clearTimeout(keepAliveTimer);
  }

  if (speechSynthesis.speaking) {
    speechSynthesis.pause();
    speechSynthesis.resume();
    keepAliveTimer = setTimeout(keepAliveVoice, 250);
  }
}

// 測試語音函數
function testVoice() {
  // 在行動裝置上，需要用戶互動才能播放音頻
  // 這將確保語音合成可以正常工作
  speechSynthesis.cancel(); // 先清除已有語音

  if (!selectedVoice) {
    alert("找不到可用的語音，請確認您的裝置支援語音合成。");
    return;
  }

  // 簡短的測試語句
  const testText = "測試語音功能，請確認您是否能聽到這段話";

  // 直接使用 SpeechSynthesisUtterance，不經過隊列系統進行測試
  const utterance = new SpeechSynthesisUtterance(testText);
  utterance.voice = selectedVoice;
  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.volume = 1;

  utterance.onend = function () {};

  utterance.onerror = function (event) {
    alert("語音播放發生錯誤：" + event.error);
  };

  try {
    speechSynthesis.speak(utterance);

    // 某些行動裝置上需要保持語音活躍
    if (isIOS() || isAndroid()) {
      keepAliveVoice();
    }
  } catch (error) {
    alert("嘗試播放語音時出現異常: " + error.message);
  }
}

// 文字轉語音函數 - 使用隊列系統
function speak(text) {
  if (!isVoiceEnabled || !selectedVoice) return;

  // 添加到隊列
  speechQueue.push(text);

  // 如果沒有正在說話，開始處理隊列
  if (!isSpeaking) {
    processSpeechQueue();
  }
}

// 處理語音隊列
function processSpeechQueue() {
  if (speechQueue.length === 0) {
    isSpeaking = false;
    if (keepAliveTimer) {
      clearTimeout(keepAliveTimer);
      keepAliveTimer = null;
    }
    return;
  }

  isSpeaking = true;
  const text = speechQueue.shift();

  // 取消所有進行中的語音
  speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = selectedVoice;
  utterance.rate = 1; // 速度，可調整
  utterance.pitch = 1; // 音調，可調整
  utterance.volume = 1; // 音量，可調整

  // 當播報結束時，處理下一個
  utterance.onend = function () {
    processSpeechQueue();
  };

  // 如果發生錯誤，也要繼續處理下一個
  utterance.onerror = function (event) {
    processSpeechQueue();
  };

  try {
    speechSynthesis.speak(utterance);

    // 在行動裝置上保持語音活躍
    if (isIOS() || isAndroid()) {
      keepAliveVoice();
    }
  } catch (error) {
    processSpeechQueue(); // 發生錯誤時繼續下一個
  }
}

// 播報場地選手名單
function announceCourt(courtIndex) {
  const court = courts[courtIndex];
  if (court.length === 0) return;

  const team1 = court.slice(0, 2);
  const team2 = court.slice(2);

  // 確保有完整的兩隊選手
  if (team1.length < 2 || team2.length < 2) return;

  let announcement = `場地${courtIndex + 1}，${team1[0].name}與${
    team1[1].name
  }對戰${team2[0].name}與${team2[1].name}`;
  speak(announcement);
}

// 播報所有場地 - 簡化版本，因為隊列會處理時間問題
function announceAllCourts() {
  for (let i = 0; i < courts.length; i++) {
    if (courts[i].length > 0) {
      announceCourt(i);
    }
  }
}

function updateLists() {
  
  // 更新選手列表
  const playerListEl = document.getElementById("playerList");
  if (players.length === 0) {
    playerListEl.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-users"></i>
        <p>尚未新增選手</p>
      </div>
    `;
  } else {
    playerListEl.innerHTML = players
      .map(
        (p) => `
      <div class="list-item">
        <div class="player-info">
          <div class="player-name">${p.name}</div>
        </div>
        <div class="player-actions">
          <button class="btn btn-success" onclick="moveToReady('${p.name}')" title="加入預備">
            進入預備
          </button>
          <button class="btn btn-danger btn-icon" onclick="removePlayer('${p.name}')" title="刪除">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `
      )
      .join("");
  }

  // 更新預備區 - 加入等待輪數顯示
  const readyListEl = document.getElementById("readyList");
  if (readyPlayers.length === 0) {
    readyListEl.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-hourglass-half"></i>
        <p>預備區無選手</p>
      </div>
    `;
  } else {
    readyListEl.innerHTML = readyPlayers
      .map((p) => {
        // 計算樣式：等待輪數超過1輪時添加高亮樣式，更高輪數有更強烈高亮
        let waitingClass = "";
        const waitingTurns = p.waitingTurns || 0;

        if (waitingTurns >= 3) {
          // 等待3輪以上用更強烈的樣式
          waitingClass = "waiting-highlight waiting-urgent";
        } else if (waitingTurns >= 2) {
          // 等待2輪以上用標準高亮
          waitingClass = "waiting-highlight";
        }

        // 添加更詳細的等待信息
        let waitingText = "";
        let waitingBadge = "";

        if (p.justFinished) {
          waitingText = `<span class="player-just-finished">剛下場</span>`;
        } else if (p.justJoinedReady) {
          waitingText = `<span class="player-just-joined">剛加入</span>`;
        } else {
          waitingText = `<span class="player-waiting">等待: ${waitingTurns}輪</span>`;

          // 移除數字徽章，僅保留文字標記
          waitingBadge = ""; // 不再添加徽章
        }

        return `
      <div class="list-item ${waitingClass}">
        <div class="player-info">
          <div class="player-name">${p.name}</div>
          ${waitingText}
        </div>
        <div class="player-actions">
          <button class="btn btn-neutral" onclick="moveToRest('${p.name}')" title="休息">
            休息
          </button>
          ${isManualMode ? `
            <button class="btn btn-sm btn-success" onclick="manualJoinCourt('${p.name}')" title="自動分配到空閒場地">
              上場
            </button>
          ` : ''}
        </div>
      </div>
    `;
      })
      .join("");
  }

  // 更新休息區
  const restListEl = document.getElementById("restList");
  if (restingPlayers.length === 0) {
    restListEl.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-coffee"></i>
        <p>休息區無選手</p>
      </div>
    `;
  } else {
    restListEl.innerHTML = restingPlayers
      .map(
        (p) => `
      <div class="list-item">
        <div class="player-info">
          <div class="player-name">${p.name}</div>
        </div>
        <div class="player-actions">
          <button class="btn btn-success" onclick="moveToReady('${p.name}')" title="回預備區">
            進入預備
          </button>
        </div>
      </div>
    `
      )
      .join("");
  }
  
}

function addBatchPlayers() {
  
  const text = document.getElementById("batchPlayers").value;
  
  if (!text.trim()) {
    console.warn("【addBatchPlayers】警告：輸入文字為空");
    alert("請貼上選手資料！");
    return;
  }
  
  const lines = text.split(/\r?\n/);
  
  let addedCount = 0;
  let skippedCount = 0;
  
  for (let line of lines) {
    line = line.trim();
    
    if (!line) {
      continue;
    }
    
    const match = line.match(/^(\D+)([\d.]+)$/);
    if (match) {
      const name = match[1].trim();
      const level = parseFloat(match[2]);
      
      if (!players.some((p) => p.name === name)) {
        players.push({ name, level, matches: 0 });
        addedCount++;
      } else {
        skippedCount++;
      }
    } else {
      console.warn(`【addBatchPlayers】格式錯誤，無法解析：'${line}'`);
    }
  }
  
  
  document.getElementById("batchPlayers").value = "";
  updateLists();
  updateHistoryDisplay();
  updateCourtsDisplay();
  
  // 自動保存遊戲狀態
  if (addedCount > 0) {
    saveGameState();
  }
}

function removePlayer(name) {
  players = players.filter((p) => p.name !== name);
  readyPlayers = readyPlayers.filter((p) => p.name !== name);
  restingPlayers = restingPlayers.filter((p) => p.name !== name);
  updateLists();
}

// 計算所有活躍選手的平均場次
function calculateActivePlayersAverageMatches() {
  let allActivePlayers = [];
  
  // 加入場地上的選手
  courts.forEach(court => {
    if (court.length > 0) {
      allActivePlayers.push(...court);
    }
  });
  
  // 加入預備區的選手
  allActivePlayers.push(...readyPlayers);
  
  if (allActivePlayers.length === 0) {
    return 0;
  }
  
  const totalMatches = allActivePlayers.reduce((sum, player) => sum + (player.matches || 0), 0);
  const averageMatches = Math.round(totalMatches / allActivePlayers.length);
  
  return averageMatches;
}

/* 
  moveToReady：
  將選手從列表或休息區移入預備區時，
  場次調整為所有活躍選手的平均場次
*/
function moveToReady(name) {
  
  let player =
    restingPlayers.find((p) => p.name === name) ||
    players.find((p) => p.name === name);
    
  if (player) {
    
    players = players.filter((p) => p.name !== name);
    restingPlayers = restingPlayers.filter((p) => p.name !== name);

    // 初始化等待輪數和標記為剛加入
    player.waitingTurns = 0;
    player.justJoinedReady = true;
    

    // 清除剛下場標記（如果有）
    if (player.justFinished) {
      player.justFinished = false;
    }

    // 將選手場次調整為所有活躍選手的平均場次
    const averageMatches = calculateActivePlayersAverageMatches();
    player.matches = averageMatches;
    

    readyPlayers.push(player);
    
    updateLists();
    
    // 自動保存遊戲狀態
    saveGameState();
  } else {
    console.warn(`【moveToReady】警告：找不到選手 ${name}`);
  }
}

function moveToRest(name) {
  let player = readyPlayers.find((p) => p.name === name);
  if (player) {
    readyPlayers = readyPlayers.filter((p) => p.name !== name);
    restingPlayers.push(player);
    updateLists();
    
    // 自動保存遊戲狀態
    saveGameState();
  }
}

// 更新場地顯示，添加即時計時功能
let courtTimers = {};

function updateCourtsDisplay(updateTimesOnly = false) {
  if (!updateTimesOnly) {
    document.getElementById("courts").innerHTML = courts
      .map((court, i) => {
        // 如果場地被禁用，不顯示
        if (!courtEnabled[i]) {
          return '';
        }
        if (court.length === 0) {
          // 清除計時器如果該場地沒有比賽
          if (courtTimers[i]) {
            clearInterval(courtTimers[i]);
            delete courtTimers[i];
          }

          return `
          <div class="court">
            <div class="court-title">
              <div class="court-header">
                <div><i class="fas fa-shuttlecock"></i> 場地 ${i + 1}</div>
              </div>
            </div>
            <div class="empty-state">
              <i class="fas fa-shuttlecock"></i>
              <p>目前無比賽</p>
            </div>
          </div>
        `;
        }

        let team1 = court.slice(0, 2);
        let team2 = court.slice(2);

        let team1Html = team1
          .map(
            (player) => `
        <div class="player-item">
          <div class="player-info">
            <span class="player-name">${player.name}</span>
          </div>
          <button class="btn btn-neutral" onclick="restPlayerOnCourt(${i}, '${player.name}')" title="休息">
            休息
          </button>
        </div>
      `
          )
          .join("");

        let team2Html = team2
          .map(
            (player) => `
        <div class="player-item">
          <div class="player-info">
            <span class="player-name">${player.name}</span>
          </div>
          <button class="btn btn-neutral" onclick="restPlayerOnCourt(${i}, '${player.name}')" title="休息">
            休息
          </button>
        </div>
      `
          )
          .join("");

        // 設置場地計時器，每秒更新一次
        if (!courtTimers[i] && court.startTime) {
          courtTimers[i] = setInterval(() => {
            updateCourtsDisplay(true);
          }, 1000);
        }

        return `
        <div class="court">
          <div class="court-title">
            <div class="court-header">
              <div>
                <i class="fas fa-shuttlecock"></i> 場地 ${i + 1}
                <span id="court-timer-${i}" class="court-timer">
                  ${getElapsedTimeString(court.startTime)}
                </span>
              </div>
              <button class="btn btn-warning" onclick="${isManualMode ? `manualEndMatch(${i})` : `endMatch(${i})`}">
                <i class="fas fa-check-circle"></i> ${isManualMode ? '清空' : '下場'}
              </button>
            </div>
          </div>
          <div class="court-players">
            ${team1Html}
            ${team2Html}
          </div>
        </div>
      `;
      })
      .join("");
  } else {
    // 只更新時間顯示
    courts.forEach((court, i) => {
      if (court.length > 0 && court.startTime) {
        const timerElement = document.getElementById(`court-timer-${i}`);
        if (timerElement) {
          timerElement.textContent = getElapsedTimeString(court.startTime);
        }
      }
    });
  }
}

// 格式化已經經過的時間
function getElapsedTimeString(startTime) {
  if (!startTime) return "";

  const now = new Date();
  const diffMs = now - startTime;
  const minutes = Math.floor(diffMs / 60000);
  const seconds = Math.floor((diffMs % 60000) / 1000);

  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

// 遞補邏輯保持不變
function restPlayerOnCourt(courtIndex, playerName) {
  let court = courts[courtIndex];
  let idx = court.findIndex((p) => p.name === playerName);
  if (idx >= 0) {
    // 獲取當前時間並計算選手在場時間
    const now = new Date();
    let restingPlayer = court.splice(idx, 1)[0];

    // 檢查選手上場時間
    if (court.startTime) {
      const timeInfo = getMinutesDiff(court.startTime, now);

      
      // 記錄這次上場的時間
      if (!restingPlayer.matchDurations) restingPlayer.matchDurations = [];
      restingPlayer.matchDurations.push(timeInfo.totalSeconds);

      // 直接計為一場比賽，無論時間長短
      restingPlayer.matches++;
    }

    // 將替換下場的選手移到休息區
    restingPlayers.push(restingPlayer);

    // 尋找替補選手 - 使用 ABC 等級匹配
    if (readyPlayers.length > 0) {
      const restingPlayerABC = restingPlayer.newLevel || 'B';
      
      // 優先選擇相同 ABC 等級的替補
      let candidateList = readyPlayers.filter(
        (candidate) => (candidate.newLevel || 'B') === restingPlayerABC
      );
      
      // 如果沒有相同等級，選擇相鄰等級
      if (candidateList.length === 0) {
        candidateList = readyPlayers.filter((candidate) => {
          const candidateABC = candidate.newLevel || 'B';
          return (restingPlayerABC === 'A' && candidateABC === 'B') ||  
                 (restingPlayerABC === 'B' && (candidateABC === 'A' || candidateABC === 'C')) ||
                 (restingPlayerABC === 'C' && candidateABC === 'B');
        });
      }
      
      // 如果還是沒有，使用所有選手
      if (candidateList.length === 0) {
        candidateList = [...readyPlayers];
      }
      
      candidateList.sort((a, b) => {
        // 優先考慮場次少的選手
        if (a.matches !== b.matches) {
          return a.matches - b.matches;
        }
        // 其次考慮等待輪次高的選手
        return (b.waitingTurns || 0) - (a.waitingTurns || 0);
      });
      let candidateIndex = readyPlayers.findIndex(
        (c) => c.name === candidateList[0].name
      );
      let candidate = readyPlayers.splice(candidateIndex, 1)[0];

      // 為新上場選手設置開始時間
      candidate.substituteStartTime = now;

      court.push(candidate);
    }
    updateLists();
    updateCourtsDisplay();
  }
}

function getPairKey(name1, name2) {
  return [name1, name2].sort().join("-");
}

function updatePairingHistory(teamKey) {
  pairingHistory[teamKey] = (pairingHistory[teamKey] || 0) + 1;
}

/*
  ============ ABC 嚴格配對系統 ============
  完全基於 ABC 等級的選手選擇和配對邏輯
  確保絕對不會產生不合法組合
*/

// ABC 等級組合優先級檢查 - 三階段權重系統
function getABCCombinationPriority(players, isEmergencyMode = false, isForceMode = false) {
  if (players.length !== 4) return 0;
  
  const levels = players.map(p => p.newLevel || 'B').sort().join('');
  
  // 【正常組合】- 基礎6種
  const normalCombinations = [
    'AAAA', 'BBBB', 'CCCC',  // 同等級組合
    'AABB', 'AACC', 'BBCC'   // 2+2組合
  ];
  
  // 【次要組合】- 緊急/強制模式下開放
  const secondaryCombinations = [
    'AAAB', 'ABBB',  // A-B混合
    'BBBC', 'BCCC'   // B-C混合
  ];
  
  // 檢查組合類型並返回優先級
  if (normalCombinations.includes(levels)) {
    return 1; // 正常組合優先級最高
  }
  
  if (secondaryCombinations.includes(levels)) {
    if (isForceMode || isEmergencyMode) {
      return 2; // 緊急/強制模式下允許次要組合
    } else {
      return 3; // 一般模式下次要組合優先級較低
    }
  }
  
  // 不允許的組合
  return 0;
}

// 決定下一輪配對（提前決定並儲存）
function decideNextMatch() {
  if (readyPlayers.length < 6) {
    nextMatchDecision = null;
    return null;
  }
  
  // 使用與實際配對完全相同的邏輯（包含隨機性）
  let sortedReady = [...readyPlayers].sort((a, b) => {
    const getWaitingScore = (player) => {
      if (player.justFinished) return 0;
      const waiting = player.waitingTurns || 0;
      if (waiting <= 1) return 0;
      return -(waiting - 1) * 10;
    };
    
    const aScore = getWaitingScore(a);
    const bScore = getWaitingScore(b);
    
    if (aScore !== bScore) return aScore - bScore;
    
    // 場次數差異在1以內時，用隨機決定
    if (Math.abs(a.matches - b.matches) <= 1) {
      return Math.random() - 0.5;
    }
    
    if (a.matches !== b.matches) return a.matches - b.matches;
    
    const getLevelOrder = (player) => {
      const level = player.newLevel || 'B';
      return level === 'A' ? 1 : level === 'B' ? 2 : 3;
    };
    if (getLevelOrder(a) !== getLevelOrder(b)) {
      return getLevelOrder(a) - getLevelOrder(b);
    }
    
    return Math.random() - 0.5;
  });
  
  // 使用 ABC 邏輯選擇最佳組合
  nextMatchDecision = selectPlayersWithABCLogic(sortedReady);
  return nextMatchDecision;
}

// 顯示臨時通知
function showToastNotification(message) {
  const toast = document.getElementById('toastNotification');
  const content = document.getElementById('toastContent');
  
  if (!toast || !content) return;
  
  content.innerHTML = message;
  
  // 移除之前的動畫類別
  toast.classList.remove('slide-out');
  
  // 顯示通知
  toast.style.display = 'block';
  
  // 4秒後自動隱藏
  setTimeout(() => {
    toast.classList.add('slide-out');
    
    // 動畫結束後真正隱藏
    setTimeout(() => {
      toast.style.display = 'none';
      toast.classList.remove('slide-out');
    }, 300);
  }, 4000);
}

// 更新永久預告區域
function updatePermanentPrediction(message) {
  const permanentPrediction = document.getElementById('permanentPrediction');
  const permanentContent = document.getElementById('permanentPredictionContent');
  
  if (!permanentPrediction || !permanentContent) return;
  
  if (message) {
    // 如果message包含選手名稱，格式化為標籤樣式
    if (message.includes(',')) {
      const players = message.split(', ').map(player => player.trim());
      
      // 將4個選手分成2x2排列
      if (players.length === 4) {
        const row1 = players.slice(0, 2).map(player => 
          `<span style="display: inline-block; background: var(--primary-light); color: white; padding: 0.15rem 0.4rem; border-radius: 10px; font-size: 0.75rem; font-weight: 500; margin: 0 0.1rem;">${player}</span>`
        ).join('');
        
        const row2 = players.slice(2, 4).map(player => 
          `<span style="display: inline-block; background: var(--primary-light); color: white; padding: 0.15rem 0.4rem; border-radius: 10px; font-size: 0.75rem; font-weight: 500; margin: 0 0.1rem;">${player}</span>`
        ).join('');
        
        permanentContent.innerHTML = `<div>${row1}</div><div style="margin-top: 0.2rem;">${row2}</div>`;
      } else {
        // 非4人時的原始處理
        const formattedPlayers = players.map(player => 
          `<span style="display: inline-block; background: var(--primary-light); color: white; padding: 0.15rem 0.4rem; border-radius: 10px; font-size: 0.75rem; font-weight: 500;">${player}</span>`
        ).join('');
        permanentContent.innerHTML = formattedPlayers;
      }
    } else {
      permanentContent.innerHTML = message;
    }
    
    // 只有在開始排場按鈕隱藏後才顯示永久預告
    const startButton = document.querySelector('button[onclick="generateMatches()"]');
    if (startButton && startButton.style.display === 'none') {
      permanentPrediction.style.display = 'flex';
    }
  } else {
    permanentPrediction.style.display = 'none';
  }
}

// 更新下輪預測（只在關鍵時刻呼叫）
function updateNextMatchPrediction() {
  if (readyPlayers.length >= 6) {
    // 決定下一場配對
    decideNextMatch();
    
    if (nextMatchDecision) {
      const predictionNames = nextMatchDecision.map(p => p.name).join(', ');
      console.log(`📋【下輪預告】已決定選手：${predictionNames}`);
      
      // 更新永久預告區域（如果顯示中）
      updatePermanentPrediction(predictionNames);
    }
  } else {
    // 人數不足時清除決定
    nextMatchDecision = null;
    // 清除永久預告
    updatePermanentPrediction(null);
  }
}

// ABC 智能選手選擇：在所有可能組合中找出最佳選擇
function selectPlayersWithABCLogic(availablePlayers) {
  if (availablePlayers.length < 4) {
    return null;
  }
  
  // 🚨 檢查選手等待情況，決定模式（階段性策略）
  const forcePlayers = availablePlayers.filter(p => (p.waitingTurns || 0) >= 5); // 改為5輪才強制
  const urgentPlayers = availablePlayers.filter(p => (p.waitingTurns || 0) >= 4); // 改為4輪才緊急
  const maxWaitingTurns = Math.max(...availablePlayers.map(p => p.waitingTurns || 0));
  
  const isForceMode = forcePlayers.length > 0;
  const isEmergencyMode = urgentPlayers.length > 0;
  
  if (isForceMode) {
    console.log(`💥【強制上場模式】發現 ${forcePlayers.length} 位選手等待≥5輪: ${forcePlayers.map(p => `${p.name}(${p.waitingTurns}輪)`).join(', ')}`);
  } else if (isEmergencyMode) {
    console.log(`🚨【緊急模式啟動】發現 ${urgentPlayers.length} 位選手等待≥4輪: ${urgentPlayers.map(p => `${p.name}(${p.waitingTurns}輪)`).join(', ')}`);
  }
  
  // 按等級分組
  const levelGroups = {
    A: availablePlayers.filter(p => (p.newLevel || 'B') === 'A'),
    B: availablePlayers.filter(p => (p.newLevel || 'B') === 'B'),
    C: availablePlayers.filter(p => (p.newLevel || 'B') === 'C')
  };
  
  
  let bestCombination = null;
  let bestPriority = 999;
  let bestWaitingScore = -Infinity;
  let samePriorityCombinations = []; // 儲存相同優先級的組合
  
  // 生成所有可能的4人組合
  const allCombinations = [];
  function generateCombinations(players, current = [], start = 0) {
    if (current.length === 4) {
      allCombinations.push([...current]);
      return;
    }
    
    for (let i = start; i < players.length; i++) {
      current.push(players[i]);
      generateCombinations(players, current, i + 1);
      current.pop();
    }
  }
  
  generateCombinations(availablePlayers);
  
  // 評估每個組合
  for (const combination of allCombinations) {
    const priority = getABCCombinationPriority(combination, isEmergencyMode, isForceMode);
    
    if (priority === 0) continue; // 跳過不合法組合
    
    // 計算綜合分數（考慮等待輪次和剛下場狀態）
    const waitingScore = combination.reduce((sum, p) => {
      const turns = p.waitingTurns || 0;
      const justFinishedPenalty = p.justFinished ? -20 : 0; // 剛下場選手優先級降低
      return sum + (turns * turns) + justFinishedPenalty;
    }, 0);
    
    // 🚨 三階段模式：權重邏輯切換
    let effectivePriority, effectiveWaitingScore;
    
    if (isForceMode) {
      // 強制模式：絕對優先等待≥5輪的選手
      const forcePlayersInCombination = combination.filter(p => (p.waitingTurns || 0) >= 5).length;
      effectivePriority = -(forcePlayersInCombination * 10000 + waitingScore); // 強制選手絕對優先
      effectiveWaitingScore = priority;
    } else if (isEmergencyMode) {
      // 緊急模式（4輪）：階段性混合策略
      let abcProbability;
      if (maxWaitingTurns <= 4) {
        abcProbability = 0.5; // 4輪：50% ABC優先
      } else {
        abcProbability = 0.3; // 5輪以上：30% ABC優先
      }
      
      const useABCPriority = Math.random() < abcProbability;
      
      if (useABCPriority) {
        effectivePriority = priority;       // ABC優先級作為主要因子
        effectiveWaitingScore = waitingScore; // 等待分數作為次要因子
        console.log(`🎯【階段性策略-緊急】${maxWaitingTurns}輪最高，選擇ABC優先模式(${Math.round(abcProbability*100)}%機率)`);
      } else {
        effectivePriority = -waitingScore; // 等待分數越高，優先級越高
        effectiveWaitingScore = priority;   // ABC優先級作為次要因子
        console.log(`⏰【階段性策略-緊急】${maxWaitingTurns}輪最高，選擇等待優先模式(${Math.round((1-abcProbability)*100)}%機率)`);
      }
    } else if (maxWaitingTurns >= 3) {
      // 3輪等待階段：80% ABC優先（有利純同等級組合AAAA, BBBB, CCCC出現）
      const useABCPriority = Math.random() < 0.8;
      
      if (useABCPriority) {
        effectivePriority = priority;
        effectiveWaitingScore = waitingScore;
        console.log(`✨【階段性策略-預警】3輪等待，選擇ABC優先模式(80%機率)`);
      } else {
        effectivePriority = -waitingScore;
        effectiveWaitingScore = priority;
        console.log(`⚠️【階段性策略-預警】3輪等待，選擇等待優先模式(20%機率)`);
      }
    } else {
      // 一般模式：ABC配對權重 > 等待輪次權重
      effectivePriority = priority;       // ABC優先級作為主要因子
      effectiveWaitingScore = waitingScore; // 等待分數作為次要因子
    }
    
    // 選擇更好的組合
    if (effectivePriority < bestPriority) {
      // 找到更高優先級的組合，重置所有候選
      bestPriority = effectivePriority;
      bestWaitingScore = effectiveWaitingScore;
      bestCombination = [...combination];
      samePriorityCombinations = [{combination: [...combination], waitingScore: effectiveWaitingScore}];
      
      const levels = combination.map(p => p.newLevel || 'B').sort().join('');
      const waitingInfo = combination.map(p => {
        const status = p.justFinished ? '剛下場' : `等待${p.waitingTurns || 0}輪`;
        return `${p.name}(${status})`;
      }).join(', ');
    } else if (effectivePriority === bestPriority) {
      if (effectiveWaitingScore > bestWaitingScore) {
        // 相同優先級但次要分數更高
        bestWaitingScore = effectiveWaitingScore;
        bestCombination = [...combination];
        samePriorityCombinations = [{combination: [...combination], waitingScore: effectiveWaitingScore}];
        
        const levels = combination.map(p => p.newLevel || 'B').sort().join('');
        const waitingInfo = combination.map(p => {
          const status = p.justFinished ? '剛下場' : `等待${p.waitingTurns || 0}輪`;
          return `${p.name}(${status})`;
        }).join(', ');
      } else if (effectiveWaitingScore === bestWaitingScore) {
        // 相同優先級和分數，加入候選池
        samePriorityCombinations.push({combination: [...combination], waitingScore: effectiveWaitingScore});
      }
    }
  }
  
  if (bestCombination) {
    // 如果有多個相同品質的組合，隨機選擇
    if (samePriorityCombinations.length > 1) {
      const randomIndex = Math.floor(Math.random() * samePriorityCombinations.length);
      bestCombination = samePriorityCombinations[randomIndex].combination;
    }
    
    const levels = bestCombination.map(p => p.newLevel || 'B').sort().join('');
    const waitingInfo = bestCombination.map(p => {
      const status = p.justFinished ? '剛下場' : `等待${p.waitingTurns || 0}輪`;
      return `${p.name}(${status})`;
    }).join(', ');
    
    // 添加配對模式的詳細日誌
    const finalPriority = getABCCombinationPriority(bestCombination, isEmergencyMode, isForceMode);
    
    if (isForceMode) {
      const forceInCombination = bestCombination.filter(p => (p.waitingTurns || 0) >= 4);
      console.log(`💥【強制模式結果】成功選中 ${forceInCombination.length} 位等待≥4輪選手: ${forceInCombination.map(p => `${p.name}(${p.waitingTurns}輪)`).join(', ')}`);
      
      if (finalPriority === 2) {
        console.log(`⚠️【次要組合啟用】因強制上場使用次要組合: ${levels}`);
      }
    } else if (isEmergencyMode) {
      const urgentInCombination = bestCombination.filter(p => (p.waitingTurns || 0) >= 3);
      console.log(`🚨【緊急模式結果-混合策略】成功選中 ${urgentInCombination.length} 位等待≥3輪選手: ${urgentInCombination.map(p => `${p.name}(${p.waitingTurns}輪)`).join(', ')}`);
      
      if (finalPriority === 2) {
        console.log(`⚠️【次要組合啟用】因緊急情況使用次要組合: ${levels}`);
      } else if (finalPriority === 1) {
        console.log(`✅【正常組合保持】混合策略下仍使用正常組合: ${levels}`);
      }
    } else if (finalPriority === 3) {
      // 一般模式下使用了次要組合
      console.log(`💡【次要組合啟用】一般模式下使用次要組合: ${levels} (無法形成正常組合)`);
    }
    
    console.log(`【ABC配對結果】${levels} 組合：${bestCombination.map(p => p.name).join(', ')}`);
    
    
    return bestCombination;
  } else {
    return null;
  }
}

/* 
  新版等級配對函數 - 按照新規則
  1. ±1.5 為絕對規則，無法滿足時返回 null
  2. 加上放寬確認提示
*/
// 【已廢棄】此函數使用舊的數值等級 ±1.5 規則，已被 ABC 配對系統取代
async function findOptimalCombinationNewRule(playerPool) {
  if (playerPool.length < 4) {
    return null;
  }

  
  let bestCombination = null;
  let bestScore = Infinity;
  let currentCombination = [];
  let testedCombinations = 0;

  function evaluateCombination(comb) {
    testedCombinations++;
    let bestLocalScore = Infinity;
    let bestPairing = null;
    let pairings = [
      [[0, 1], [2, 3]],  // AB vs CD
      [[0, 2], [1, 3]],  // AC vs BD  
      [[0, 3], [1, 2]]   // AD vs BC
    ];

    // 只顯示前幾個組合的詳細資訊，避免過多日誌
    const showDetails = testedCombinations <= 3;
    
    if (showDetails) {
    }

    for (let pairing of pairings) {
      let team1 = [comb[pairing[0][0]], comb[pairing[0][1]]];
      let team2 = [comb[pairing[1][0]], comb[pairing[1][1]]];
      let team1Sum = team1[0].level + team1[1].level;
      let team2Sum = team2[0].level + team2[1].level;
      let levelDiff = Math.abs(team1Sum - team2Sum);

      if (showDetails) {
      }

      // 絕對規則：兩隊等級相加差異必須 ≤ 1.5
      if (levelDiff <= 1.5) {
        if (showDetails) {
        }
        
        // 計算等待輪數優先分數
        let waitingScore = 0;
        for (let player of comb) {
          waitingScore -= (player.waitingTurns || 0) * (player.waitingTurns || 0);
        }
        
        let score = waitingScore * 100 + levelDiff; // 等待輪次權重更高

        if (score < bestLocalScore) {
          bestLocalScore = score;
          bestPairing = [team1[0], team1[1], team2[0], team2[1]];
        }
      } else if (showDetails) {
      }
    }
    
    return { score: bestLocalScore, pairing: bestPairing, hasValidPairing: bestPairing !== null };
  }

  function backtrack(start) {
    if (currentCombination.length === 4) {
      let result = evaluateCombination(currentCombination);
      if (result.hasValidPairing && result.score < bestScore) {
        bestScore = result.score;
        bestCombination = result.pairing.slice();
      }
      return;
    }
    
    for (let i = start; i < playerPool.length; i++) {
      currentCombination.push(playerPool[i]);
      backtrack(i + 1);
      currentCombination.pop();
    }
  }

  backtrack(0);


  if (bestCombination) {
    return bestCombination;
  } else {
    // 無法滿足等級規則，詢問是否放寬標準
    
    // 根據規則：只顯示通知，只能按OK，立即開始放寬標準配對
    alert('即將單次放寬組合標準以利進行組隊');
    
    // 放寬標準：隨機選擇4人
    const shuffled = [...playerPool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 4);
  }
}

/* 
  放寬標準的組合尋找函式 - 無視等級差異限制
  僅考慮等待輪數和場次優先級
*/
// 【已廢棄】此函數使用舊的數值等級規則，已被 ABC 配對系統取代
function findOptimalCombinationRelaxed(sortedReady, lastCombination) {
  function internalFindOptimalCombination(pool) {
    let bestCombination = null;
    let bestScore = Infinity;
    let currentCombination = [];

    function evaluateCombination(comb) {
      // 放寬標準：無視等級差異，僅考慮等待輪數
      let bestLocalScore = Infinity;
      let bestPairing = null;
      let pairings = [
        [
          [0, 1],
          [2, 3],
        ],
        [
          [0, 2],
          [1, 3],
        ],
        [
          [0, 3],
          [1, 2],
        ],
      ];
      
      for (let pairing of pairings) {
        let team1 = [comb[pairing[0][0]], comb[pairing[0][1]]];
        let team2 = [comb[pairing[1][0]], comb[pairing[1][1]]];

        // 計算等待輪數分數：等待輪數越高的選手優先度越高
        let waitingScoreTeam1 = team1.reduce((sum, p) => {
          const turns = p.waitingTurns || 0;
          return sum - turns * turns; // 等待輪數越高，分數越低（優先度越高）
        }, 0);

        let waitingScoreTeam2 = team2.reduce((sum, p) => {
          const turns = p.waitingTurns || 0;
          return sum - turns * turns;
        }, 0);

        let waitingTurnsSum = waitingScoreTeam1 + waitingScoreTeam2;

        // 放寬標準評分：主要考慮等待輪數，無等級差異限制
        let score = waitingTurnsSum * 10;

        if (score < bestLocalScore) {
          bestLocalScore = score;
          bestPairing = [team1[0], team1[1], team2[0], team2[1]];
        }
      }
      return { score: bestLocalScore, pairing: bestPairing };
    }

    function backtrack(start) {
      if (currentCombination.length === 4) {
        let result = evaluateCombination(currentCombination);
        if (result.pairing && result.score < bestScore) {
          bestScore = result.score;
          bestCombination = result.pairing.slice();
        }
        return;
      }
      for (let i = start; i < pool.length; i++) {
        currentCombination.push(pool[i]);
        backtrack(i + 1);
        currentCombination.pop();
      }
    }
    backtrack(0);
    return bestCombination;
  }

  // 放寬標準：直接尋找最佳組合，無等級差異限制
  return internalFindOptimalCombination(sortedReady);
}

/*
  純等級配對函數：只考慮等級平衡，完全忽略等待輪次
  專門用於規則三（場次相同時的等級配對）
*/
// 【已廢棄】此函數使用舊的數值等級規則，已被 ABC 配對系統取代
function findOptimalCombinationLevelOnly(pool) {
  function internalFindOptimalCombination(playerPool, threshold = 1.5) {
    let bestCombination = null;
    let bestScore = Infinity;
    let currentCombination = [];

    function evaluateCombination(comb) {
      let bestLocalScore = Infinity;
      let bestPairing = null;
      let pairings = [
        [[0, 1], [2, 3]],
        [[0, 2], [1, 3]], 
        [[0, 3], [1, 2]]
      ];
      
      for (let pairing of pairings) {
        let team1 = [comb[pairing[0][0]], comb[pairing[0][1]]];
        let team2 = [comb[pairing[1][0]], comb[pairing[1][1]]];
        let team1Sum = team1[0].level + team1[1].level;
        let team2Sum = team2[0].level + team2[1].level;
        let levelDiff = Math.abs(team1Sum - team2Sum);

        // 只考慮等級差異，完全忽略等待輪次
        if (levelDiff <= threshold) {
          // 分數只基於等級差異，數值越小越好
          let score = levelDiff;

          if (score < bestLocalScore) {
            bestLocalScore = score;
            bestPairing = [team1[0], team1[1], team2[0], team2[1]];
          }
        }
      }
      return { score: bestLocalScore, pairing: bestPairing };
    }

    function backtrack(start) {
      if (currentCombination.length === 4) {
        let result = evaluateCombination(currentCombination);
        if (result.pairing && result.score < bestScore) {
          bestScore = result.score;
          bestCombination = result.pairing.slice();
        }
        return;
      }
      for (let i = start; i < playerPool.length; i++) {
        currentCombination.push(playerPool[i]);
        backtrack(i + 1);
        currentCombination.pop();
      }
    }
    
    backtrack(0);
    return bestCombination;
  }

  // 先嘗試嚴格規則（±1.5），失敗則放寬到（±3.0）
  let result = internalFindOptimalCombination(pool, 1.5);
  if (!result) {
    result = internalFindOptimalCombination(pool, 3.0);
  }
  return result;
}

/*
  新排場邏輯：根據準備區人數選擇選手
  完全按照新規則實作，不保留舊規則邏輯
*/
// 【已廢棄】此函數使用舊的選手選擇邏輯，已被 ABC 配對系統取代
function selectPlayersForMatch() {
  // 分離準備區中的非剛下場和剛下場選手
  const readyNonFinished = readyPlayers.filter(p => !p.justFinished);
  const readyJustFinished = readyPlayers.filter(p => p.justFinished);
  
  
  const readyCount = readyNonFinished.length;
  
  // 根據準備區人數決定使用哪種情況
  if (readyCount >= 1 && readyCount <= 4) {
    // 情況一：準備區 1-4 人
    return selectPlayersScenarioOne(readyNonFinished, readyJustFinished);
  } else if (readyCount >= 5) {
    // 情況二：準備區 5 人以上
    return selectPlayersScenarioTwo(readyNonFinished, readyJustFinished);
  } else {
    // 準備區無選手（只有剛下場），返回null
    return null;
  }
}

/*
  輔助函數：從準備區選手中選擇指定數量的選手
  按新規則：等待輪次最高優先，相同時隨機選擇
  整合等待保護機制：等待≥2輪的選手有絕對優先權
*/
function selectFromReadyPlayers(readyPlayers, count) {
  if (readyPlayers.length <= count) {
    return [...readyPlayers]; // 不足時全部選上
  }
  
  // ⭐ 等待保護機制：檢查是否有選手等待≥2輪
  const urgentPlayers = readyPlayers.filter(p => (p.waitingTurns || 0) >= 2);
  
  if (urgentPlayers.length > 0) {
    
    // 如果等待≥2輪的選手數量 >= 需要的數量，優先選擇他們
    if (urgentPlayers.length >= count) {
      // 按等待輪次排序，選出最需要的
      urgentPlayers.sort((a, b) => {
        if ((a.waitingTurns || 0) !== (b.waitingTurns || 0)) {
          return (b.waitingTurns || 0) - (a.waitingTurns || 0); // 等待輪次高的優先
        }
        return Math.random() - 0.5; // 相同時隨機
      });
      const selected = urgentPlayers.slice(0, count);
      return selected;
    } else {
      // 等待≥2輪的選手不足，全部選上並補充其他選手
      let selected = [...urgentPlayers];
      const remainingPlayers = readyPlayers.filter(p => !urgentPlayers.includes(p));
      
      // 按等待輪次對剩餘選手排序
      remainingPlayers.sort((a, b) => {
        if ((a.waitingTurns || 0) !== (b.waitingTurns || 0)) {
          return (b.waitingTurns || 0) - (a.waitingTurns || 0);
        }
        return Math.random() - 0.5;
      });
      
      const needed = count - selected.length;
      selected.push(...remainingPlayers.slice(0, needed));
      return selected;
    }
  }
  
  // 沒有等待≥2輪的選手，按正常邏輯選擇
  const waitingGroups = {};
  readyPlayers.forEach(player => {
    const waiting = player.waitingTurns || 0;
    if (!waitingGroups[waiting]) {
      waitingGroups[waiting] = [];
    }
    waitingGroups[waiting].push(player);
  });
  
  const waitingLevels = Object.keys(waitingGroups).map(Number).sort((a, b) => b - a);
  let selected = [];
  
  for (const level of waitingLevels) {
    const playersAtLevel = waitingGroups[level];
    const needed = count - selected.length;
    
    if (needed <= 0) break;
    
    if (playersAtLevel.length <= needed) {
      selected.push(...playersAtLevel);
    } else {
      const shuffled = [...playersAtLevel].sort(() => Math.random() - 0.5);
      selected.push(...shuffled.slice(0, needed));
    }
  }
  
  return selected;
}

/*
  情況一：準備區 1-4 人的選手選擇邏輯（按新規則）
*/
// 【已廢棄】此函數使用舊的選手選擇邏輯，已被 ABC 配對系統取代
function selectPlayersScenarioOne(readyNonFinished, justFinishedPlayers) {
  const readyCount = readyNonFinished.length;
  let selectedPlayers = [];
  
  
  // 剛下場選手隨機排序
  const shuffledJustFinished = [...justFinishedPlayers].sort(() => Math.random() - 0.5);
  
  switch (readyCount) {
    case 1:
      // 準備區1人 + 剛下場4人取3人 = 總共4人
      selectedPlayers = [...readyNonFinished]; // 1人全上
      selectedPlayers.push(...shuffledJustFinished.slice(0, 3)); // 剛下場隨機取3人
      break;
      
    case 2:
      // 準備區2人 + 剛下場4人取2人 = 總共4人
      selectedPlayers = [...readyNonFinished]; // 2人全上
      selectedPlayers.push(...shuffledJustFinished.slice(0, 2)); // 剛下場隨機取2人
      break;
      
    case 3:
      // 準備區3人取2人 + 剛下場4人取2人 = 總共4人
      // 準備區選擇：等待輪次最高或隨機
      const readySelected = selectFromReadyPlayers(readyNonFinished, 2);
      selectedPlayers = readySelected;
      selectedPlayers.push(...shuffledJustFinished.slice(0, 2)); // 剛下場隨機取2人
      break;
      
    case 4:
      // 準備區4人取3人 + 剛下場4人取1人 = 總共4人
      // 準備區選擇：等待輪次最高或隨機
      const readySelected4 = selectFromReadyPlayers(readyNonFinished, 3);
      selectedPlayers = readySelected4;
      selectedPlayers.push(...shuffledJustFinished.slice(0, 1)); // 剛下場隨機取1人
      break;
  }
  
  return selectedPlayers;
}

/*
  情況二：準備區 5 人以上的選手選擇邏輯（按新規則）
*/
// 【已廢棄】此函數使用舊的選手選擇邏輯，已被 ABC 配對系統取代
function selectPlayersScenarioTwo(readyNonFinished, justFinishedPlayers) {
  const readyCount = readyNonFinished.length;
  let selectedPlayers = [];
  
  
  // 剛下場選手隨機排序
  const shuffledJustFinished = [...justFinishedPlayers].sort(() => Math.random() - 0.5);
  
  if (readyCount === 5) {
    // 準備區5人取3人 + 剛下場4人取1人 = 總共4人
    const readySelected = selectFromReadyPlayers(readyNonFinished, 3);
    selectedPlayers = readySelected;
    selectedPlayers.push(...shuffledJustFinished.slice(0, 1)); // 剛下場隨機取1人
    
  } else if (readyCount >= 6) {
    // 準備區6人以上取4人，剛下場全下
    // 🎯 新版動態選人機制：臨界值8人啟動動態保護
    
    const waitingTwoOrMore = readyNonFinished.filter(p => (p.waitingTurns || 0) >= 2);
    const waitingLess = readyNonFinished.filter(p => (p.waitingTurns || 0) < 2);
    
    
    // 🎯 臨界值判斷：準備區≥8人且有等待≥2輪選手時，啟動動態選人機制
    if (readyCount >= 8 && waitingTwoOrMore.length > 0) {
      
      // 動態決定優先選擇數量
      let priorityCount;
      if (waitingTwoOrMore.length >= 6) {
        priorityCount = 3;  // 6人以上選3人
      } else if (waitingTwoOrMore.length >= 4) {
        priorityCount = 3;  // 4-5人選3人  
      } else if (waitingTwoOrMore.length >= 2) {
        priorityCount = 2;  // 2-3人選2人
      } else {
        priorityCount = 1;  // 1人選1人
      }
      
      
      // 按等待輪次排序，優先選擇等待最久的
      const sortedWaiting = [...waitingTwoOrMore].sort((a, b) => {
        if ((a.waitingTurns || 0) !== (b.waitingTurns || 0)) {
          return (b.waitingTurns || 0) - (a.waitingTurns || 0); // 等待輪次高的優先
        }
        return Math.random() - 0.5; // 相同輪次時隨機
      });
      
      selectedPlayers.push(...sortedWaiting.slice(0, priorityCount));
      
      // 從剩餘選手中補充
      const remainingPlayers = readyNonFinished.filter(p => !selectedPlayers.includes(p));
      const shuffledRemaining = [...remainingPlayers].sort(() => Math.random() - 0.5);
      const needed = 4 - selectedPlayers.length;
      selectedPlayers.push(...shuffledRemaining.slice(0, needed));
      
      
    } else {
      // 人數<8人或無等待≥2輪選手，使用原始固定邏輯
      
      if (waitingTwoOrMore.length >= 2) {
        // 固定選2人邏輯
        const shuffledWaitingTwo = [...waitingTwoOrMore].sort(() => Math.random() - 0.5);
        selectedPlayers.push(...shuffledWaitingTwo.slice(0, 2));
        
        const remainingPlayers = readyNonFinished.filter(p => !selectedPlayers.includes(p));
        const shuffledRemaining = [...remainingPlayers].sort(() => Math.random() - 0.5);
        const needed = 4 - selectedPlayers.length;
        selectedPlayers.push(...shuffledRemaining.slice(0, needed));
        
        
      } else if (waitingTwoOrMore.length === 1) {
        selectedPlayers.push(...waitingTwoOrMore);
        
        const remainingPlayers = readyNonFinished.filter(p => !selectedPlayers.includes(p));
        const shuffledRemaining = [...remainingPlayers].sort(() => Math.random() - 0.5);
        selectedPlayers.push(...shuffledRemaining.slice(0, 3));
        
        
      } else {
        const readySelected = selectFromReadyPlayers(readyNonFinished, 4);
        selectedPlayers = readySelected;
      }
    }
    
  }
  
  return selectedPlayers;
}

// 添加特殊標記清除和修正函數
function clearOldJustFinishedMarks() {
  // 檢查預備區中所有選手的特殊標記和修正不一致狀態

  // 首先檢查並統計目前預備區選手的狀態
  const justFinishedCount = readyPlayers.filter((p) => p.justFinished).length;
  const waitingTurnsOneCount = readyPlayers.filter(
    (p) => p.waitingTurns === 1
  ).length;
  const waitingTurnsTwoCount = readyPlayers.filter(
    (p) => p.waitingTurns >= 2
  ).length;


  // 1. 處理「升級」剛下場選手 - 如果有其他選手比他們等待更久，則不該再是「剛」下場
  let maxWaiting = 0;
  readyPlayers.forEach((p) => {
    if (p.waitingTurns > maxWaiting) maxWaiting = p.waitingTurns;
  });

  // 如果有選手等待超過1輪，則把所有「剛下場」標記取消
  // 但只記錄操作，不真正增加等待輪數（等待輪數會在後續增加邏輯中統一處理）
  if (maxWaiting >= 2) {
    readyPlayers.forEach((player) => {
      if (player.justFinished) {
        // 只清除標記，不改變等待輪數（避免被處理兩次）
        player.justFinished = false;
        // 添加一個標記，表示這個選手剛被處理過
        player.justClearedFinished = true;
      }
    });
  }
  // 如果沒有選手等待超過1輪，則保持剛下場標記不變

  // 2. 檢查剛下場標記與等待輪數的一致性
  const anomalyPlayers = readyPlayers.filter(
    (p) =>
      (p.justFinished && p.waitingTurns > 0) || // 剛下場但等待輪數>0
      (!p.justFinished &&
        !p.justClearedFinished &&
        p.waitingTurns === 0 &&
        !p.justJoinedReady) // 不是剛下場、不是剛被清除剛下場標記、不是剛加入，但等待輪數為0
  );

  if (anomalyPlayers.length > 0) {
    console.warn(
      `發現 ${anomalyPlayers.length} 名選手的等待狀態不一致，進行修正`
    );
    anomalyPlayers.forEach((p) => {
      if (p.justFinished && p.waitingTurns > 0) {
        console.warn(
          `- 選手 ${p.name}: 剛下場標記=true，但等待輪數=${p.waitingTurns}，清除剛下場標記`
        );
        p.justFinished = false;
        // 添加標記表示剛被處理過
        p.justClearedFinished = true;
      } else if (
        !p.justFinished &&
        !p.justClearedFinished &&
        p.waitingTurns === 0 &&
        !p.justJoinedReady
      ) {
        console.warn(`- 選手 ${p.name}: 無特殊標記但等待輪數=0，設為等待1輪`);
        p.waitingTurns = 1;
      }
    });
  }
}

// 修改 generateMatches，實現「排場後未被選中則等待輪數+1」邏輯
async function generateMatches() {
  // 在生成比賽前，先清除不再適用的 justFinished 標記
  clearOldJustFinishedMarks();

  // 記錄排場前在預備區的所有選手名單 - 不在此處更新等待輪次
  const readyPlayersBeforeMatch = [...readyPlayers];

  // 檢查預備區的選手情況，以便於偵錯
  const justFinishedCount = readyPlayers.filter((p) => p.justFinished).length;
  const longWaitingCount = readyPlayers.filter(
    (p) => (p.waitingTurns || 0) >= 2
  ).length;

  if (justFinishedCount > 0 || longWaitingCount > 0) {
  }

  // 為每個空場地生成比賽（只處理啟用的場地）
  let hasNewMatches = false;
  for (let i = 0; i < courts.length; i++) {
    // 跳過被禁用的場地
    if (!courtEnabled[i]) continue;

    let result = await generateMatchForCourtImmediate(i);
    if (result) hasNewMatches = true;
  }

  // 添加詳細調試信息


  // 使用統一的等待輪次更新函數
  updateWaitingTurnsAfterMatch(readyPlayersBeforeMatch, hasNewMatches);

  // 如果有新對戰，播報新對戰
  if (hasNewMatches) {
    setTimeout(() => {
      announceAllCourts();
    }, 1000);
    
    // 更新下輪預告
    updateNextMatchPrediction();
    
    // 隱藏開始排場按鈕（只在第一次使用）並顯示永久預告
    const startButton = document.querySelector('button[onclick="generateMatches()"]');
    if (startButton) {
      startButton.style.display = 'none';
      
      // 顯示永久預告區域（如果有預測內容）
      if (nextMatchDecision) {
        const predictionNames = nextMatchDecision.map(p => p.name).join(', ');
        updatePermanentPrediction(predictionNames);
      }
    }
  } else {
    // 沒有新的比賽被安排，但預備區選手等待輪數已增加
  }
  
  // 自動保存遊戲狀態
  if (hasNewMatches) {
    saveGameState();
  }
}

// 獨立的等待輪次更新函數
function updateWaitingTurnsAfterMatch(readyPlayersBeforeMatch, hasNewMatches) {
  
  // 檢查哪些選手上場了（排場前在預備區但排場後不在）
  const playersSelected = readyPlayersBeforeMatch.filter(
    (beforePlayer) =>
      !readyPlayers.some(
        (afterPlayer) => afterPlayer.name === beforePlayer.name
      )
  );

  // 每次排場後都需要更新等待輪次，不論是否有新比賽產生
  // 因為即使沒有新比賽，等待中的選手仍然應該增加等待輪次
  if (hasNewMatches) {
  }
  
  // 首先清除所有留在預備區選手的「剛加入」和「剛處理」標記
  // 這樣在增加等待輪數時，這些選手將被視為正常選手
  let clearedJustJoinedCount = 0;
  let clearedJustProcessedCount = 0;
  readyPlayers.forEach((player) => {
    if (player.justJoinedReady) {
      player.justJoinedReady = false;
      clearedJustJoinedCount++;
    }
    // 清除剛處理標記，讓所有選手都能正常增加等待輪次
    if (player.justProcessed) {
      delete player.justProcessed;
      clearedJustProcessedCount++;
    }
  });
  

  // 無論是否有新對戰，都增加未被選上場選手的等待輪數
  // 排場完成後，增加未被選中選手的等待輪數
  // 這是根據新邏輯：「排場後沒有上場 = 需要等待一輪才有機會上場」
  let updatedCount = 0;

  // 重點：在清除剛加入標記後處理等待輪數

  readyPlayers.forEach((player, index) => {
    // 打印詳細的選手狀態

    // 應該都是 false 了

    // 處理不同狀態選手的等待輪數邏輯
    // 注意：justProcessed 標記已在前面清除，所以不需要檢查
    if (player.justFinished) {
      // 如果是標記為剛下場的選手
      if (player.waitingTurns === 0) {
        // 正常剛下場選手，從剛下場變為等待1輪
        player.justFinished = false; // 清除剛下場標記
        player.waitingTurns = 1; // 升級為等待1輪

        updatedCount++;
      } else if (player.waitingTurns === 1) {
        // 先前是剛下場但已變為等待1輪，保持不變

        player.justFinished = false; // 清除過期標記
      } else {
        // 異常情況：剛下場但等待輪數>1，清除標記

        player.justFinished = false;
      }
    } else if (player.justClearedFinished) {
      // 這是剛被clearOldJustFinishedMarks函數處理過的選手
      // 表示原本是剛下場，但標記已被清除，現在應變為等待1輪
      player.waitingTurns = 1; // 設為等待1輪

      updatedCount++;

      // 清除臨時標記，避免多次處理
      delete player.justClearedFinished;
    } else {
      // 正常等待選手，增加等待輪數
      const oldValue = player.waitingTurns || 0;
      player.waitingTurns = oldValue + 1;
      updatedCount++;
    }
  });

  // 最終檢查：確認所有選手都有 waitingTurns 屬性
  const missingWaitingTurns = readyPlayers.filter(
    (p) => p.waitingTurns === undefined
  );
  if (missingWaitingTurns.length > 0) {
    console.warn(
      `警告: ${missingWaitingTurns.length} 名選手缺少 waitingTurns 屬性，現已修正`
    );
    missingWaitingTurns.forEach((p) => {
      p.waitingTurns = 0;
      console.warn(`- 已為選手 ${p.name} 初始化 waitingTurns=0`);
    });
  }

  // 排場完成後最終狀態統計

  // 打印所有選手的最終狀態
  const finalStatus = readyPlayers.map((player) => {
    return {
      name: player.name,
      waitingTurns: player.waitingTurns || 0,
      justFinished: player.justFinished || false,
      justJoinedReady: player.justJoinedReady || false,
      matches: player.matches,
    };
  });

  console.table(finalStatus);

  // 等待輪數統計
  const waitingStats = {
    0: readyPlayers.filter((p) => (p.waitingTurns || 0) === 0).length,
    1: readyPlayers.filter((p) => (p.waitingTurns || 0) === 1).length,
    2: readyPlayers.filter((p) => (p.waitingTurns || 0) === 2).length,
    3: readyPlayers.filter((p) => (p.waitingTurns || 0) >= 3).length,
  };
  

  // 更新界面以顯示新的等待輪數
  updateLists();
}

// 修改 generateMatchForCourtImmediate 函數 - 使用新規則
async function generateMatchForCourtImmediate(courtIndex) {
  // 檢查場地是否啟用
  if (!courtEnabled[courtIndex]) {
    alert(`場地 ${courtIndex + 1} 目前已關閉`);
    return null;
  }

  // 使用所有預備區的選手（包含剛下場的）
  let pool = readyPlayers;
  let candidatePool;

  // 【修改後邏輯】檢查是否出現預備區選手循環情況
  // 過濾出非剛下場的選手（真正等待的選手）
  const nonJustFinishedPlayers = readyPlayers.filter((p) => !p.justFinished);


  // 判斷非剛下場選手的數量是否符合檢測條件（僅在4人以下時檢測）
  if (nonJustFinishedPlayers.length <= 4 && nonJustFinishedPlayers.length > 0) {
    // 獲取當前非剛下場選手的名稱列表
    const currentNonJustFinishedNames = nonJustFinishedPlayers
      .map((p) => p.name)
      .sort();
    const currentNonJustFinishedNamesStr =
      currentNonJustFinishedNames.join(",");
    

    // 修改檢測邏輯：記錄前2次出現過的組合，以檢測交替循環模式
    // 全局變數定義（保存倒數第二次的組合）
    if (!window.prevPrevReadyNames) {
      window.prevPrevReadyNames = [];
    }

    // 檢查是否與上次相同或與上上次相同（檢測交替循環）
    const matchesLastGroup = currentNonJustFinishedNamesStr === lastReadyPlayersNames.join(",");
    const matchesPrevPrevGroup = currentNonJustFinishedNamesStr === window.prevPrevReadyNames.join(",");
    
    if (matchesLastGroup || matchesPrevPrevGroup) {
      // 如果與上次或上上次組合相同，增加計數
      readyPlayersCycleCount++;
      if (matchesPrevPrevGroup) {
      }
    } else {
      // 選手組合已變化但不重置計數，只在計數達到一定閾值後重置
      // 這樣可以在交替循環模式中仍然積累足夠的計數
      if (readyPlayersCycleCount > 3) {
        readyPlayersCycleCount = 0;
      }
      
      // 保存前一次的組合為上上次組合
      window.prevPrevReadyNames = [...lastReadyPlayersNames];
      // 更新上次組合
      lastReadyPlayersNames = [...currentNonJustFinishedNames];
    }
  } else {
    readyPlayersCycleCount = 0;
    lastReadyPlayersNames = [];
    if (window.prevPrevReadyNames) {
      window.prevPrevReadyNames = [];
    }
  }

  if (pool.length < 4) {
    // 只在用戶主動按"開始排場"時才顯示警告，endMatch中調用時不顯示
    if (courtIndex !== undefined) {
      // 移除 console.log
    } else {
      alert("預備區至少需要4人才可開始排場！");
    }
    return null;
  }

  // 全新排序邏輯：等待1輪與剛下場同等優先級，等待2輪以上絕對優先
  let sortedReady = [...pool].sort((a, b) => {
    // 計算等待狀態分數
    // 剛下場 = 0分, 等待1輪 = 0分, 等待2輪 = -10分, 等待3輪 = -20分（負分表示優先）
    const getWaitingScore = (player) => {
      if (player.justFinished) return 0; // 剛下場
      const waiting = player.waitingTurns || 0;
      if (waiting <= 1) return 0; // 等待0-1輪都視為同等
      return -(waiting - 1) * 10; // 等待2輪以上，每多一輪優先度大幅提升
    };
    
    const aScore = getWaitingScore(a);
    const bScore = getWaitingScore(b);
    
    // 1. 首先比較等待分數（等待2輪以上的絕對優先）
    if (aScore !== bScore) return aScore - bScore;
    
    // 2. 等待分數相同時（都是剛下場或等待1輪），加入隨機性
    // 場次數差異在1以內時，視為相近，用隨機決定
    if (Math.abs(a.matches - b.matches) <= 1) {
      return Math.random() - 0.5;
    }
    
    // 3. 場次數差異大於1時，場次少的優先
    if (a.matches !== b.matches) return a.matches - b.matches;
    
    // 4. 其他情況考慮 ABC 等級 (A=1, B=2, C=3 for sorting)
    const getLevelOrder = (player) => {
      const level = player.newLevel || 'B';
      return level === 'A' ? 1 : level === 'B' ? 2 : 3;
    };
    if (getLevelOrder(a) !== getLevelOrder(b)) {
      return getLevelOrder(a) - getLevelOrder(b);
    }
    
    // 5. 最後隨機
    return Math.random() - 0.5;
  });


  // 直接使用排序後的選手池
  candidatePool = sortedReady;

  // 如果有長時間等待選手，可視情況將其顯示在控制台，幫助偵錯
  const longWaitingPlayers = sortedReady.filter(
    (p) => (p.waitingTurns || 0) >= 2
  );
  if (longWaitingPlayers.length > 0) {
    // 移除 console.log
  }

  // 取得該場地上次的組合
  let lastCombination = lastCombinationByCourt[courtIndex] || [];
  if (courts[courtIndex].length === 0 && candidatePool.length >= 4) {
    
    // 【ABC 嚴格配對系統】完全基於 ABC 等級的選手選擇
    
    let candidate;
    
    // 如果有已決定的配對，使用它
    if (nextMatchDecision && nextMatchDecision.length === 4) {
      // 確認所有選手都還在準備區
      const allInReady = nextMatchDecision.every(p => 
        readyPlayers.some(rp => rp.name === p.name)
      );
      
      if (allInReady) {
        candidate = nextMatchDecision;
        nextMatchDecision = null; // 使用後清除
      }
    }
    
    // 如果沒有已決定的配對，或已決定的配對無效，則重新選擇
    if (!candidate) {
      // 所有可用選手（準備區選手）
      const allAvailablePlayers = [...readyPlayers];
      
      // 使用 ABC 智能選擇
      candidate = selectPlayersWithABCLogic(allAvailablePlayers);
    }
    
    if (candidate && candidate.length === 4) {
      
      // 移除選中的選手
      candidate.forEach((player) => {
        player.justFinished = false;
        player.justJoinedReady = false;
        player.waitingTurns = 0;
        readyPlayers = readyPlayers.filter((p) => p.name !== player.name);
        players = players.filter((p) => p.name !== player.name);
        restingPlayers = restingPlayers.filter((p) => p.name !== player.name);
      });
      
      // 更新配對記錄
      let team1Key = getPairKey(candidate[0].name, candidate[1].name);
      let team2Key = getPairKey(candidate[2].name, candidate[3].name);
      lastPairings = new Set([team1Key, team2Key]);
      
      // 設置比賽開始時間
      const startTime = new Date();
      candidate.forEach((player) => {
        player.currentMatchStartTime = startTime;
      });
      
      // 更新場地資訊
      courts[courtIndex] = candidate;
      lastCombinationByCourt[courtIndex] = candidate;
      courts[courtIndex].startTime = startTime;
      courts[courtIndex].formattedStartTime = formatTime(startTime);
      
      // 更新介面
      updateLists();
      updateCourtsDisplay();
      
      const levels = candidate.map(p => p.newLevel || 'B').sort().join('');
      console.log(`【比賽結果】場地${courtIndex + 1} - ${levels} 組合：${candidate.map(p => p.name).join(', ')}`);
      return candidate;
    } else {
      return null;
    }
  } // 關閉場地檢查的大括號
  
  // 如果 ABC 系統無法找到合法組合，直接返回 null
  return null;
}

// 下場按鈕點擊後，更新該場地的新對戰組合
async function endMatch(courtIndex) {
  if (!confirm("確認 場地" + (courtIndex + 1) + " 下場？")) {
    return;
  }

  // 記錄比賽結束時間
  const endTime = new Date();
  const formattedEndTime = formatTime(endTime);

  // 清除預備區內所有選手的特殊標記
  readyPlayers.forEach((player) => {
    // 清除剛加入標記(如果有)
    if (player.justJoinedReady) {
      player.justJoinedReady = false;
    }

    // 清除過舊的剛下場標記 - 如果選手在預備區有等待輪數，表示已經不是真的"剛"下場了
    if (player.justFinished && player.waitingTurns > 0) {
      player.justFinished = false;
    }
  });

  // 原有處理下場選手的邏輯
  let playersToReady = courts[courtIndex];

  // 計算比賽時長
  const startTime = courts[courtIndex].startTime || new Date(endTime - 600000); // 默認10分鐘
  const durationInfo = getMinutesDiff(startTime, endTime);

  // 保存選手增加場次前的數值（用於歷史記錄）
  const playerBeforeMatches = playersToReady.map((p) => ({
    name: p.name,
    matches: p.matches,
  }));

  // 為每位選手記錄場次時間，無論時長都計入場次
  playersToReady.forEach((player) => {
    // 記錄選手的場次時間
    if (!player.matchDurations) player.matchDurations = [];
    player.matchDurations.push(durationInfo.totalSeconds); // 以秒數形式儲存

    // 直接增加場次
    player.matches++;

    // 計算平均場次時間(以秒計算後轉換為分秒)
    const totalSeconds = player.matchDurations.reduce((sum, d) => sum + d, 0);
    const avgSeconds = Math.round(totalSeconds / player.matchDurations.length);
    player.averageMatchDuration = {
      minutes: Math.floor(avgSeconds / 60),
      seconds: avgSeconds % 60,
    };

    // 清除當前比賽開始時間
    delete player.currentMatchStartTime;
  });

  if (playersToReady.length >= 4) {
    let team1Key = getPairKey(playersToReady[0].name, playersToReady[1].name);
    let team2Key = getPairKey(playersToReady[2].name, playersToReady[3].name);
    updatePairingHistory(team1Key);
    updatePairingHistory(team2Key);
  }

  // 創建時間記錄對象
  const timeRecord = {
    startTime: startTime,
    endTime: endTime,
    formattedStart: formatTime(startTime),
    formattedEnd: formattedEndTime,
    duration: durationInfo.minutes,
    seconds: durationInfo.seconds,
    totalSeconds: durationInfo.totalSeconds,
    courtIndex: courtIndex,
  };

  // 保存到歷史記錄 - 使用存儲的原始場次數而非增加後的數值
  historyMatchTimes.unshift(timeRecord);

  // 移除比分記錄功能

  // 僅記錄選手名稱，不包含場次數
  historyMatches.unshift(
    playerBeforeMatches
      .map((p) => {
        // 只返回選手名稱
        return p.name;
      })
      .join(" / ")
  );

  // 將本次比賽的組合存入 historyMatchesArr（以複本形式）
  // 使用當前選手完整資訊，但場次數使用更新前的值
  historyMatchesArr.unshift(
    playersToReady.map((player) => {
      // 創建選手對象的深拷貝
      const playerCopy = { ...player };
      // 查找對應的原始場次
      const original = playerBeforeMatches.find((p) => p.name === player.name);
      if (original) {
        playerCopy.matchesBeforeThisGame = original.matches;
      }
      return playerCopy;
    })
  );

  // 將下場選手加入休息區，設置justFinished標記
  playersToReady.forEach((player) => {
    player.justFinished = true;
    // 重置下場選手的等待輪數
    player.waitingTurns = 0;
    // 清除剛加入標記(如果有)
    player.justJoinedReady = false;
  });

  courts[courtIndex] = [];
  // 剛下場的選手回到預備區
  readyPlayers.push(...playersToReady);
  

  // 打印下場後預備區的詳細狀態

  readyPlayers.forEach((player, index) => {});

  // 對等待輪數統計
  const waitingStats = {
    0: readyPlayers.filter((p) => (p.waitingTurns || 0) === 0).length,
    1: readyPlayers.filter((p) => (p.waitingTurns || 0) === 1).length,
    2: readyPlayers.filter((p) => (p.waitingTurns || 0) === 2).length,
    3: readyPlayers.filter((p) => (p.waitingTurns || 0) >= 3).length,
  };

  // 手動處理一次等待輪數增加邏輯（下場後跳過剛下場的選手）

  // 處理「剛下場」和「剛加入」的特殊標記

  // 1. 清除剛加入標記
  let clearedJustJoinedCount = 0;
  readyPlayers.forEach((player) => {
    if (player.justJoinedReady) {
      player.justJoinedReady = false;
      clearedJustJoinedCount++;
    }
  });

  // 2. 篩選出上一輪剛下場的選手（justFinished=true且waitingTurns=0）
  const previouslyJustFinishedPlayers = readyPlayers.filter(
    (p) =>
      p.justFinished &&
      p.waitingTurns === 0 &&
      !playersToReady.some((q) => q.name === p.name)
  );

  if (previouslyJustFinishedPlayers.length > 0) {
    previouslyJustFinishedPlayers.forEach((player) => {
      // 先前剛下場的，現在變為等待1輪
      player.justFinished = false; // 清除剛下場標記
      player.waitingTurns = 1; // 設為等待1輪
      console.log(`【endMatch】清除過期剛下場標記：${player.name} 設為等待1輪`);
    });
  }

  // 不在此處更新等待輪次，等待輪次的更新應該在排場完成後進行
  console.log(`【endMatch】下場完成，等待輪次更新將在下次排場完成後進行`);

  // 更新界面
  updateLists();
  updateCourtsDisplay();
  updateHistoryDisplay();
  
  // 自動同步到 Google Sheets（如果已登入）
  if (googleAccessToken && enableSheetsSync) {
    const matchIndex = 0; // 最新的比賽記錄在索引 0
    console.log('比賽結束，準備自動同步到 Google Sheets');
    autoSyncAfterMatch(matchIndex);
  }

  // 在下場且更新等待輪數後進行新一輪排場
  // 記錄排場前的預備區狀態，用於等待輪次更新
  const readyPlayersBeforeMatch = [...readyPlayers];

  let result = await generateMatchForCourtImmediate(courtIndex);

  // 更新等待輪次（如果有新比賽產生）
  if (result) {
    updateWaitingTurnsAfterMatch(readyPlayersBeforeMatch, true);
  }

  // 如果有新的對戰，播報這個場地的配對
  if (result) {
    setTimeout(() => {
      announceCourt(courtIndex);
    }, 1000);
    
    // 在配對完成後更新預測
    updateNextMatchPrediction();
  }
  
  // 自動保存遊戲狀態
  saveGameState();
}

function updateHistoryDisplay() {
  const historyEl = document.getElementById("history");
  if (historyMatches.length === 0) {
    historyEl.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-history"></i>
        <p>尚無比賽記錄</p>
      </div>
    `;
  } else {
    // 診斷記錄

    historyEl.innerHTML = historyMatches
      .map((match, index) => {
        const players = match.split(" / ");

        // 獲取時間記錄（如果存在）
        const timeRecord =
          index < historyMatchTimes.length ? historyMatchTimes[index] : null;

        // 診斷日誌 - 檢查單項時間記錄

        // 檢查是否有時間記錄，顯示分鐘和秒數
        let timeInfo = "";
        if (timeRecord) {
          // 兼容新舊時間格式
          if (typeof timeRecord.duration === "number") {
            // 顯示分鐘和秒數 - 新格式：包含秒數信息
            const seconds = timeRecord.seconds || 0;
            const secondsDisplay = seconds > 0 ? `${seconds}秒` : "";
            const minutesDisplay =
              timeRecord.duration > 0 ? `${timeRecord.duration}分` : "";
            const timeDisplay =
              timeRecord.duration > 0 || seconds > 0
                ? `${minutesDisplay}${secondsDisplay}`
                : "不到1秒";

            timeInfo = `<div class="history-duration">
             <i class="fas fa-clock"></i>
             <span>${timeDisplay}</span>
             <span class="court-info">場地 ${
               (timeRecord.courtIndex || 0) + 1
             }</span>
           </div>`;
          } else if (timeRecord.startTime && timeRecord.endTime) {
            // 舊格式：從原始時間戳重新計算
            const start = new Date(timeRecord.startTime);
            const end = new Date(timeRecord.endTime);
            const diffMs = end - start;
            const minutes = Math.floor(diffMs / 60000);
            const seconds = Math.floor((diffMs % 60000) / 1000);

            const secondsDisplay = seconds > 0 ? `${seconds}秒` : "";
            const minutesDisplay = minutes > 0 ? `${minutes}分` : "";
            const timeDisplay =
              minutes > 0 || seconds > 0
                ? `${minutesDisplay}${secondsDisplay}`
                : "不到1秒";

            timeInfo = `<div class="history-duration">
             <i class="fas fa-clock"></i>
             <span>${timeDisplay}</span>
             <span class="court-info">場地 ${
               (timeRecord.courtIndex || 0) + 1
             }</span>
           </div>`;
          } else {
            // 有時間記錄但格式未知
            timeInfo = `<div class="history-duration">
            <i class="fas fa-clock"></i>
            <span>${timeRecord.duration || 0}分鐘</span>
            <span class="court-info">場地 ${
              (timeRecord.courtIndex || 0) + 1
            }</span>
          </div>`;
          }
        } else {
          // 無時間記錄時顯示提示
          timeInfo = `<div class="history-duration">
          <i class="fas fa-clock"></i>
          <span class="time-details">無時間記錄</span>
        </div>`;
        }

        // 移除比分記錄功能，只保留組合和時間記錄

        return `
        <div class="history-item">
          <div class="history-header">
            <div class="history-time">比賽 #${
              historyMatches.length - index
            }</div>
            ${timeInfo}
          </div>
          <div class="history-content">
            <div class="history-players">
              ${players
                .slice(0, 2)
                .map((p) => {
                  // 移除括號及內容如果存在 - 例如 "小明 (3)" 變成 "小明"
                  const nameOnly = p.replace(/ \(\d+\)$/, "");
                  return `<span class="history-player">${nameOnly}</span>`;
                })
                .join("")}
              ${players
                .slice(2, 4)
                .map((p) => {
                  const nameOnly = p.replace(/ \(\d+\)$/, "");
                  return `<span class="history-player">${nameOnly}</span>`;
                })
                .join("")}
            </div>
          </div>
        </div>
      `;
      })
      .join("");
  }
}

// Google Sheets API 整合
const GOOGLE_API_KEY = "AIzaSyCyoLexsIwzSg6tMLVhchfMjTgmYNn6S4U"; // 您的 API 金鑰
const GOOGLE_CLIENT_ID = "186072660354-833c6b74da3t6jgk9ace7ig2mgvcht0u.apps.googleusercontent.com"; // 您的 OAuth Client ID
// 將這些值直接設為常量
const SPREADSHEET_ID = "1961u7uge-1AHRLrIS1kEG8GNuMNHrf-WdjGVw-pClE0"; // 社團用
const PRIVATE_SPREADSHEET_ID = "1LLC0sMwfvoTDMCHNCD2LpaKcKI-yJUYriROgA3OM3u0"; // 私人用
const SHEET_NAME = "人員名單";
const MATCH_RECORD_SHEET_NAME = "比賽紀錄"; // 新增比賽紀錄工作表名稱

// 記錄當前使用的試算表
let currentSpreadsheetId = SPREADSHEET_ID;
let isPrivateMode = false;

// Google OAuth 相關變數
let googleAccessToken = null;
let googleUser = null;

// 私人模式切換功能
function togglePrivateMode() {
  const password = prompt("請輸入密碼以切換到私人模式：");

  // 設定密碼（您可以更改這個密碼）
  const correctPassword = "1111"; // 請更改為您想要的密碼

  if (password === correctPassword) {
    isPrivateMode = true;
    currentSpreadsheetId = PRIVATE_SPREADSHEET_ID;

    // 更新按鈕文字以顯示當前模式
    const loadBtn = document.getElementById("loadSheetsDataBtn");
    if (loadBtn) {
      loadBtn.innerHTML = '<i class="fas fa-cloud-download-alt"></i> 從 Google Sheets 載入選手資料 (私人模式)';
      loadBtn.style.backgroundColor = '#6c757d';
    }

    // 顯示場地控制選項
    showCourtControls();

    alert("已切換到私人模式！\n請點擊「從 Google Sheets 載入選手資料」按鈕來載入資料。\n您可以在場地上方選擇要啟用的場地。");
  } else {
    alert("密碼錯誤！");
  }
}

// 切換回社團模式
function switchToClubMode() {
  isPrivateMode = false;
  currentSpreadsheetId = SPREADSHEET_ID;

  const loadBtn = document.getElementById("loadSheetsDataBtn");
  if (loadBtn) {
    loadBtn.innerHTML = '<i class="fas fa-cloud-download-alt"></i> 從 Google Sheets 載入選手資料';
    loadBtn.style.backgroundColor = '';
  }

  // 重新啟用所有場地
  courtEnabled = [true, true, true];
  hideCourtControls();
  updateCourtsDisplay();

  alert("已切換回社團模式");
}

// 顯示場地控制選項
function showCourtControls() {
  const courtsContainer = document.getElementById("courts");
  if (courtsContainer) {
    // 如果控制面板不存在，創建它
    let controlPanel = document.getElementById("courtControls");
    if (!controlPanel) {
      controlPanel = document.createElement("div");
      controlPanel.id = "courtControls";
      controlPanel.style.cssText = `
        padding: 15px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-radius: 12px;
        margin-bottom: 20px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        animation: fadeIn 0.3s ease-in;
      `;

      controlPanel.innerHTML = `
        <div style="
          display: flex;
          gap: 20px;
          align-items: center;
          justify-content: center;
          flex-wrap: wrap;
        ">
          <div style="
            color: white;
            font-weight: 600;
            font-size: 16px;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
          ">
            場地設定
          </div>
          ${[1, 2, 3].map(num => `
            <label style="
              display: flex;
              align-items: center;
              gap: 8px;
              cursor: pointer;
              padding: 8px 16px;
              background: rgba(255, 255, 255, 0.9);
              border-radius: 20px;
              transition: all 0.3s ease;
              box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            "
            onmouseover="this.style.transform='scale(1.05)'; this.style.boxShadow='0 4px 8px rgba(0, 0, 0, 0.15)';"
            onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 2px 4px rgba(0, 0, 0, 0.1)';">
              <input type="checkbox"
                id="court${num}-toggle"
                checked
                onchange="toggleCourt(${num - 1})"
                style="
                  width: 20px;
                  height: 20px;
                  cursor: pointer;
                  accent-color: #667eea;
                ">
              <span style="
                font-weight: 500;
                color: #333;
                font-size: 14px;
              ">
                <i class="fas fa-shuttlecock" style="color: #667eea;"></i> 場地 ${num}
              </span>
            </label>
          `).join('')}
        </div>
      `;

      // 添加淡入動畫
      const style = document.createElement('style');
      style.textContent = `
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `;
      if (!document.head.querySelector('style[data-court-controls]')) {
        style.setAttribute('data-court-controls', 'true');
        document.head.appendChild(style);
      }

      courtsContainer.parentNode.insertBefore(controlPanel, courtsContainer);
    }
    controlPanel.style.display = 'block';
  }
}

// 隱藏場地控制選項
function hideCourtControls() {
  const controlPanel = document.getElementById("courtControls");
  if (controlPanel) {
    controlPanel.style.display = 'none';
  }
}

// 切換場地啟用狀態
function toggleCourt(courtIndex) {
  courtEnabled[courtIndex] = !courtEnabled[courtIndex];

  // 如果場地被禁用且有比賽，結束該場地的比賽
  if (!courtEnabled[courtIndex] && courts[courtIndex].length > 0) {
    if (confirm(`場地 ${courtIndex + 1} 目前有比賽進行中，確定要關閉嗎？\n這將結束該場地的比賽。`)) {
      endMatch(courtIndex);
    } else {
      // 如果用戶取消，重新勾選
      document.getElementById(`court${courtIndex + 1}-toggle`).checked = true;
      courtEnabled[courtIndex] = true;
      return;
    }
  }

  updateCourtsDisplay();
}

// 載入 Google Sheets 資料 - 修改為直接匯入不顯示模態視窗
async function loadGoogleSheetsData() {
  try {
    // 使用當前模式的試算表 ID
    const spreadsheetId = isPrivateMode ? PRIVATE_SPREADSHEET_ID : SPREADSHEET_ID;

    // 顯示載入狀態
    const statusElement = document.getElementById("loadStatus");
    const modeText = isPrivateMode ? "(私人模式)" : "";
    statusElement.textContent = `正在從 Google Sheets ${modeText} 載入資料...`;

    // 構建 API 請求 URL
    const range = `${SHEET_NAME}!A2:E1000`; // A列=姓名, B列=等級, C列=出席狀態, D列=分數, E列=ABC等級
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?key=${GOOGLE_API_KEY}`;

    // 發送 API 請求
    const response = await fetch(url);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `API 請求失敗: ${response.status} ${response.statusText}\n${errorText}`
      );
    }

    const data = await response.json();

    // 處理資料
    if (!data.values || data.values.length === 0) {
      throw new Error("試算表中沒有資料");
    }


    // 解析選手資料 - 只保存出席的選手
    const newPlayers = [];

    data.values.forEach((row) => {
      if (row.length >= 2) {
        const name = row[0]?.trim();
        const levelStr = row[1]?.trim();
        let status = row[2]?.trim() || ""; // 獲取出席狀態

        // 只接受確切的「出席」狀態
        const isPresent = status === "出席" || status === "有出席";

        if (name && levelStr) {
          const level = parseFloat(levelStr);
          if (!isNaN(level)) {
            if (isPresent) {
              // 檢查是否有更多欄位（例如：D欄可能是分數，E欄是ABC等級）
              const score = row[3] ? parseFloat(row[3]?.trim()) : undefined;
              const newLevel = row[4]?.trim() || 'B'; // E欄位的ABC等級，預設為B
              
              const playerData = { name, level, matches: 0, newLevel };
              
              // 如果有分數欄位且是有效數字，加入分數
              if (score !== undefined && !isNaN(score)) {
                playerData.score = score;
              }
              
              newPlayers.push(playerData);
            }
          }
        }
      }
    });

    // 直接更新選手列表，不顯示模態視窗
    if (newPlayers.length === 0) {
      statusElement.textContent = "未找到任何標記為出席的選手";
      alert("未找到任何標記為出席的選手");
      return null;
    }

    // 直接替換現有選手列表
    players = [...newPlayers];
    readyPlayers = [];

    // 更新顯示
    updateLists();

    // 更新載入狀態
    statusElement.textContent = `成功導入 ${newPlayers.length} 位出席選手`;
    alert(`已成功導入 ${newPlayers.length} 位出席選手`);
    
    // 自動保存遊戲狀態
    saveGameState();

    return { players: newPlayers };
  } catch (error) {
    console.error("Google Sheets 資料載入失敗:", error);

    const statusElement = document.getElementById("loadStatus");
    if (statusElement) {
      statusElement.textContent = `載入失敗: ${error.message}`;
    }

    alert(`無法從 Google Sheets 載入資料: ${error.message}`);
    return null;
  }
}

// 切換輸入方式
function toggleInputMode(mode) {
  const sheetsInputSection = document.getElementById("sheetsInputSection");
  const batchInputSection = document.getElementById("batchInputSection");

  if (mode === "sheets") {
    sheetsInputSection.style.display = "block";
    batchInputSection.style.display = "none";
    document.getElementById("toggleSheets").classList.add("btn-primary");
    document.getElementById("toggleSheets").classList.remove("btn-secondary");
    document.getElementById("toggleBatch").classList.add("btn-secondary");
    document.getElementById("toggleBatch").classList.remove("btn-primary");
  } else {
    sheetsInputSection.style.display = "none";
    batchInputSection.style.display = "block";
    document.getElementById("toggleBatch").classList.add("btn-primary");
    document.getElementById("toggleBatch").classList.remove("btn-secondary");
    document.getElementById("toggleSheets").classList.add("btn-secondary");
    document.getElementById("toggleSheets").classList.remove("btn-primary");
  }
}

// 手動模式切換
function toggleManualMode() {
  isManualMode = document.getElementById('manualMode').checked;
  updateCourtsDisplay(); // 更新場地顯示
  updateLists(); // 更新選手列表顯示
}

// 手動清空場地
function manualEndMatch(courtIndex) {
  if (!confirm("確認清空場地" + (courtIndex + 1) + "？")) {
    return;
  }

  // 將場地選手移回預備區
  let playersToReady = courts[courtIndex];
  courts[courtIndex] = [];
  readyPlayers.push(...playersToReady);

  // 更新界面
  updateLists();
  updateCourtsDisplay();
}

// 手動上場功能 - 自動分配到空閒場地
function manualJoinCourt(playerName) {
  // 找到第一個有空位的場地
  let availableCourtIndex = -1;
  for (let i = 0; i < courts.length; i++) {
    if (courts[i].length < 4) {
      availableCourtIndex = i;
      break;
    }
  }

  // 檢查是否有可用場地
  if (availableCourtIndex === -1) {
    alert("所有場地都已滿，無法上場");
    return;
  }

  // 從預備區找到選手
  const playerIndex = readyPlayers.findIndex(p => p.name === playerName);
  if (playerIndex === -1) {
    alert("找不到選手");
    return;
  }

  // 移動選手到場地
  const player = readyPlayers.splice(playerIndex, 1)[0];
  courts[availableCourtIndex].push(player);

  // 如果場地滿了，設定開始時間
  if (courts[availableCourtIndex].length === 4) {
    courts[availableCourtIndex].startTime = new Date();
  }

  // 更新界面
  updateLists();
  updateCourtsDisplay();

  // 如果場地滿了，播報
  if (courts[availableCourtIndex].length === 4) {
    announceCourt(availableCourtIndex);
  }

  console.log(`${playerName} 已分配到場地 ${availableCourtIndex + 1}`);
}

// 頁面加載完成後初始化
document.addEventListener("DOMContentLoaded", function () {
  updateLists();
  updateCourtsDisplay();
  updateHistoryDisplay();
  initVoice(); // 初始化語音功能
  initGoogleAPI(); // 初始化 Google API

  // 綁定手動模式切換事件
  document.getElementById('manualMode').addEventListener('change', toggleManualMode);
});

// 移除beforeunload警告，因為現在有自動保存和恢復功能
// window.addEventListener("beforeunload", function (e) {
//   e.preventDefault();
//   e.returnValue = "警告：關閉此網頁將會清空所有資料，是否確認關閉？";
// });

// 比分輸入相關功能




// 點擊對話框外部關閉
document.addEventListener('click', function(event) {
  const modal = document.getElementById('scoreInputModal');
  if (event.target === modal) {
    closeScoreInput();
  }
});

// Google Sheets 同步功能 - 登入後自動啟用
let enableSheetsSync = false;

// 準備比賽紀錄數據格式
function prepareMatchRecordForSheets(matchIndex) {
  const match = historyMatches[matchIndex];
  if (!match) {
    console.error('無法找到比賽記錄，matchIndex:', matchIndex);
    return null;
  }
  const timeRecord = historyMatchTimes[matchIndex];
  const players = match.split(" / ");
  
  // 建立比賽紀錄物件（只記錄組合和時間）
  const record = {
    matchNumber: historyMatches.length - matchIndex,
    date: timeRecord ? new Date(timeRecord.startTime).toLocaleDateString('zh-TW') : '',
    startTime: timeRecord ? timeRecord.formattedStart : '',
    endTime: timeRecord ? timeRecord.formattedEnd : '',
    duration: timeRecord ? `${timeRecord.duration || 0}分${timeRecord.seconds || 0}秒` : '',
    court: timeRecord ? `場地${timeRecord.courtIndex + 1}` : '',
    team1Player1: players[0] || '',
    team1Player2: players[1] || '',
    team2Player1: players[2] || '',
    team2Player2: players[3] || ''
  };
  
  return record;
}

// 同步所有比賽紀錄到 Google Sheets
async function syncMatchRecordsToSheets() {
  try {
    // 檢查是否有比賽紀錄
    if (historyMatches.length === 0) {
      alert('目前沒有比賽紀錄可以同步');
      return;
    }
    
    // 準備所有比賽紀錄
    const allRecords = [];
    for (let i = 0; i < historyMatches.length; i++) {
      const record = prepareMatchRecordForSheets(i);
      allRecords.push(record);
    }
    
    console.log('準備同步的比賽紀錄：', allRecords);
    
    // 準備表頭
    const headers = [
      '比賽編號', '日期', '開始時間', '結束時間', '比賽時長', '場地',
      '第一隊選手1', '第一隊選手2', '第二隊選手1', '第二隊選手2'
    ];
    
    // 轉換為二維陣列（Google Sheets 格式）
    const sheetData = [headers];
    allRecords.forEach(record => {
      sheetData.push([
        record.matchNumber,
        record.date,
        record.startTime,
        record.endTime,
        record.duration,
        record.court,
        record.team1Player1,
        record.team1Player2,
        record.team2Player1,
        record.team2Player2
      ]);
    });
    
    console.log('Google Sheets 格式數據：', sheetData);
    
    // 生成 CSV 格式數據
    const csvContent = sheetData.map(row => 
      row.map(cell => {
        // 如果包含逗號或換行，需要用引號包起來
        const cellStr = String(cell);
        if (cellStr.includes(',') || cellStr.includes('\n') || cellStr.includes('"')) {
          return '"' + cellStr.replace(/"/g, '""') + '"';
        }
        return cellStr;
      }).join(',')
    ).join('\n');
    
    // 創建可複製的文字區域
    const textarea = document.createElement('textarea');
    textarea.value = csvContent;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    
    try {
      document.execCommand('copy');
      alert(`已複製 ${allRecords.length} 筆比賽紀錄到剪貼簿！\n\n請到 Google Sheets 貼上數據：\n1. 開啟您的 Google Sheets\n2. 選擇「比賽紀錄」工作表\n3. 點擊 A1 儲存格\n4. 按 Ctrl+V (或 Cmd+V) 貼上`);
    } catch (err) {
      console.error('複製失敗：', err);
      alert('自動複製失敗，請手動複製控制台中的 CSV 數據。');
      console.log('CSV 數據：\n', csvContent);
    } finally {
      document.body.removeChild(textarea);
    }
    
    // 這裡可以實作實際的 Google Sheets API 寫入
    // 需要 OAuth 2.0 認證或 Google Apps Script
    
  } catch (error) {
    console.error('同步失敗：', error);
    alert('同步過程中發生錯誤，請查看控制台了解詳情。');
  }
}

// 在比賽結束時自動同步（如果已登入）
function autoSyncAfterMatch(matchIndex) {
  if (googleAccessToken && enableSheetsSync) {
    const record = prepareMatchRecordForSheets(matchIndex);
    if (record) {
      console.log('自動同步比賽紀錄：', record);
      // 自動寫入 Google Sheets
      writeToGoogleSheets([record]);
    } else {
      console.error('無法準備比賽紀錄，跳過同步');
    }
  }
}

// 驗證 token 是否有效
async function validateToken(token) {
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=' + token);
    if (response.ok) {
      const tokenInfo = await response.json();
      if (!tokenInfo.error) {
        // Token 仍然有效
        googleAccessToken = token;
        gapi.client.setToken({ access_token: token });
        updateGoogleSignInUI(true);
        return;
      }
    }
  } catch (error) {
    console.log('Token 驗證失敗：', error);
  }
  
  // Token 無效，清除並更新 UI
  localStorage.removeItem('googleAccessToken');
  googleAccessToken = null;
  updateGoogleSignInUI(false);
}

// 初始化 Google API
function initGoogleAPI() {
  // 載入 Google API client library
  gapi.load('client', async () => {
    try {
      await gapi.client.init({
        apiKey: GOOGLE_API_KEY,
        discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
      });
      console.log('Google API 初始化成功');
      
      // 檢查是否已有存儲的 token
      const savedToken = localStorage.getItem('googleAccessToken');
      if (savedToken) {
        // 驗證 token 是否仍然有效
        validateToken(savedToken);
      } else {
        updateGoogleSignInUI(false);
      }
    } catch (error) {
      console.error('Google API 初始化失敗：', error);
    }
  });
}

// 更新登入 UI
function updateGoogleSignInUI(isSignedIn) {
  const signInBtn = document.getElementById('googleSignInBtn');
  const signOutBtn = document.getElementById('googleSignOutBtn');
  const userInfo = document.getElementById('googleUserInfo');
  
  if (signInBtn && signOutBtn) {
    if (isSignedIn) {
      signInBtn.style.display = 'none';
      signOutBtn.style.display = 'inline-flex';
      userInfo.textContent = googleUser ? `已登入：${googleUser.email}` : '已登入';
    } else {
      signInBtn.style.display = 'inline-flex';
      signOutBtn.style.display = 'none';
      userInfo.textContent = '';
    }
  }
}

// 處理 Google 登入
async function handleGoogleSignIn() {
  try {
    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email',
      callback: async (response) => {
        if (response.access_token) {
          googleAccessToken = response.access_token;
          localStorage.setItem('googleAccessToken', googleAccessToken);
          
          // 設定 API client 的 access token
          gapi.client.setToken({ access_token: googleAccessToken });
          
          try {
            // 獲取用戶資訊
            const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
              headers: { Authorization: `Bearer ${googleAccessToken}` }
            });
            
            if (userResponse.ok) {
              const userInfo = await userResponse.json();
              googleUser = userInfo;
              enableSheetsSync = true; // 登入成功後自動啟用同步
              updateGoogleSignInUI(true);
              alert(`登入成功！歡迎 ${userInfo.email}\n\n比賽紀錄將自動同步到 Google Sheets。`);
            } else {
              // 如果無法獲取用戶資訊，仍然算登入成功
              enableSheetsSync = true; // 登入成功後自動啟用同步
              updateGoogleSignInUI(true);
              alert('登入成功！比賽紀錄將自動同步到 Google Sheets。');
            }
          } catch (userError) {
            console.warn('無法獲取用戶資訊：', userError);
            // 但仍然更新 UI 為已登入狀態
            enableSheetsSync = true; // 登入成功後自動啟用同步
            updateGoogleSignInUI(true);
            alert('登入成功！比賽紀錄將自動同步到 Google Sheets。');
          }
        }
      },
      error_callback: (error) => {
        if (error.type === 'popup_closed') {
          console.log('使用者關閉了登入視窗');
          // 不顯示錯誤訊息，因為使用者可能只是改變主意
        } else {
          console.error('登入失敗：', error);
          alert('登入失敗，請重試。');
        }
      }
    });
    
    tokenClient.requestAccessToken();
  } catch (error) {
    console.error('初始化登入時發生錯誤：', error);
    alert('登入功能初始化失敗，請重新整理頁面後再試。');
  }
}

// 處理登出
function handleGoogleSignOut() {
  googleAccessToken = null;
  googleUser = null;
  enableSheetsSync = false; // 登出時停用同步
  localStorage.removeItem('googleAccessToken');
  
  // 撤銷 token
  if (gapi.client.getToken()) {
    google.accounts.oauth2.revoke(gapi.client.getToken().access_token, () => {
      console.log('Token 已撤銷');
    });
    gapi.client.setToken(null);
  }
  
  updateGoogleSignInUI(false);
  alert('已登出 Google 帳號');
}

// 寫入數據到 Google Sheets
async function writeToGoogleSheets(records) {
  if (!googleAccessToken) {
    alert('請先登入 Google 帳號以啟用寫入功能');
    return;
  }
  
  try {
    // 準備要寫入的數據
    const headers = [
      '比賽編號', '日期', '開始時間', '結束時間', '比賽時長', '場地',
      '第一隊選手1', '第一隊選手2', '第二隊選手1', '第二隊選手2'
    ];
    
    // 檢查工作表是否已有標題
    const checkRange = `${MATCH_RECORD_SHEET_NAME}!A1:J1`;
    const checkResponse = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: currentSpreadsheetId,
      range: checkRange,
    });
    
    let startRow = 1;
    if (!checkResponse.result.values || checkResponse.result.values.length === 0) {
      // 如果沒有標題，先寫入標題
      await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: currentSpreadsheetId,
        range: `${MATCH_RECORD_SHEET_NAME}!A1:J1`,
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [headers]
        }
      });
      startRow = 2;
    } else {
      // 如果已有數據，找到最後一行
      const dataRange = `${MATCH_RECORD_SHEET_NAME}!A:A`;
      const dataResponse = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: currentSpreadsheetId,
        range: dataRange,
      });
      
      if (dataResponse.result.values) {
        startRow = dataResponse.result.values.length + 1;
      }
    }
    
    // 準備要寫入的數據行
    const rows = records.map(record => [
      record.matchNumber,
      record.date,
      record.startTime,
      record.endTime,
      record.duration,
      record.court,
      record.team1Player1,
      record.team1Player2,
      record.team2Player1,
      record.team2Player2
    ]);
    
    // 寫入數據
    const response = await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: currentSpreadsheetId,
      range: `${MATCH_RECORD_SHEET_NAME}!A${startRow}`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values: rows
      }
    });
    
    console.log('寫入成功：', response);
    // 靜默同步，不顯示成功訊息，避免干擾現場操作
    console.log(`✅ 已自動同步 ${records.length} 筆比賽紀錄到 Google Sheets`);
    
  } catch (error) {
    console.error('寫入 Google Sheets 失敗：', error);
    alert('寫入失敗：' + (error.result?.error?.message || error.message));
  }
}

// 修改同步函數以使用 OAuth 寫入
async function syncMatchRecordsToSheets() {
  try {
    // 檢查是否有比賽紀錄
    if (historyMatches.length === 0) {
      alert('目前沒有比賽紀錄可以同步');
      return;
    }
    
    // 準備所有比賽紀錄
    const allRecords = [];
    for (let i = 0; i < historyMatches.length; i++) {
      const record = prepareMatchRecordForSheets(i);
      allRecords.push(record);
    }
    
    // 如果已登入，直接寫入
    if (googleAccessToken) {
      await writeToGoogleSheets(allRecords);
    } else {
      // 否則使用原本的複製貼上方式
      console.log('準備同步的比賽紀錄：', allRecords);
      
      // 準備表頭
      const headers = [
        '比賽編號', '日期', '開始時間', '結束時間', '比賽時長', '場地',
        '第一隊選手1', '第一隊選手2', '第二隊選手1', '第二隊選手2'
      ];
      
      // 轉換為二維陣列（Google Sheets 格式）
      const sheetData = [headers];
      allRecords.forEach(record => {
        sheetData.push([
          record.matchNumber,
          record.date,
          record.startTime,
          record.endTime,
          record.duration,
          record.court,
          record.team1Player1,
          record.team1Player2,
          record.team2Player1,
          record.team2Player2
        ]);
      });
      
      console.log('Google Sheets 格式數據：', sheetData);
      
      // 生成 CSV 格式數據
      const csvContent = sheetData.map(row => 
        row.map(cell => {
          // 如果包含逗號或換行，需要用引號包起來
          const cellStr = String(cell);
          if (cellStr.includes(',') || cellStr.includes('\n') || cellStr.includes('"')) {
            return '"' + cellStr.replace(/"/g, '""') + '"';
          }
          return cellStr;
        }).join(',')
      ).join('\n');
      
      // 創建可複製的文字區域
      const textarea = document.createElement('textarea');
      textarea.value = csvContent;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      
      try {
        document.execCommand('copy');
        alert(`已複製 ${allRecords.length} 筆比賽紀錄到剪貼簿！\n\n請到 Google Sheets 貼上數據：\n1. 開啟您的 Google Sheets\n2. 選擇「比賽紀錄」工作表\n3. 點擊 A1 儲存格\n4. 按 Ctrl+V (或 Cmd+V) 貼上\n\n提示：您也可以登入 Google 帳號以啟用直接寫入功能。`);
      } catch (err) {
        console.error('複製失敗：', err);
        alert('自動複製失敗，請手動複製控制台中的 CSV 數據。');
        console.log('CSV 數據：\n', csvContent);
      } finally {
        document.body.removeChild(textarea);
      }
    }
    
  } catch (error) {
    console.error('同步失敗：', error);
    alert('同步過程中發生錯誤，請查看控制台了解詳情。');
  }
}

// 顯示狀態恢復對話框
function showRestoreDialog() {
  const modal = document.getElementById('restoreStateModal');
  const savedState = loadGameState();
  
  if (!savedState) return;
  
  // 填入保存狀態詳情
  const saveTime = new Date(savedState.timestamp);
  const activeCourts = savedState.courts.filter(c => c.length > 0).length;
  const readyCount = savedState.readyPlayers.length;
  const totalPlayers = savedState.players.length;
  
  document.getElementById('savedStateDetails').innerHTML = `
    <div><strong>保存時間：</strong>${saveTime.toLocaleString('zh-TW')}</div>
    <div><strong>進行場地：</strong>${activeCourts} 個</div>
    <div><strong>預備選手：</strong>${readyCount} 人</div>
    <div><strong>總選手數：</strong>${totalPlayers} 人</div>
    <div><strong>歷史比賽：</strong>${savedState.historyMatches.length} 場</div>
  `;
  
  modal.style.display = 'flex';
}

// 確認恢復狀態
function confirmRestoreState() {
  const savedState = loadGameState();
  if (savedState && restoreGameState(savedState)) {
    document.getElementById('restoreStateModal').style.display = 'none';
    
    // 恢復場地計時器
    courts.forEach((court, index) => {
      if (court.length > 0 && court.startTime) {
        // 將ISO字符串轉換回Date對象
        court.startTime = new Date(court.startTime);
      }
    });
    
    // 更新所有界面
    updateCourtsDisplay();
    updateNextMatchPrediction();
    
    // 顯示成功訊息
    showSuccessToast('✅ 比賽狀態已成功恢復！');
  } else {
    alert('恢復狀態失敗，將重新開始');
    startFresh();
  }
}

// 重新開始（清除保存狀態）
function startFresh() {
  clearGameState();
  document.getElementById('restoreStateModal').style.display = 'none';
  
  // 重置所有狀態
  players = [];
  readyPlayers = [];
  restingPlayers = [];
  courts = [[], [], []];
  historyMatches = [];
  historyMatchesArr = [];
  historyMatchTimes = [];
  pairingHistory = {};
  lastCombinationByCourt = {};
  isManualMode = false;
  nextMatchDecision = null;
  readyPlayersCycleCount = 0;
  lastReadyPlayersNames = [];
  
  // 更新界面
  updateLists();
  updateCourtsDisplay();
  
  // 重置手動模式狀態
  document.getElementById('manualMode').checked = false;
  
  console.log('🔄【重新開始】所有狀態已重置');
}

// 顯示成功提示
function showSuccessToast(message) {
  // 創建臨時提示元素
  const toast = document.createElement('div');
  toast.className = 'alert alert-info';
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 10000;
    min-width: 300px;
    animation: slideIn 0.3s ease-out;
  `;
  toast.innerHTML = `
    <i class="fas fa-check-circle"></i>
    <span>${message}</span>
  `;
  
  document.body.appendChild(toast);
  
  // 3秒後自動移除
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease-in forwards';
    setTimeout(() => {
      if (toast.parentNode) {
        document.body.removeChild(toast);
      }
    }, 300);
  }, 3000);
}

// 在頁面載入時初始化 Google API 和檢查保存狀態
window.addEventListener('load', () => {
  // 檢查是否有保存的遊戲狀態
  if (hasSavedGameState()) {
    showRestoreDialog();
  }
  
  // 初始化 Google API
  if (typeof gapi !== 'undefined') {
    initGoogleAPI();
  } else {
    console.warn('Google API 尚未載入');
  }
});
