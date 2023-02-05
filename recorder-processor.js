// processor for an AudioNode that records the input samples in a Float32Array,
// and responds to any message sent to its port with that array
class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samples = new Float32Array(1024); // one 4k page
    this.numSamples = 0;
    this.port.onmessage = (evt) => {
      this.port.postMessage(this.samples.subarray(0, this.numSamples));
    };
  }

  process(inputs, outputs /*, parameters */) {
    // double the size of this.samples when we run out of room
    if (this.samples.length < this.numSamples + inputs[0][0].length) {
      const newSamples = new Float32Array(this.samples.length * 2);
      newSamples.set(this.samples);
      this.samples = newSamples;
    }
    this.samples.set(inputs[0][0], this.numSamples);
    this.numSamples += inputs[0][0].length;
    return true;
  }
}

registerProcessor('recorder-processor', RecorderProcessor);
