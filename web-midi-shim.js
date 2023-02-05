// web-midi-shim.js - implement the minimum of the Web MIDI API necessary to
// get wat working

/* enter this in the web console to apply the shim:
const wms = document.createElement('script');
wms.src='web-midi-shim.js';
document.body.appendChild(wms);
*/

class MIDIPort extends EventTarget { // eslint-disable-line no-redeclare
  constructor() {
    super();
    this.socket = new WebSocket('ws://localhost:22468', 'midi');
    this.socket.addEventListener('message', evt => {
      const msg = new Event('midimessage');
      msg.data = JSON.parse(evt.data);
      this.dispatchEvent(msg);
    });
  }
}

navigator.requestMIDIAccess = function(opts) {
  return {
    then: cb => {
      const port = new MIDIPort();
      cb({ inputs: [port] });
    }
  };
};
