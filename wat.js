/*
 * Initialization
 */

initTrees();

const nodeTypes = {
  AudioDestinationNode: {
    create: null,
    numberOfInputs: 1,
    numberOfOutputs: 0
  }
};

var ctx;

var tree = { // map IDs to data structures
  destination: {
    type: 'AudioDestinationNode',
    params: {},
    children: []
  }
};
var nextID = 0;
function getNextID() {
  return 'wat-node-' + (nextID++);
}

// clone the given template node, but give it a new id attribute
function cloneNewID(templateNode) {
  var clone = templateNode.cloneNode(true);
  clone.setAttribute('id', getNextID());
  return clone;
}

// clone the given template node, but remove its id attribute
function cloneNoID(templateNode) {
  var clone = templateNode.cloneNode(true);
  clone.removeAttribute('id');
  return clone;
}

function initWebAudio() {
  if ('function' != typeof AudioContext) {
    console.log('Web Audio API not supported in this browser.');
    document.getElementById('web-audio-status').classList.replace('unknown', 'unsupported');
    return;
  }
  ctx = new AudioContext({ latencyHint: 'interactive' });

  // fill nodeTypes by inspecting BaseAudioContext and example nodes created
  // using ctx
  for (var k in BaseAudioContext.prototype) {
    if (k == 'createScriptProcessor') { continue; } // deprecated
    if (/^create/.test(k)) {
      var v = BaseAudioContext.prototype[k];
      if (('function' == typeof v) && v.length == 0) {
	// found a method of BaseAudioContext taking no arguments, whose name
	// starts with 'create'. guess it will create a type of node!
	var typeName = k.replace(/^create/,'') + 'Node';
	// if not, try prepending 'Audio'
	if (!AudioNode.isPrototypeOf(window[typeName])) {
	  typeName = 'Audio' + typeName;
	}
	// if we have the name of an AudioNode subtype
	if (AudioNode.isPrototypeOf(window[typeName])) {
	  // try making an example instance
	  var example = ctx[k]();
	  // if it's not an instance, skip it
	  if (!(example instanceof window[typeName])) { continue; }
	  // if it is, make an entry in nodeTypes
	  nodeTypes[typeName] = {
	    create: k,
	    isScheduled: (example instanceof AudioScheduledSourceNode),
	    numberOfInputs: example.numberOfInputs,
	    numberOfOutputs: example.numberOfOutputs,
	    params: {},
	    fields: {}
	  };
	  // fill params and fields
	  for (var param in example) {
	    if (param in AudioScheduledSourceNode.prototype) {
	      // skip generic fields/methods
	    } else if (example[param] instanceof AudioParam) {
	      var automationRate = example[param].automationRate;
	      if (!automationRate) { // some browsers don't do this, so fake it
		automationRate =
		  // defaults according to the spec
		  (typeName == 'AudioBufferSourceNode' ||
		   typeName == 'DynamicsCompressorNode') ? 'k-rate' : 'a-rate';
	      }
	      nodeTypes[typeName].params[param] = {
		automationRate: automationRate,
		defaultValue: example[param].defaultValue,
		minValue: example[param].minValue,
		maxValue: example[param].maxValue
	      };
	    } else if ('function' == typeof example[param]) {
	      if (/^set/.test(param)) {
		var paramTypeName = param.substring(3);
		var paramCreate = 'create' + paramTypeName;
		if (example[param].length == 1 &&
		    ('function' == typeof window[paramTypeName]) &&
		    (paramCreate in BaseAudioContext.prototype) &&
		    ('function' ==
		       typeof BaseAudioContext.prototype[paramCreate])) {
		  var numArgs = BaseAudioContext.prototype[paramCreate].length;
		  var args = new Array(numArgs).fill('?').join(', ');
		  console.log(typeName + '#' + param + '(' + paramCreate + '(' + args + '))');
		  nodeTypes[typeName].fields[paramTypeName] = {
		    type: paramTypeName,
		    create: paramCreate,
		    set: param
		  };
		} else {
		  var numArgs = example[param].length;
		  var args = new Array(numArgs).fill('?').join(', ');
		  console.log(typeName + '#' + param + '(' + args + ')');
		  // meh
		}
	      } // else ignore non-setter functions
	    } else {
	      var paramType = typeof example[param];
	      if (paramType == 'object') {
		if (example[param] !== null) {
		  paramType = example[param].constructor.name;
		} else if (param == 'buffer') {
		  paramType = 'AudioBuffer';
		} else if (param == 'curve') {
		  paramType = 'Float32Array';
		}
	      } else if (paramType == 'string') {
		paramType = 'enum';
	      }
	      // these two are read-only
	      if ((typeName == 'AnalyserNode' &&
		   param == 'frequencyBinCount') ||
		  (typeName == 'DynamicsCompressorNode' &&
		   param == 'reduction')) {
		continue;
	      }
	      var values;
	      if (paramType == 'enum') {
		switch (typeName + '#' + param) {
		  case 'BiquadFilterNode#type':
		    values = ["lowpass", "highpass", "bandpass", "lowshelf", "highshelf", "peaking", "notch", "allpass"];
		    break;
		  case 'OscillatorNode#type':
		    values = ["sine", "square", "sawtooth", "triangle", "custom"];
		    break;
		  case 'PannerNode#panningModel':
		    values = ["equalpower", "HRTF"];
		    break;
		  case 'PannerNode#distanceModel':
		    values = ["linear", "inverse", "exponential"];
		    break;
		  case 'WaveShaperNode#oversample':
		    values = ["none", "2x", "4x"];
		    break;
		  default:
		    console.error('unknown enum: ' + typeName + '#' + param);
		    continue;
		}
	      }
	      console.log(typeName + '#' + param + ' : ' + JSON.stringify(paramType));
	      nodeTypes[typeName].fields[param] = {
		type: paramType,
		defaultValue: example[param]
	      };
	      if (paramType == 'enum') {
		nodeTypes[typeName].fields[param].values = values;
	      }
	    }
	  }
	}
      }
    }
  }

  // fill the add-child template from sorted nodeTypes (but only certain types)
  var addChildTemplate =
    document.querySelector('#audio-node-template > .add-child');
  Object.keys(nodeTypes).sort().forEach(function(name) {
    var desc = nodeTypes[name];
    // if the node has exactly one output, it can be a child node
    // if it has more than one input, we can't really use it
    if (desc.numberOfOutputs == 1 && desc.numberOfInputs <= 1) {
      var opt = document.createElement('option');
      opt.innerHTML = name;
      addChildTemplate.appendChild(opt);
    }
  });

  // add a clone of the add-child template to the destination li, as well as a
  // place for the children to be created
  var dest = document.getElementById('destination')
  dest.appendChild(cloneNoID(addChildTemplate));
  var ul = document.createElement('ul');
  ul.className = 'children';
  dest.appendChild(ul);
  dest.classList.replace('leaf', 'expanded');

  // also add them to the audio param template
  var apt = document.getElementById('audio-param-template')
  apt.appendChild(cloneNoID(addChildTemplate));
  var ul = document.createElement('ul');
  ul.className = 'children';
  apt.appendChild(ul);
  apt.classList.replace('leaf', 'expanded');

  document.getElementById('web-audio-status').classList.replace('unknown', 'supported');
}

