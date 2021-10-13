import Log from './shared/Log';
import { BackendStatus } from "./BackendStore";
import { WatchConfiguration } from "./NotificationStore";
import * as Store from "./Store";

const logger = Log.logger(__filename);

const audioContext: AudioContext|undefined = (()=> {
    if (window.AudioContext) {
        return new window.AudioContext();
    }
    if ((window as any).webkitAudioContext) {
        return new (((window as any).webkitAudioContext))() as AudioContext;
    }
    return undefined;
})()

let currentConfig : WatchConfiguration = {
    active: false,
    tictac: false,
    tictacHours: false,
};

let currentRunnerId: number = 0;
let currentRunner: Promise<void>|undefined;
let currentRunnerConfUpdate : undefined|(()=>void) = undefined;

export function setConfiguration(w : WatchConfiguration) {
    if (currentConfig === w) {
        return;
    }

    const startStop = currentConfig.active !== w.active;

    currentConfig = w;
    if (startStop) {
        const todo = currentRunnerConfUpdate;
        currentRunnerId++;
        currentRunnerConfUpdate = undefined;
        currentRunner = undefined;

        if (todo) todo();

        if (currentConfig.active) {
            currentRunner = run(currentRunnerId);
        }

    } else {
        if (currentRunnerConfUpdate) {
            currentRunnerConfUpdate();
        }
    }
}

function fetchAudio(url: string): Promise<ArrayBuffer> {
    return new Promise((res, rej)=> {
        var request = new XMLHttpRequest();
        request.open('GET', url, true);
        request.responseType = 'arraybuffer';

        // Decode asynchronously
        request.onload = function() {
            res(request.response);
        }

        request.onerror = function(e) {
            logger.error('error fetching audio file', {url}, e);
            rej(e);
        }

        request.ontimeout = function(t) {
            logger.error('timeout fetching audio file', {url, t});
            rej(t);
        }

        request.send();
    });
}

async function loadSound(url: string): Promise<AudioBuffer> {
    if (audioContext === undefined) {
        throw new Error("Audio not available");
    }

    logger.info('fetching audio file', {url});
    const buffer = await fetchAudio(url);
    const ret = await audioContext.decodeAudioData(buffer);
    logger.info('fetched audio file', {url, duration: ret.duration});
    return ret;
}


function audioNow() {
    if (audioContext == undefined) {
        return new Date().getTime();
    }
    return audioContext.currentTime;
}

function playSound(buffer: AudioBuffer|undefined, opts?: {rate?: number, tweak?: (t: AudioBufferSourceNode)=>{}, when?: number, offset?:number}) {
    if (audioContext === undefined) {
        throw new Error("Audio not available");
    }
    if (buffer === undefined) {
        throw new Error("Missing audio resource");
    }
    const source = audioContext.createBufferSource(); // creates a sound source
    source.buffer = buffer;                    // tell the source which sound to play
    source.playbackRate.value = opts?.rate || 1;
    if (opts?.tweak) opts?.tweak(source);
    //source.detune.value = -600;
    source.connect(audioContext.destination);       // connect the source to the context's destination (the speakers)

    source.start(Math.max(opts?.when || 0, 0), opts?.offset||0);
    return source;
}


function getAlarmState() {
    const state = Store.getStore().getState();

    const now = new Date().getTime();

    if ((state.backendStatus !== BackendStatus.Connected) &&
        (state.backendLastCnxTime || 0) < now - 30000
        && now - state.appStartTime > 30000)
    {
        // We have a connectivity issue
        return "connectivity";
    }

    if (state.backend?.notification?.list?.length)
    {
        // FIXME: handle some filtering here ?
        // We have an unread notification
        return "notification";
    }

    return undefined;
}

type AudioResource = {
    tick: AudioBuffer;
    bell: AudioBuffer;
    alarm: AudioBuffer;
    startup: AudioBuffer;
    finish: AudioBuffer;
}

const resources: Partial<AudioResource> = {};

async function loadIfMissing(key: keyof AudioResource, url: string)
{
    if (resources[key] !== undefined) return;
    resources[key] = await loadSound(url);
}

async function run(uniqueId: number) {

    await Promise.all([
        loadIfMissing('tick', 'tick.mp3'),
        loadIfMissing('bell', 'bell.mp3'),
        loadIfMissing('alarm', 'alert.mp3'),
        loadIfMissing('startup', 'startup.mp3'),
        loadIfMissing('finish', 'finish.mp3'),
    ]);

    if (currentRunnerId != uniqueId) {
        return;
    }
    currentRunnerConfUpdate = onConfUpdate;

    playSound(resources.startup);

    // FIXME: detect notifications ids from store
    // Warn those present for more than xxx seconds (configuration)

    let alarmPlay:AudioBufferSourceNode|undefined;
    let handler: NodeJS.Timeout;
    let clockSchedule: NodeJS.Timeout|undefined;

    function stopAlarm() {
        if (alarmPlay !== undefined) {
            alarmPlay.stop();
            alarmPlay = undefined;
        }
    }

    function checkEverything() {
        const alarmState = getAlarmState();
        if (alarmState) {
            logger.info('Audio alarm state', {alarmState});
            if (alarmPlay === undefined) {
                alarmPlay = playSound(resources.alarm, {tweak: (t)=>t.loop=true});
            }
        } else {
            stopAlarm();
        }
    }

    handler = setInterval(checkEverything, 1000);

    let prevClock: number = 0;
    function clock() {
        clockSchedule = undefined;
        let {time, delay} = scheduleClock();
        if (time === prevClock) {
            return;
        }
        prevClock = time;

        const dt = new Date(time);

        const gong = (dt.getHours() % 12) || 12;

        const gongDelay = 2;

        // We are scheduled with a theorical 500 ms delay. So program the sound with that delay
        const when = audioNow() + 0.5 - delay/1000;

        if (currentConfig.tictacHours && (dt.getMinutes() % 60 === 0) && (dt.getSeconds() < gong * gongDelay)) {
            if (dt.getSeconds() % gongDelay === 0) {
                playSound(resources.bell, {when});
            }
        } else {
            let high = (time / 1000) % 2;
            const rate = 6 + 2 * high;
            playSound(resources.tick, {rate, when});
        }
    }

    function unscheduleClock() {
        if (clockSchedule !== undefined) {
            clearTimeout(clockSchedule);
            clockSchedule = undefined;
        }
    }

    function scheduleClock() {
        // Insert a confortable 500 ms delay here (to program with good accuracy)
        const date = new Date().getTime() + 500;
        const nextSecond = (date - (date % 1000) + 1000);
        clockSchedule = setTimeout(clock, nextSecond - date);
        const time = nextSecond - 1000;
        const delay = date - time;
        return { time, delay };
    }

    function onConfUpdate() {
        if ((!currentConfig.active) || (currentRunnerId !== uniqueId)) {
            clearInterval(handler);
            unscheduleClock();
            playSound(resources.finish);
            return;
        }

        if (currentConfig.tictac) {
            if (!clockSchedule) scheduleClock();
        } else {
            if (clockSchedule) unscheduleClock();
        }

    }

    onConfUpdate();
}
