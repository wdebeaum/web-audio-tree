# Web Audio Tree #

Web Audio Tree is a GUI for the Web Audio API. You can use it to create a musical instrument that you can play with a computer keyboard, a MIDI keyboard, or a mouse. It arranges connected `AudioNode`s in a collapsible tree, with the destination node (i.e. the speakers) at the root. Audio data flows from the leaves of the tree to the root of the tree, and there are additional leaves for `AudioParam`s and other fields, as well as automation and scheduling calls (e.g. `setTargetAtTime()` and `stop()`). Non-tree-like structures (one node's output connected to the inputs of more than one other node), including those that form cycles, may be formed with labels and special "reference" nodes.

## Requirements ##

Web Audio Tree uses my [Simple Tree](https://github.com/wdebeaum/simple-tree) library for the collapsible tree view. Run `git submodule update` to get it.

Web Audio Tree requires a web browser that implements the [Web Audio API](https://webaudio.github.io/web-audio-api/). It is somewhat flexible about what version of the API the browser supports, and also tolerates the `webkit` prefix being applied to some names. I know it to work to some extent on recent (as of 2018) versions of Firefox, Chrome, Safari, and other WebKit/Blink-based browsers. It may also work on Edge. Internet Explorer will not work.

Some browsers on some platforms have a large amount of audio latency. For example, as of this writing, Chrome on Linux has approximately 150ms of latency between striking a key (on the computer keyboard or a MIDI controller) and hearing the corresponding sound. Personally, I find this too distracting to actually play music well. Firefox does not have this large latency.

Although not required, Web Audio Tree can also make use of the [Web MIDI API](http://webaudio.github.io/web-midi-api/) to receive note on/off messages from a MIDI controller. But not all browsers that support the Web Audio API also support MIDI. In particular, Firefox does not yet support it (they seem to be a bit hung up on the security implications of SysEx messages, nevermind that I don't use those...). Chrome does support MIDI (it only allows SysEx in secure contexts (HTTPS), with a user prompt). See below for a workaround for Firefox on Linux, though.

And Web Audio Tree can make use of the [Media Capture and Streams API](https://www.w3.org/TR/mediacapture-streams/) for microphone input to record into an `AudioBuffer`. Again, this is not required. You can also load an audio file from your computer into an `AudioBuffer`.

## Usage ##

<span class="TODO">general description, specific examples (simple sine, FM, buffer loop, filters, etc.)</span>

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

