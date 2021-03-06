// web-midi-shim.js - implement the minimum of the Web MIDI API necessary to
// get wat working

// enter this in the web console to apply the shim:
// var wms = document.createElement('script'); wms.src='web-midi-shim.js'; document.body.appendChild(wms);

function MIDIPort() {
  this.socket = new WebSocket('ws://localhost:22468', 'midi');
  var that = this;
  this.socket.addEventListener('message', function(evt) {
    if ('function' == typeof that.onmidimessage) {
      that.onmidimessage({ data: JSON.parse(evt.data) });
    }
  });
}

navigator.requestMIDIAccess = function(opts) {
  return {
    then: function(cb) {
      var port = new MIDIPort();
      cb({ inputs: [port] });
    }
  };
}
