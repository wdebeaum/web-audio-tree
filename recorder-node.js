class RecorderNode extends AudioWorkletNode {
  constructor(context, sampleRate) {
    super(context, 'recorder-processor' /*, { numberOfOutputs: 0 }*/);
    this.port.onmessage = (evt) => {
      var buffer = this.context.createBuffer(1, evt.data.length, sampleRate);
      buffer.copyToChannel(evt.data, 0);
      this.resolve(buffer);
    }
  }

  getBuffer() {
    return new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.port.postMessage({});
    });
  }
}

RecorderNode.addModule = (ctx) => {
  return ctx.audioWorklet.addModule('recorder-processor.js');
}
