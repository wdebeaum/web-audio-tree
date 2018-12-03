# Web Audio Tree #

Web Audio Tree is a GUI for the Web Audio API. You can use it to create a musical instrument that you can play with a computer keyboard, a MIDI keyboard, or a mouse. It arranges connected `AudioNode`s in a collapsible tree, with the destination node (i.e. the speakers) at the root. Audio data flows from the leaves of the tree to the root of the tree, and there are additional leaves for `AudioParam`s and other fields, as well as automation and scheduling calls (e.g. `setTargetAtTime()` and `stop()`). Non-tree-like structures (one node's output connected to the inputs of more than one other node), including those that form cycles, may be formed with labels and special "reference" nodes.

## Requirements ##

Web Audio Tree uses my [Simple Tree](https://github.com/wdebeaum/simple-tree) library for the collapsible tree view. Run `git submodule update` to get it.

Web Audio Tree requires a web browser that implements the [Web Audio API](https://webaudio.github.io/web-audio-api/). It is somewhat flexible about what version of the API the browser supports, and also tolerates the `webkit` prefix being applied to some names. I know it to work to some extent on recent (as of 2018) versions of Firefox, Chrome, Safari, and other WebKit/Blink-based browsers. It may also work on Edge. Internet Explorer will not work.

Some browsers on some platforms have a large amount of audio latency. For example, as of this writing, Chrome on Linux has approximately 150ms of latency between striking a key (on the computer keyboard or a MIDI controller) and hearing the corresponding sound. Personally, I find this too distracting to actually play music well. Firefox does not have this large latency.

Although not required, Web Audio Tree can also make use of the [Web MIDI API](http://webaudio.github.io/web-midi-api/) to receive note on/off messages from a MIDI controller. But not all browsers that support the Web Audio API also support MIDI. In particular, Firefox does not yet support it (they seem to be [a bit hung up](https://github.com/mozilla/standards-positions/issues/58) on the security implications of SysEx messages, nevermind that I don't use those...). Chrome does support MIDI (it only allows SysEx in secure contexts (HTTPS), with a user prompt). See below for a workaround for Firefox on Linux, though.

And Web Audio Tree can make use of the [Media Capture and Streams API](https://www.w3.org/TR/mediacapture-streams/) for microphone input to record into an `AudioBuffer`. Again, this is not required. You can also load an audio file from your computer into an `AudioBuffer`.

## Usage ##

To start using Web Audio Tree, click the green "start" button. This will attempt to create an `AudioContext`, and then attempt to connect to your computer's first MIDI input port. The results of these attempts are visible in the API status area in the top right; a green checkmark means success, a red X means your browser doesn't support the relevant API, and a yellow question mark means either the attempt wasn't made for some reason, or you do have the API but it didn't work (this can happen if you don't have a MIDI input port). Only the green checkmark next to "Web Audio API" is required.

To start with, you are given the root of the tree, the `AudioDestinationNode` labeled "destination". This corresponds to the `destination` field of the `AudioContext`, and it is where audio data flows to in order to play it out of the speakers. When you click the "start" button, the button is replaced with an "add child" menu. All `AudioNode`s with an input have this menu. Selecting an `AudioNode` type from this menu will add an instance of that type as a child, which is to say the child's output will be connected to the parent's input. You can remove a child by clicking on the red X button to its right.

It's usually a good idea to start with a `GainNode`, and set its `gain` parameter down from 1 to something like 0.1, to avoid playing the maximum volume level from any `OscillatorNode`s you might add.

Note that when you add an `AudioNode` child, it will usually come with children of its own, representing its scheduling calls, fields, and k-rate and a-rate `AudioParam`s (in that order). These are not `AudioNode`s, but affect their parent `AudioNode`. `AudioNode`s have cool-color backgrounds (purple for source nodes, blue for others), while these other tree nodes have warm-color backgrounds (yellow for a-rate `AudioParam`s, orange for k-rate `AudioParam`s, pink for other fields and scheduling).

You can add children to non-source `AudioNode`s, and to `AudioParam`s. In the case of `AudioParam`s, the output audio of the child will affect the effective value of the parameter for each audio sample frame (for a-rate parameters) or quantum of 128 frames (for k-rate parameters).

You can also add automation calls to `AudioParam`s, which lets you schedule smooth (or abrupt) transitions between specific values at specific times. And you can, of course, just set a single value for any `AudioParam` or field.

When setting values for `AudioParam`s, number fields, or automation or scheduling calls, you can use simple arithmetic expressions with these variables:

 - `n` = The MIDI note number of the key that was pressed.
 - `f` = The corresponding frequency in Hz.
 - `v` = The velocity of the key press, as a number between 0 and 1.
 - `o` = The onset time in seconds since the `AudioContext` was created.
 - `r` = The release time in seconds since the `AudioContext` was created.

Note that since we only know `r` after the key was released, it can only be used in scheduling and automation calls, and using it has the side effect that the calls it is used in will be deferred until the key has been released. So you can't, for example, schedule an `OscillatorNode` to stop playing 1 second before the key is released by putting `r-1` in its `stop()` call. This software cannot see the future.

<span class="TODO">`PeriodicWave` should also be able to use arithmetic/variables, but currently it can't.</span>

To actually play the instrument you have created by building the tree, you can press, hold, and release keys using one of three methods:

 - Press the corresponding keys on your computer's keyboard. Use the diagram below the tree to show you which keys to press. This gives you a little over two octaves, with the q key being middle C. Note that the two rows overlap: ,-/ and q-e are the same notes. Also note that, while you can get polyphony by holding multiple keys, many computer keyboards are unable to detect certain combinations of keypresses, so one or more of the notes may not sound.
 - Click on the key diagram with your mouse or other pointing device. You can't get polyphony this way, but you can drag the mouse across the keys to change which note is being played.
 - Connect a MIDI keyboard (or other MIDI controller) to your computer and press its keys. This will only work if there is a green checkmark next to "Web MIDI API" in the top right corner, and your device is connected to the first MIDI input port your computer has (however it defines "first"). Only note on/off messages are supported, so e.g. a sustain pedal isn't going to work. <span class="TODO">make sustain pedals work.</span>

Anywhere you can add an `AudioNode` child, you can also add a reference to another `AudioNode` already in the tree. Make sure the node you plan to refer to (the "referent") has a label by entering one in the text box to the right of the node type. Then add a "reference" child somewhere else, and enter the same label in its text box. The referent's output will be connected to both parents' inputs.

You can also use references to move nodes. Just make a reference as above, and then click on its "move here" button. The reference and its referent will switch places. Then you can remove the reference, leaving the referent in its new location in the tree.

<span class="TODO">make the "copy here" button work too.</span>

Note that while you can make cycles in the graph using references, the Web Audio API specification says that you must insert a non-zero `DelayNode` in any such cycle. Web Audio Tree does not check for this, but if you break this rule, you might break it.

### Examples ###

<span class="TODO">specific examples (simple sine, FM, buffer loop, filters, etc. In particular, explain special field types: PeriodicWave, curve, buffer)</span>

## Linux Firefox MIDI workaround ##

I have kind of a hacky workaround for adding just enough MIDI support to Firefox on Linux to get MIDI keyboard input working. It may also work for other browsers, but only on Linux. Follow these steps:

 - Once:
   - Install [lighttpd](https://www.lighttpd.net/).
   - Install [Node.js](https://nodejs.org/) and its package manager, NPM (which usually comes with it).
   - In this directory: `npm install websocket`
 - Each time you want to use Web Audio Tree:
   - In one terminal: `./lighttpd.sh`
   - In another terminal: `node midi-server.js`
   - Point Firefox at `http://localhost:11235/wat.html` (don't click "start" yet!).
   - Open the Web Console in the Web Developer tools (Ctrl+Shift+K).
   - Paste this there: `var wms = document.createElement('script'); wms.src='web-midi-shim.js'; document.body.appendChild(wms);`

Now when you click "start" the Web MIDI API should be detected, and MIDI messages should be read from `/dev/snd/midiC0D0` and passed into Firefox (if you want to use a different device, edit `midi-server.js`).

If no messages appear to be getting through, make sure they're not getting taken by another program or connection. In particular, you can find your computer's MIDI port using `aconnect -l`, and if it already has a connection, you should disconnect it using `aconnect -d <from> <to>`. For example, I usually have my MIDI port `16:0` connected to my soundcard's wavetable synthesizer `17:0`, so I would have to run `aconnect -d 16:0 17:0` in order to use this workaround.

