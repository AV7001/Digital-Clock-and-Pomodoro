// =================================================================
// GLOBAL STATE & CONSTANTS
// =================================================================

const DURATION_WORK = 25 * 60 * 1000; // 25 minutes
const DURATION_BREAK = 5 * 60 * 1000; // 5 minutes
const DURATION_LONG_BREAK = 15 * 60 * 1000; // 15 minutes
const LAPS_PER_LONG_BREAK = 4;

// Time zone data
const TIME_ZONES = [
    { label: 'Local Time', zone: 'local' },
    { label: 'UTC (Coordinated Universal Time)', zone: 'UTC' },
    { label: 'New York (EST/EDT)', zone: 'America/New_York' },
    { label: 'London (GMT/BST)', zone: 'Europe/London' },
    { label: 'Tokyo (JST)', zone: 'Asia/Tokyo' },
    { label: 'New Delhi (IST)', zone: 'Asia/Kolkata' },
    { label: 'Sydney (AEST/AEDT)', zone: 'Australia/Sydney' },
    { label: 'Berlin (CET/CEST)', zone: 'Europe/Berlin' },
];

let currentMode = 'clock';
let clockInterval = null;
// Simple chime sound for timer completion
let sound = new Audio('https://s3-us-west-2.amazonaws.com/s.cdpn.io/3/success.mp3'); 

// --- Timezone State ---
let selectedTimezone = 'local';
// 12/24 format preference - standard 24-hour format
let use24 = true;

// --- Pomodoro State ---
let pomodoroInterval = null;
let pomodoroRemainingTime = DURATION_WORK;
let pomodoroIsRunning = false;
let pomodoroCycle = 'work'; // 'work' | 'break' | 'longBreak'
let pomodoroWorkLaps = 0;

// --- Timer State ---
let timerInterval = null;
let timerTotalDuration = 0;
let timerRemainingTime = 0;
let timerIsRunning = false;

// --- Stopwatch State ---
let stopwatchInterval = null;
let stopwatchStartTime = 0;
let stopwatchElapsedTime = 0;
let stopwatchIsRunning = false;
let stopwatchLapCount = 0;
let stopwatchLapTimes = [];

// =================================================================
// DOM ELEMENTS
// =================================================================
const $ = (id) => document.getElementById(id);

// Main UI
const clockDisplay = $('clock-display');
const dateDisplay = $('date-display');
const tabButtons = document.querySelectorAll('.tab-button');
const timezoneSelect = $('timezone-select');

// Pomodoro DOM
const pomodoroDisplay = $('pomodoro-display');
const pomodoroStatus = $('pomodoro-status');
const pomodoroStartBtn = $('pomodoro-start-btn');
const pomodoroPauseBtn = $('pomodoro-pause-btn');
const pomodoroResetBtn = $('pomodoro-reset-btn');

// Timer DOM
const timerDisplay = $('timer-display');
const timerSetBtn = $('timer-set-btn');
const timerStartBtn = $('timer-start-btn');
const timerPauseBtn = $('timer-pause-btn');
const timerResetBtn = $('timer-reset-btn');
const timerHours = $('timer-hours');
const timerMinutes = $('timer-minutes');
const timerSeconds = $('timer-seconds');
const timerSetter = $('timer-setter');

// Stopwatch DOM
const stopwatchDisplay = $('stopwatch-display');
const stopwatchStartBtn = $('stopwatch-start-btn');
const stopwatchPauseBtn = $('stopwatch-pause-btn');
const stopwatchResetBtn = $('stopwatch-reset-btn');
const stopwatchLapBtn = $('stopwatch-lap-btn');
const lapList = $('lap-list');

// =================================================================
// UTILITY FUNCTIONS
// =================================================================

/**
 * Converts milliseconds to HH:MM:SS format (or MM:SS).
 */
