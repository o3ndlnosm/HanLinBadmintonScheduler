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
// 用於檢測固定循環組合的變數
let readyPlayersCycleCount = 0;
let lastReadyPlayersNames = [];

// 動態配額制相關變數
let enableDynamicRotation = false;  // 是否啟用動態配額制
let matchRotationCounter = 0;       // 排場輪次計數器

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
  const text = document.getElementById("batchPlayers").value;
  if (!text.trim()) {
    alert("請貼上選手資料！");
    return;
  }
  const lines = text.split(/\r?\n/);
  for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    const match = line.match(/^(\D+)([\d.]+)$/);
    if (match) {
      const name = match[1].trim();
      const level = parseFloat(match[2]);
      if (!players.some((p) => p.name === name)) {
        players.push({ name, level, matches: 0 });
      }
    }
  }
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

/* 
  moveToReady：
  將選手從列表或休息區移入預備區時，
  保留選手的實際場次數，不再覆蓋為「次小場次」
*/
function moveToReady(name) {
  let player =
    players.find((p) => p.name === name) ||
    restingPlayers.find((p) => p.name === name);
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

    // 選手應保持其原有場次數，不再自動調整
    // 只為完全未定義場次的選手設置初始值0
    if (player.matches === undefined) {
      // 新選手初始化為0場，不再使用系統最小場次
      player.matches = 0;
    }

    readyPlayers.push(player);
    updateLists();
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
              <button class="btn btn-warning" onclick="endMatch(${i})">
                <i class="fas fa-check-circle"></i> 下場
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
  修改 findOptimalCombination 函式：
  1. 評分機制中加入等級差異考量，使其對實力平衡的組合給予更高評分
  2. 確保所有可能的組合都被充分評估
  3. 使用更全面的評分標準，避免僅根據歷史配對頻率決定最佳組合
*/
function findOptimalCombination(sortedReady, lastCombination) {
  function internalFindOptimalCombination(pool, threshold, allowedOverlap) {
    let bestCombination = null;
    let bestScore = Infinity;
    let currentCombination = [];

    function evaluateCombination(comb) {
      // 檢查傳入的 lastCombination（若有）與候選組合重複的人數
      if (lastCombination && lastCombination.length === 4) {
        let overlap = comb.filter((player) => {
          return lastCombination.find(
            (lp) => lp.name.trim() === player.name.trim()
          );
        }).length;
        // 對最近一場比賽，仍然嚴格限制重疊人數
        if (overlap > allowedOverlap) {
          return { score: Infinity, pairing: null };
        }
      }

      // 檢查所有歷史比賽組合（historyMatchesArr），但人數少時放寬限制
      // 只檢查前5場比賽的歷史記錄
      const recentHistoryLimit = 5;
      const checkHistory = historyMatchesArr.slice(
        0,
        Math.min(recentHistoryLimit, historyMatchesArr.length)
      );

      for (let hist of checkHistory) {
        let commonCount = comb.filter((player) => {
          return hist.find((lp) => lp.name.trim() === player.name.trim());
        }).length;
        // 放寬歷史重複限制：允許更多重疊
        if (commonCount > allowedOverlap + 1) {
          // 比正常允許值多允許1人重疊
          return { score: Infinity, pairing: null };
        }
      }

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

        if (levelDiff <= threshold) {
          let team1Key = getPairKey(team1[0].name, team1[1].name);
          let team2Key = getPairKey(team2[0].name, team2[1].name);

          // 修改評分機制：不僅考慮歷史配對頻率，還要考慮等待輪數
          // 配對頻率越低越好(0是最好的)，等待輪數越高越好
          let pairingScore =
            (pairingHistory[team1Key] || 0) + (pairingHistory[team2Key] || 0);

          // 計算等待分數：等待輪數較多的選手應優先考慮，因此等待分數為正向評分
          // 等待輪數總和越高，等待分數越低（因為總分越低越好）

          // 強化等待輪數的影響 - 使用平方值提升權重差異
          let waitingScoreTeam1 = team1.reduce((sum, p) => {
            const turns = p.waitingTurns || 0;
            // 對等待輪數平方來增強影響力
            return sum - turns * turns;
          }, 0);

          let waitingScoreTeam2 = team2.reduce((sum, p) => {
            const turns = p.waitingTurns || 0;
            return sum - turns * turns;
          }, 0);

          let waitingTurnsSum = waitingScoreTeam1 + waitingScoreTeam2;

          // 綜合得分：配對頻率(負向) + 等待輪數(正向) + 等級差異(負向)
          // 等待輪數權重為5，配對頻率權重為1
          let score = pairingScore + waitingTurnsSum * 5 + levelDiff;

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

  // 優先檢查是否有長時間等待的選手
  let longWaitingPlayers = sortedReady
    .filter((p) => (p.waitingTurns || 0) >= 2 && !p.justFinished)
    .sort((a, b) => (b.waitingTurns || 0) - (a.waitingTurns || 0));

  // 如果有足夠的長等待選手，嘗試優先選擇
  if (longWaitingPlayers.length >= 4) {
    let priorityPool = longWaitingPlayers.slice(
      0,
      Math.min(12, longWaitingPlayers.length)
    );
    let candidate = internalFindOptimalCombination(priorityPool, 2.5, 2);
    if (candidate) {
      return candidate;
    }
  }

  // 如果有超過2輪的長等待選手，確保優先納入
  let veryLongWaitingPlayers = sortedReady.filter(
    (p) => (p.waitingTurns || 0) >= 3 && !p.justFinished
  );
  if (veryLongWaitingPlayers.length > 0 && veryLongWaitingPlayers.length < 4) {
    // 從其他選手中選出適合的搭配
    let otherPlayers = sortedReady.filter(
      (p) => (p.waitingTurns || 0) < 3 || p.justFinished
    );

    // 構建一個混合池，先放入所有超長等待選手，再加入其他選手
    let mixedPool = [...veryLongWaitingPlayers];

    // 根據需要補充其他選手到至少4人
    let neededPlayers = 4 - mixedPool.length;
    if (neededPlayers > 0 && otherPlayers.length >= neededPlayers) {
      // 添加足夠數量的其他選手
      mixedPool = mixedPool.concat(
        otherPlayers.slice(0, Math.min(12, otherPlayers.length))
      );

      let candidate = internalFindOptimalCombination(mixedPool, 2.5, 2);
      if (candidate) {
        // 檢查是否所有超長等待選手都被納入
        const allVeryLongWaitingIncluded = veryLongWaitingPlayers.every(
          (veryLongPlayer) =>
            candidate.some(
              (selectedPlayer) => selectedPlayer.name === veryLongPlayer.name
            )
        );

        if (allVeryLongWaitingIncluded) {
          return candidate;
        }
      }
    }
  }

  // 原有邏輯 - 先嘗試 strict 模式：允許重複不超過 2 人（即 overlap 最大為 2）
  let candidate = internalFindOptimalCombination(sortedReady, 1.5, 2);
  if (candidate) return candidate;

  // 修改：不再優先考慮忽略justFinished標記的剛下場選手
  // 而是在找不到合適組合時，直接放寬等級差異條件
  candidate = internalFindOptimalCombination(sortedReady, 1.8, 2);
  if (candidate) return candidate;
  candidate = internalFindOptimalCombination(sortedReady, 2.1, 2);
  if (candidate) return candidate;

  // 如果 strict 模式下找不到合適組合，則放寬條件：允許重複不超過 3 人（即 overlap 最大為 3）
  candidate = internalFindOptimalCombination(sortedReady, 1.5, 3);
  if (candidate) return candidate;

  // 放寬條件 - 如果真的找不到合適組合，才考慮放寬justFinished限制
  for (let i = 0; i < sortedReady.length; i++) {
    if (sortedReady[i].justFinished) {
      let originalJustFinished = sortedReady[i].justFinished;
      sortedReady[i].justFinished = false;
      candidate = internalFindOptimalCombination(sortedReady, 2.1, 3);
      if (candidate) return candidate;
      sortedReady[i].justFinished = originalJustFinished;
    }
  }

  candidate = internalFindOptimalCombination(sortedReady, 1.8, 3);
  if (candidate) return candidate;
  candidate = internalFindOptimalCombination(sortedReady, 2.1, 3);
  return candidate;
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

  // 記錄排場前在預備區的所有選手名單
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

  // 檢查哪些選手上場了（排場前在預備區但排場後不在）
  const playersSelected = readyPlayersBeforeMatch.filter(
    (beforePlayer) =>
      !readyPlayers.some(
        (afterPlayer) => afterPlayer.name === beforePlayer.name
      )
  );

  // 首先清除所有留在預備區選手的「剛加入」標記
  // 這樣在增加等待輪數時，這些選手將被視為正常選手

  let clearedJustJoinedCount = 0;
  readyPlayers.forEach((player) => {
    if (player.justJoinedReady) {
      player.justJoinedReady = false;
      clearedJustJoinedCount++;
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
    if (player.justProcessed) {
      // 如果選手在前面的處理中已被設置為等待1輪，跳過

      // 清除處理標記，下次可以正常處理
      delete player.justProcessed;
    } else if (player.justFinished) {
      // 如果是標記為剛下場的選手
      if (player.waitingTurns === 0) {
        // 正常剛下場選手，從剛下場變為等待1輪
        player.justFinished = false; // 清除剛下場標記
        player.waitingTurns = 1; // 升級為等待1輪

        updatedCount++;
        // 添加處理標記，避免在同一次操作中被重複處理
        player.justProcessed = true;
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
      // 添加處理標記，避免在同一次操作中被重複處理
      player.justProcessed = true;
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

  // 如果有新對戰，播報新對戰
  if (hasNewMatches) {
    setTimeout(() => {
      announceAllCourts();
    }, 1000);
  } else {
    // 沒有新的比賽被安排，但預備區選手等待輪數已增加
  }
}

// 修改 generateMatchForCourtImmediate 函數 - 考慮等待輪數的完整優化版
function generateMatchForCourtImmediate(courtIndex) {
  // 首先檢查是否有足夠的選手
  let eligibleReady = readyPlayers.filter((p) => !p.justFinished);
  let pool = eligibleReady.length >= 4 ? eligibleReady : readyPlayers;

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

  // 全新排序邏輯，綜合考慮等待輪數、場次數、等級
  // 增強對等待輪數的權重，確保長時間等待的選手優先上場
  let sortedReady = [...pool].sort((a, b) => {
    // 0. 首先過濾剛下場的選手
    if (a.justFinished && !b.justFinished) return 1; // a剛下場，排後面
    if (!a.justFinished && b.justFinished) return -1; // b剛下場，排後面

    // 1. 優先考慮等待輪數（提高權重）
    const aWaiting = a.waitingTurns || 0;
    const bWaiting = b.waitingTurns || 0;
    if (aWaiting !== bWaiting) return bWaiting - aWaiting; // 等待輪數高的優先

    // 2. 然後考慮場次數
    if (a.matches !== b.matches) return a.matches - b.matches;

    // 3. 如果場次數和等待輪數都一樣，考慮等級
    if (a.level !== b.level) return a.level - b.level;

    // 4. 所有條件都相同時，添加少量隨機性避免固定順序
    return Math.random() - 0.5;
  });

  // 記錄排序結果用於調試
  if (pool.length >= 4) {
    // 移除 console.log
  }

  // 檢查是否啟用動態配額制
  if (enableDynamicRotation) {
    const waitingPlayers = pool.filter(p => !p.justFinished);
    const justFinishedPlayers = pool.filter(p => p.justFinished);
    
    // 當等待和剛下場各為4人時，使用動態配額
    if (waitingPlayers.length === 4 && justFinishedPlayers.length === 4) {
      console.log(`【動態配額制】啟動！等待${waitingPlayers.length}人，剛下場${justFinishedPlayers.length}人`);
      matchRotationCounter++;
      
      let dynamicPool = [];
      
      if (matchRotationCounter % 2 === 1) {
        // 奇數輪：等待3人 + 剛下場1人
        console.log(`【動態配額制】第${matchRotationCounter}輪（奇數輪）：選擇等待3人 + 剛下場1人`);
        
        // 從等待的選手中選3人（按場次少的優先）
        const selectedWaiting = [...waitingPlayers]
          .sort((a, b) => a.matches - b.matches)
          .slice(0, 3);
        
        // 從剛下場的選手中選1人（按場次少的優先）
        const selectedJustFinished = [...justFinishedPlayers]
          .sort((a, b) => a.matches - b.matches)
          .slice(0, 1);
        
        dynamicPool = [...selectedWaiting, ...selectedJustFinished];
      } else {
        // 偶數輪：等待1人 + 剛下場3人
        console.log(`【動態配額制】第${matchRotationCounter}輪（偶數輪）：選擇等待1人 + 剛下場3人`);
        
        // 從等待的選手中選1人（按場次少的優先）
        const selectedWaiting = [...waitingPlayers]
          .sort((a, b) => a.matches - b.matches)
          .slice(0, 1);
        
        // 從剛下場的選手中選3人（按場次少的優先）
        const selectedJustFinished = [...justFinishedPlayers]
          .sort((a, b) => a.matches - b.matches)
          .slice(0, 3);
        
        dynamicPool = [...selectedWaiting, ...selectedJustFinished];
      }
      
      console.log(`【動態配額制】選出的4人：${dynamicPool.map(p => p.name).join(', ')}`);
      
      // 使用動態選出的4人進行排序（考慮等級平衡）
      candidatePool = dynamicPool.sort((a, b) => {
        if (a.level !== b.level) return a.level - b.level;
        return Math.random() - 0.5;
      });
    } else {
      // 人數不符合條件，使用原邏輯
      candidatePool = sortedReady;
    }
  } else {
    // 未啟用動態配額制，使用原邏輯
    candidatePool = sortedReady;
  }

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

        // 把被選中的選手從預備區移除（如果在預備區中）
        readyPlayers = readyPlayers.filter((p) => p.name !== player.name);
        // 同時從其他區域移除（如果選手是剛下場的）
        players = players.filter((p) => p.name !== player.name);
        restingPlayers = restingPlayers.filter((p) => p.name !== player.name);
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
      alert("無法找到符合條件的候選組合！可能需要更多選手或調整等級搭配。");
      return null;
    }
  }
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

  // 將下場選手加入預備區時設置justFinished標記，重置等待輪數
  playersToReady.forEach((player) => {
    player.justFinished = true;
    // 重置下場選手的等待輪數
    player.waitingTurns = 0;
    // 清除剛加入標記(如果有)
    player.justJoinedReady = false;

    // 不設置 justJoinedReady 標記，因為下場選手不是剛加入預備區的新選手
  });

  courts[courtIndex] = [];
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
      // 標記為剛處理過，這樣在下面的等待輪數增加邏輯中會被跳過
      player.justProcessed = true;
    });
  }

  // 3. 增加正常選手的等待輪數（根據選手狀態分別處理）
  let updatedCount = 0;
  readyPlayers.forEach((player, index) => {
    // 檢查是否為本次下場的選手
    const isCurrentlyJustFinished = playersToReady.some(
      (p) => p.name === player.name
    );

    // 檢查是否為剛處理過的選手（跳過這些選手，避免重複處理）
    if (player.justProcessed) {
      // 清除處理標記，下次可以正常處理
      delete player.justProcessed;
    } else if (isCurrentlyJustFinished) {
      // 本次剛下場的選手，等待輪數設為0
      player.waitingTurns = 0;
      // 清除可能有的其他標記
      if (player.justClearedFinished) delete player.justClearedFinished;
    } else if (player.justFinished) {
      // 處理先前剛下場的選手
      if (player.waitingTurns === 0) {
        // 之前剛下場，現在變為等待1輪
        player.waitingTurns = 1;
        player.justFinished = false; // 清除剛下場標記

        updatedCount++;
      } else if (player.waitingTurns === 1) {
        // 特殊情況，選手已有1輪等待，保持不變
        player.justFinished = false; // 但清除剛下場標記
      }
    } else if (player.justClearedFinished) {
      // 這是剛被清除剛下場標記的選手，直接設為等待1輪
      player.waitingTurns = 1;
      delete player.justClearedFinished; // 清除標記避免重複處理

      updatedCount++;
    } else {
      // 普通選手，增加等待輪數
      const oldValue = player.waitingTurns || 0;
      player.waitingTurns = oldValue + 1;
      updatedCount++;
    }
  });

  // 更新界面
  updateLists();
  updateCourtsDisplay();
  updateHistoryDisplay();

  // 在下場且更新等待輪數後進行新一輪排場

  let result = generateMatchForCourtImmediate(courtIndex);

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

        return `
        <div class="history-item">
          <div class="history-header">
            <div class="history-time">比賽 #${
              historyMatches.length - index
            }</div>
            ${timeInfo}
          </div>
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
      `;
      })
      .join("");
  }
}

// Google Sheets API 整合
const GOOGLE_API_KEY = "AIzaSyCyoLexsIwzSg6tMLVhchfMjTgmYNn6S4U"; // 您的 API 金鑰
// 將這些值直接設為常量
const SPREADSHEET_ID = "1961u7uge-1AHRLrIS1kEG8GNuMNHrf-WdjGVw-pClE0";
const SHEET_NAME = "人員名單";

// 載入 Google Sheets 資料 - 修改為直接匯入不顯示模態視窗
async function loadGoogleSheetsData() {
  try {
    // 顯示載入狀態
    const statusElement = document.getElementById("loadStatus");
    statusElement.textContent = "正在從 Google Sheets 載入資料...";

    // 構建 API 請求 URL
    const range = `${SHEET_NAME}!A2:C1000`; // A列=姓名, B列=等級, C列=出席狀態
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
              newPlayers.push({ name, level, matches: 0 });
              playerCount++;
            } else {
              skippedCount++;
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

// 頁面加載完成後初始化
document.addEventListener("DOMContentLoaded", function () {
  updateLists();
  updateCourtsDisplay();
  updateHistoryDisplay();
  initVoice(); // 初始化語音功能

  // 初始化動態配額制開關
  const dynamicRotationCheckbox = document.getElementById('enableDynamicRotation');
  if (dynamicRotationCheckbox) {
    dynamicRotationCheckbox.addEventListener('change', function() {
      enableDynamicRotation = this.checked;
      if (enableDynamicRotation) {
        console.log('動態配額制已開啟');
      } else {
        console.log('動態配額制已關閉');
        matchRotationCounter = 0; // 重置計數器
      }
    });
  }
});

window.addEventListener("beforeunload", function (e) {
  e.preventDefault();
  e.returnValue = "警告：關閉此網頁將會清空所有資料，是否確認關閉？";
});
