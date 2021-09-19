import { BackendStatus } from "./BackendStore";
import { WatchConfiguration } from "./NotificationStore";
import * as Store from "./Store";

const resources = {
    tick: 'button-press.mp3',
    gong: 'beep.mp3',
};

const audioContext = new (window.AudioContext || ((window as any).webkitAudioContext as AudioContext))();

let currentConfig : WatchConfiguration = {
    active: false
};

let currentRunnerId: number = 0;
let currentRunner: Promise<void>;

export function setConfiguration(w : WatchConfiguration) {
    if (currentConfig === w) {
        return;
    }

    console.log('Updating audio alert config');
    const startStop = currentConfig.active !== w.active;

    currentConfig = w;
    if (startStop) {
        currentRunnerId++;
        if (currentConfig.active) {
            currentRunner = run(currentRunnerId);
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
            console.log('error');
            rej(e);
        }

        request.ontimeout = function(t) {
            console.log('timeout');
            rej(t);
        }

        request.send();
    });
}

async function loadSound(url: string): Promise<AudioBuffer> {
    console.log('loading ', url);
    const buffer = await fetchAudio(url);
    const ret = await audioContext.decodeAudioData(buffer);
    console.log('loaded ', url);
    return ret;
}


function playSound(buffer: AudioBuffer, rate: number, tweak?: (t: AudioBufferSourceNode)=>{}) {
    const source = audioContext.createBufferSource(); // creates a sound source
    source.buffer = buffer;                    // tell the source which sound to play
    source.playbackRate.value = rate;
    if (tweak) tweak(source);
    //source.detune.value = -600;
    source.connect(audioContext.destination);       // connect the source to the context's destination (the speakers)

    source.start(0);                           // play the source now
                                               // note: on older systems, may have to use deprecated noteOn(time);
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


    return undefined;
}

async function run(uniqueId: number) {
    const tick = await loadSound('button-press.mp3');
    const beep = await loadSound('beep.mp3');
    const alarm = await loadSound('alert.mp3');

    playSound(beep, 1);

    // FIXME: detect notifications ids from store
    // Warn those present for more than xxx seconds (configuration)

    let alarmPlay:AudioBufferSourceNode|undefined;
    let handler: NodeJS.Timeout;

    function stopAlarm() {
        if (alarmPlay !== undefined) {
            alarmPlay.stop();
            alarmPlay = undefined;
        }
    }

    function checkEverything() {
        if (currentRunnerId != uniqueId) {
            clearInterval(handler);
            stopAlarm();
            playSound(beep, 0.5);
            return;
        }

        const alarmState = getAlarmState();
        if (alarmState) {
            console.log(alarmState);
            if (alarmPlay === undefined) {
                alarmPlay = playSound(alarm, 1, (t)=>t.loop=true);
            }
        } else {
            stopAlarm();
        }
    }

    handler = setInterval(checkEverything, 1000);
}


/*
let prev = 0;

function pad2(t:number) {
    return ('' + t).padStart(2, "0");
}

function play() {
    const time = schedule();
    if (time === prev) {
        return;
    }
    prev = time;

    const dt = new Date(time);

    const gong = (dt.getHours() % 12) || 12;

    const gongDelay = 2;

    if ((dt.getMinutes() % 60 === 0) && (dt.getSeconds() < gong * gongDelay)) {
        if (dt.getSeconds() % gongDelay === 0) {
            playSound(gongSound, 1);
        }
    } else {
        let high = (time / 1000) % 2;
        playSound(tickSound, 6 + 2 * high);
    }
    
    document.getElementById('hour').textContent = pad2(dt.getHours()) + ':' + pad2(dt.getMinutes()) + ':' + pad2(dt.getSeconds());
}

function schedule() {
    const date = new Date().getTime();
    console.log('delay ', date%1000);
    const nextSecond = (date - (date % 1000) + 1000);
    setTimeout(play, nextSecond - date);
    return (nextSecond - 1000);
}

schedule();


*/