var note2osc = {};

function initWebMIDI() {
  if ('function' != typeof navigator.requestMIDIAccess) {
    console.log('Web MIDI API not supported in this browser.');
    document.getElementById('web-midi-status').classList.replace('unknown', 'unsupported');
    return;
  }
  navigator.requestMIDIAccess({ sysex: false, software: false }).
  then(function(midiAccess) {
    // get the first MIDI input port
    var inputPort;
    midiAccess.inputs.forEach(function(port, key) {
      if (!inputPort) {
	inputPort = port;
      }
    });
    if (!inputPort) {
      console.log('no MIDI input ports found.');
      return;
    }
    inputPort.onmidimessage = function(evt) {
      try {
	//console.log(evt.data);
	if (evt.data.length == 3) {
	  var cmd = evt.data[0] >> 4;
	  var noteNum = evt.data[1];
	  var velocity = evt.data[2];
	  if (cmd == 8 || // note off
	      (cmd == 9 && velocity == 0)) { // note on with vel 0 (i.e. off)
	    //console.log({ note: 'off', num: noteNum });
	    if (note2osc[noteNum]) {
	      note2osc[noteNum].release(ctx.currentTime);
	    }
	  } else if (cmd == 9) { // note on
	    //console.log({ note: 'on', num: noteNum, vel: velocity });
	    if (note2osc[noteNum]) {
	      note2osc[noteNum].end();
	    }
	    note2osc[noteNum] = noteNumToStartedOscillator(noteNum, velocity);
	  }
	}
      } catch (e) {
	console.error(e);
      }
    };
    document.getElementById('web-midi-status').classList.replace('unknown', 'supported');
  });
}

