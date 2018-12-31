/*
 * Initialization
 */

// no webkit prefix plz
Object.getOwnPropertyNames(window).forEach((k) => {
  if (/^webkit/.test(k)) {
    var noPrefix = k.substring(6);
    var noPrefixLower = noPrefix.substring(0,1).toLowerCase() + noPrefix.substring(1);
    if (!(noPrefix in window) && !(noPrefixLower in window)) {
      window[noPrefix] = window[k];
      window[noPrefixLower] = window[k];
    }
  }
});

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
    label: 'destination',
    fields: {},
    params: {},
    children: [],
    subtree: document.getElementById('destination')
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
  // fake BaseAudioContext if it's missing
  if (!('BaseAudioContext' in window)) {
    window.BaseAudioContext = window.AudioContext;
  }
  // fake AudioScheduledSourceNode if it's missing
  if (!('AudioScheduledSourceNode' in window)) {
    window.AudioScheduledSourceNode = function() {};
    window.AudioScheduledSourceNode.prototype = { isFake: true };
    'onended start stop connect disconnect context numberOfInputs numberOfOutputs channelCount channelCountMode channelInterpretation playbackState UNSCHEDULED_STATE SCHEDULED_STATE PLAYING_STATE FINISHED_STATE'.split(/ /).forEach((k) => {
      window.AudioScheduledSourceNode.prototype[k] = null;
    });
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
	    isScheduled:
	      (AudioScheduledSourceNode.prototype.isFake ?
	        ('start' in example) :
	        (example instanceof AudioScheduledSourceNode)),
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
		    defaultValue: null,
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
		  case 'AudioPannerNode#panningModel':
		  case 'PannerNode#panningModel':
		    values = ["equalpower", "HRTF"];
		    break;
		  case 'AudioPannerNode#distanceModel':
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
  dest.appendChild(document.getElementById('save-load-controls'));
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

  if ('RecorderNode' in window) {
    RecorderNode.addModule(ctx).
    then(() => { console.log('added RecorderNode to ctx'); }).
    catch((err) => {
      console.log(err.message);
      console.log(err.stack);
      console.log(JSON.stringify(err));
    });
  } else {
    console.log('no RecorderNode');
  }

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
	  var velocity = evt.data[2] / 127; // divide so velocity is in [0,1]
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
	    note2osc[noteNum] = new PlayingNote(noteNum, velocity);
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
  var data = makeChild(typeName);
  tree[data.subtree.id] = data;
  tree[parentSubtree.id].children.push(data);
  children.appendChild(data.subtree);
  updateSubtree(parentSubtree, true);
}

