// 全域變數
let players = [];
let readyPlayers = [];
let restingPlayers = [];
let courts = [[], [], []];
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
  console.log(`【updateLists】開始更新界面，選手總數：${players.length}，預備區：${readyPlayers.length}，休息區：${restingPlayers.length}`);
  
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
          <span class="player-matches">場次: ${p.matches}</span>
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
          <span class="player-matches">場次: ${p.matches}</span>
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
          <span class="player-matches">場次: ${p.matches}</span>
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
  console.log("【addBatchPlayers】開始批量新增選手");
  
  const text = document.getElementById("batchPlayers").value;
  console.log("【addBatchPlayers】輸入文字：", text);
  
  if (!text.trim()) {
    console.warn("【addBatchPlayers】警告：輸入文字為空");
    alert("請貼上選手資料！");
    return;
  }
  
  const lines = text.split(/\r?\n/);
  console.log("【addBatchPlayers】分割後的行數：", lines.length);
  
  let addedCount = 0;
  let skippedCount = 0;
  
  for (let line of lines) {
    line = line.trim();
    console.log(`【addBatchPlayers】處理行：'${line}'`);
    
    if (!line) {
      console.log("【addBatchPlayers】跳過空行");
      continue;
    }
    
    const match = line.match(/^(\D+)([\d.]+)$/);
    if (match) {
      const name = match[1].trim();
      const level = parseFloat(match[2]);
      console.log(`【addBatchPlayers】解析成功：姓名='${name}', 等級=${level}`);
      
      if (!players.some((p) => p.name === name)) {
        players.push({ name, level, matches: 0 });
        addedCount++;
        console.log(`【addBatchPlayers】新增選手：${name} (等級${level})`);
      } else {
        skippedCount++;
        console.log(`【addBatchPlayers】選手已存在，跳過：${name}`);
      }
    } else {
      console.warn(`【addBatchPlayers】格式錯誤，無法解析：'${line}'`);
    }
  }
  
  console.log(`【addBatchPlayers】完成批量新增：新增 ${addedCount} 位選手，跳過 ${skippedCount} 位選手`);
  console.log(`【addBatchPlayers】當前選手總數：${players.length}`);
  
  document.getElementById("batchPlayers").value = "";
  updateLists();
  updateHistoryDisplay();
  updateCourtsDisplay();
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
  
  console.log(`【平均場次計算】總共 ${allActivePlayers.length} 位活躍選手，總場次 ${totalMatches}，平均場次 ${averageMatches}`);
  return averageMatches;
}

/* 
  moveToReady：
  將選手從列表或休息區移入預備區時，
  場次調整為所有活躍選手的平均場次
*/
function moveToReady(name) {
  console.log(`【moveToReady】嘗試將選手 ${name} 移入預備區`);
  
  let player =
    restingPlayers.find((p) => p.name === name) ||
    players.find((p) => p.name === name);
    
  if (player) {
    console.log(`【moveToReady】找到選手 ${name}，當前狀態：場次${player.matches || 0}，等待輪次${player.waitingTurns || 0}`);
    
    players = players.filter((p) => p.name !== name);
    restingPlayers = restingPlayers.filter((p) => p.name !== name);

    // 初始化等待輪數和標記為剛加入
    player.waitingTurns = 0;
    player.justJoinedReady = true;
    
    console.log(`【moveToReady】選手 ${name} 設置等待輪次為 0，標記為剛加入`);

    // 清除剛下場標記（如果有）
    if (player.justFinished) {
      player.justFinished = false;
    }

    // 將選手場次調整為所有活躍選手的平均場次
    const averageMatches = calculateActivePlayersAverageMatches();
    player.matches = averageMatches;
    
    console.log(`【moveToReady】選手 ${name} 場次調整為平均場次：${averageMatches}`);

    readyPlayers.push(player);
    console.log(`【moveToReady】選手 ${name} 已成功加入預備區，預備區目前有 ${readyPlayers.length} 人`);
    console.log(`【moveToReady】預備區選手列表：${readyPlayers.map(p => p.name).join(', ')}`);
    
    updateLists();
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
  }
}

// 更新場地顯示，添加即時計時功能
let courtTimers = {};