document.getElementById('start').onclick = function(evt) {
  evt.currentTarget.remove();
  initWebAudio();
  initWebMIDI();
}

/*
 * Tree UI
 */

function addChild(select) {
  var typeName = select.value;
  select.value = 'add child';
  var parentSubtree = select.parentNode
  var children = parentSubtree.querySelector('.children');
  var newChild;
  var data = {
    type: typeName,
    label: '',
    fields: {},
    params: {},
    children: []
  };
  if (typeName == 'reference') {
    newChild = cloneNewID(document.getElementById('reference-template'));
  } else if (typeName in nodeTypes) {
    newChild = cloneNewID(document.getElementById('audio-node-template'));
    newChild.firstChild.innerHTML = typeName;
    if (nodeTypes[typeName].numberOfInputs == 0) { // can't add children
      newChild.getElementsByClassName('add-child')[0].remove();
      newChild.classList.add('source');
    }
    var grandkids = newChild.getElementsByClassName('children')[0];
    var fields = nodeTypes[typeName].fields;
    var fieldNames = Object.keys(fields).sort();
    fieldNames.forEach(function(name) {
      var type = fields[name].type;
      var fieldTemplate = document.getElementById(type + '-field-template');
      var field = cloneNewID(fieldTemplate);
      data.fields[name] = {
	type: type,
	value: nodeTypes[typeName].fields[name].defaultValue,
	valueFn: function() { return this.value; }
      };
      if ('set' in nodeTypes[typeName].fields[name]) {
	data.fields[name].set = nodeTypes[typeName].fields[name].set;
      }
      if (type != 'PeriodicWave') {
	field.querySelector('span.node').innerHTML = type + ' ' + name + ' = ';
      }
      switch (type) {
	case 'boolean':
	  var input = field.querySelector('input');
	  input.name = name;
	  if (fields[name].defaultValue) {
	    input.setAttribute('checked', 'checked');
	  }
	  break;
	case 'number':
	  var input = field.querySelector('input');
	  input.name = name;
	  input.value = fields[name].defaultValue;
	  break;
        case 'enum':
	  var select = field.querySelector('select.enum');
	  select.name = name;
	  fields[name].values.forEach(function(v) {
	    var option = document.createElement('option');
	    if (v == fields[name].defaultValue) {
	      option.setAttribute('selected', 'selected');
	    }
	    option.innerHTML = v;
	    select.appendChild(option);
	  });
	  break;
	case 'PeriodicWave':
	  field.querySelector('.PeriodicWave-row').remove();
	  break;
	case 'Float32Array':
	  var input = field.querySelector('input');
	  input.name = name;
	  break;
	case 'AudioBuffer':
	  // nothing?
	  break;
      }
      grandkids.appendChild(field);
    });
    var params = nodeTypes[typeName].params;
    var paramTemplate = document.getElementById('audio-param-template');
    // sort parameter names k-rate before a-rate, and then alphabetically
    var paramNames = Object.keys(params).sort(function(a,b) {
      if (params[a].automationRate == 'k-rate' &&
	  params[b].automationRate == 'a-rate') {
	return -1;
      } else if (params[a].automationRate == 'a-rate' &&
		 params[b].automationRate == 'k-rate') {
	return 1;
      } else if (a < b) {
	return -1;
      } else if (a > b) {
	return 1;
      } else {
	return 0;
      }
    });
    paramNames.forEach(function(name) {
      var param = cloneNewID(paramTemplate);
      var paramData = {
	type: 'AudioParam',
	value: params[name].defaultValue,
	valueFn: function() { return this.value; },
	automation: [],
	children: []
      };
      tree[param.id] = paramData;
      data.params[name] = paramData;
      param.firstChild.innerHTML = 'AudioParam ' + name + ' = ';
      param.classList.add(params[name].automationRate);
      param.getElementsByClassName('value')[0].value =
        params[name].defaultValue;
      grandkids.appendChild(param);
    });
  } else {
    console.error("bogus add-child value " + typeName);
    return;
  }
  data.subtree = newChild;
  tree[newChild.id] = data;
  tree[parentSubtree.id].children.push(data);
  children.appendChild(newChild);
  updateSubtree(parentSubtree, true);
}