function formatTime(ms, includeMillis = false) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = includeMillis ? Math.floor(ms % 1000) : 0; 

    const pad = (num, length = 2) => String(num).padStart(length, '0');

    if (includeMillis) {
        return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(milliseconds, 3)}`;
    } else if (hours > 0) {
        return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    } else {
        return `${pad(minutes)}:${pad(seconds)}`;
    }
}

// =================================================================
// UI AND MODE MANAGEMENT
// =================================================================

function changeMode(newMode) {
    // Stop any running intervals from the old mode to save resources
    if (currentMode === 'clock') clearInterval(clockInterval);
    if (currentMode === 'pomodoro' && pomodoroIsRunning) pausePomodoro(true);
    if (currentMode === 'timer' && timerIsRunning) pauseTimer(true);
    if (currentMode === 'stopwatch' && stopwatchIsRunning) pauseStopwatch(true);

    currentMode = newMode;
    
    // Update Tab styles
    tabButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === newMode);
    });

    // Update Content visibility
    document.querySelectorAll('.mode').forEach(modeDiv => {
        modeDiv.classList.add('hidden');
        modeDiv.classList.remove('active');
    });
    const activeModeDiv = $(`${newMode}-mode`);
    if (activeModeDiv) {
        activeModeDiv.classList.remove('hidden');
        activeModeDiv.classList.add('active');
    }

    // Initialize the new mode
    if (newMode === 'clock') {
        startClock();
    } else if (newMode === 'pomodoro') {
        updatePomodoroDisplay();
    } else if (newMode === 'timer') {
        updateTimerDisplay();
    } else if (newMode === 'stopwatch') {
        updateStopwatchDisplay();
    }
}

// =================================================================
// 1. DIGITAL CLOCK LOGIC
// =================================================================

function updateClock() {
    // Create a Date object that reflects the selected timezone's wall clock.
    const tz = selectedTimezone === 'local' ? undefined : selectedTimezone;
    const now = tz ? new Date(new Date().toLocaleString('en-US', { timeZone: tz })) : new Date();

    // Build time string using numeric components for consistent cross-browser behavior
    let hours = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    let ampm = '';
    if (!use24) {
        ampm = hours >= 12 ? ' PM' : ' AM';
        hours = hours % 12 || 12;
    }

    const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}${ampm}`;

    // Date string (long format)
    const dateOpts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateStr = now.toLocaleDateString('en-US', dateOpts);

    if (clockDisplay) clockDisplay.textContent = timeStr;
    if (dateDisplay) dateDisplay.textContent = dateStr;
}

function startClock() {
    updateClock();
    clockInterval = setInterval(updateClock, 1000); 
}

// =================================================================
// 2. POMODORO LOGIC
// =================================================================

function updatePomodoroDisplay() {
    pomodoroDisplay.textContent = formatTime(pomodoroRemainingTime);
    
    let statusText = '';
    let statusColor = 'text-green-400';
    
    if (pomodoroCycle === 'work') {
        statusText = 'Focus Time';
        statusColor = 'text-green-400';
    } else {
        statusText = 'Break Time';
        statusColor = pomodoroCycle === 'longBreak' ? 'text-indigo-400' : 'text-yellow-400';
    }
    
    pomodoroStatus.className = `text-2xl font-bold mb-4 ${statusColor}`;
    pomodoroStatus.textContent = statusText;
    
    // Button visibility
    if (pomodoroIsRunning) {
        pomodoroStartBtn.classList.add('hidden');
        pomodoroPauseBtn.classList.remove('hidden');
    } else {
        pomodoroStartBtn.classList.remove('hidden');
        pomodoroPauseBtn.classList.add('hidden');
    }
}