function makeChild(typeName) {
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
  } else if (['if','elif','else'].includes(typeName)) {
    newChild = cloneNewID(document.getElementById('audio-node-template'));
    newChild.firstChild.innerHTML = typeName;
    var input = newChild.getElementsByClassName('label')[0];
    if (typeName == 'else') {
      input.parentNode.removeChild(input);
    } else {
      data.value = 'false';
      data.valueFn = function() { return false; }
      input.value = data.value;
      input.className = 'value';
      input.placeholder = 'condition';
      input.name = 'condition';
      input.setAttribute('onchange', 'changeCondition(this)');
    }
  } else if (typeName in nodeTypes) {
    newChild = cloneNewID(document.getElementById('audio-node-template'));
    newChild.firstChild.innerHTML = typeName;
    if (nodeTypes[typeName].numberOfInputs == 0) { // can't add children
      newChild.getElementsByClassName('add-child')[0].remove();
      newChild.classList.add('source');
    }
    var grandkids = newChild.getElementsByClassName('children')[0];
    // AnalyserNode output data
    if (typeName == 'AnalyserNode') {
      var freqSubtree = cloneNoID(document.getElementById('AnalyserNode-data-template'));
      freqSubtree.firstChild.innerHTML = 'Uint8Array frequencyData';
      grandkids.appendChild(freqSubtree);
      var timeSubtree = cloneNoID(document.getElementById('AnalyserNode-data-template'));
      timeSubtree.firstChild.innerHTML = 'Uint8Array timeDomainData';
      grandkids.appendChild(timeSubtree);
    }
    // non-AudioParam fields
    var fields = nodeTypes[typeName].fields;
    // start()/end() calls for scheduled nodes (as fake fields)
    if (nodeTypes[typeName].isScheduled) {
      data.fields.startWhen = {
	type: 'number',
	value: 'o',
	valueFn: function({ o }) { return o; },
	set: 'start',
	subtree: cloneNoID(document.getElementById('start-template'))
      };
      grandkids.appendChild(data.fields.startWhen.subtree);
      // TODO? add offset arg for AudioBufferSourceNode
      data.fields.stopWhen = {
	type: 'number',
	value: 'r',
	valueFn: function({ r }) { return r; },
	set: 'stop',
	subtree: cloneNoID(document.getElementById('stop-template'))
      };
      grandkids.appendChild(data.fields.stopWhen.subtree);
    }
    var fieldNames = Object.keys(fields).sort();
    fieldNames.forEach(function(name) {
      var type = fields[name].type;
      var fieldTemplate = document.getElementById(type + '-field-template');
      var field = cloneNewID(fieldTemplate);
      data.fields[name] = {
	type: type,
	value: nodeTypes[typeName].fields[name].defaultValue,
	valueFn: function() { return this.value; },
	subtree: field
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
	    if (typeName == 'OscillatorNode' &&
	        name == 'type' && v == 'custom') {
	      // not allowed to directly set OscillatorNode#type='custom'; must
	      // setPeriodicWave instead
	      option.setAttribute('disabled', 'disabled');
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
    // AudioParams
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
	children: [],
	subtree: param
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
  return data;
}

function getDescendantLabels(nodeData, labels) {
  if (!labels) {
    labels = [];
  }
  if (nodeData.type != 'reference' && nodeData.label != '') {
    labels.push(nodeData.label);
  }
  for (var name in nodeData.params) {
    nodeData.params[name].children.forEach(function(child) {
      getDescendantLabels(child, labels);
    });
  }
  nodeData.children.forEach(function(child) {
    getDescendantLabels(child, labels);
  });
  return labels;
}

function isDescendant(ancestorID, descendantID) {
  if (ancestorID == descendantID) {
    return true;
  } else if (descendantID == 'destination') { // root
    return false;
  } else {
    var parentID =
      document.getElementById(descendantID).parentNode.parentNode.id;
    return isDescendant(ancestorID, parentID);
  }
}

// move descendants of the given node out from under it if they are referenced
// elsewhere, in preparation for removing the node
function moveReferencedDescendants(nodeData) {
  var labels = getDescendantLabels(nodeData);
  console.log('descendant labels: ' + labels.join(', '));
  for (var id in tree) {
    var refNodeData = tree[id];
    if (refNodeData.type == 'reference') {
      console.log('reference ' + id + ' has label ' + refNodeData.label);
      var labelIndex = labels.indexOf(refNodeData.label);
      console.log('labelIndex = ' + labelIndex);
      if (labelIndex >= 0 &&
	  labels.includes(refNodeData.label) &&
	  !isDescendant(nodeData.subtree.id, id)) {
	console.log('moving');
	moveHere(document.getElementById(id)); // swap reference with referent
	labels.splice(labelIndex, 1); // remove the label from the list
      }
    }
  }
}

// delete all the nodes in the subtree from tree
function deleteSubtree(nodeData) {
  if ('children' in nodeData) {
    nodeData.children.forEach(deleteSubtree);
  }
  if ('params' in nodeData) {
    for (var name in nodeData.params) {
      deleteSubtree(nodeData.params[name]);
    }
  }
  if ('automation' in nodeData) {
    nodeData.automation.forEach(deleteSubtree);
  }
  if ('subtree' in nodeData) {
    delete tree[nodeData.subtree.id];
  }
  if (nodeData.type != 'reference' &&
      nodeData.label != '') {
    delete tree[nodeData.label];
  }
}

function deleteChild(childSubtree) {
  var removeFromList;
  if (childSubtree.matches('.audio-node')) {
    removeFromList = 'children';
  } else if (childSubtree.matches('.automation')) {
    removeFromList = 'automation';
  }
  if (childSubtree.id && (childSubtree.id in tree)) {
    var childData = tree[childSubtree.id];
    if (removeFromList == 'children') { // automation can't have descendants
      moveReferencedDescendants(childData);
    }
    deleteSubtree(childData);
    if (removeFromList) {
      var parentData = tree[childSubtree.parentNode.parentNode.id];
      var i = parentData[removeFromList].indexOf(childData);
      if (i >= 0) {
	parentData[removeFromList].splice(i, 1);
      }
    }
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
    argFns: new Array(numArgs),
    subtree: newChild
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

function updatePeriodicWave(table) {
  var subtree = table.parentNode.parentNode.parentNode.parentNode;
  var data = tree[subtree.id];
  var valueExprs = [];
  // NodeList, y u no have map?
  table.querySelectorAll('input').forEach(function(input) {
    valueExprs.push(input.value);
  });
  var select = subtree.querySelector("select[name='type']");
  if (valueExprs.length == 0) { // no PeriodicWave
    // reenable the select and set it to the default value, if we had a
    // PeriodicWave before
    if (data.fields.PeriodicWave.value !== null) {
      data.fields.type.value =
        nodeTypes.OscillatorNode.fields.type.defaultValue;
      select.value = data.fields.type.value;
      select.disabled = false;
    }
    // unset the PeriodicWave
    data.fields.PeriodicWave.valueFn = function() { return this.value; }
    data.fields.PeriodicWave.value = null;
  } else { // some PeriodicWave
    // make the PeriodicWave valueFn
    data.fields.PeriodicWave.valueFn = makeValueFn(valueExprs, 'PeriodicWave');
    data.fields.PeriodicWave.value = valueExprs;
    // set type='custom' and disable the select
    data.fields.type.value = 'custom';
    select.value = data.fields.type.value;
    select.disabled = true;
  }
}

function changePeriodicWaveValue(input) {
  var table = input.parentNode.parentNode.parentNode;
  try {
    updatePeriodicWave(table);
  } catch (ex) {
    console.error(ex);
    alert('invalid PeriodicWave value: ' + ex.message);
    // set the input value back to what it was
    var subtree = table.parentNode.parentNode.parentNode.parentNode;
    var data = tree[subtree.id];
    var i =
      table.querySelectorAll('input').
      findIndex(function(inp) { return (inp === input); });
    if (i >= 0)
      input.value = data.fields.PeriodicWave.value[i];
  }
}

function addPeriodicWaveRow(button) {
  var buttonRow = button.parentNode.parentNode;
  var table = buttonRow.parentNode;
  var rowTemplate = document.getElementById('PeriodicWave-row-template');
  var newRow = cloneNoID(rowTemplate);
  newRow.children[0].innerHTML = table.children.length - 2;
  table.insertBefore(newRow, buttonRow);
  try {
    updatePeriodicWave(table);
  } catch (ex) {
    console.error(ex);
    alert('something went wrong adding a PeriodicWave row: ' + ex.message);
  }
}

function removePeriodicWaveRow(button) {
  var buttonRow = button.parentNode.parentNode;
  var table = buttonRow.parentNode;
  var rowToRemove = buttonRow.previousElementSibling;
  if (rowToRemove) {
    rowToRemove.remove();
    try {
      updatePeriodicWave(table);
    } catch (ex) {
      console.error(ex);
      alert('something went wrong removing a PeriodicWave row: ' + ex.message);
    }
  }
}

function makeValueFn(valueExpr, expectedType) {
  if (!expectedType) { expectedType = 'value'; }
  var jsValueExpr;
  switch (expectedType) {
    // case 'AudioBuffer': // TODO?
    case 'PeriodicWave':
      // in this case, valueExpr is an array of expressions in the order they
      // appear as input fields in the document
      if (valueExpr.length % 2 != 0)
	throw new Error('expected even number of PeriodicWave elements');
      var real = [];
      var imag = [];
      for (var i = 0; i < valueExpr.length; i += 2) {
	real.push(ValueParser.parse(''+valueExpr[i], {startRule: 'value'}));
	imag.push(ValueParser.parse(''+valueExpr[i+1], {startRule: 'value'}));
      }
      jsValueExpr =
        'ctx.createPeriodicWave(' +
	  'new Float32Array([' + real.join(', ') + ']), ' +
	  'new Float32Array([' + imag.join(', ') + '])' +
	')';
      break;
    case 'value': // fall through
    case 'array':
    case 'condition':
      jsValueExpr = ValueParser.parse(''+valueExpr, {startRule: expectedType});
      break;
    default:
      throw new Error('unknown expression type: ' + expectedType);
  }
  return eval(
    "(function({ n, f, v, o, r }) {\n" +
    "  return (" + jsValueExpr + ");\n" +
    "})\n"
  );
}

function changeLabel(input) {
  var subtree = input.parentNode;
  var data = tree[subtree.id];
  var oldLabel = data.label;
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
  data[input.name] = input.value;
}

function changeCondition(input) {
  var subtree = input.parentNode;
  var data = tree[subtree.id];
  try {
    data.valueFn = makeValueFn(input.value, 'condition');
    data.value = input.value;
  } catch (ex) {
    alert('invalid condition: ' + ex.message);
    input.value = data.value;
  }
}

function changeFieldValue(input) {
  var subtree = input.parentNode.parentNode.parentNode;
  var field = tree[subtree.id].fields[input.name];
  try {
    switch (field.type) {
      case 'boolean':
	field.value = input.checked;
	break;
      case 'number':
	field.valueFn = makeValueFn(input.value);
	field.value = input.value;
	break;
      case 'enum':
	field.value = input.value;
	break;
      case 'Float32Array':
	field.valueFn = makeValueFn(input.value, 'array');
	field.value = input.value;
	break;
    }
  } catch (ex) {
    alert('invalid field value: ' + ex.message);
    input.value = field.value;
  }
}

function changeParamValue(input) {
  var subtree = input.parentNode;
  try {
    tree[subtree.id].valueFn = makeValueFn(input.value);
    tree[subtree.id][input.name] = input.value;
  } catch (ex) {
    alert('invalid parameter value: ' + ex.message);
    input.value = tree[subtree.id][input.name]
  }
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
  try {
    tree[input.parentNode.id].argFns[i] = makeValueFn(input.value);
    tree[input.parentNode.id].args[i] = input.value;
  } catch (ex) {
    alert('invalid argument value: ' + ex.message);
    input.value = tree[input.parentNode.id].args[i];
  }
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

// Recursively copy the subtree under the given node, keeping a map from old to
// new IDs in idmap. Any lists of children become lists of new IDs. Any labeled
// nodes (except the top node (idmap undefined)) turn into references to the
// originals instead of copies.
// buildLoadedTree should be called after all nodes are copied.
function copyNode(nodeData, idmap) {
  var isRoot = (idmap === undefined);
  if (isRoot) idmap = {};
  if (nodeData.subtree.id in idmap) { // already copied/referenced
    return tree[idmap[nodeData.subtree.id]];
  } else if ((!isRoot) &&
	     ('label' in nodeData) && nodeData.label != '') { // reference
    var json = {
      type: 'reference',
      label: nodeData.label,
      fields: {},
      params: {},
      children: []
    };
    var reference = nodeFromJSON(json);
    tree[reference.subtree.id] = reference;
    idmap[nodeData.subtree.id] = reference.subtree.id;
    return reference;
  } else { // copy
    var json = nodeToJSON(nodeData);
    if (isRoot && ('label' in json)) json.label = '';
    var copy = nodeFromJSON(json);
    if ('params' in copy) {
      for (var param in copy.params) {
	var paramData = copy.params[param];
	paramData.children = paramData.children.map(function(oldID) {
	  var childCopy = copyNode(tree[oldID], idmap);
	  return childCopy.subtree.id;
	});
      }
    }
    if ('children' in copy) {
      copy.children = copy.children.map(function(oldID) {
	var childCopy = copyNode(tree[oldID], idmap);
	return childCopy.subtree.id;
      });
    }
    tree[copy.subtree.id] = copy;
    idmap[nodeData.subtree.id] = copy.subtree.id;
    return copy;
  }
}

// replace the reference with a copy of the referent (using copyNode and
// buildLoadedTree)
function copyHere(referenceSubtree) {
  // get relevant variables
  var reference = tree[referenceSubtree.id];
  var referent = tree[reference.label];
  var referenceUL = referenceSubtree.parentNode;
  var referenceParent = tree[referenceUL.parentNode.id];
  var referenceIndex = referenceParent.children.indexOf(reference);
  // make the copy
  var copy = copyNode(referent);
  buildLoadedTree(copy);
  // replace the reference with the copy
  referenceUL.replaceChild(copy.subtree, referenceSubtree);
  referenceParent.children[referenceIndex] = copy;
  delete tree[referenceSubtree.id];
  // make node collapsible
  updateSubtree(copy.subtree, true);
}

var inputStream;
var inputSource;
var recorderNode;

function recordBuffer(button) {
  button.innerHTML = '■';
  button.className = 'stop';
  button.setAttribute('onclick', 'stopRecordingBuffer(this)');
  // TODO? push some of this into RecorderNode
  navigator.mediaDevices.getUserMedia({ audio: { channelCount: { exact: 2 } } }).
  then((stream) => {
    inputStream = stream;
    var sampleRate = inputStream.getTracks()[0].getSettings().sampleRate;
    if (!('number' == typeof sampleRate)) {
      sampleRate = ctx.sampleRate;
    }
    inputSource = ctx.createMediaStreamSource(stream);
    recorderNode = new RecorderNode(ctx, sampleRate);
    recorderNode.connectFrom(inputSource);
    recorderNode.connect(ctx.destination);
  });
}

function stopRecordingBuffer(button) {
  var audioBufferLI = button.parentNode;
  var canvas = audioBufferLI.querySelector('.waveform');
  var nodeData = tree[audioBufferLI.parentNode.parentNode.id];
  button.innerHTML = '●';
  button.className = 'record';
  button.setAttribute('onclick', 'recordBuffer(this)');
  inputStream.getTracks()[0].stop(); // stop recording audio
  inputStream = null;
  inputSource.disconnect();
  inputSource = null;
  recorderNode.disconnect();
  recorderNode.getBuffer().then((buffer) => {
    nodeData.fields.buffer.value = buffer;
    drawBuffer(canvas, buffer);
    recorderNode = null;
  }).catch((err) => {
    console.log('error getting recording buffer:');
    console.error(err);
  });
}

// show the first 10 seconds of the buffer as kind of a waveform on the canvas,
// with each column of pixels forming a histogram of the sample values it
// represents
function drawBuffer(canvas, buffer) {
  var gctx = canvas.getContext('2d');
  var w = canvas.width;
  var h = canvas.height;
  // clear canvas to black
  gctx.fillStyle = 'black';
  gctx.fillRect(0, 0, w, h);
  var numSamplesPerChannelColumn = Math.floor(buffer.sampleRate * 10 / w);
  var numSamplesPerColumn =
    buffer.numberOfChannels * numSamplesPerChannelColumn;
  var columnSamples = new Float32Array(numSamplesPerColumn);
  var columnHistogram = new Uint32Array(h);
  var columnImageData = gctx.createImageData(1, h);
  var columnPixels = columnImageData.data;
  // set 100% opacity for all pixels
  for (var y = 0; y < h; y++) { columnPixels[4*y+3] = 255; }
  var waveformWidth =
    Math.min(w, Math.floor(buffer.length / numSamplesPerChannelColumn));
  // find the range of sample values for the whole buffer
  var minSample = 1;
  var maxSample = -1;
  for (var x = 0; x < waveformWidth; x++) {
    var startInChannel = numSamplesPerChannelColumn * x;
    // get all samples from all channels for this column into columnSamples
    for (var c = 0; c < buffer.numberOfChannels; c++) {
      var start = numSamplesPerChannelColumn * c;
      var end = start + numSamplesPerChannelColumn;
      var channelSamples = columnSamples.subarray(start, end);
      buffer.copyFromChannel(channelSamples, c, startInChannel);
    }
    for (var s = 0; s < numSamplesPerColumn; s++) {
      if (minSample > columnSamples[s]) { minSample = columnSamples[s]; }
      if (maxSample < columnSamples[s]) { maxSample = columnSamples[s]; }
    }
  }
  var sampleRange = maxSample - minSample;
  for (var x = 0; x < waveformWidth; x++) {
    var startInChannel = numSamplesPerChannelColumn * x;
    // get all samples from all channels for this column into columnSamples
    for (var c = 0; c < buffer.numberOfChannels; c++) {
      var start = numSamplesPerChannelColumn * c;
      var end = start + numSamplesPerChannelColumn;
      var channelSamples = columnSamples.subarray(start, end);
      buffer.copyFromChannel(channelSamples, c, startInChannel);
    }
    // make a histogram of sample values with one bin per pixel, using the
    // sample value range we found earlier
    columnHistogram.fill(0);
    for (var s = 0; s < numSamplesPerColumn; s++) {
      var bin =
	Math.floor((columnSamples[s] - minSample) * h / sampleRange);
      columnHistogram[bin]++;
    }
    // find the maximum count for any histogram bin in this column
    var maxThisColumn = 0;
    for (var y = 0; y < h; y++) {
      if (columnHistogram[y] > maxThisColumn) {
	maxThisColumn = columnHistogram[y];
      }
    }
    // turn the histogram bins into green pixels of corresponding intensity
    for (var y = 0; y < h; y++) {
      columnPixels[4*y+1] = columnHistogram[y] * 255 / maxThisColumn;
      // mark the full range of the wave in less intense blue
      columnPixels[4*y+2] = ((columnHistogram[y] > 0) ? 64 : 0);
    }
    // put the pixels on the canvas
    gctx.putImageData(columnImageData, x, 0);
  }
}

function loadBuffer(audioBufferLI, arrayBuffer, fieldData) {
  var canvas = audioBufferLI.querySelector('.waveform');
  if (fieldData === undefined) {
				  // ul.children li ABSN    id
    var nodeData = tree[audioBufferLI.parentNode.parentNode.id];
    fieldData = nodeData.fields.buffer;
  }
  return ctx.decodeAudioData(arrayBuffer).
    then(function(buffer) {
      fieldData.value = buffer;
      drawBuffer(canvas, buffer);
    });
}

function loadBufferFromFile(input) {
		   // input label      li buffer
  var audioBufferLI = input.parentNode.parentNode;
  var file = input.files[0];
  var reader = new FileReader();
  reader.onload = function(evt) {
    loadBuffer(audioBufferLI, evt.target.result).
    catch(function(err) {
      console.error('failed to decode audio data:');
      console.error(err);
      console.error(err.stack);
    });
  };
  reader.readAsArrayBuffer(file);
}

function loadBufferFromURL(button) {
  var input = button.previousElementSibling;
  var audioBufferLI = button.parentNode;
  fetch(input.value).then(function(response) {
    return response.arrayBuffer().
      then(function(arrayBuffer) {
	loadBuffer(audioBufferLI, arrayBuffer)
      });
  }).catch(function(err) {
    console.error(err);
    alert('error fetching file:' + err);
  });
}

// encode AudioBuffer data as a wav file in a Uint8Array
// see http://www-mmsp.ece.mcgill.ca/Documents/AudioFormats/WAVE/WAVE.html
function encodeWav(audioBuffer) {
  var numDataBytes = 2 * audioBuffer.numberOfChannels * audioBuffer.length;
  var wavHeader = "RIFF    WAVEfmt                     data    ";
  var wavBytes =
    new Uint8Array(wavHeader.length + numDataBytes);
  for (var i in wavHeader) { wavBytes[i] = wavHeader.charCodeAt(i); }
  var wavView = new DataView(wavBytes.buffer);
  wavView.setUint32(4, 36 + numDataBytes, true); // length of rest of file
  wavView.setUint32(16, 16, true); // length of rest of "fmt " chunk
  wavView.setUint16(20, 1, true); // PCM
  wavView.setUint16(22, audioBuffer.numberOfChannels, true);
  wavView.setUint32(24, audioBuffer.sampleRate, true);
  wavView.setUint32(28,
      2 * audioBuffer.sampleRate * audioBuffer.numberOfChannels, // bytes/sec
      true);
  wavView.setUint16(32,
      2 * audioBuffer.numberOfChannels, // bytes/sample (all channels)
      true);
  wavView.setUint16(34, 16, true); // bits/sample (one channel)
  wavView.setUint32(40, numDataBytes, true);
  // copy data a sample at a time
  // FIXME? it would probably be more efficient to do this in chunks, but
  // whatever
  var i = 44;
  var sample = new Float32Array(1);
  for (var s = 0; s < audioBuffer.length; s++) {
    for (var c = 0; c < audioBuffer.numberOfChannels; c++) {
      audioBuffer.copyFromChannel(sample, c, s);
      wavView.setInt16(i, Math.round(sample[0] * 32767), true);
      i += 2;
    }
  }
  return wavBytes;
}

function saveBlob(blob, filename) {
  var blobURL = URL.createObjectURL(blob);
  var link = document.getElementById('file-output');
  link.href = blobURL;
  link.download = filename;
  link.innerHTML = filename;
  link.click();
}

function saveBuffer(button) {
  var audioBufferLI = button.parentNode;
  var bufferSourceLI = audioBufferLI.parentNode.parentNode;
  var nodeData = tree[bufferSourceLI.id];
  var filename =
    ((nodeData.label == '') ? bufferSourceLI.id : nodeData.label) + '.wav';
  var audioBuffer = nodeData.fields.buffer.value;
  var wavBytes = encodeWav(audioBuffer);
  var wavBlob = new Blob([wavBytes], { type: 'audio/wav' });
  saveBlob(wavBlob, filename);
}

/*
 * Save/Load
 */

function nodeToJSON(nodeData) {
  var json = { type: nodeData.type };
  if ('label' in nodeData) json.label = nodeData.label;
  if ('fields' in nodeData) { // and params
    json.fields = {};
    for (var field in nodeData.fields) {
      var fieldData = nodeData.fields[field];
      switch (fieldData.type) {
	case 'AudioBuffer':
	  var wavBytes = encodeWav(fieldData.value);
	  json.fields[field] = base64js.fromByteArray(wavBytes);
	  break;
	default:
	  json.fields[field] = fieldData.value;
      }
    }
    json.params = {};
    for (var param in nodeData.params) {
      json.params[param] = {
	value: nodeData.params[param].value,
	automation: nodeData.params[param].automation.map(function(autoData) {
	  return {
	    fn: autoData.fn,
	    args: autoData.args
	  };
	}),
	children: nodeData.params[param].children.map(function(childData) {
	  return childData.subtree.id;
	})
      };
    }
  }
  if ('children' in nodeData) {
    json.children = nodeData.children.map(function(childData) {
      return childData.subtree.id;
    });
  }
  if ('value' in nodeData) { // conditional
    json.value = nodeData.value;
  }
  return json;
}

function nodeFromJSON(json) {
  // make full nodeData, including subtree with fields and params, except don't add subtree to its parent yet, and keep children as just ID strings
  var nodeData =
    (json.type == 'AudioDestinationNode' ?
      tree.destination : makeChild(json.type));
  if ('label' in json) {
    nodeData.label = json.label;
    nodeData.subtree.getElementsByClassName('label')[0].value = json.label;
  }
  if ('fields' in json) { // and params
    for (var field in json.fields) {
      if (!(field in nodeData.fields)) {
	console.warn('missing ' + json.type + '#' + field + ' field; skipping');
	continue;
      }
      var fieldData = nodeData.fields[field];
      try {
	var val = json.fields[field];
	switch (fieldData.type) {
	  // TODO validate boolean, enum fields?
	  case 'boolean':
	    fieldData.subtree.getElementsByTagName('input')[0].checked = val;
	    break;
	  case 'enum':
	    fieldData.subtree.getElementsByTagName('select')[0].value = val;
	    break;
	  case 'number':
	    fieldData.valueFn = makeValueFn(val);
	    fieldData.subtree.getElementsByTagName('input')[0].value = val;
	    break;
	  case 'Float32Array':
	    fieldData.valueFn = makeValueFn(val, 'array');
	    fieldData.subtree.getElementsByTagName('input')[0].value = val;
	    break;
	  case 'PeriodicWave':
	    if (val !== null) {
	      fieldData.valueFn = makeValueFn(val, 'PeriodicWave');
	      var buttonRow =
		fieldData.subtree.
		getElementsByClassName('PeriodicWave-buttons')[0].
		parentNode;
	      var table = buttonRow.parentNode;
	      var rowTemplate =
		document.getElementById('PeriodicWave-row-template');
	      for (var i = 0; i < val.length; i += 2) {
		var newRow = cloneNoID(rowTemplate);
		newRow.children[0].innerHTML = i/2;
		table.insertBefore(newRow, buttonRow);
		var inputs = newRow.getElementsByTagName('input');
		inputs[0].value = val[i];
		inputs[1].value = val[i+1];
	      }
	      var select =
		nodeData.subtree.querySelector("select[name='type']");
	      select.disabled = true;
	    }
	    break;
	  case 'AudioBuffer':
	    var arrayBuffer = Uint8Array.from(base64js.toByteArray(val)).buffer;
	    loadBuffer(fieldData.subtree, arrayBuffer, fieldData);
	    val = fieldData.value;
	    break;
	}
	fieldData.value = val;
      } catch (ex) {
	console.warn('invalid field value ' + JSON.stringify(val) + ', using default:')
	console.warn(ex);
      }
    }
    for (var param in json.params) {
      if (!(param in nodeData.params)) {
	console.warn('missing ' + json.type + '#' + param + ' param; skipping');
	continue;
      }
      var paramData = nodeData.params[param];
      var val = json.params[param].value;
      try {
	paramData.valueFn = makeValueFn(val);
	paramData.value = val;
	paramData.subtree.getElementsByClassName('value')[0].value = val;
      } catch (ex) {
	console.warn('invalid parameter value ' + JSON.stringify(val) + ', using default');
	console.warn(ex);
      }
      json.params[param].automation.forEach(function(a) {
	addAutomation({ value: a.fn, parentNode: paramData.subtree });
	var autoData = paramData.automation[paramData.automation.length - 1];
	var argInputs = autoData.subtree.getElementsByClassName('value');
	if (argInputs.length != a.args.length) {
	  console.warn('wrong number of arguments for automation ' + a.fn + '; expected ' + argInputs.length + ', but got ' + a.args.length);
	}
	for (var i = 0; i < argInputs.length && i < a.args.length; i++) {
	  var val = a.args[i];
	  try {
	    autoData.argFns[i] = makeValueFn(val);
	    autoData.args[i] = val;
	    argInputs[i].value = val;
	  } catch (ex) {
	    console.warn('invalid argument value ' + JSON.stringify(val) + ':');
	    console.warn(ex);
	  }
	}
      });
      // for now; buildLoadedTree will finish
      nodeData.params[param].children = json.params[param].children;
    }
  }
  if ('children' in json) {
    nodeData.children = json.children; // for now; buildLoadedTree will finish
  }
  if ('value' in json) { // conditional
    var val = json.value;
    try {
      nodeData.valueFn = makeValueFn(val, 'condition');
      nodeData.value = val;
    } catch (ex) {
      console.warn('invalid condition ' + JSON.stringify(val) + ':');
      console.warn(ex);
    }
  }
  return nodeData;
}

function buildLoadedTree(nodeData) {
  // recurse on params
  for (var param in nodeData.params) {
    buildLoadedTree(nodeData.params[param]);
  }
  // replace child IDs with actual child tree data
  nodeData.children = nodeData.children.map(function(id) { return tree[id]; });
  // add child subtrees to this subtree's children, and recurse
  var ul = nodeData.subtree.querySelector('.children');
  nodeData.children.forEach(function(childData) {
    ul.appendChild(childData.subtree);
    buildLoadedTree(childData);
  });
}

function saveTree() {
  var json = {};
  for (var label in tree) {
    // skip AudioParams, automation, and extra labels
    if ((!('type' in tree[label])) || tree[label].type == 'AudioParam' ||
        (tree[label].label == label && label != 'destination'))
      continue;
    json[label] = nodeToJSON(tree[label]);
  }
  var jsonStr = JSON.stringify(json, null, 2);
  var blob = new Blob([jsonStr], { type: 'application/json' });
  saveBlob(blob, 'untitled.json'); // TODO use loaded filename if possible
}

function loadTree(jsonStr) {
  try {
    var json = JSON.parse(jsonStr);
    // clear tree (except destination)
    tree = {
      destination: {
	type: 'AudioDestinationNode',
	label: 'destination',
	fields: {},
	params: {},
	children: [],
	subtree: document.getElementById('destination')
      }
    }
    document.querySelector('#destination > .children').innerHTML = '';
    // make sure new IDs don't interfere with loaded ones
    // FIXME ID inflation
    nextID = 0;
    for (var id in json) {
      if (/^wat-node-\d+$/.test(id)) {
	var idNum = parseInt(id.substring(9));
	if (nextID <= idNum)
	  nextID = idNum + 1;
      }
    }
    // fill tree nodes from JSON
    for (var id in json) {
      tree[id] = nodeFromJSON(json[id]);
      tree[id].subtree.id = id; // use the ID from JSON instead of the new one
      // add extra label
      if (('label' in tree[id]) && tree[id].label != '')
	tree[tree[id].label] = tree[id];
    }
    // build up structure of tree
    buildLoadedTree(tree.destination);
    // make nodes collapsible
    updateSubtree(tree.destination.subtree, true);
  } catch (ex) {
    console.error(ex);
    alert('error loading file: ' + ex.message);
  }
}

function loadTreeFromFile(input) {
  var file = input.files[0];
  var reader = new FileReader();
  reader.onload = function(evt) {
    loadTree(reader.result);
  };
  reader.readAsText(file);
}

function loadTreeFromURL(button) {
  var input = button.previousElementSibling;
  fetch(input.value).then(function(response) {
    return response.text().then(loadTree);
  }).catch(function(err) {
    console.error(err);
    alert('error fetching file:' + err);
  });
}

/*
 * Playing note
 */

function PlayingNote(noteNum, velocity, onset) {
  if (velocity === undefined) {
    velocity = 1;
  }
  if (onset === undefined) {
    onset = ctx.currentTime;
  }
  // TODO make octave changeable
  var fractionOfA440 = Math.pow(2.0, (noteNum - 69) / 12) * 2;
  var frequency = fractionOfA440 * 440;
  // NOTE: no release (r) var yet
  this.vars = { n: noteNum, f: frequency, v: velocity, o: onset };
  this.audioNodes = {}; // by label
  this.scheduledNodes = []; // [audioNode, nodeData] pairs
  this.referenceTasks = []; // functions to be called to connect references
  this.releaseTasks = []; // functions to be called when we know release time
  this.topNodes =
    tree.destination.children.map(this.instantiateNode.bind(this));
  this.topNodes.forEach(function(n) {
    n.connect(ctx.destination);
  });
  this.referenceTasks.forEach(function(fn) { fn(); });
  this.isEnded = false;
  this.start();
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
    } else if (['if', 'elif', 'else'].includes(nodeData.type)) { // conditional
      // make a GainNode to represent this conditional node
      var audioNode = ctx.createGain();
      audioNode.gain.value = 1; // just in case the spec changes
      // find out whether we should instantiate the children
      var val = false;
      switch (nodeData.type) {
	case 'if':
	  val = window.isPrevCondTrue = nodeData.valueFn(this.vars);
	  break;
	case 'elif':
	  if (!window.isPrevCondTrue)
	    val = window.isPrevCondTrue = nodeData.valueFn(this.vars);
	  break;
	case 'else':
	  val = !window.isPrevCondTrue;
	  break;
      }
      // instantiate the children
      if (val) {
	// save isPrevCondTrue
	var oldIsPrevCondTrue = window.isPrevCondTrue;
	window.isPrevCondTrue = false; // no previous conds among children
	nodeData.children.forEach(function(c) {
	  this.instantiateNode(c).connect(audioNode);
	}, this);
	// restore old isPrevCondTrue
	window.isPrevCondTrue = oldIsPrevCondTrue;
      }
      return audioNode;
    } else { // ordinary AudioNode
      var typeData = nodeTypes[nodeData.type]
      var audioNode = ctx[typeData.create]();
      if (nodeData.label != '') {
	this.audioNodes[nodeData.label] = audioNode;
      }
      if (typeData.isScheduled) {
	this.scheduledNodes.push([audioNode, nodeData]);
      }
      if (nodeData.type == 'AnalyserNode') {
	var grandkids = nodeData.subtree.getElementsByClassName('children')[0];
	var freqCanvas =
	  grandkids.children[0].getElementsByTagName('canvas')[0];
	var timeCanvas =
	  grandkids.children[1].getElementsByTagName('canvas')[0];
	requestAnimationFrame(this.drawAnalysis.bind(this, freqCanvas, timeCanvas, audioNode));
      }
      // save isPrevCondTrue (so nested conditions don't leak out)
      var oldIsPrevCondTrue = window.isPrevCondTrue;
      for (var fieldName in nodeData.fields) {
	// don't set schedule here, and don't set type when a PeriodicWave has
	// already been set (spec says that's an error)
	if (!(/^st(art|op)When$/.test(fieldName) ||
	      (fieldName == 'type' && ('PeriodicWave' in nodeData.fields) &&
	       nodeData.fields.PeriodicWave.value))) {
	  this.instantiateField(audioNode, fieldName, nodeData);
	}
      }
      for (var paramName in nodeData.params) {
	this.instantiateParam(audioNode, paramName, nodeData);
      }
      window.isPrevCondTrue = false; // no previous conds among children
      nodeData.children.forEach(function(c) {
	this.instantiateNode(c).connect(audioNode);
      }, this);
      // restore old isPrevCondTrue
      window.isPrevCondTrue = oldIsPrevCondTrue;
      return audioNode;
    }
  },

  function instantiateField(audioNode, fieldName, nodeData) {
    var field = nodeData.fields[fieldName];
    if (field.value != '') {
      window.isPrevCondTrue = false;
      var val = field.valueFn(this.vars);
      if ('set' in field) {
	if (val !== null) {
	  audioNode[field.set](val);
	}
      } else {
	audioNode[fieldName] = val;
      }
    }
  },

  function instantiateParam(audioNode, paramName, nodeData) {
    var paramData = nodeData.params[paramName];
    var audioParam = audioNode[paramName];
    if (paramData.value != '') {
      window.isPrevCondTrue = false;
      audioParam.value = paramData.valueFn(this.vars);
    }
    paramData.automation.forEach(function(a) {
      // push anything that needs r onto releaseTasks; schedule everything else
      // immediately
      // TODO? only schedule events that happen at onset immediately; do later events in setTimeout(fn,0) to avoid delaying calls to .start() (not sure how much this matters; probably happens internal to these automation methods anyway)
      if (a.args.some(function(arg) { return /\br\b/.test(arg); })) {
	var that = this;
	this.releaseTasks.push(function() {
	  that.instantiateAutomation(audioParam, a);
	});
      } else {
	this.instantiateAutomation(audioParam, a);
      }
    }, this);
    window.isPrevCondTrue = false;
    paramData.children.forEach(function(c) {
      this.instantiateNode(c).connect(audioParam);
    }, this);
  },

  function instantiateAutomation(audioParam, autoData) {
    audioParam[autoData.fn].apply(audioParam,
      autoData.argFns.map(function(fn) {
	window.isPrevCondTrue = false;
	return fn(this.vars);
      }, this)
    );
  },

  function start() {
    var that = this;
    this.scheduledNodes.forEach(function(pair) {
      var [audioNode, nodeData] = pair;
      // remove this pair from the list when the audioNode ends
      audioNode.onended = function() {
	var i = that.scheduledNodes.indexOf(pair);
	if (i >= 0) {
	  that.scheduledNodes.splice(i, 1);
	}
	// if we just removed the last scheduled node, end the whole note
	if (that.scheduledNodes.length == 0) {
	  that.end();
	}
      };
      // start the audioNode according to startWhen "field"
      if (/\br\b/.test(nodeData.fields.startWhen.value)) {
	that.releaseTasks.push(function() {
	  that.instantiateField(audioNode, 'startWhen', nodeData);
	});
      } else {
	that.instantiateField(audioNode, 'startWhen', nodeData);
      }
      // stop it according to stopWhen
      if (/\br\b/.test(nodeData.fields.stopWhen.value)) {
	that.releaseTasks.push(function() {
	  that.instantiateField(audioNode, 'stopWhen', nodeData);
	});
      } else {
	that.instantiateField(audioNode, 'stopWhen', nodeData);
      }
    });
  },

  function release(releaseTime) {
    this.vars.r = releaseTime;
    this.releaseTasks.forEach(function(fn) { fn(); });
  },

  function end() {
    this.isEnded = true;
    // try to stop any stragglers
    this.scheduledNodes.forEach(function([n, d]) {
      try {
	n.stop();
      } catch (err) {
	console.error('failed to stop scheduled node:');
	console.error(n);
	console.error(err);
      }
    });
    // disconnect everything from the top
    this.topNodes.forEach(function(n) { n.disconnect(); });
    // call onended() if we have it
    if ('function' == typeof this.onended) {
      this.onended();
    }
  },

  function drawFreqAnalysis(canvas, data) {
    var gctx = canvas.getContext('2d');
    var w = canvas.width;
    var h = canvas.height;
    // clear canvas to black
    gctx.fillStyle = 'black';
    gctx.fillRect(0, 0, w, h);
    var binsPerCol = Math.max(1, Math.floor(data.length / w));
    gctx.fillStyle = 'lime';
    for (var x = 0, i = 0; x < w && i < data.length; x++, i += binsPerCol) {
      var sum = 0;
      for (var j = 0; j < binsPerCol; j++) {
	sum += data[i+j];
      }
      var y = Math.floor(sum / binsPerCol);
      gctx.fillRect(x, h - y, 1, y);
    }
  },

  function drawTimeAnalysis(canvas, data) {
    var gctx = canvas.getContext('2d');
    var w = canvas.width;
    var h = canvas.height;
    // clear canvas to black
    gctx.fillStyle = 'black';
    gctx.fillRect(0, 0, w, h);
    // trigger on positive 0-crossing (128-crossing?)
    var pzc;
    var prev = data[0];
    for (pzc = 1; pzc < data.length; pzc++) {
      if (prev < 128 && data[pzc] >= 128)
	break;
      prev = data[pzc];
    }
    // snap back to 0 if there is no such crossing
    if (pzc == data.length)
      pzc = 0;
    gctx.fillStyle = 'lime';
    for (var x = 0, i = pzc; x < w && i < data.length; x++, i++) {
      var y = data[i];
      var y1 = Math.floor((data[i > 0 ? i-1 : i] + y) / 2);
      var y2 = Math.floor((data[i < data.length - 1 ? i+1 : i] + y) / 2);
      if (y2 < y1) {
	var tmp = y1;
	y1 = y2;
	y2 = tmp;
      }
      gctx.fillRect(x, h - 1 - y2, 1, y2 - y1 + 1);
    }
  },

  function drawAnalysis(freqCanvas, timeCanvas, analyserNode) {
    var freqData = new Uint8Array(analyserNode.frequencyBinCount);
    analyserNode.getByteFrequencyData(freqData);
    this.drawFreqAnalysis(freqCanvas, freqData);
    var timeData = new Uint8Array(analyserNode.fftSize);
    analyserNode.getByteTimeDomainData(timeData);
    this.drawTimeAnalysis(timeCanvas, timeData);
    if (!this.isEnded) {
      requestAnimationFrame(this.drawAnalysis.bind(this, freqCanvas, timeCanvas, analyserNode));
    }
  }

].forEach(function(fn) { PlayingNote.prototype[fn.name] = fn; });

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
	  kc2osc[code] = new PlayingNote(noteNum);
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
    mouseOscillator = new PlayingNote(noteNum);
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
	mouseOscillator = new PlayingNote(noteNum);
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
