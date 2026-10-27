---
title: "Building a Ukulele Tuner with Web Audio, Web Workers, and TypeScript"
pubDate: 2026-10-27
description: "How Uke Tune Along uses Web Audio, Web Workers, and TypeScript to detect pitch, match ukulele strings, and display stable tuning guidance."
---

A musical instrument tuner sounds like a small frontend project: read the microphone, detect a frequency, and move a needle.

The interesting engineering starts between those steps. A plucked string contains harmonics. A microphone captures room noise. A pitch estimate moves slightly from one measurement to the next. If the interface follows every measurement literally, the player gets a restless display instead of useful guidance.

I built [Uke Tune Along](https://uketunealong.com/), a free ukulele tuner that processes microphone audio locally in the browser. It supports different tunings, guided string selection, automatic detection, and reference tones without requiring an account.

This article walks through the TypeScript implementation behind it, especially the boundary between detecting a pitch and presenting a reading someone can act on.

## 1. Separate audio capture, pitch detection, and presentation

The primary audio path has three execution contexts:

```text
Microphone
    |
    v
AudioWorklet: collect PCM samples
    |
    v
Main thread: relay sample buffers
    |
    v
Web Worker: estimate frequency and clarity
    |
    v
Main thread: match a string and stabilize the reading
    |
    v
React: display tuning guidance
```

An [AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet) runs custom processing on the Web Audio rendering thread. In this project, its job stays small: collect incoming samples into an analysis window and send the completed window onward.

The more expensive pitch detector runs in a dedicated Web Worker. The main thread relays the samples, then receives a compact result containing frequency and clarity.

The analysis window contains 4,096 samples. At a 48 kHz sample rate, that represents about 85.3 milliseconds of audio:

```ts
const windowDurationMs = (4096 / 48000) * 1000;
```

That is the duration of one window, not a measurement of total interface latency. Buffering, message delivery, stability checks, and rendering all contribute to the final response.

The main thread forwards each window using a transfer list:

```ts
// Inside the AudioWorkletNode's message handler:
const buffer: Float32Array = event.data.buffer;

worker.postMessage(
  { type: 'audio', buffer },
  [buffer.buffer]
);
```

Transferring the underlying `ArrayBuffer` avoids cloning its contents for this hop. Ownership moves to the worker, so the sender must stop using that buffer afterward. The capture worklet uses a separate reusable collection buffer and creates a chunk when a window is complete.

## 2. Ask for microphone access when the player starts tuning

Microphone access begins with the **Start microphone** button. The application requests these audio settings:

```ts
const constraints: MediaStreamConstraints = {
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  },
};
```

The intent is to reduce speech-oriented processing before analyzing an instrument. These are requested settings; the browser and input device still determine the actual capture behavior.

The implementation also retries with `{ audio: true }` if the first request fails. That compatibility retry can still fail, so the interface needs a clear error state and another way to tune.

Browser microphone access requires permission and a secure context, generally HTTPS in production. The [getUserMedia documentation](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) covers the relevant permission and device errors.

When listening stops, the application disconnects its audio pipeline, terminates the worker, stops the media tracks, and closes the audio context. Resetting the visible needle alone would leave the microphone lifecycle unfinished.

## 3. Estimate periodicity, then decide whether to trust it

A string can produce a strong harmonic above its fundamental frequency. Selecting the loudest spectral peak can therefore point at the wrong octave.

The detector in Uke Tune Along implements the McLeod Pitch Method. Its main steps are:

1. Reject windows below an RMS signal threshold.
2. Normalize the samples by their peak amplitude.
3. Compute autocorrelation using an FFT.
4. Calculate the normalized square difference function, or NSDF.
5. Select a candidate peak and refine its position with parabolic interpolation.
6. Convert the estimated period into a frequency.

The final conversion is simple:

```ts
const frequency = sampleRate / periodInSamples;
```

The FFT here supports autocorrelation. The detector is looking for repetition in the waveform rather than choosing a frequency bin directly.

Each result includes a clarity value. The matching layer checks clarity and the expected frequency range before accepting a reading. In this implementation, the clarity threshold varies with frequency and tuning mode.

Those thresholds are engineering choices, not a guarantee that every accepted result is correct. When the signal is ambiguous, withholding a reading can give the player better guidance than displaying a precise-looking guess.

## 4. Compare pitches in cents

Frequency differences in hertz do not correspond to equal musical intervals across the pitch range. For tuning, I use cents: 100 cents per semitone and 1,200 per octave.

The conversion is a small pure function:

```ts
function centsFromPitch(frequency: number, target: number) {
  return 1200 * Math.log2(frequency / target);
}
```

For an A4 target of 440 Hz:

```ts
centsFromPitch(440, 440); // 0: on target
centsFromPitch(435, 440); // approximately -19.8: flat
centsFromPitch(445, 440); // approximately +19.6: sharp
```

This gives the gauge a consistent meaning across strings. It also lets automatic detection compare the measured pitch with each target using absolute cents distance.

The selected tuning matters. Standard high-G tuning uses G4, C4, E4, and A4. Low-G changes the fourth string to G3. A note name without its octave is insufficient to describe the target.

Guided mode supplies another useful piece of information: the player selects the intended string. That reduces the need to infer their intent when the instrument is far from its target.

## 5. Stabilize both the measurement and the state

Even a plausible pitch estimate changes between windows. The measurement processor smooths successive frequencies with these weights:

```ts
const smoothedFrequency =
  previousFrequency * 0.55 + currentFrequency * 0.45;
```

When the matched string changes, the processor starts from the new reading rather than blending it with the previous string's frequency.

Smoothing alone does not solve state flicker. Imagine measurements moving between 4.9 and 5.1 cents. A single five-cent cutoff would repeatedly toggle the “in tune” indicator.

The implementation uses hysteresis:

```ts
const TUNED_ENTER_CENTS = 5;
const TUNED_EXIT_CENTS = 7;

function resolveInTune(cents: number, wasInTune: boolean) {
  const threshold = wasInTune
    ? TUNED_EXIT_CENTS
    : TUNED_ENTER_CENTS;

  return Math.abs(cents) <= threshold;
}
```

A string enters the tuned state within five cents and stays there until it moves beyond seven cents. These are the application's display thresholds, not a claim about measurement accuracy.

The React display reads the latest measurements on a 100 ms interval. A separate 900 ms signal timeout clears an old reading when valid measurements stop arriving. Together, these decisions keep the interface from chasing every fluctuation or indefinitely showing a note that has faded away.

## 6. Test the math separately from the microphone

Audio hardware makes failures difficult to reproduce. The core detector and matching logic can also be exercised with generated signals.

The current detector tests generate a fundamental plus a second harmonic at a 48 kHz sample rate. Across seven target frequencies, they assert a frequency error below 0.15 Hz for those synthetic inputs. They also check that silence and a weak signal are rejected.

Separate tests cover cents conversion, hysteresis boundaries, string matching, and octave correction, including preserving a valid low-G reading.

The existing detector, state, and matching suites all passed while preparing this article. These checks establish specific behavior under controlled inputs. They do not establish the same accuracy across real instruments, rooms, and phone microphones; device testing remains a separate task.

## Try it with an instrument

You can try [Uke Tune Along's online ukulele tuner](https://uketunealong.com/#tuner) without installing an app or creating an account. Raw microphone samples stay in the browser's audio processing path and are not uploaded by the tuner. Built-in reference tones also let you tune by ear without microphone access.

Building this tool made the presentation layer as interesting as the pitch detector. A frequency estimate becomes useful when the application can connect it to the intended string, decide how much confidence to place in it, and give the player a steady direction for their next adjustment.

If you try it, I'd be interested in your device, browser, tuning mode, and whether the display settles clearly after a single pluck.