function startPomodoro() {
    if (pomodoroIsRunning) return;
    pomodoroIsRunning = true;
    
    // Use Date.now() delta calculation to prevent drift
    let startTime = Date.now();
    let expectedEndTime = startTime + pomodoroRemainingTime;

    pomodoroInterval = setInterval(() => {
        const now = Date.now();
        pomodoroRemainingTime = expectedEndTime - now;
        
        if (pomodoroRemainingTime <= 0) {
            clearInterval(pomodoroInterval);
            pomodoroRemainingTime = 0;
            updatePomodoroDisplay();
            sound.play();
            handlePomodoroCompletion();
        } else {
            updatePomodoroDisplay();
        }
    }, 100);
    updatePomodoroDisplay();
}

function pausePomodoro(silent = false) {
    if (!pomodoroIsRunning) return;
    clearInterval(pomodoroInterval);
    pomodoroIsRunning = false;
    updatePomodoroDisplay();
    if (!silent) console.log('Pomodoro Paused');
}

function resetPomodoro() {
    clearInterval(pomodoroInterval);
    pomodoroIsRunning = false;
    pomodoroRemainingTime = DURATION_WORK;
    pomodoroCycle = 'work';
    pomodoroWorkLaps = 0;
    updatePomodoroDisplay();
    console.log('Pomodoro Reset');
}

function handlePomodoroCompletion() {
    if (pomodoroCycle === 'work') {
        pomodoroWorkLaps++;
        
        if (pomodoroWorkLaps % LAPS_PER_LONG_BREAK === 0) {
            pomodoroCycle = 'longBreak';
            pomodoroRemainingTime = DURATION_LONG_BREAK;
        } else {
            pomodoroCycle = 'break';
            pomodoroRemainingTime = DURATION_BREAK;
        }
    } else {
        pomodoroCycle = 'work';
        pomodoroRemainingTime = DURATION_WORK;
    }
    
    // Auto-start the next phase
    startPomodoro();
}

// =================================================================
// 3. TIMER (COUNTDOWN) LOGIC
// =================================================================

function updateTimerDisplay() {
    timerDisplay.textContent = formatTime(timerRemainingTime, false);
    
    const isSet = timerTotalDuration > 0;
    const isZero = timerRemainingTime === 0;

    if (timerIsRunning) {
        timerSetter.classList.add('hidden');
        timerStartBtn.classList.add('hidden');
        timerPauseBtn.classList.remove('hidden');
    } else if (isSet && !isZero) {
        timerSetter.classList.add('hidden');
        timerStartBtn.classList.remove('hidden');
        timerPauseBtn.classList.add('hidden');
    } else {
        timerSetter.classList.remove('hidden');
        timerStartBtn.classList.add('hidden');
        timerPauseBtn.classList.add('hidden');
    }
}

function setTimer() {
    // Ensure positive integers
    const h = Math.abs(Math.floor(parseInt(timerHours.value) || 0));
    const m = Math.abs(Math.floor(parseInt(timerMinutes.value) || 0));
    const s = Math.abs(Math.floor(parseInt(timerSeconds.value) || 0));
    
    if (h === 0 && m === 0 && s === 0) return; // Must set a time

    const totalMs = (h * 3600 + m * 60 + s) * 1000;
    timerTotalDuration = totalMs;
    timerRemainingTime = totalMs;
    
    // Reset inputs
    timerHours.value = 0;
    timerMinutes.value = 0;
    timerSeconds.value = 0;

    updateTimerDisplay();
}

function startTimer() {
    if (timerIsRunning || timerRemainingTime <= 0) return;
    timerIsRunning = true;
    
    let startTime = Date.now();
    let expectedEndTime = startTime + timerRemainingTime;

    timerInterval = setInterval(() => {
        const now = Date.now();
        timerRemainingTime = expectedEndTime - now;
        
        if (timerRemainingTime <= 0) {
            clearInterval(timerInterval);
            timerRemainingTime = 0;
            timerIsRunning = false;
            updateTimerDisplay();
            sound.play();
            timerSetBtn.classList.remove('hidden');
        } else {
            updateTimerDisplay();
        }
    }, 100);
    updateTimerDisplay();
}

