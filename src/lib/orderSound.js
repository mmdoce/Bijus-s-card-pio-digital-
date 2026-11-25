const patterns = {
  chime: ['triangle', [740, 988, 740, 1175], 0.18],
  bells: ['sine', [523, 659, 784, 1047], 0.24],
  pulse: ['square', [660, 660, 880], 0.19],
  melody: ['triangle', [784, 659, 880, 1047, 880], 0.14],
  signal: ['sawtooth', [440, 587, 440, 587], 0.17],
}

let audio
let activeTone
let pendingUnlock
const listeners = new Set()
export const audioReady = () => audio?.state === 'running'
export function subscribeAudio(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
const notify = () => listeners.forEach(listener => listener())

export async function unlockOrderAudio() {
  if (audioReady()) return true
  try {
    if (!audio || audio.state === 'closed') {
      const Audio = globalThis.AudioContext ?? globalThis.webkitAudioContext
      audio = new Audio()
      audio.addEventListener('statechange', notify)
    }
    pendingUnlock ??= audio.resume().finally(() => { pendingUnlock = undefined })
    await Promise.race([pendingUnlock, new Promise(resolve => setTimeout(resolve, 800))])
  } catch { return false }
  return audioReady()
}

export function startAudioUnlock() {
  const unlock = () => { if (!audioReady()) void unlockOrderAudio() }
  for (const event of ['click', 'pointerup', 'keydown']) window.addEventListener(event, unlock, true)
}

export function playOrderSound({ sound, volume }) {
  if (!audioReady() || volume <= 0) return false
  const [wave, notes, step] = patterns[sound] ?? patterns.chime
  const start = audio.currentTime
  activeTone?.stop(start)
  const tone = audio.createOscillator()
  const gain = audio.createGain()
  tone.type = wave
  const peak = (wave === 'square' || wave === 'sawtooth' ? 0.23 : 0.42) * volume / 100
  notes.forEach((note, index) => {
    const at = start + index * step
    tone.frequency.setValueAtTime(note, at)
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.linearRampToValueAtTime(peak, at + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + step - 0.015)
  })
  tone.connect(gain).connect(audio.destination)
  tone.onended = () => {
    if (activeTone === tone) activeTone = undefined
    tone.disconnect()
    gain.disconnect()
  }
  activeTone = tone
  tone.start(start)
  tone.stop(start + step * notes.length)
  return true
}
