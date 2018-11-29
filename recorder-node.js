if ('AudioWorkletNode' in window) {

  class RecorderNode extends AudioWorkletNode {
    constructor(context, sampleRate) {
      super(context, 'recorder-processor' /*, { numberOfOutputs: 0 }*/);
      this.port.onmessage = (evt) => {
	var buffer = this.context.createBuffer(1, evt.data.length, sampleRate);
	buffer.copyToChannel(evt.data, 0);
	this.resolve(buffer);
      }
    }

    connectFrom(from) {
      from.connect(this);
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

  window.RecorderNode = RecorderNode;

} else if ('ScriptProcessorNode' in window) {
  console.log('no AudioWorkletNode; falling back to ScriptProcessorNode');

  class RecorderNode {
    constructor(context, sampleRate) {
      this.context = context;
      this.sampleRate = sampleRate;
      this.samples = new Float32Array(1024);
      this.numSamples = 0;
      this.quantum = 256;
      this.scriptProcessor = this.context.createScriptProcessor(this.quantum, 1, 0);
      this.scriptProcessor.onaudioprocess = this.onaudioprocess.bind(this);
    }

    connect(to) {
      this.scriptProcessor.connect(to);
    }

    connectFrom(from) {
      from.connect(this.scriptProcessor);
    }

    disconnect() {
      this.scriptProcessor.disconnect();
    }

    onaudioprocess(evt) {
      if (this.samples.length < this.numSamples + this.quantum) {
	var newSamples = new Float32Array(this.samples.length * 2);
	newSamples.set(this.samples);
	this.samples = newSamples;
      }
      var sa =
        this.samples.subarray(this.numSamples, this.numSamples + this.quantum);
      evt.inputBuffer.copyFromChannel(sa, 0);
      this.numSamples += this.quantum;
      return true;
    }

    getBuffer() {
      return new Promise((resolve, reject) => {
	var buffer =
	  this.context.createBuffer(1, this.numSamples, this.sampleRate);
	buffer.copyToChannel(this.samples.subarray(0, this.numSamples), 0);
	resolve(buffer);
      });
    }
  }

  RecorderNode.addModule = (ctx) => {
    // do nothing, just resolve immediately
    return new Promise((resolve, reject) => { resolve(); });
  }

  window.RecorderNode = RecorderNode;

} else {
  console.log('no AudioWorkletNode or ScriptProcessorNode; recording disabled');
}
