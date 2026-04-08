/**
 * Generate a synthetic alarm WAV file — 2 alternating tones (European siren style)
 * Output: assets/sounds/alarm_alert.wav
 */
const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 44100;
const DURATION = 6; // seconds — will be looped by expo-av
const BITS_PER_SAMPLE = 16;
const NUM_CHANNELS = 1;

const totalSamples = SAMPLE_RATE * DURATION;
const dataSize = totalSamples * NUM_CHANNELS * (BITS_PER_SAMPLE / 8);
const fileSize = 44 + dataSize; // WAV header = 44 bytes

const buffer = Buffer.alloc(fileSize);

// WAV header
buffer.write('RIFF', 0);
buffer.writeUInt32LE(fileSize - 8, 4);
buffer.write('WAVE', 8);
buffer.write('fmt ', 12);
buffer.writeUInt32LE(16, 16); // chunk size
buffer.writeUInt16LE(1, 20);  // PCM
buffer.writeUInt16LE(NUM_CHANNELS, 22);
buffer.writeUInt32LE(SAMPLE_RATE, 24);
buffer.writeUInt32LE(SAMPLE_RATE * NUM_CHANNELS * (BITS_PER_SAMPLE / 8), 28);
buffer.writeUInt16LE(NUM_CHANNELS * (BITS_PER_SAMPLE / 8), 32);
buffer.writeUInt16LE(BITS_PER_SAMPLE, 34);
buffer.write('data', 36);
buffer.writeUInt32LE(dataSize, 40);

// Generate alternating two-tone siren (like European ambulance)
const FREQ_HIGH = 960;   // Hz
const FREQ_LOW = 770;    // Hz
const SWITCH_PERIOD = 0.65; // seconds per tone switch

for (let i = 0; i < totalSamples; i++) {
  const t = i / SAMPLE_RATE;
  
  // Determine which tone we're on
  const cyclePos = (t % (SWITCH_PERIOD * 2)) / (SWITCH_PERIOD * 2);
  
  // Smooth frequency sweep between tones (more realistic siren)
  let freq;
  if (cyclePos < 0.5) {
    // Sweep from low to high
    const progress = cyclePos / 0.5;
    freq = FREQ_LOW + (FREQ_HIGH - FREQ_LOW) * progress;
  } else {
    // Sweep from high to low
    const progress = (cyclePos - 0.5) / 0.5;
    freq = FREQ_HIGH - (FREQ_HIGH - FREQ_LOW) * progress;
  }
  
  // Generate sine wave with slight harmonic for richer sound
  const fundamental = Math.sin(2 * Math.PI * freq * t);
  const harmonic2 = Math.sin(2 * Math.PI * freq * 2 * t) * 0.3;
  const harmonic3 = Math.sin(2 * Math.PI * freq * 3 * t) * 0.1;
  
  let sample = (fundamental + harmonic2 + harmonic3) / 1.4;
  
  // Apply slight volume envelope at loop boundaries for smooth looping
  const fadeLen = SAMPLE_RATE * 0.02; // 20ms fade
  if (i < fadeLen) {
    sample *= i / fadeLen;
  } else if (i > totalSamples - fadeLen) {
    sample *= (totalSamples - i) / fadeLen;
  }
  
  // Volume at ~85% to avoid clipping
  const value = Math.round(sample * 0.85 * 32767);
  const clamped = Math.max(-32768, Math.min(32767, value));
  
  buffer.writeInt16LE(clamped, 44 + i * 2);
}

const outPath = path.join(__dirname, '..', 'assets', 'sounds', 'alarm_alert.wav');
fs.writeFileSync(outPath, buffer);
console.log(`✅ Generated alarm at: ${outPath}`);
console.log(`   Duration: ${DURATION}s, Size: ${(fileSize / 1024).toFixed(1)} KB`);