function updateCourtsDisplay(updateTimesOnly = false) {
  if (!updateTimesOnly) {
    document.getElementById("courts").innerHTML = courts
      .map((court, i) => {
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
            <span class="player-matches">場次: ${player.matches}</span>
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
            <span class="player-matches">場次: ${player.matches}</span>
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
            <div class="team-divider"><span>VS</span></div>
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

    // 尋找替補選手
    if (readyPlayers.length > 0) {
      let candidateList = readyPlayers.filter(
        (candidate) => Math.abs(candidate.level - restingPlayer.level) <= 1
      );
      if (candidateList.length === 0) {
        candidateList = [...readyPlayers];
      }
      candidateList.sort((a, b) => {
        if (a.matches === b.matches) {
          return (
            Math.abs(a.level - restingPlayer.level) -
            Math.abs(b.level - restingPlayer.level)
          );
        }
        return a.matches - b.matches;
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
  修改 findOptimalCombination 函式 - 新規則 2024/06/30：
  1. 已移除四人完全不能重複組合的限制
  2. 絕對規則：AB vs CD 兩隊等級相加差異必須在 ±1.5 範圍內
  3. 不符合等級規則則返回 null，由外部處理放寬邏輯
*/
function findOptimalCombination(sortedReady, lastCombination) {
  function internalFindOptimalCombination(pool, threshold) {
    let bestCombination = null;
    let bestScore = Infinity;
    let currentCombination = [];

    function evaluateCombination(comb) {
      // 已移除所有重複組合的檢查邏輯
      // 現在只評估等級平衡（絕對規則 ±1.5）和等待輪數

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
        let team1Sum = team1[0].level + team1[1].level;
        let team2Sum = team2[0].level + team2[1].level;
        let levelDiff = Math.abs(team1Sum - team2Sum);

        // 絕對規則：兩隊等級相加差異必須在 threshold 以內
        if (levelDiff <= threshold) {
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

          // 簡化評分：主要考慮等待輪數，其次考慮等級差異
          let score = waitingTurnsSum * 10 + levelDiff;

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
      for (let i = start; i < pool.length; i++) {
        currentCombination.push(pool[i]);
        backtrack(i + 1);
        currentCombination.pop();
      }
    }
    backtrack(0);
    return bestCombination;
  }

  // 絕對規則：只嘗試 1.5 等級差異
  let candidate = internalFindOptimalCombination(sortedReady, 1.5);
  
  // 如果找不到符合 ±1.5 等級差異的組合，返回 null
  // 不放寬標準，由外部處理
  if (candidate) {
    return candidate;
  } else {
    return null;
  }
  return candidate;
}

/* 
  放寬標準的組合尋找函式 - 無視等級差異限制
  僅考慮等待輪數和場次優先級
*/
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
  實作情況一（1-4人）和情況二（5-8+人）的選手選擇邏輯
*/
function selectPlayersForMatch() {
  // 分離準備區中的非剛下場和剛下場選手
  const readyNonFinished = readyPlayers.filter(p => !p.justFinished);
  const readyJustFinished = readyPlayers.filter(p => p.justFinished);
  
  console.log(`【新排場邏輯】開始選手選擇，準備區總人數: ${readyPlayers.length}人`);
  console.log(`【調試】等待選手: ${readyNonFinished.length}人，剛下場選手: ${readyJustFinished.length}人`);
  console.log(`【調試】等待選手:`, readyNonFinished.map(p => `${p.name}(${p.matches}場,等待${p.waitingTurns||0}輪)`));
  console.log(`【調試】剛下場選手:`, readyJustFinished.map(p => `${p.name}(${p.matches}場,剛下場)`));
  
  // 【優先權規則檢查】優先執行，主要基於等待選手進行判斷
  if (readyPlayers.length >= 4) {
    console.log(`【優先權規則檢查】開始檢查所有準備區選手的優先權規則`);
    
    // 檢查規則(1)：等待輪次為2輪的選手優先（只檢查準備區選手）
    const waitingTwoRounds = readyPlayers.filter(p => (p.waitingTurns || 0) === 2);
    const waitingThreeOrMore = readyPlayers.filter(p => (p.waitingTurns || 0) >= 3);
    
    if (waitingThreeOrMore.length > 0) {
      console.log(`【規則違反】有${waitingThreeOrMore.length}位選手等待超過3輪，強制處理`);
      
      // 強制讓違反規則的選手獲得最高優先權
      const sortedViolatingPlayers = waitingThreeOrMore.sort((a, b) => {
        if ((a.waitingTurns || 0) !== (b.waitingTurns || 0)) {
          return (b.waitingTurns || 0) - (a.waitingTurns || 0);
        }
        return Math.random() - 0.5;
      });
      
      if (waitingThreeOrMore.length >= 4) {
        const selected = sortedViolatingPlayers.slice(0, 4);
        console.log(`【強制處理】選擇前4位違反規則的選手: ${selected.map(p => `${p.name}(等待${p.waitingTurns}輪)`).join(', ')}`);
        return selected;
      } else {
        // 違反規則的選手不足4人，全部選上並補充其他選手
        let selected = [...sortedViolatingPlayers];
        
        // 補充其他選手，按等待輪次和場次排序
        const remainingPlayers = readyPlayers.filter(p => !waitingThreeOrMore.includes(p));
        const sortedRemaining = remainingPlayers.sort((a, b) => {
          if ((a.waitingTurns || 0) !== (b.waitingTurns || 0)) {
            return (b.waitingTurns || 0) - (a.waitingTurns || 0);
          }
          if (a.matches !== b.matches) {
            return a.matches - b.matches;
          }
          return Math.random() - 0.5;
        });
        
        const needed = 4 - selected.length;
        selected.push(...sortedRemaining.slice(0, needed));
        console.log(`【強制處理】選出組合: ${selected.map(p => `${p.name}(等待${p.waitingTurns || 0}輪)`).join(', ')}`);
        return selected;
      }
    } else if (waitingTwoRounds.length > 0) {
      console.log(`【規則檢查】有等待2輪選手，但需先檢查是否場次相同`);
      
      // 先檢查等待選手的場次是否相同（不包含剛下場選手）
      const waitingPlayerMatches = readyNonFinished.map(p => p.matches || 0);
      const minMatches = Math.min(...waitingPlayerMatches);
      const maxMatches = Math.max(...waitingPlayerMatches);
      
      if (minMatches === maxMatches) {
        console.log(`【規則(3)優先】等待2輪但場次皆相同(${minMatches}場)，依據等級分配組隊`);
        
        // 場次相同時，優先適用規則3（等級配對）
        const playersToUse = readyNonFinished.length >= 4 ? readyNonFinished : readyPlayers;
        const playerSource = readyNonFinished.length >= 4 ? "等待選手" : "所有選手(包含剛下場)";
        
        console.log(`【調試】觸發規則3（場次相同優先於等待2輪），從${playersToUse.length}名${playerSource}中選4人`);
        
        // 規則三：只考慮等級配對，忽略等待輪次
        const levelOnlyCombination = findOptimalCombinationLevelOnly(playersToUse);
        
        if (levelOnlyCombination) {
          console.log(`【純等級配對成功】選出組合: ${levelOnlyCombination.map(p => `${p.name}(等級${p.level})`).join(', ')}`);
          return levelOnlyCombination;
        } else {
          // 嘗試放寬規則
          console.log(`【等級配對】嚴格規則失敗，嘗試放寬規則`);
          const relaxedCombination = findOptimalCombinationRelaxed(playersToUse);
          
          if (relaxedCombination) {
            console.log(`【放寬配對成功】選出組合: ${relaxedCombination.map(p => `${p.name}(等級${p.level})`).join(', ')}`);
            return relaxedCombination;
          } else {
            // 等級配對完全失敗，從等待2輪選手中優先選擇
            console.log(`【等級配對失敗】回到等待2輪優先邏輯`);
            if (waitingTwoRounds.length >= 4) {
              const selected = waitingTwoRounds.slice(0, 4);
              console.log(`【等待2輪優先】選出: ${selected.map(p => `${p.name}(等待2輪)`).join(', ')}`);
              return selected;
            } else {
              let selected = [...waitingTwoRounds];
              const remainingPlayers = readyPlayers.filter(p => (p.waitingTurns || 0) !== 2);
              const sortedRemaining = remainingPlayers.sort((a, b) => {
                if ((a.waitingTurns || 0) !== (b.waitingTurns || 0)) {
                  return (b.waitingTurns || 0) - (a.waitingTurns || 0);
                }
                if (a.matches !== b.matches) {
                  return a.matches - b.matches;
                }
                return Math.random() - 0.5;
              });
              const needed = 4 - selected.length;
              selected.push(...sortedRemaining.slice(0, needed));
              console.log(`【等待2輪優先】選出組合: ${selected.map(p => `${p.name}(等待${p.waitingTurns || 0}輪)`).join(', ')}`);
              return selected;
            }
          }
        }
      } else {
        console.log(`【規則(1)】場次不同且有等待2輪選手，等待2輪優先`);
        
        // 場次不同時，等待2輪選手優先
        if (waitingTwoRounds.length >= 4) {
          const selected = waitingTwoRounds.slice(0, 4);
          console.log(`【等待2輪優先】選出: ${selected.map(p => `${p.name}(等待2輪)`).join(', ')}`);
          return selected;
        } else {
          // 等待2輪的選手不足4人，補充其他選手
          let selected = [...waitingTwoRounds];
          
          const remainingPlayers = readyPlayers.filter(p => (p.waitingTurns || 0) !== 2);
          const sortedRemaining = remainingPlayers.sort((a, b) => {
            if ((a.waitingTurns || 0) !== (b.waitingTurns || 0)) {
              return (b.waitingTurns || 0) - (a.waitingTurns || 0);
            }
            if (a.matches !== b.matches) {
              return a.matches - b.matches;
            }
            return Math.random() - 0.5;
          });
          
          const needed = 4 - selected.length;
          selected.push(...sortedRemaining.slice(0, needed));
          console.log(`【等待2輪優先】選出組合: ${selected.map(p => `${p.name}(等待${p.waitingTurns || 0}輪)`).join(', ')}`);
          return selected;
        }
      }
    } else {
      // 檢查規則(2)：等待輪次皆為1輪以下（只檢查準備區選手）
      const maxWaitingTurns = Math.max(...readyPlayers.map(p => p.waitingTurns || 0));
      
      if (maxWaitingTurns <= 1) {
        console.log(`【規則(2)】等待輪次皆為1輪以下，檢查場次`);
        
        // 定義所有可選選手：準備區的所有選手（包含剛下場的選手，因為剛下場的選手已經在readyPlayers中）
        const allAvailablePlayers = [...readyPlayers];
        
        // 檢查規則(3)：場次是否皆相同（檢查所有可選選手）
        const allMatches = allAvailablePlayers.map(p => p.matches || 0);
        const minMatches = Math.min(...allMatches);
        const maxMatches = Math.max(...allMatches);
        
        if (minMatches === maxMatches) {
          console.log(`【規則(3)】場次皆相同(${minMatches}場)，依據等級分配組隊`);
          
          // 優先從等待選手中選擇，如果等待選手不足4人則包含剛下場選手
          const playersToUse = readyNonFinished.length >= 4 ? readyNonFinished : allAvailablePlayers;
          const playerSource = readyNonFinished.length >= 4 ? "等待選手" : "所有選手(包含剛下場)";
          
          console.log(`【調試】觸發規則3，從${playersToUse.length}名${playerSource}中選4人（準備區${readyPlayers.length}人）`);
          
          // 使用等級配對邏輯選4人
          const bestCombination = findOptimalCombination(playersToUse);
          
          if (bestCombination) {
            console.log(`【等級配對成功】選出組合: ${bestCombination.map(p => `${p.name}(等級${p.level})`).join(', ')}`);
            return bestCombination;
          } else {
            // 嘗試放寬規則
            console.log(`【等級配對】嚴格規則失敗，嘗試放寬規則`);
            const relaxedCombination = findOptimalCombinationRelaxed(playersToUse);
            
            if (relaxedCombination) {
              console.log(`【放寬配對成功】選出組合: ${relaxedCombination.map(p => `${p.name}(等級${p.level})`).join(', ')}`);
              return relaxedCombination;
            } else {
              // 等級配對完全失敗，直接從選定的選手中隨機選4人
              console.log(`【規則(3)】等級配對失敗，從${playerSource}中隨機選4人`);
              const shuffledPlayers = [...playersToUse].sort(() => Math.random() - 0.5);
              const randomSelection = shuffledPlayers.slice(0, 4);
              console.log(`【隨機選擇】選出組合: ${randomSelection.map(p => `${p.name}(場次${p.matches},等級${p.level})`).join(', ')}`);
              return randomSelection;
            }
          }
        } else {
          console.log(`【規則(2)】場次不同，按場次最低優先`);
          
          // 從所有可選選手中按場次排序，選場次最低的4人
          const sortedByMatches = [...allAvailablePlayers].sort((a, b) => {
            if (a.matches !== b.matches) {
              return a.matches - b.matches; // 場次最低優先
            }
            // 場次相同時，準備區選手優先於剛下場選手
            const aWaiting = a.waitingTurns || 0;
            const bWaiting = b.waitingTurns || 0;
            const aJustFinished = a.justFinished || false;
            const bJustFinished = b.justFinished || false;
            
            if (aJustFinished !== bJustFinished) {
              return aJustFinished ? 1 : -1; // 非剛下場優先
            }
            // 都是非剛下場，按等待輪次高的優先
            if (aWaiting !== bWaiting) {
              return bWaiting - aWaiting;
            }
            // 最後隨機
            return Math.random() - 0.5;
          });
          
          const selectedByMatches = sortedByMatches.slice(0, 4);
          console.log(`【場次最低優先】選出: ${selectedByMatches.map(p => `${p.name}(${p.matches}場,等待${p.waitingTurns || 0}輪)`).join(', ')}`);
          return selectedByMatches;
        }
      } else {
        console.log(`【優先權規則不適用】有選手等待超過1輪，回到原始邏輯`);
      }
    }
  }
  
  // 分別取得準備區選手和剛下場選手（在優先權規則檢查之後）
  const readyNonFinishedFinal = readyPlayers.filter(p => !p.justFinished);
  const justFinishedPlayers = readyPlayers.filter(p => p.justFinished);
  const readyCount = readyNonFinishedFinal.length;
  
  console.log(`【回到原始邏輯】準備區非剛下場選手: ${readyCount}人, 剛下場選手: ${justFinishedPlayers.length}人`);
  
  // 回到原始的情況一或情況二邏輯
  if (readyCount >= 1 && readyCount <= 4) {
    return selectPlayersScenarioOne(readyNonFinishedFinal, justFinishedPlayers);
  } else if (readyCount >= 5) {
    return selectPlayersScenarioTwo(readyNonFinishedFinal, justFinishedPlayers);
  } else {
    // 準備區無選手，使用原邏輯
    return null;
  }
}

/*
  情況一：準備區 1-4 人的選手選擇邏輯
*/
function selectPlayersScenarioOne(readyNonFinished, justFinishedPlayers) {
  const readyCount = readyNonFinished.length;
  let selectedPlayers = [];
  
  console.log(`【情況一】準備區${readyCount}人，開始選擇選手`);
  
  // 準備區選手按優先序排序
  const sortedReady = [...readyNonFinished].sort((a, b) => {
    // 第一優先：等待輪次最高
    if ((a.waitingTurns || 0) !== (b.waitingTurns || 0)) {
      return (b.waitingTurns || 0) - (a.waitingTurns || 0);
    }
    // 第二優先：場次最低
    if (a.matches !== b.matches) {
      return a.matches - b.matches;
    }
    // 第三優先：隨機
    return Math.random() - 0.5;
  });
  
  // 剛下場選手隨機排序
  const shuffledJustFinished = [...justFinishedPlayers].sort(() => Math.random() - 0.5);
  
  switch (readyCount) {
    case 1:
      // 準備區1人全上 + 剛下場4人取3人
      selectedPlayers = [...sortedReady]; // 1人
      selectedPlayers.push(...shuffledJustFinished.slice(0, 3)); // 3人
      console.log(`【情況一-1人】選出: 準備區1人 + 剛下場3人`);
      break;
      
    case 2:
      // 準備區2人全上 + 剛下場4人取2人
      selectedPlayers = [...sortedReady]; // 2人
      selectedPlayers.push(...shuffledJustFinished.slice(0, 2)); // 2人
      console.log(`【情況一-2人】選出: 準備區2人 + 剛下場2人`);
      break;
      
    case 3:
      // 準備區3人取2人 + 剛下場4人取2人
      selectedPlayers = sortedReady.slice(0, 2); // 2人
      selectedPlayers.push(...shuffledJustFinished.slice(0, 2)); // 2人
      console.log(`【情況一-3人】選出: 準備區前2人 + 剛下場2人`);
      break;
      
    case 4:
      // 準備區4人取3人 + 剛下場4人取1人
      // 準備區按場次最低優先（無視等待輪次）
      const sortedReadyByMatches = [...readyNonFinished].sort((a, b) => {
        // 第一優先：場次最低
        if (a.matches !== b.matches) {
          return a.matches - b.matches;
        }
        // 第二優先：隨機
        return Math.random() - 0.5;
      });
      
      selectedPlayers = sortedReadyByMatches.slice(0, 3); // 3人
      selectedPlayers.push(...shuffledJustFinished.slice(0, 1)); // 1人
      console.log(`【情況一-4人】選出: 準備區前3人(按場次) + 剛下場1人`);
      break;
  }
  
  console.log(`【情況一】最終選出選手: ${selectedPlayers.map(p => p.name).join(', ')}`);
  return selectedPlayers;
}

/*
  情況二：準備區 5-8+ 人的選手選擇邏輯
*/
function selectPlayersScenarioTwo(readyNonFinished, justFinishedPlayers) {
  const readyCount = readyNonFinished.length;
  let selectedPlayers = [];
  
  console.log(`【情況二】準備區${readyCount}人，開始選擇選手`);
  
  if (readyCount === 5) {
    // 準備區5人取3人 + 剛下場4人取1人
    
    // 準備區選手按優先序排序
    const sortedReady = [...readyNonFinished].sort((a, b) => {
      if ((a.waitingTurns || 0) !== (b.waitingTurns || 0)) {
        return (b.waitingTurns || 0) - (a.waitingTurns || 0);
      }
      if (a.matches !== b.matches) {
        return a.matches - b.matches;
      }
      return Math.random() - 0.5;
    });
    
    // 剛下場選手按場次最低優先
    const sortedJustFinished = [...justFinishedPlayers].sort((a, b) => {
      if (a.matches !== b.matches) {
        return a.matches - b.matches;
      }
      return Math.random() - 0.5;
    });
    
    selectedPlayers = sortedReady.slice(0, 3); // 準備區3人
    selectedPlayers.push(...sortedJustFinished.slice(0, 1)); // 剛下場1人
    console.log(`【情況二-5人】選出: 準備區前3人 + 剛下場1人`);
    
  } else if (readyCount === 6 || readyCount === 7) {
    // 準備區6-7人取4人，剛下場全下
    // 新邏輯：等待輪次為2輪優先，全部選手等待輪次不可高於3輪
    
    // 先檢查是否有選手等待超過3輪
    const overThreeRounds = readyNonFinished.filter(p => (p.waitingTurns || 0) > 3);
    if (overThreeRounds.length > 0) {
      console.log(`【情況二-${readyCount}人】警告：有${overThreeRounds.length}位選手等待超過3輪`);
    }
    
    // 按等待輪次分組 - 修正：等待3輪的選手獲得絕對優先權
    const waitingThreeRounds = readyNonFinished.filter(p => (p.waitingTurns || 0) === 3);
    const waitingTwoRounds = readyNonFinished.filter(p => (p.waitingTurns || 0) === 2);
    const waitingOneOrLess = readyNonFinished.filter(p => (p.waitingTurns || 0) <= 1);
    
    // 檢查是否有違反規則的選手（等待超過3輪）
    const violatingPlayers = readyNonFinished.filter(p => (p.waitingTurns || 0) > 3);
    if (violatingPlayers.length > 0) {
      console.error(`【規則違反】有${violatingPlayers.length}位選手等待超過3輪，這違反了系統規則！`);
      console.error(`違反規則的選手:`, violatingPlayers.map(p => `${p.name}(${p.waitingTurns}輪)`).join(', '));
      
      // 強制讓違反規則的選手獲得最高優先權
      const sortedViolatingPlayers = violatingPlayers.sort((a, b) => {
        if ((a.waitingTurns || 0) !== (b.waitingTurns || 0)) {
          return (b.waitingTurns || 0) - (a.waitingTurns || 0);
        }
        return Math.random() - 0.5;
      });
      
      if (violatingPlayers.length >= 4) {
        // 違反規則的選手超過4人，強制選4人
        selectedPlayers = sortedViolatingPlayers.slice(0, 4);
        console.log(`【強制處理】選擇前4位違反規則的選手上場`);
      } else {
        // 違反規則的選手不足4人，全部選上並補充其他選手
        selectedPlayers = [...sortedViolatingPlayers];
        console.log(`【強制處理】所有違反規則的選手必須上場`);
        
        // 補充等待3輪的選手
        if (waitingThreeRounds.length > 0) {
          const needed = 4 - selectedPlayers.length;
          selectedPlayers.push(...waitingThreeRounds.slice(0, needed));
        }
        
        // 補充等待2輪的選手
        if (selectedPlayers.length < 4 && waitingTwoRounds.length > 0) {
          const needed = 4 - selectedPlayers.length;
          selectedPlayers.push(...waitingTwoRounds.slice(0, needed));
        }
        
        // 補充等待1輪以下的選手
        if (selectedPlayers.length < 4 && waitingOneOrLess.length > 0) {
          const sortedWaitingOneOrLess = waitingOneOrLess.sort((a, b) => {
            if (a.matches !== b.matches) {
              return a.matches - b.matches;
            }
            return Math.random() - 0.5;
          });
          
          const needed = 4 - selectedPlayers.length;
          selectedPlayers.push(...sortedWaitingOneOrLess.slice(0, needed));
        }
      }
    } else if (waitingThreeRounds.length > 0) {
      // 有等待3輪的選手，絕對優先選擇（防止超過3輪）
      console.log(`【情況二-${readyCount}人】絕對優先選擇等待3輪的選手: ${waitingThreeRounds.length}人`);
      
      if (waitingThreeRounds.length >= 4) {
        // 等待3輪的選手超過4人，從中選4人
        selectedPlayers = waitingThreeRounds.slice(0, 4);
      } else {
        // 等待3輪的選手不足4人，補充其他選手
        selectedPlayers = [...waitingThreeRounds];
        
        // 優先補充等待2輪的選手
        if (waitingTwoRounds.length > 0) {
          const needed = 4 - selectedPlayers.length;
          selectedPlayers.push(...waitingTwoRounds.slice(0, needed));
        }
        
        // 如果還不足4人，補充等待1輪以下的選手
        if (selectedPlayers.length < 4 && waitingOneOrLess.length > 0) {
          const sortedWaitingOneOrLess = waitingOneOrLess.sort((a, b) => {
            if (a.matches !== b.matches) {
              return a.matches - b.matches;
            }
            return Math.random() - 0.5;
          });
          
          const needed = 4 - selectedPlayers.length;
          selectedPlayers.push(...sortedWaitingOneOrLess.slice(0, needed));
        }
      }
    } else if (waitingTwoRounds.length > 0) {
      // 有等待2輪的選手，優先選擇
      console.log(`【情況二-${readyCount}人】優先選擇等待2輪的選手: ${waitingTwoRounds.length}人`);
      
      if (waitingTwoRounds.length >= 4) {
        // 等待2輪的選手超過4人，從中選4人
        selectedPlayers = waitingTwoRounds.slice(0, 4);
      } else {
        // 等待2輪的選手不足4人，補充其他選手
        selectedPlayers = [...waitingTwoRounds];
        
        // 從等待1輪以下的選手中按場次最低優先補充
        const sortedWaitingOneOrLess = waitingOneOrLess.sort((a, b) => {
          if (a.matches !== b.matches) {
            return a.matches - b.matches;
          }
          return Math.random() - 0.5;
        });
        
        const needed = 4 - selectedPlayers.length;
        selectedPlayers.push(...sortedWaitingOneOrLess.slice(0, needed));
      }
    } else {
      // 沒有等待2輪以上的選手，按場次最低優先
      console.log(`【情況二-${readyCount}人】無等待2輪以上選手，按場次最低優先`);
      
      // 檢查準備區選手的場次是否都相同
      const minMatches = Math.min(...readyNonFinished.map(p => p.matches || 0));
      const maxMatches = Math.max(...readyNonFinished.map(p => p.matches || 0));
      
      if (minMatches === maxMatches) {
        // 場次皆相同，依據等級分配組隊，剛下場全下
        console.log(`【情況二-${readyCount}人】場次皆相同(${minMatches}場)，依據等級分配組隊，剛下場全下`);
        
        // 使用等級配對邏輯從準備區選手中選出最佳4人組合
        const bestCombination = findOptimalCombination(readyNonFinished);
        
        if (bestCombination) {
          selectedPlayers = bestCombination;
          console.log(`【等級配對】選出最佳組合: ${selectedPlayers.map(p => `${p.name}(等級${p.level})`).join(', ')}`);
        } else {
          // 如果等級配對失敗，嘗試放寬規則
          console.log(`【等級配對】嚴格規則失敗，嘗試放寬規則`);
          const relaxedCombination = findOptimalCombinationRelaxed(readyNonFinished);
          
          if (relaxedCombination) {
            selectedPlayers = relaxedCombination;
            console.log(`【放寬配對】選出組合: ${selectedPlayers.map(p => `${p.name}(等級${p.level})`).join(', ')}`);
          } else {
            // 最後手段：隨機選擇
            console.log(`【最後手段】等級配對完全失敗，隨機選擇4人`);
            const shuffledPlayers = [...readyNonFinished].sort(() => Math.random() - 0.5);
            selectedPlayers = shuffledPlayers.slice(0, 4);
          }
        }
      } else {
        // 場次不同，按場次最低優先
        console.log(`【情況二-${readyCount}人】場次不同，按場次最低優先`);
        
        const sortedByMatches = [...readyNonFinished].sort((a, b) => {
          if (a.matches !== b.matches) {
            return a.matches - b.matches;
          }
          return Math.random() - 0.5;
        });
        
        selectedPlayers = sortedByMatches.slice(0, 4);
        console.log(`【場次優先】選出場次最低的4位: ${selectedPlayers.map(p => `${p.name}(${p.matches}場)`).join(', ')}`);
      }
    }
    
    console.log(`【情況二-${readyCount}人】選出: 準備區4人，剛下場全下`);
    
  } else if (readyCount >= 8) {
    // 準備區8+人：先取等待輪次最高2人，再取場次最低2人
    
    // 按等待輪次排序
    const sortedByWaiting = [...readyNonFinished].sort((a, b) => {
      if ((a.waitingTurns || 0) !== (b.waitingTurns || 0)) {
        return (b.waitingTurns || 0) - (a.waitingTurns || 0);
      }
      return Math.random() - 0.5;
    });
    
    // 按場次排序
    const sortedByMatches = [...readyNonFinished].sort((a, b) => {
      if (a.matches !== b.matches) {
        return a.matches - b.matches;
      }
      return Math.random() - 0.5;
    });
    
    // 先取等待輪次最高2人
    const topWaiting = sortedByWaiting.slice(0, 2);
    selectedPlayers.push(...topWaiting);
    
    // 再從剩餘選手中取場次最低2人（避免重複）
    const remainingPlayers = readyNonFinished.filter(p => !topWaiting.includes(p));
    const sortedRemaining = remainingPlayers.sort((a, b) => {
      if (a.matches !== b.matches) {
        return a.matches - b.matches;
      }
      return Math.random() - 0.5;
    });
    
    selectedPlayers.push(...sortedRemaining.slice(0, 2));
    console.log(`【情況二-8+人】選出: 等待輪次最高2人 + 場次最低2人`);
  }
  
  console.log(`【情況二】最終選出選手: ${selectedPlayers.map(p => p.name).join(', ')}`);
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

  console.log(
    `預備區狀態: 共${readyPlayers.length}名選手，` +
      `其中剛下場: ${justFinishedCount}名，` +
      `等待1輪: ${waitingTurnsOneCount}名，` +
      `等待2輪以上: ${waitingTurnsTwoCount}名`
  );

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

  // 為每個空場地生成比賽
  let hasNewMatches = false;
  for (let i = 0; i < courts.length; i++) {
    let result = generateMatchForCourtImmediate(i);
    if (result) hasNewMatches = true;
  }

  // 添加詳細調試信息

  console.log(
    "排場前預備區選手狀態:",
    readyPlayersBeforeMatch.map(
      (p) =>
        `${p.name}(等待${p.waitingTurns || 0}輪,剛加入:${
          p.justJoinedReady || false
        })`
    )
  );

  console.log(
    "排場後預備區選手狀態:",
    readyPlayers.map(
      (p) =>
        `${p.name}(等待${p.waitingTurns || 0}輪,剛加入:${
          p.justJoinedReady || false
        })`
    )
  );

  // 使用統一的等待輪次更新函數
  updateWaitingTurnsAfterMatch(readyPlayersBeforeMatch, hasNewMatches);

  // 如果有新對戰，播報新對戰
  if (hasNewMatches) {
    setTimeout(() => {
      announceAllCourts();
    }, 1000);
  } else {
    // 沒有新的比賽被安排，但預備區選手等待輪數已增加
  }
}

// 獨立的等待輪次更新函數
function updateWaitingTurnsAfterMatch(readyPlayersBeforeMatch, hasNewMatches) {
  console.log(`【updateWaitingTurnsAfterMatch】開始更新等待輪次，hasNewMatches: ${hasNewMatches}`);
  
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
    console.log(`【等待輪次更新】有新比賽產生，開始更新未被選中選手的等待輪次`);
  } else {
    console.log(`【等待輪次更新】沒有新比賽產生，但仍需更新等待選手的等待輪次`);
  }
  console.log(`【等待輪次更新】排場前${readyPlayersBeforeMatch.length}人，排場後${readyPlayers.length}人，${playersSelected.length}人被選中上場`);
  
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
  
  console.log(`【等待輪次更新】清除標記：剛加入 ${clearedJustJoinedCount} 人，剛處理 ${clearedJustProcessedCount} 人`);

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
        console.log(`【等待輪次更新】剛下場選手 ${player.name} 等待輪次：0 → 1`);
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
      console.log(`【等待輪次更新】清除剛下場選手 ${player.name} 等待輪次：設為 1`);
    } else {
      // 正常等待選手，增加等待輪數
      const oldValue = player.waitingTurns || 0;
      player.waitingTurns = oldValue + 1;
      updatedCount++;
      console.log(`【等待輪次更新】等待選手 ${player.name} 等待輪次：${oldValue} → ${player.waitingTurns}`);
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
  
  console.log(`【等待輪次更新完成】更新結果: 等待0輪${waitingStats[0]}人, 等待1輪${waitingStats[1]}人, 等待2輪${waitingStats[2]}人, 等待3+輪${waitingStats[3]}人`);

  // 更新界面以顯示新的等待輪數
  updateLists();
}

// 修改 generateMatchForCourtImmediate 函數 - 考慮等待輪數的完整優化版
function generateMatchForCourtImmediate(courtIndex) {
  // 使用所有預備區的選手（包含剛下場的）
  let pool = readyPlayers;
  let candidatePool;

  // 【修改後邏輯】檢查是否出現預備區選手循環情況
  // 過濾出非剛下場的選手（真正等待的選手）
  const nonJustFinishedPlayers = readyPlayers.filter((p) => !p.justFinished);

  // 添加調適訊息
  console.log("【循環檢測】開始檢查預備區選手循環情況");
  console.log(`【循環檢測】目前預備區總人數: ${readyPlayers.length}, 非剛下場選手人數: ${nonJustFinishedPlayers.length}`);

  // 判斷非剛下場選手的數量是否符合檢測條件（僅在4人以下時檢測）
  if (nonJustFinishedPlayers.length <= 4 && nonJustFinishedPlayers.length > 0) {
    // 獲取當前非剛下場選手的名稱列表
    const currentNonJustFinishedNames = nonJustFinishedPlayers
      .map((p) => p.name)
      .sort();
    const currentNonJustFinishedNamesStr =
      currentNonJustFinishedNames.join(",");
    
    console.log(`【循環檢測】當前非剛下場選手: ${currentNonJustFinishedNamesStr}`);
    console.log(`【循環檢測】上次紀錄的選手: ${lastReadyPlayersNames.join(",")}`);
    console.log(`【循環檢測】當前循環計數: ${readyPlayersCycleCount}`);

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
      console.log(`【循環檢測】偵測到重複組合，循環計數增加為: ${readyPlayersCycleCount}`);
      if (matchesPrevPrevGroup) {
        console.log(`【循環檢測】組合與前2輪相同，偵測到交替循環模式`);
      }
    } else {
      // 選手組合已變化但不重置計數，只在計數達到一定閾值後重置
      // 這樣可以在交替循環模式中仍然積累足夠的計數
      if (readyPlayersCycleCount > 3) {
        console.log("【循環檢測】選手組合持續變化，重置循環計數");
        readyPlayersCycleCount = 0;
      } else {
        console.log("【循環檢測】選手組合變化，但保持循環計數");
      }
      
      // 保存前一次的組合為上上次組合
      window.prevPrevReadyNames = [...lastReadyPlayersNames];
      // 更新上次組合
      lastReadyPlayersNames = [...currentNonJustFinishedNames];
    }
  } else {
    // 非剛下場選手數量不符合條件
    console.log(`【循環檢測】非剛下場選手數量不符合條件: ${nonJustFinishedPlayers.length}人，無法進行循環檢測`);
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
    
    // 4. 其他情況考慮等級
    if (a.level !== b.level) return a.level - b.level;
    
    // 5. 最後隨機
    return Math.random() - 0.5;
  });

  // 記錄排序結果用於調試
  if (pool.length >= 4) {
    // 顯示排序前後的詳細資訊
    console.log(`【排序調試】排序前總人數：${pool.length}`);
    console.log("【排序調試】排序前所有選手狀態：");
    pool.forEach((p, index) => {
      const status = p.justFinished ? "剛下場" : `等待${p.waitingTurns || 0}輪`;
      console.log(`${index+1}. ${p.name}: ${status}, 場次${p.matches}`);
    });
    
    console.log("【排序調試】排序後所有選手順序：");
    sortedReady.forEach((p, i) => {
      const status = p.justFinished ? "剛下場" : `等待${p.waitingTurns || 0}輪`;
      const score = p.justFinished ? 0 : (p.waitingTurns <= 1 ? 0 : -(p.waitingTurns - 1) * 10);
      console.log(`${i+1}. ${p.name}: ${status}, 場次${p.matches}, 分數${score}`);
    });
  }

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
    
    // 【新排場邏輯】優先使用新的選手選擇邏輯
    console.log("【新排場邏輯】開始使用新的選手選擇邏輯");
    const newSelectedPlayers = selectPlayersForMatch();
    
    if (newSelectedPlayers && newSelectedPlayers.length === 4) {
      console.log("【新排場邏輯】成功選出4位選手，開始組隊配對");
      
      // 使用選出的選手進行等級配對
      let candidate = findOptimalCombination(newSelectedPlayers, lastCombination);
      
      if (candidate) {
        // 成功找到符合等級規則的組合
        candidate.forEach((player) => {
          player.justFinished = false;
          player.justJoinedReady = false;
          player.waitingTurns = 0;
          readyPlayers = readyPlayers.filter((p) => p.name !== player.name);
          players = players.filter((p) => p.name !== player.name);
          restingPlayers = restingPlayers.filter((p) => p.name !== player.name);
        });
        
        let team1Key = getPairKey(candidate[0].name, candidate[1].name);
        let team2Key = getPairKey(candidate[2].name, candidate[3].name);
        lastPairings = new Set([team1Key, team2Key]);
        
        const startTime = new Date();
        candidate.forEach((player) => {
          player.currentMatchStartTime = startTime;
        });
        
        courts[courtIndex] = candidate;
        lastCombinationByCourt[courtIndex] = candidate;
        courts[courtIndex].startTime = startTime;
        courts[courtIndex].formattedStartTime = formatTime(startTime);
        
        updateLists();
        updateCourtsDisplay();
        
        console.log("【新排場邏輯】成功建立比賽組合:", candidate.map(p => p.name).join(", "));
        return candidate;
      } else {
        // 無法找到符合等級規則的組合，觸發放寬標準
        console.log("【新排場邏輯】無法找到符合等級規則的組合，觸發放寬標準");
        alert("即將單次放寬組合標準以利進行組隊");
        
        const relaxedCandidate = findOptimalCombinationRelaxed(newSelectedPlayers, lastCombination);
        
        if (relaxedCandidate) {
          relaxedCandidate.forEach((player) => {
            player.justFinished = false;
            player.justJoinedReady = false;
            player.waitingTurns = 0;
            readyPlayers = readyPlayers.filter((p) => p.name !== player.name);
            players = players.filter((p) => p.name !== player.name);
            restingPlayers = restingPlayers.filter((p) => p.name !== player.name);
          });
          
          let team1Key = getPairKey(relaxedCandidate[0].name, relaxedCandidate[1].name);
          let team2Key = getPairKey(relaxedCandidate[2].name, relaxedCandidate[3].name);
          lastPairings = new Set([team1Key, team2Key]);
          
          const startTime = new Date();
          relaxedCandidate.forEach((player) => {
            player.currentMatchStartTime = startTime;
          });
          
          courts[courtIndex] = relaxedCandidate;
          lastCombinationByCourt[courtIndex] = relaxedCandidate;
          courts[courtIndex].startTime = startTime;
          courts[courtIndex].formattedStartTime = formatTime(startTime);
          
          updateLists();
          updateCourtsDisplay();
          
          console.log("【新排場邏輯-放寬標準】成功建立比賽組合:", relaxedCandidate.map(p => p.name).join(", "));
          return relaxedCandidate;
        }
      }
    }
    
    // 【修正】新邏輯失敗後不再回退到舊邏輯，避免重新選擇選手
    console.log("【新排場邏輯】選手選擇失敗，無法找到合適的組合");
    alert("無法找到符合等級規則的組合，可能需要調整選手等級或增加選手數量");
    return null;
  } // 關閉 if (courts[courtIndex].length === 0 && candidatePool.length >= 4) 的大括號
    
    /*
    // 【已註解】舊邏輯 - 回退到原始選手選擇邏輯
    // 這個邏輯會重新從所有準備區選手中選擇，可能包含剛下場選手
    // 與新邏輯的「準備區7人時只從非剛下場選手中選4人」需求衝突
    
    // 【修改後邏輯】檢查是否需要激活交叉選擇 - 考慮非剛下場選手
    // 過濾出非剛下場的選手
    const nonJustFinishedCount = readyPlayers.filter(
      (p) => !p.justFinished
    ).length;

    console.log("【交叉組隊】開始檢查是否需要啟動交叉組隊機制");
    console.log(`【交叉組隊】非剛下場選手人數: ${nonJustFinishedCount}, 循環計數: ${readyPlayersCycleCount}`);

    // 原來的判斷條件：當非剛下場選手數量<=4且>0，且循環計數>=2時觸發
    // 問題在於readyPlayersCycleCount值一直為0，無法累加，導致條件永遠不成立
    
    // 檢查當前預備區的4人選手是否與上次排場時的4人選手相同
    // 為了直接檢測排場固定循環，我們使用一個全局變數存儲最近4次排場中使用的選手
    if (!window.recentlyUsedPlayers) {
      window.recentlyUsedPlayers = [];
    }
    
    // 將當前候選池中的選手名稱提取出來進行比較
    const currentPoolNames = candidatePool.slice(0, 8).map(p => p.name).sort().join(',');
    console.log(`【交叉組隊】當前候選池前8名選手: ${currentPoolNames}`);
    
    // 檢查是否在最近的排場記錄中出現過相同的選手組合
    let cycleDetected = false;
    if (window.recentlyUsedPlayers.length > 0) {
      // 檢查與最近使用的選手組合是否有相似性
      for (let i = 0; i < window.recentlyUsedPlayers.length; i++) {
        const pastRecord = window.recentlyUsedPlayers[i];
        console.log(`【交叉組隊】比較過去記錄 #${i+1}: ${pastRecord}`);
        
        if (pastRecord.includes(currentPoolNames) || currentPoolNames.includes(pastRecord)) {
          cycleDetected = true;
          console.log(`【交叉組隊】檢測到選手循環！與過去記錄 #${i+1} 相似`);
          break;
        }
      }
    }
    
    // 將當前候選池添加到歷史記錄
    window.recentlyUsedPlayers.unshift(currentPoolNames);
    // 只保留最近4次的記錄
    if (window.recentlyUsedPlayers.length > 4) {
      window.recentlyUsedPlayers.pop();
    }
    
    // 更改邏輯，使用直接的循環檢測
    const useCrossSelectionLogic =
      nonJustFinishedCount <= 4 &&
      nonJustFinishedCount > 0 &&
      cycleDetected;
    
    console.log(`【交叉組隊】是否符合交叉組隊條件: ${useCrossSelectionLogic}`);
    console.log(`【交叉組隊】詳細檢查: 非剛下場選手數量<=${nonJustFinishedCount<=4}, 非剛下場選手數量>0=${nonJustFinishedCount>0}, 檢測到選手循環=${cycleDetected}`);

    let candidate = null;

    if (useCrossSelectionLogic) {
      console.log("【交叉組隊】條件符合！開始執行交叉組隊選擇邏輯...");
      // 1. 檢查預備區是否有剛下場選手
      const readyFinished = readyPlayers.filter((p) => p.justFinished);
      // 2. 檢查休息區是否有剛下場選手
      const restingFinished = restingPlayers.filter((p) => p.justFinished);
      // 3. 檢查選手列表是否有剛下場選手
      const listFinished = players.filter((p) => p.justFinished);

      // 合併所有剛下場選手 - 以預備區為主要來源
      let recentlyFinishedPlayers = [...readyFinished];

      // 只有在預備區找不到足夠的剛下場選手時，才考慮其他區域
      if (recentlyFinishedPlayers.length < 2) {
        recentlyFinishedPlayers = [
          ...recentlyFinishedPlayers,
          ...restingFinished,
          ...listFinished,
        ];
      }

      if (recentlyFinishedPlayers.length >= 2 && readyPlayers.length >= 2) {
        // 交叉選擇邏輯：從預備區和剛下場選手中各選選手

        // 先過濾掉預備區中剛下場的選手，確保不重複選擇
        const readyNonFinished = readyPlayers.filter((p) => !p.justFinished);

        // 如果過濾後的預備區選手不足，回退使用全部預備區選手
        const readyPool =
          readyNonFinished.length >= 2 ? readyNonFinished : readyPlayers;

        // 從預備區選擇選手
        const readyTop2 = [...readyPool]
          .sort((a, b) => {
            // 優先選擇等待輪數高的選手
            if (a.waitingTurns !== b.waitingTurns)
              return b.waitingTurns - a.waitingTurns;
            // 次優先級：場次少的選手
            return a.matches - b.matches;
          })
          .slice(0, 2);

        // 從剛下場選手中選擇
        const finishedTop2 = [...recentlyFinishedPlayers]
          .sort((a, b) => {
            // 優先選擇場次少的選手
            return a.matches - b.matches;
          })
          .slice(0, 2);

        // 組合這些選手並確保沒有重複
        // 建立一個 Set 來追蹤已選擇的選手名稱
        const selectedNames = new Set();
        const candidateList = [];

        // 添加選手到候選組合，確保沒有重複
        const addToCandidate = (player) => {
          if (!selectedNames.has(player.name)) {
            selectedNames.add(player.name);
            candidateList.push(player);
          }
        };

        // 依序添加不同來源的選手直到湊滿4人
        readyTop2.forEach(addToCandidate);
        finishedTop2.forEach(addToCandidate);

        // 如果還不足4人，從預備區補充
        if (candidateList.length < 4) {
          // 選擇尚未被選中的預備區選手
          const additionalPlayers = readyPlayers
            .filter((p) => !selectedNames.has(p.name))
            .sort((a, b) => {
              if (a.waitingTurns !== b.waitingTurns)
                return b.waitingTurns - a.waitingTurns;
              return a.matches - b.matches;
            })
            .slice(0, 4 - candidateList.length);

          additionalPlayers.forEach(addToCandidate);
        }

        if (candidateList.length < 4) {
          // 如果組合中的選手少於4人，使用正常邏輯
          candidate = findOptimalCombination(candidatePool, lastCombination);
        } else {
          // 使用交叉選擇的結果
          candidate = candidateList;

          // 重置循環檢測計數器
          readyPlayersCycleCount = 0;

          // 添加調適訊息
          console.log("【交叉組隊】成功建立交叉選擇組合，即將顯示警告訊息");
          console.log("【交叉組隊】選出的選手:", candidateList.map(p => p.name).join(", "));
          
          // 添加UI標識
          alert("已啟動交叉選擇機制，打破固定組合循環！");
        }
      } else {
        // 若無法使用交叉選擇，仍然使用正常邏輯
        candidate = findOptimalCombination(candidatePool, lastCombination);
      }
    } else {
      // 正常邏輯：使用優化排序後的候選池進行組合選取
      candidate = findOptimalCombination(candidatePool, lastCombination);
    }

    if (candidate) {
      candidate.forEach((player) => {
        // 清除所有標記
        player.justFinished = false;
        player.justJoinedReady = false;
        player.waitingTurns = 0; // 選手被選中上場，等待輪數重置為0

        // 把被選中的選手從相應區域移除
        readyPlayers = readyPlayers.filter((p) => p.name !== player.name);
        restingPlayers = restingPlayers.filter((p) => p.name !== player.name);
        players = players.filter((p) => p.name !== player.name);
      });

      // 更新配對記錄
      let team1Key = getPairKey(candidate[0].name, candidate[1].name);
      let team2Key = getPairKey(candidate[2].name, candidate[3].name);
      lastPairings = new Set([team1Key, team2Key]);

      // 添加比賽開始時間記錄
      const startTime = new Date();
      candidate.forEach((player) => {
        player.currentMatchStartTime = startTime;
      });

      // 更新場地
      courts[courtIndex] = candidate;
      lastCombinationByCourt[courtIndex] = candidate;

      // 記錄在場地屬性中
      courts[courtIndex].startTime = startTime;
      courts[courtIndex].formattedStartTime = formatTime(startTime);

      // 更新介面顯示
      updateLists();
      updateCourtsDisplay();

      // 如果選中的組合包含等待多輪的選手，在控制台記錄
      const waitingPlayersSelected = candidate.filter(
        (p) => (p.waitingTurns || 0) >= 2
      );

      return candidate;
    } else {
      // 當無法找到符合 ±1.5 等級差異的組合時，進行放寬標準配對
      alert("即將單次放寬組合標準以利進行組隊");
      
      // 使用放寬標準（無視等級差異）重新尋找組合
      const relaxedCandidate = findOptimalCombinationRelaxed(candidatePool, lastCombination);
      
      if (relaxedCandidate) {
        relaxedCandidate.forEach((player) => {
          // 清除所有標記
          player.justFinished = false;
          player.justJoinedReady = false;
          player.waitingTurns = 0; // 選手被選中上場，等待輪數重置為0

          // 把被選中的選手從預備區移除（如果在預備區中）
          readyPlayers = readyPlayers.filter((p) => p.name !== player.name);
          // 同時從其他區域移除（如果選手是剛下場的）
          players = players.filter((p) => p.name !== player.name);
          restingPlayers = restingPlayers.filter((p) => p.name !== player.name);
        });

        // 更新配對記錄
        let team1Key = getPairKey(relaxedCandidate[0].name, relaxedCandidate[1].name);
        let team2Key = getPairKey(relaxedCandidate[2].name, relaxedCandidate[3].name);
        lastPairings = new Set([team1Key, team2Key]);

        // 添加比賽開始時間記錄
        const startTime = new Date();
        relaxedCandidate.forEach((player) => {
          player.currentMatchStartTime = startTime;
        });

        // 更新場地
        courts[courtIndex] = relaxedCandidate;
        lastCombinationByCourt[courtIndex] = relaxedCandidate;

        // 記錄在場地屬性中
        courts[courtIndex].startTime = startTime;
        courts[courtIndex].formattedStartTime = formatTime(startTime);

        // 更新介面顯示
        updateLists();
        updateCourtsDisplay();

        console.log("【放寬標準】成功建立放寬等級標準的組合:", relaxedCandidate.map(p => p.name).join(", "));
        return relaxedCandidate;
      } else {
        alert("無法找到任何可用的候選組合！可能需要更多選手。");
        return null;
      }
    }
  }
  return null;
  */
  
  // 舊邏輯註解結束
  return null;
}

// 下場按鈕點擊後，更新該場地的新對戰組合
function endMatch(courtIndex) {
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
  
  console.log(`【endMatch】場地${courtIndex + 1}下場，${playersToReady.length}名選手回到預備區`);

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

  let result = generateMatchForCourtImmediate(courtIndex);

  // 更新等待輪次（如果有新比賽產生）
  if (result) {
    updateWaitingTurnsAfterMatch(readyPlayersBeforeMatch, true);
  }

  // 如果有新的對戰，播報這個場地的配對
  if (result) {
    setTimeout(() => {
      announceCourt(courtIndex);
    }, 1000);
  }
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
              <span class="badge badge-primary">VS</span>
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
const SPREADSHEET_ID = "1961u7uge-1AHRLrIS1kEG8GNuMNHrf-WdjGVw-pClE0";
const SHEET_NAME = "人員名單";
const MATCH_RECORD_SHEET_NAME = "比賽紀錄"; // 新增比賽紀錄工作表名稱

// Google OAuth 相關變數
let googleAccessToken = null;
let googleUser = null;

// 載入 Google Sheets 資料 - 修改為直接匯入不顯示模態視窗
async function loadGoogleSheetsData() {
  try {
    // 顯示載入狀態
    const statusElement = document.getElementById("loadStatus");
    statusElement.textContent = "正在從 Google Sheets 載入資料...";

    // 構建 API 請求 URL
    const range = `${SHEET_NAME}!A2:D1000`; // A列=姓名, B列=等級, C列=出席狀態, D列=分數(如果有)
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}?key=${GOOGLE_API_KEY}`;

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

    // 印出 Google Sheets 原始資料
    console.log("【Google Sheets 原始資料】");
    console.log(`總共讀取 ${data.values.length} 列資料`);
    console.log("前10列資料：");
    data.values.slice(0, 10).forEach((row, index) => {
      console.log(`第${index + 2}列: [${row.join(', ')}]`);
    });

    // 解析選手資料 - 只保存出席的選手
    const newPlayers = [];
    let playerCount = 0; // 符合條件的選手數
    let skippedCount = 0; // 跳過的選手數

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
              // 檢查是否有更多欄位（例如：D欄可能是分數）
              const score = row[3] ? parseFloat(row[3]?.trim()) : undefined;
              const playerData = { name, level, matches: 0 };
              
              // 如果有分數欄位且是有效數字，加入分數
              if (score !== undefined && !isNaN(score)) {
                playerData.score = score;
              }
              
              newPlayers.push(playerData);
              playerCount++;
              
              // 印出匯入的選手資料
              console.log(`【匯入選手】${name}: 等級=${level}, 出席=${status}${score !== undefined ? `, 分數=${score}` : ''}`);
            } else {
              skippedCount++;
              console.log(`【跳過選手】${name}: 等級=${level}, 出席=${status || '未標記'}`);
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
    console.log(`【loadGoogleSheetsData】準備更新選手列表：原有 ${players.length} 位選手，新增 ${newPlayers.length} 位選手`);
    
    players = [...newPlayers];
    readyPlayers = [];
    
    console.log(`【loadGoogleSheetsData】選手列表更新完成：目前有 ${players.length} 位選手`);
    console.log(`【loadGoogleSheetsData】選手名單：`, players.map(p => `${p.name}(${p.level})`).join(', '));

    // 更新顯示
    updateLists();
    console.log(`【loadGoogleSheetsData】界面更新完成`);

    // 更新載入狀態
    statusElement.textContent = `成功導入 ${playerCount} 位出席選手，跳過 ${skippedCount} 位不出席選手`;
    alert(`已成功導入 ${playerCount} 位出席選手`);

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

window.addEventListener("beforeunload", function (e) {
  e.preventDefault();
  e.returnValue = "警告：關閉此網頁將會清空所有資料，是否確認關閉？";
});

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
      spreadsheetId: SPREADSHEET_ID,
      range: checkRange,
    });
    
    let startRow = 1;
    if (!checkResponse.result.values || checkResponse.result.values.length === 0) {
      // 如果沒有標題，先寫入標題
      await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
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
        spreadsheetId: SPREADSHEET_ID,
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
      spreadsheetId: SPREADSHEET_ID,
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

// 在頁面載入時初始化 Google API
window.addEventListener('load', () => {
  // 初始化 Google API
  if (typeof gapi !== 'undefined') {
    initGoogleAPI();
  } else {
    console.warn('Google API 尚未載入');
  }
});