function deleteChild(childSubtree) {
  var removeFromList;
  if (childSubtree.matches('.audio-node')) {
    removeFromList = 'children';
  } else if (childSubtree.matches('.automation')) {
    removeFromList = 'automation';
  }
  if (childSubtree.id && (childSubtree.id in tree)) {
    if (tree[childSubtree.id].type != 'reference' &&
        tree[childSubtree.id].label != '') {
      // this child has a label and isn't itself a reference; check that there
      // are no references to it, then delete it from its label
      // FIXME actually, we need to check all the descendants too
      for (var id in tree) {
	if (tree[id].label == tree[childSubtree.id].label &&
	    tree[id].type == 'reference') {
	  alert('cannot delete node, there are still references to it');
	  return;
	}
      }
      delete tree[tree[childSubtree.id].label];
    }
    if (removeFromList) {
      var parentData = tree[childSubtree.parentNode.parentNode.id];
      var childData = tree[childSubtree.id];
      var i = parentData[removeFromList].indexOf(childData);
      if (i >= 0) {
	parentData[removeFromList].splice(i, 1);
      }
    }
    delete tree[childSubtree.id];
  }
  childSubtree.remove();
}

function addAutomation(select) {
  var fnName = select.value;
  select.value = 'add automation';
  var children = select.parentNode.getElementsByClassName('children')[0];
  var newChild = cloneNewID(document.getElementById(fnName + '-template'));
  children.appendChild(newChild);
  var numArgs = newChild.getElementsByTagName('input').length;
  var childData = {
    fn: fnName,
    args: new Array(numArgs),
    argFns: new Array(numArgs)
  };
  tree[newChild.id] = childData;
  tree[select.parentNode.id].automation.push(childData);
}

function moveAutomation(button) {
  var li = button.parentNode;
  var dir = button.innerText;
  var data = tree[li.id];
  var parentData = tree[li.parentNode.parentNode.id];
  var i = parentData.automation.indexOf(data);
  if (dir == '↑') {
    var prev = li.previousElementSibling;
    if (prev) {
      li.parentNode.insertBefore(li, prev);
    }
    if (i > 0) {
      var tmp = parentData.automation[i];
      parentData.automation[i] = parentData.automation[i-1];
      parentData.automation[i-1] = tmp;
    }
  } else { // ↓
    var next = li.nextElementSibling;
    if (next) {
      var nextNext = next.nextElementSibling;
      li.parentNode.insertBefore(li, nextNext);
    }
    if (i >= 0 && i < parentData.automation.length - 1) {
      var tmp = parentData.automation[i];
      parentData.automation[i] = parentData.automation[i+1];
      parentData.automation[i+1] = tmp;
    }
  }
}