function pauseTimer(silent = false) {
    if (!timerIsRunning) return;
    clearInterval(timerInterval);
    timerIsRunning = false;
    updateTimerDisplay();
    if (!silent) console.log('Timer Paused');
}

function resetTimer() {
    clearInterval(timerInterval);
    timerIsRunning = false;
    timerTotalDuration = 0;
    timerRemainingTime = 0;
    updateTimerDisplay();
    console.log('Timer Reset');
}

// =================================================================
// 4. STOPWATCH LOGIC
// =================================================================

function updateStopwatchDisplay() {
    stopwatchDisplay.textContent = formatTime(stopwatchElapsedTime, true);
    
    stopwatchLapBtn.classList.toggle('hidden', !stopwatchIsRunning);
    
    if (stopwatchIsRunning) {
        stopwatchStartBtn.classList.add('hidden');
        stopwatchPauseBtn.classList.remove('hidden');
    } else {
        stopwatchStartBtn.classList.remove('hidden');
        stopwatchPauseBtn.classList.add('hidden');
    }
}

function startStopwatch() {
    if (stopwatchIsRunning) return;
    stopwatchIsRunning = true;
    
    // Adjust start time to account for previous elapsed time
    stopwatchStartTime = Date.now() - stopwatchElapsedTime; 

    stopwatchInterval = setInterval(() => {
        stopwatchElapsedTime = Date.now() - stopwatchStartTime;
        updateStopwatchDisplay();
    }, 10); 
    updateStopwatchDisplay();
}

function pauseStopwatch(silent = false) {
    if (!stopwatchIsRunning) return;
    clearInterval(stopwatchInterval);
    stopwatchIsRunning = false;
    updateStopwatchDisplay();
    if (!silent) console.log('Stopwatch Paused');
}

function resetStopwatch() {
    clearInterval(stopwatchInterval);
    stopwatchIsRunning = false;
    stopwatchElapsedTime = 0;
    stopwatchLapCount = 0;
    stopwatchLapTimes = [];
    
    lapList.innerHTML = ''; // Clear lap history
    updateStopwatchDisplay();
    console.log('Stopwatch Reset');
}

function lapStopwatch() {
    if (!stopwatchIsRunning) return;
    
    const currentTotalTime = stopwatchElapsedTime;
    const previousTotalTime = stopwatchLapTimes.length > 0 ? stopwatchLapTimes[0].totalMs : 0;
    const lapDuration = currentTotalTime - previousTotalTime;

    stopwatchLapCount++;
    
    const lapEntry = {
        id: stopwatchLapCount,
        durationMs: lapDuration,
        totalMs: currentTotalTime
    };
    
    // Store the newest lap at the front
    stopwatchLapTimes.unshift(lapEntry);

    renderLapTimes();
}

function renderLapTimes() {
    lapList.innerHTML = ''; 
    
    stopwatchLapTimes.forEach((lap, index) => {
        const li = document.createElement('li');
        // Tailwind classes for list items
        li.className = 'flex justify-between text-sm py-1 px-2 border-b border-slate-600 last:border-b-0';
        
        // Lap number (Count down from total)
        const lapNumber = stopwatchLapTimes.length - index;
        
        li.innerHTML = `
            <span class="text-slate-400 font-bold">LAP ${lapNumber}</span>
            <span class="lap-time text-slate-200">Total: ${formatTime(lap.totalMs, true)}</span>
            <span class="lap-time text-indigo-300">Delta: ${formatTime(lap.durationMs, true)}</span>
        `;
        lapList.appendChild(li);
    });
}


// =================================================================
// TIMER UP/DOWN BUTTONS LOGIC
// =================================================================

function adjustTimerValue(targetId, delta) {
    const input = document.getElementById(targetId);
    if (!input) return;
    let value = parseInt(input.value) || 0;
    value += delta;
    const min = parseInt(input.min) || 0;
    const max = parseInt(input.max) || 99;
    value = Math.max(min, Math.min(max, value));
    input.value = value;
}

