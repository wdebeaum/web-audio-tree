# Web Audio Tree #

Web Audio Tree is a GUI for the Web Audio API. You can use it to create a musical instrument that you can play with a computer keyboard, a MIDI keyboard, or a mouse. It arranges connected `AudioNode`s in a collapsible tree, with the destination node (i.e. the speakers) at the root. Audio data flows from the leaves of the tree to the root of the tree, and there are additional leaves for `AudioParam`s and other fields, as well as automation and scheduling calls (e.g. `setTargetAtTime()` and `stop()`). Non-tree-like structures (one node's output connected to the inputs of more than one other node), including those that form cycles, may be formed with labels and special "reference" nodes.

[Web Audio Tree online](https://ssl.uofr.net/~willdb/wat/wat.html)

[GitHub repo](https://github.com/wdebeaum/web-audio-tree)

## Requirements ##

Web Audio Tree uses my [Simple Tree](https://github.com/wdebeaum/simple-tree) library for the collapsible tree view. It also uses [PEG.js](https://pegjs.org/) for parsing value formulae. Run `make` to get them, and to generate the value parser and README.html, if you are setting up your own local installation of Web Audio Tree. Making README.html requires Ruby and the [github-markup gem](https://github.com/github/markup), but if it fails that won't prevent the rest of Web Audio Tree from working.

Web Audio Tree requires a web browser that implements the [Web Audio API](https://webaudio.github.io/web-audio-api/). It is somewhat flexible about what version of the API the browser supports, and also tolerates the `webkit` prefix being applied to some names. I know it to work to some extent on recent (as of 2018) versions of Firefox, Chrome, Safari, and other WebKit/Blink-based browsers. It may also work on Edge. Internet Explorer will not work.

Some browsers on some platforms have a large amount of audio latency. For example, as of this writing, Chrome on Linux has approximately 150ms of latency between striking a key (on the computer keyboard or a MIDI controller) and hearing the corresponding sound. Personally, I find this too distracting to actually play music well. Firefox does not have this large latency.

Although not required, Web Audio Tree can also make use of the [Web MIDI API](http://webaudio.github.io/web-midi-api/) to receive note on/off messages from a MIDI controller. But not all browsers that support the Web Audio API also support MIDI. In particular, Firefox does not yet support it (they seem to be [a bit hung up](https://github.com/mozilla/standards-positions/issues/58) on the security implications of SysEx messages, nevermind that I don't use those...). Chrome does support MIDI (it only allows SysEx in secure contexts (HTTPS), with a user prompt). See below for a workaround for Firefox on Linux, though.

And Web Audio Tree can make use of the [Media Capture and Streams API](https://www.w3.org/TR/mediacapture-streams/) for microphone input to record into an `AudioBuffer`. Again, this is not required. You can also load an audio file into an `AudioBuffer` from your computer or from the web.

## <a name="usage">Usage</a> ##

### Web Audio API basics ###

The Web Audio API lets you process and play audio from JavaScript running in a web browser. You do this by setting up a graph that describes the processing to be done, scheduling when certain nodes in the graph start and stop playing, and optionally automating changes to parameters. The edges of the graph are connections along which audio data flows. When more than one connection is made to the same place, the audio is mixed.

Audio data is represented as floating point numbers, called samples, usually between -1 and 1, representing sound levels at specific moments in time, called sample frames. Since audio data may have more than one channel (e.g. left and right for stereo), each sample frame has a sample for each channel. Most of the time you can ignore the existence of channels and just think of audio data as a single stream of samples.

The nodes of the graph are either `AudioNode`s or `AudioParam`s. `AudioNode`s are created using an `AudioContext`, which also includes a special `destination` node representing the speakers. Each type of `AudioNode` has a number of outputs (usually 1), and a number of inputs (usually 0 or 1), which can be connected to or from other graph nodes, respectively. It may also have some named `AudioParam`s and other fields that affect its behavior.

An `AudioParam` has a single numeric value at any given time, which you can think of as its output, passed into the `AudioNode` it is part of, but separate from the `AudioNode`'s other inputs (not mixed). You can simply set the value of an `AudioParam`, or you can automate changes to its value over time. `AudioParam`s also act as inputs; you can connect the output of another `AudioNode` to them (this is useful for various kinds of modulation). The audio data from these incoming connections is mixed (added) with the `AudioParam`'s set or automated value. An `AudioParam` may be a-rate (audio-rate) or k-rate (kontrol-rate?); an a-rate parameter can have a different value for each audio sample frame (e.g. 44100 times per second), while a k-rate parameter samples at a lower rate, once every render quantum (defined to be 128 sample frames).

Fields of `AudioNodes` that are not `AudioParams` cannot be automated or connected to, they can only be set. But fields are not restricted to numeric values. In fact, most numbers associated with `AudioNodes` are realized as `AudioParam`s; the exceptions are numbers that are not meant to vary over time, such as the `fftSize` of an `AnalyserNode`.

One important detail of the API is that any `AudioNode`s that can be scheduled to start can only be started once. To play the same sound again you must create and connect a new copy of any such node before starting it again. Web Audio Tree conveniently hides this detail from you, making a new instance of the whole tree for each note you play (this also enables polyphony).

For more information on the API, including a complete list of the different types of `AudioNode`s and their parameters and other fields, see the [Web Audio API spec](https://webaudio.github.io/web-audio-api/).

### Web Audio Tree ###

To start using Web Audio Tree, click the green "start" button. This will attempt to create an `AudioContext`, and then attempt to connect to your computer's first MIDI input port. The results of these attempts are visible in the API status area in the top right; a green checkmark means success, a red X means your browser doesn't support the relevant API, and a yellow question mark means either the attempt wasn't made for some reason, or you do have the API but it didn't work (this can happen if you don't have a MIDI input port). Only the green checkmark next to "Web Audio API" is required.

#### Building the tree ####

To start with, you are given the root of the tree, the `AudioDestinationNode` labeled "destination". This corresponds to the `destination` field of the `AudioContext`, and it is where audio data flows to in order to play it out of the speakers. When you click the "start" button, the button is replaced with an "add child" menu. All `AudioNode`s with an input have this menu. Selecting an `AudioNode` type from this menu will add an instance of that type as a child, which is to say the child's output will be connected to the parent's input. You can remove a child by clicking on the red X button to its right.

It's usually a good idea to start with a `GainNode`, and set its `gain` parameter down from 1 to something like 0.1, to avoid playing the maximum volume level from any `OscillatorNode`s you might add.

Note that when you add an `AudioNode` child, it will usually come with children of its own, representing its scheduling calls, fields, and k-rate and a-rate `AudioParam`s (in that order). These are not `AudioNode`s, but affect their parent `AudioNode`. `AudioNode`s have cool-color backgrounds (purple for source nodes, blue for others), while these other tree nodes have warm-color backgrounds (yellow for a-rate `AudioParam`s, orange for k-rate `AudioParam`s, pink for other fields and scheduling).

You can add children to non-source `AudioNode`s, and to `AudioParam`s. In the case of `AudioParam`s, the output audio of the child will affect the effective value of the parameter for each audio sample frame (for a-rate parameters) or quantum of 128 frames (for k-rate parameters).

You can also add automation calls to `AudioParam`s, which lets you schedule smooth (or abrupt) transitions between specific values at specific times. And you can, of course, just set a single value for any `AudioParam` or field.

#### Value expressions ####

When setting values for `AudioParam`s, number fields (including `PeriodicWave` and `Float32Array`), or automation or scheduling calls, you can use simple arithmetic expressions with these variables:

 - `n` = The MIDI **n**ote number of the key that was pressed.
 - `f` = The corresponding **f**requency in Hz.
 - `v` = The **v**elocity of the key press, as a number between 0 and 1.
 - `o` = The **o**nset time in seconds since the `AudioContext` was created.
 - `r` = The **r**elease time in seconds since the `AudioContext` was created.

Note that since we only know `r` after the key was released, it can only be used in scheduling and automation calls, and using it has the side effect that the calls it is used in will be deferred until the key has been released. So you can't, for example, schedule an `OscillatorNode` to stop playing 1 second before the key is released by putting `r-1` in its `stop()` call. This software cannot see the future.

You can also use the constants `π`, `τ`, and `e` (or equivalently `pi`/`PI`, `tau`/`TAU`, and `E`; `τ = 2π`), and any of the functions defined as methods of the [JavaScript Math object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math), without the `Math.` prefix. And you can use the additional function `st()`, which takes a pitch interval in semitones and returns the corresponding frequency multiplier, so e.g. `f*st(3)` is the frequency 3 semitones above the note frequency. Also, `√` can be used instead of `sqrt()`, and multiplication can be written as `*`, `×`, `·`, or juxtaposition. So the following are all equivalent: `PI * sqrt(2)`, `pi × √(2)`, `π√2`. And `^` is the exponentiation operator; `2^3` and `pow(2,3)` both equal `8`.

You can also use conditionals `if(condition)`, `elif(condition)`, and `else` (in that order), which each evaluate to `1` if the branch is taken, `0` otherwise. Otherwise they work the same as conditional nodes (see below). For example, if you want the frequency of an oscillator to be `f*2` for notes below A440 (MIDI note number 69), but `f` for other notes, you could set the frequency to the expression `if(n<69)*f*2 + else*f`.

#### Playing the instrument ####

To actually play the instrument you have created by building the tree, you can press, hold, and release keys using one of four methods:

 - Press the corresponding keys on your computer's keyboard. Use the diagram below the tree to show you which keys to press. This gives you a little over two octaves, with the q key being middle C. Note that the two rows overlap: ,-/ and q-e are the same notes. Also note that, while you can get polyphony by holding multiple keys, many computer keyboards are unable to detect certain combinations of keypresses, so one or more of the notes in a given chord may not sound.
 - Click on the key diagram with your mouse or other pointing device. You can't get polyphony this way, but you can drag the mouse across the keys to change which note is being played.
 - Switch from the keyboard to the touchboard using the menu above the key diagram. The touchboard is better suited to touchscreens, and supports multitouch/polyphony.
 - Connect a MIDI keyboard (or other MIDI controller) to your computer and press its keys. This will only work if there is a green checkmark next to "Web MIDI API" in the top right corner, and your device is connected to the first MIDI input port your computer has (however it defines "first"). Only note on/off messages are supported, so e.g. a sustain pedal isn't going to work. <span class="TODO">Making sustain pedals work is a planned feature.</span>

#### Reference nodes ####

Anywhere you can add an `AudioNode` child, you can also add a reference to another `AudioNode` already in the tree. Make sure the node you plan to refer to (the "referent") has a label by entering one in the text box to the right of the node type. Then add a `reference` child somewhere else, and enter the same label in its text box. The referent's output will be connected to both parents' inputs.

You can also use references to move nodes. Just make a reference as above, and then click on its `move here` button. The reference and its referent will switch places. Then you can remove the reference, leaving the referent in its new location in the tree.

And you can use references to copy nodes. Clicking the `copy here` button replaces the reference with a deep copy of the referent. Any labeled descendants will be turned into references to the originals instead of copies.

Note that while you can make cycles in the graph using references, the Web Audio API specification says that you must insert a non-zero `DelayNode` in any such cycle. Web Audio Tree does not check for this, but if you break this rule, you might break the program.

#### Microphone node ####

A `microphone` child takes input from the microphone, using a combination of a `MediaStreamSourceNode` and an audio stream obtained from `navigator.mediaDevices.getUserMedia()`. The microphone is opened when a key is pressed, and closed when it is released (it doesn't wait for the rest of the note to finish playing). <span class="TODO">In the future, it might support scheduling `start()`/`stop()` times.</span>

The microphone only works properly when playing one note at a time. Simultaneous notes can share the input, but the first note "owns" the microphone and will close it when it is released, regardless of whether other notes are using it. <span class="TODO">This may be fixed in the future so that the microphone remains open as long as it is in use.</span>

#### Conditional nodes ####

Also anywhere you can add an `AudioNode` child, you can also add a conditional node, one of `if`, `elif`, or `else`. The children of a conditional node are only used if the branch is taken. The `if` and `elif` nodes accept a condition, which is a boolean expression. Boolean expressions include `true` and `false`, and can be built up from value expressions using comparison and logical operators. Comparison operators include `<`, `<=`, `=`, `>=`, and `>`, and `<=` and `>=` can also be written as `≤` and `≥`, respectively. The logical operators are `and`, `or`, and `not`. An `if` branch is taken if its condition is true. An `elif` branch is taken if no previous `if` or `elif` branch was taken, and its condition is true. An `else` branch is taken if no previous `if` or `elif` branch was taken. `elif` and `else` only look back as far as the previous `if`, and it's possible to nest conditionals when they are nodes. It is not possible to nest conditionals in value expressions, but they won't interfere with conditional nodes.

You should not put the referent of a reference under a conditional node, since the referent might not be created, and then the reference will fail. <span class="TODO">This might be fixed in a later version. For now, one workaround is to put the referent under a top-level `GainNode` with `gain` set to 0, and use reference nodes everywhere it's actually needed, including under conditional nodes.</span>

#### Saving and loading the tree ####

You can save the whole tree to a JSON file by clicking the "Save..." button next to the root `AudioDestinationNode`. You can later load the tree again by clicking the "Load file..." button next to it. You can also load a JSON file from a web address by entering the address and clicking the "Load URL" button (this can be a relative address, such as `examples/sine-organ.json`). When you load a tree from a file, it will replace the currently displayed tree.

### Examples ###

The following are some examples of common patterns you might want to build in Web Audio Tree. Parameters and fields that aren't relevant for the specific example are omitted, and parts you must add or enter are in **bold**. Explanatory comments are added in _[bracketed italics]_.

#### Oscillators and envelopes ####

First, probably the simplest possible thing that's actually playable as an instrument: a sine-wave organ.

 - AudioDestinationNode destination
   - **GainNode** _[add child... GainNode]_
     - AudioParam gain = **0.1** _[change this from 1]_
     - **OscillatorNode** _[add this as a child of the GainNode]_
       - AudioParam frequency = **f** _[set the frequency or everything will be A440]_

You can automate the `GainNode`, adding a simple envelope to make the instrument more "piano"-like:

 - AudioDestinationNode destination
   - GainNode
     - AudioParam gain = 0.1
       - **setTargetAtTime(0, o, 0.5)** _[start moving the gain towards 0 at time o, with time constant 0.5 (lower is faster)]_
     - OscillatorNode

Or you can make the envelope more complex:

 - AudioDestinationNode destination
   - GainNode
     - AudioParam gain = **0** _[start at 0]_
       - **setValueAtTime(0, o)** _[no, really, [Firefox](https://github.com/WebAudio/web-audio-api/issues/341), start at 0]_
       - **linearRampToValueAtTime(0.2, o + 0.05)** _[attack, reaching 0.2 at time o + 0.05]_
       - **setTargetAtTime(0.1, o + 0.05, 0.3)** _[decay and sustain at 0.1]_
       - **setTargetAtTime(0, r, 0.3)** _[release to 0]_
     - OscillatorNode
       - stop(r **+ 5**) _[stop playing 5 seconds after key is released]_

Note that if you want to have the note continue playing after releasing the key that you used to play it, you must add to the stop time (in this case we added 5 seconds, which should be plenty).

Sine waves can be a bit boring, but we have other options, for example sawtooth:

 - AudioDestinationNode destination
   - GainNode
     - OscillatorNode
       - enum type = **sawtooth**

You can also construct an arbitrary periodic wave by specifying complex amplitudes (representing loudness and phase) for multiples of the specified frequency of the `OscillatorNode`. In most cases you don't really need to worry about the complex numbers; just set the real components.

 - AudioDestinationNode destination
   - GainNode
     - OscillatorNode
       - PeriodicWave
         - _ * f | real    | imaginary
         - 0     | 0       | 0 _[no DC offset]_
         - 1     | **1**   | 0 _[the main frequency]_
         - 2     | **0.2** | 0 _[lower amplitude for 2 * f]_
         - 3     | **0.4** | 0 _[middle amplitude for 3 * f]_
       - enum type = custom

Note that when you add rows to the `PeriodicWave` table, the `type` automatically switches to `custom`. If you delete all the rows, it switches back to `sine`.

#### Modulation ####

You can make interesting sounds using various kinds of modulation, connecting additional oscillators to parameters.

Amplitude Modulation (AM):

 - AudioDestinationNode destination
   - GainNode carrierGain
     - AudioParam gain = 0.1 _[center amplitude on 0.1]_
       - **GainNode** modulatorGain
         - AudioParam gain = **0.05** _[vary the amplitude by ±0.05, i.e. between 0.05 and 0.15]_
         - **Oscillator** modulator
           - AudioParam frequency = **f / 2**
     - OscillatorNode carrier
       - AudioParam frequency = f

Frequency Modulation (FM):

 - AudioDestinationNode destination
   - GainNode carrierGain
     - AudioParam gain = 0.1
     - OscillatorNode carrier
       - AudioParam frequency = f
         - **GainNode** modulatorGain
           - AudioParam gain = **f**
           - **Oscillator** modulator
             - AudioParam frequency = **f / 2**

Phase Modulation:

 - AudioDestinationNode destination
   - GainNode carrierGain
     - **DelayNode** phaseDelay
       - AudioParam delayTime = **1 / (pi * f)** _[delayTime must not go negative; again, we can't see the future]_
         - **GainNode** modulatorGain
           - AudioParam gain = **1 / (pi * f)**
           - **OscillatorNode** modulator
             - AudioParam frequency = **f / 2**
       - Oscillator carrier
         - AudioParam frequency = f

Technically, phase modulation is equivalent to frequency modulation for sine waves, except for a phase shift. And for that reason it was often used to implement "frequency" modulation in synthesizers and sound cards like the Adlib. But those devices don't just use sine waves, so it's not actually equivalent. And note that even for sine waves, the modulator gain is a bit different. The above two examples produce the same sound (except for the phase shift).

#### Wave shapes and buffers ####

You can use a `WaveShaperNode` to give an `OscillatorNode` an arbitrary waveform:

 - AudioDestinationNode destination
   - GainNode
     - **WaveShaperNode**
       - Float32Array curve = **-1, -0.2, 0, 0.8, 1**
       - OscillatorNode
         - enum type = **triangle**

In this example, the `WaveShaperNode`'s `curve` effectively moves the points on the `triangle` wave where it crosses -0.5 and 0.5, up to -0.2 and 0.8, respectively, while leaving the points where it touches -1, 0, and 1 alone.

You can use an `AudioBufferSourceNode` instead of an `OscillatorNode`, to play a sound loaded from a file (by clicking the button labeled "Load file...") or from the web (by entering the web address and clicking the button labeled "Load URL"), or a sound you record from your microphone (by clicking the record button to start recording, and then clicking it again to stop).

 - AudioDestinationNode destination
   - **AudioBufferSourceNode**
     - AudioBuffer buffer = **[●]** `[-|/\/\/\----]` [Save...] **[Load file...] [http://...____] [Load URL]**
     - AudioParam playbackRate = **f / 440**

To use such a recording as an instrument, you should put the note frequency variable `f` into the `playbackRate` parameter, divided by the actual frequency of the original sound (A440 in this case). Note that unlike the `OscillatorNode`, the `AudioBufferSourceNode` doesn't automatically play the sound as loudly as it can, just at its original volume. So a `GainNode` might not be necessary here.

A similar `AudioBuffer` field exists in the `ConvolverNode`, which can be useful for applying environmental effects to other sounds.

 - AudioDestinationNode destination
   - GainNode
     - **ConvolverNode**
       - AudioBuffer buffer = [●] `[-|/\/\/\----]` [Save...] [Load file...] [http://...____] [Load URL]
       - **OscillatorNode**

#### Conditionals ####

You can use conditionals to make different instruments for different parts of the keyboard. For example, you can make all the keys below middle C (MIDI note number 60) use a sawtooth organ, and the rest of the keys (i.e. middle C and above) use a sine piano:

 - **if n < 60** _[if note is below middle C...]_
   - **GainNode**
     - AudioParam gain = **0.2** _[...use an organ-like envelope...]_
       - **setTargetAtTime(0.1, o, 0.1)**
       - **setTargetAtTime(0, r, 0.1)**
     - **OscillatorNode**
       - stop(**r + 1**)
       - enum type = **sawtooth** _[...and a sawtooth waveform.]_
 - **else** _[if note is not below middle C...]_
   - **GainNode**
     - AudioParam gain = **0.1** _[...use a piano-like envelope...]_
       - **setTargetAtTime(0, o, 0.5)**
       - **setTargetAtTime(0, r, 0.1)**
     - **OscillatorNode**
       - stop(**r + 1**)
       - enum type = sine _[...and the default sine waveform.]_

#### References enable non-tree-shaped graphs ####

You can use references to make graphs that aren't strictly tree shaped. For example, you can make two parallel oscillators share the same LFO modulating their frequency:

 - **GainNode**
   - **Oscillator**
     - enum type = sine
     - AudioParam frequency = **f**
       - **GainNode lfo** _[the referent, labeled "lfo"]_
         - AudioParam gain = **f/100**
         - **Oscillator**
           - AudioParam frequency = **5**
   - **Oscillator**
     - enum type = **square**
     - AudioParam frequency = **f**
       - **from lfo** _[the reference. The audio data comes **from** the node labeled "lfo"]_

You can even make a feedback loop, though you must include a `DelayNode`:

 - **GainNode**
   - **Oscillator carrier** _[the referent]_
     - AudioParam frequency = **f**
       - **GainNode**
         - AudioParam gain = **f/4**
	 - **DelayNode**
	   - AudioParam delayTime = **10/f**
	     - **from carrier** _[the reference]_

Here, the output of the `carrier` is delayed by 10 wavelengths, then used to modulate its own frequency.

#### More in the spec ####

More types of `AudioNode` are available; see the [Web Audio API spec](https://webaudio.github.io/web-audio-api/) for complete, up-to-date information. Web Audio Tree is designed to automatically accommodate changes to the API, especially new `AudioNode` types.

## Planned Features ##

Some of these features may be implemented in the future:

 - use multitouch gestures to pan/zoom the touchboard by its handle along the top
 - handle MIDI controller messages, in particular the sustain pedal
 - variable for MIDI program number (along with selector for non-MIDI input)
 - import instruments from:
   - Adlib data (Rdos `.raw` / DosBox `.dro` / Video Game Music `.vgm` / `.vgz`)
   - FastTracker II (`.xm` / `.xi`)
   - SoundFont 2 (`.sf2`)?
 - export to JavaScript source code (except `AudioBuffer`s?)
 - record waveform of instrument being played to `.wav` file

## Linux Firefox MIDI workaround ##

I have kind of a hacky workaround for adding just enough MIDI support to Firefox on Linux to get MIDI keyboard input working. It may also work for other browsers, but only on Linux. Follow these steps:

 - Once:
   - Install [lighttpd](https://www.lighttpd.net/).
   - Install [Node.js](https://nodejs.org/) and its package manager, NPM (which usually comes with it).
 - Each time you want to use Web Audio Tree:
   - Run `make midi-workaround`
   - Follow the instructions it gives you.
 - When you're done using Web Audio Tree:
   - Press Ctrl+C in the terminal to stop the servers.

Now when you click "start" the Web MIDI API should be detected, and MIDI messages should be read from `/dev/snd/midiC0D0` and passed into Firefox (if you want to use a different device, edit `midi-server.js`).

If no messages appear to be getting through, make sure they're not getting taken by another program or connection. In particular, you can find your computer's MIDI port using `aconnect -l`, and if it already has a connection, you should disconnect it using `aconnect -d <from> <to>`. For example, I usually have my MIDI port `16:0` connected to my soundcard's wavetable synthesizer `17:0`, so I would have to run `aconnect -d 16:0 17:0` in order to use this workaround.