function makeValueFn(valueExpr) {
  // TODO!!! validate input.value before passing to eval
  return eval(
    "(function({ f, v, o, r }) {\n" +
    "  return (" + valueExpr + ");\n" +
    "})\n"
  );
}

function changeLabel(input) {
  var subtree = input.parentNode;
  if (subtree.matches('.reference')) { // ... on a reference
    // ensure that the new label actually refers to an existing node
    if (!(input.value in tree)) {
      alert('there is nothing labeled "' + input.value + '" to refer to');
      input.value = oldLabel;
      return;
    }
  } else { // setting a label field on a non-reference
    // ensure that we can look up the data by its (nonempty) label in tree,
    // and that any references to this node continue to reference this node
    var data = tree[subtree.id];
    var oldLabel = data.label;
    var references = [];
    if (oldLabel && oldLabel != '') {
      for (var id in tree) {
	if (tree[id].type == 'reference' && tree[id].label == oldLabel) {
	  references.push(tree[id]);
	}
      }
    }
    if (input.value == '') {
      if (references.length > 0) {
	alert('node is still referenced, cannot remove its label');
	input.value = oldLabel;
	return;
      }
    } else {
      if (input.value in tree) {
	alert('there is already something labeled "' + input.value + '"');
	input.value = oldLabel;
	return;
      }
      tree[input.value] = data;
    }
    if (oldLabel && oldLabel != '') {
      references.forEach(function(r) { r.label = input.value; });
      delete tree[oldLabel];
    }
  }
  tree[subtree.id][input.name] = input.value;
}

function changeFieldValue(input) {
  var subtree = input.parentNode.parentNode.parentNode;
  var field = tree[subtree.id].fields[input.name];
  switch (field.type) {
    case 'boolean':
      field.value = input.checked;
      break;
    case 'number':
      field.value = input.value;
      field.valueFn = makeValueFn(input.value);
      break;
    case 'enum':
      field.value = input.value;
      break;
    case 'Float32Array':
      field.value = input.value;
      field.valueFn = makeValueFn('Float32Array.from([' + input.value + '])');
      break;
  }
}

function changeParamValue(input) {
  var subtree = input.parentNode;
  tree[subtree.id][input.name] = input.value;
  tree[subtree.id].valueFn = makeValueFn(input.value);
}

function changeArg(input) {
  var i = 0;
  var sib = input.previousElementSibling;
  while (sib) {
    if (sib.tagName == 'INPUT') {
      i++;
    }
    sib = sib.previousElementSibling;
  }
  tree[input.parentNode.id].args[i] = input.value;
  tree[input.parentNode.id].argFns[i] = makeValueFn(input.value);
}

function moveHere(referenceSubtree) {
  // variables here are named for the old state
  var reference = tree[referenceSubtree.id];
  var referent = tree[reference.label];
  var referenceUL = referenceSubtree.parentNode;
  var referentUL = referent.subtree.parentNode;
  var referenceParent = tree[referenceUL.parentNode.id];
  var referentParent = tree[referentUL.parentNode.id];
  var referenceIndex = referenceParent.children.indexOf(reference);
  var referentIndex = referentParent.children.indexOf(referent);
  var referenceNext = referenceSubtree.nextElementSibling;
  var referentNext = referent.subtree.nextElementSibling;
  // swap the DOM nodes
  referenceUL.insertBefore(referent.subtree, referenceNext);
  referentUL.insertBefore(referenceSubtree, referentNext);
  // swap the data
  referenceParent.children[referenceIndex] = referent;
  referentParent.children[referentIndex] = reference;
}

function copyHere(referenceSubtree) {
  // TODO replace the reference with a copy of the referent, down to any labeled nodes, which become references to the originals instead of copies
  // (do both DOM nodes and data)
}

function recordBuffer(button) {
  button.innerHTML = '■';
  button.className = 'stop';
  button.setAttribute('onclick', 'stopRecordingBuffer(this)');
  // TODO
}

