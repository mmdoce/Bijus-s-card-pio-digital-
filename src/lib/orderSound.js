export function createOrderSound({ notes, duration }) {
  let audio
  let enabled = false
  let activation = 0
  return {
    async enable() {
      const attempt = ++activation
      audio ??= new AudioContext()
      await audio.resume()
      if (attempt === activation) enabled = audio.state === 'running'
      return enabled
    },
    disable() {
      activation++
      enabled = false
      if (audio?.state === 'running') void audio.suspend().catch(() => {})
    },
    play() {
      if (!enabled || audio.state !== 'running') return
      const tone = audio.createOscillator()
      const volume = audio.createGain()
      const start = audio.currentTime
      notes.forEach((note, index) => tone.frequency.setValueAtTime(note, start + index * 0.13))
      volume.gain.setValueAtTime(0.12, start)
      volume.gain.exponentialRampToValueAtTime(0.001, start + duration)
      tone.connect(volume).connect(audio.destination)
      tone.start(start)
      tone.stop(start + duration)
    },
  }
}