// =================================================================
// POMODORO UP/DOWN BUTTONS LOGIC
// =================================================================

function adjustPomodoroTime(delta) {
    const minutes = Math.floor(pomodoroRemainingTime / (60 * 1000));
    let newMinutes = minutes + delta;
    newMinutes = Math.max(1, Math.min(60, newMinutes)); // Min 1 min, max 60 min
    pomodoroRemainingTime = newMinutes * 60 * 1000;
    updatePomodoroDisplay();
}

// =================================================================
// INITIALIZATION
// =================================================================

function initApp() {
    // Quick runtime sanity checks for required DOM elements
    const required = [
        'clock-display','date-display','timezone-select','toggle-format-btn',
        'pomodoro-display','pomodoro-status','pomodoro-start-btn','pomodoro-pause-btn','pomodoro-reset-btn',
        'timer-display','timer-set-btn','timer-start-btn','timer-pause-btn','timer-reset-btn','timer-hours','timer-minutes','timer-seconds',
        'stopwatch-display','stopwatch-start-btn','stopwatch-pause-btn','stopwatch-reset-btn','stopwatch-lap-btn','lap-list'
    ];
    const missing = required.filter(id => !document.getElementById(id));
    if (missing.length) console.warn('Time Hub: missing DOM elements (these IDs not found):', missing);
    // Populate Timezone Selector
    TIME_ZONES.forEach(tz => {
        const option = document.createElement('option');
        option.value = tz.zone;
        option.textContent = tz.label;
        timezoneSelect.appendChild(option);
    });

    timezoneSelect.addEventListener('change', (e) => {
        selectedTimezone = e.target.value;
        updateClock(); // Force immediate update
    });

    // Restore saved timezone and 12/24 preference (if any)
    const savedTZ = localStorage.getItem('selectedTimezone');
    if (savedTZ && timezoneSelect.querySelector(`option[value="${savedTZ}"]`)) {
        timezoneSelect.value = savedTZ;
        selectedTimezone = savedTZ;
    }

    // 1. Initial Mode Setup
    changeMode('clock');

    // 2. Tab Click Handlers
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            changeMode(button.dataset.mode);
        });
    });

    // 3. Pomodoro Listeners
    pomodoroStartBtn.addEventListener('click', startPomodoro);
    pomodoroPauseBtn.addEventListener('click', () => pausePomodoro(false));
    pomodoroResetBtn.addEventListener('click', resetPomodoro);

    // Pomodoro up/down buttons
    document.querySelectorAll('.pomodoro-up').forEach(btn => {
        btn.addEventListener('click', () => adjustPomodoroTime(1));
    });
    document.querySelectorAll('.pomodoro-down').forEach(btn => {
        btn.addEventListener('click', () => adjustPomodoroTime(-1));
    });

    // 4. Timer Listeners
    timerSetBtn.addEventListener('click', setTimer);
    timerStartBtn.addEventListener('click', startTimer);
    timerPauseBtn.addEventListener('click', () => pauseTimer(false));
    timerResetBtn.addEventListener('click', resetTimer);

    // Timer up/down buttons
    document.querySelectorAll('.timer-up').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetId = e.target.dataset.target;
            adjustTimerValue(targetId, 1);
        });
    });
    document.querySelectorAll('.timer-down').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetId = e.target.dataset.target;
            adjustTimerValue(targetId, -1);
        });
    });

    // 5. Stopwatch Listeners
    stopwatchStartBtn.addEventListener('click', startStopwatch);
    stopwatchPauseBtn.addEventListener('click', () => pauseStopwatch(false));
    stopwatchResetBtn.addEventListener('click', resetStopwatch);
    stopwatchLapBtn.addEventListener('click', lapStopwatch);

    console.log('Time Hub initialized (No API Mode).');
}

window.onload = initApp;