function stopRecordingBuffer(button) {
  button.innerHTML = '●';
  button.className = 'record';
  button.setAttribute('onclick', 'recordBuffer(this)');
  // TODO
}

/*
 * Playing note
 */

function PlayingNote(frequency, velocity, onset) {
  this.vars = { f: frequency, v: velocity, o: onset }; // no release yet
  this.audioNodes = {}; // by label
  this.scheduledNodes = [];
  this.referenceTasks = []; // functions to be called to connect references
  this.releaseTasks = []; // functions to be called when we know release time
  this.topNodes =
    tree.destination.children.map(this.instantiateNode.bind(this));
  this.topNodes.forEach(function(n) {
    n.connect(ctx.destination);
  });
  this.referenceTasks.forEach(function(fn) { fn(); });
  // TODO make start/end scheduling configurable?
  this.scheduledNodes.forEach(function(n) { n.start(onset); });
}

[ // begin PlayingNote methods

  function instantiateNode(nodeData) {
    if (nodeData.type == 'reference') {
      var that = this;
      return {
	connect: function(toNode) {
	  that.referenceTasks.push(function() {
	    that.audioNodes[nodeData.label].connect(toNode);
	  });
	},
	disconnect: function() {
	  that.audioNodes[nodeData.label].disconnect();
	}
      };
    } else { // ordinary AudioNode
      var typeData = nodeTypes[nodeData.type]
      var audioNode = ctx[typeData.create]();
      if (nodeData.label != '') {
	this.audioNodes[nodeData.label] = audioNode;
      }
      if (typeData.isScheduled) {
	this.scheduledNodes.push(audioNode);
      }
      for (var fieldName in nodeData.fields) {
	var field = nodeData.fields[fieldName];
	var val = field.valueFn(this.vars);
	if ('set' in field) {
	  if (val !== undefined) {
	    audioNode[field.set](val);
	  }
	} else {
	  audioNode[fieldName] = val;
	}
      }
      for (var paramName in nodeData.params) {
	this.instantiateParam(audioNode, paramName, nodeData.params[paramName]);
      }
      nodeData.children.forEach(function(c) {
	this.instantiateNode(c).connect(audioNode);
      }, this);
      return audioNode;
    }
  },

  function instantiateParam(audioNode, paramName, paramData) {
    var audioParam = audioNode[paramName];
    if (paramData.value != '') {
      audioParam.value = paramData.valueFn(this.vars);
    }
    paramData.automation.forEach(function(a) {
      // push anything that needs r onto releaseTasks; schedule everything else
      // immediately
      // TODO? only schedule events that happen at onset immediately; do later events in setTimeout(fn,0) to avoid delaying calls to .start() (not sure how much this matters; probably happens internal to these automation methods anyway)
      if (a.args.some(function(arg) { return /r/.test(arg); })) {
	var that = this;
	this.releaseTasks.push(function() {
	  that.instantiateAutomation(audioParam, a);
	});
      } else {
	this.instantiateAutomation(audioParam, a);
      }
    }, this);
    paramData.children.forEach(function(c) {
      this.instantiateNode(c).connect(audioParam);
    }, this);
  },

  function instantiateAutomation(audioParam, autoData) {
    audioParam[autoData.fn].apply(audioParam, autoData.argFns.map(function(fn) { return fn(this.vars); }, this));
  },

  function release(releaseTime) {
    this.vars.r = releaseTime;
    this.releaseTasks.forEach(function(fn) { fn(); });
    // FIXME: this isn't quite right; we should only call end after the note has finished sounding, but release does not necessarily immediately stop the note from sounding
    this.end();
  },

  function end() {
    this.scheduledNodes.forEach(function(n) { n.stop(); });
    this.topNodes.forEach(function(n) { n.disconnect(); });
    if ('function' == typeof this.onended) {
      this.onended();
    }
  },

].forEach(function(fn) { PlayingNote.prototype[fn.name] = fn; });

function noteNumToStartedOscillator(noteNum, velocity) {
  if (velocity === undefined) {
    velocity = 1;
  }
  // TODO make octave changeable
  var fractionOfMiddleC = Math.pow(2.0, (0 + noteNum - 72) / 12) * 2;
  var frequency = fractionOfMiddleC * 440;
  //console.log('start oscillator at ' + frequency + ' Hz');
  return new PlayingNote(frequency, velocity, ctx.currentTime);
}

/*
 * Keyboard
 * (largely borrowed from music-cad)
 */

function isAsciiKeyCode(code) {
  return ((code >= 48 && code <= 59) || (code >= 65 && code <= 90));
}

var tds = document.getElementsByTagName("td");
document.querySelectorAll('table#keyboard td.w, table#keyboard td.b').
forEach(function(td, i) {
  var content = td.innerHTML;
  if (content.length == 1) {
    var code = content.toUpperCase().charCodeAt(0);
    if (isAsciiKeyCode(code)) {
      td.setAttribute("id", "key_" + code);
    } else if (content == ',') {
      td.setAttribute("id", "key_188");
    } else if (content == '.') {
      td.setAttribute("id", "key_190");
    } else if (content == '/') {
      td.setAttribute("id", "key_191");
    }
  }
});

var kc2osc = {};

function standardKeyCode(evt) {
  var code = evt.keyCode;
  if (code == 186) { // Firefox and Chrome can't agree on ";"
    code = 59;
  }
  return code;
}

// activated by the actual keyboard

document.body.onkeydown = function(evt) {
  if (document.activeElement.tagName != 'INPUT') {
    var code = standardKeyCode(evt);
    var td = document.getElementById("key_" + code);
    if (td) {
      if (!kc2osc[code]) {
	var noteNum = td.className.slice(0,2);
	if (/\d\d/.test(noteNum)) {
	  kc2osc[code] = noteNumToStartedOscillator(noteNum);
	}
	setTimeout(function() { td.classList.add("keydown"); }, 0);
      }
      evt.preventDefault();
    }
  }
};

document.body.onkeyup = function(evt) {
  var code = standardKeyCode(evt);
  var td = document.getElementById("key_" + code);
  if (td) {
    var oscillator = kc2osc[code];
    if (oscillator) {
      oscillator.release(ctx.currentTime);
      kc2osc[code] = null;
    }
    setTimeout(function() { td.classList.remove("keydown"); }, 0);
    evt.preventDefault();
  }
};

// activated by clicking on the on-screen keyboard

var mouseOscillator;
var mouseButtonIsDown;

document.getElementById('keyboard').onmousedown = function(evt) {
  mouseButtonIsDown = true;
  var td = evt.target;
  if (td.matches('.b, .w')) {
    var noteNum = evt.target.className.slice(0,2);
    mouseOscillator = noteNumToStartedOscillator(noteNum);
    mouseOscillator.onended =
      function () {
	td.classList.remove('keydown');
      }
    setTimeout(function() { td.classList.add("keydown"); }, 0);
  }
  evt.preventDefault();
};

document.getElementById('keyboard').onmouseup = function(evt) {
  mouseButtonIsDown = false;
  mouseOscillator.release(ctx.currentTime);
  mouseOscillator = null;
  evt.preventDefault();
};

document.querySelectorAll('#keyboard td').
forEach(function(td) {
  td.onmouseenter = function(evt) {
    if (mouseButtonIsDown) {
      if (td.matches('.b, .w')) {
	var noteNum = td.className.slice(0,2);
	mouseOscillator = noteNumToStartedOscillator(noteNum);
	//console.log("enter " + mouseOscillator.vars.f);
	mouseOscillator.onended =
	  function () {
	    td.classList.remove('keydown');
	  }
	setTimeout(function() { td.classList.add("keydown"); }, 0);
      }
    }
    evt.preventDefault();
  };
  td.onmouseleave = function(evt) {
    if (mouseOscillator) {
      //console.log("leave " + mouseOscillator.vars.f);
      mouseOscillator.release(ctx.currentTime);
      mouseOscillator = null;
    }
    evt.preventDefault();
  };
});
