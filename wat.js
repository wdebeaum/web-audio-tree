'use strict';

/*
 * Initialization
 */

// no webkit prefix plz
for (const k of Object.getOwnPropertyNames(window)) {
  if (/^webkit/.test(k)) {
    const noPrefix = k.substring(6);
    const noPrefixLower =
      noPrefix.substring(0,1).toLowerCase() + noPrefix.substring(1);
    if (!(noPrefix in window) && !(noPrefixLower in window)) {
      window[noPrefix] = window[k];
      window[noPrefixLower] = window[k];
    }
  }
}

initTrees();

const nodeTypes = {
  AudioDestinationNode: {
    create: null,
    numberOfInputs: 1,
    numberOfOutputs: 0
  }
};

let ctx;

let tree = { // map IDs to data structures
  destination: {
    type: 'AudioDestinationNode',
    label: 'destination',
    fields: {},
    params: {},
    children: [],
    subtree: document.getElementById('destination')
  }
};
let nextID = 0;
function getNextID() {
  return `wat-node-${nextID++}`;
}

// clone the given template node, but give it a new id attribute
function cloneNewID(templateNode) {
  const clone = templateNode.cloneNode(true);
  clone.setAttribute('id', getNextID());
  return clone;
}

// clone the given template node, but remove its id attribute
function cloneNoID(templateNode) {
  const clone = templateNode.cloneNode(true);
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
  if (!('BaseAudioContext' in window))
    window.BaseAudioContext = window.AudioContext;
  // fake AudioScheduledSourceNode if it's missing
  if (!('AudioScheduledSourceNode' in window)) {
    window.AudioScheduledSourceNode = function() {};
    window.AudioScheduledSourceNode.prototype = { isFake: true };
    for (const k of 'onended start stop connect disconnect context numberOfInputs numberOfOutputs channelCount channelCountMode channelInterpretation playbackState UNSCHEDULED_STATE SCHEDULED_STATE PLAYING_STATE FINISHED_STATE'.split(/ /))
      window.AudioScheduledSourceNode.prototype[k] = null;
  }

  ctx = new AudioContext({ latencyHint: 'interactive' });

  // fill nodeTypes by inspecting BaseAudioContext and example nodes created
  // using ctx
  for (const k in BaseAudioContext.prototype) {
    if (k == 'createScriptProcessor') continue; // deprecated
    if (/^create/.test(k)) {
      const v = BaseAudioContext.prototype[k];
      if (('function' == typeof v) && v.length == 0) {
	// found a method of BaseAudioContext taking no arguments, whose name
	// starts with 'create'. guess it will create a type of node!
	let typeName = `${k.replace(/^create/,'')}Node`;
	// if not, try prepending 'Audio'
	if (!Object.prototype.isPrototypeOf.call(AudioNode, window[typeName]))
	  typeName = `Audio${typeName}`;
	// if we have the name of an AudioNode subtype
	if (Object.prototype.isPrototypeOf.call(AudioNode, window[typeName])) {
	  // try making an example instance
	  const example = ctx[k]();
	  // if it's not an instance, skip it
	  if (!(example instanceof window[typeName]))
	    continue;
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
	  for (const param in example) {
	    if (param in AudioScheduledSourceNode.prototype) {
	      // skip generic fields/methods
	    } else if (example[param] instanceof AudioParam) {
	      let automationRate = example[param].automationRate;
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
		const paramTypeName = param.substring(3);
		const paramCreate = `create${paramTypeName}`;
		if (example[param].length == 1 &&
		    ('function' == typeof window[paramTypeName]) &&
		    (paramCreate in BaseAudioContext.prototype) &&
		    ('function' ==
		       typeof BaseAudioContext.prototype[paramCreate])) {
		  const numArgs=BaseAudioContext.prototype[paramCreate].length;
		  const args = new Array(numArgs).fill('?').join(', ');
		  console.log(`${typeName}#${param}(${paramCreate}(${args}))`);
		  nodeTypes[typeName].fields[paramTypeName] = {
		    type: paramTypeName,
		    defaultValue: null,
		    create: paramCreate,
		    set: param
		  };
		} else {
		  const numArgs = example[param].length;
		  const args = new Array(numArgs).fill('?').join(', ');
		  console.log(`${typeName}#${param}(${args})`);
		  // meh
		}
	      } // else ignore non-setter functions
	    } else {
	      let paramType = typeof example[param];
	      if (paramType == 'object') {
		if (example[param] !== null)
		  paramType = example[param].constructor.name;
		else if (param == 'buffer')
		  paramType = 'AudioBuffer';
		else if (param == 'curve')
		  paramType = 'Float32Array';
	      } else if (paramType == 'string') {
		paramType = 'enum';
	      }
	      // these two are read-only
	      if ((typeName == 'AnalyserNode' &&
		   param == 'frequencyBinCount') ||
		  (typeName == 'DynamicsCompressorNode' &&
		   param == 'reduction'))
		continue;
	      let values;
	      if (paramType == 'enum') {
		switch (`${typeName}#${param}`) {
		  case 'BiquadFilterNode#type':
		    values = 'lowpass highpass bandpass lowshelf highshelf peaking notch allpass'.split(' ');
		    break;
		  case 'OscillatorNode#type':
		    values = 'sine square sawtooth triangle custom'.split(' ');
		    break;
		  case 'AudioPannerNode#panningModel':
		  case 'PannerNode#panningModel':
		    values = 'equalpower HRTF'.split(' ');
		    break;
		  case 'AudioPannerNode#distanceModel':
		  case 'PannerNode#distanceModel':
		    values = 'linear inverse exponential'.split(' ');
		    break;
		  case 'WaveShaperNode#oversample':
		    values = 'none 2x 4x'.split(' ');
		    break;
		  default:
		    console.error(`unknown enum: ${typeName}#${param}`);
		    continue;
		}
	      }
	      console.log(`${typeName}#${param} : ${JSON.stringify(paramType)}`);
	      nodeTypes[typeName].fields[param] = {
		type: paramType,
		defaultValue: example[param]
	      };
	      if (paramType == 'enum')
		nodeTypes[typeName].fields[param].values = values;
	    }
	  }
	}
      }
    }
  }

  // fill the add-child template from sorted nodeTypes (but only certain types)
  const addChildTemplate =
    document.querySelector('#audio-node-template > .add-child');
  for (const name of Object.keys(nodeTypes).sort()) {
    const desc = nodeTypes[name];
    // if the node has exactly one output, it can be a child node
    // if it has more than one input, we can't really use it
    if (desc.numberOfOutputs == 1 && desc.numberOfInputs <= 1) {
      const opt = document.createElement('option');
      opt.innerHTML = name;
      addChildTemplate.appendChild(opt);
    }
  }

  // add a clone of the add-child template to the destination li, as well as a
  // place for the children to be created
  const dest = document.getElementById('destination');
  dest.appendChild(cloneNoID(addChildTemplate));
  dest.appendChild(document.getElementById('save-load-controls'));
  let ul = document.createElement('ul');
  ul.className = 'children';
  dest.appendChild(ul);
  dest.classList.replace('leaf', 'expanded');

  // also add them to the audio param template
  const apt = document.getElementById('audio-param-template');
  apt.appendChild(cloneNoID(addChildTemplate));
  ul = document.createElement('ul');
  ul.className = 'children';
  apt.appendChild(ul);
  apt.classList.replace('leaf', 'expanded');

  if ('RecorderNode' in window) {
    RecorderNode.addModule(ctx).
    then(() => { console.log('added RecorderNode to ctx'); }).
    catch(err => {
      console.log(err.message);
      console.log(err.stack);
      console.log(JSON.stringify(err));
    });
  } else {
    console.log('no RecorderNode');
  }

  document.getElementById('web-audio-status').classList.replace('unknown', 'supported');
}

// is the midi sustain pedal pressed down?
let midiSustainOn = false;
// which keys (note number strings) on the midi keyboard are currently held
// down? (those that continue playing because the sustain pedal is down don't
// count)
const midiNotesHeld = new Set();
// map midi note number string to PlayingNote instance
const midiNote2osc = {};

function handleMIDIMessage(evt) {
  try {
    //console.log(evt.data);
    if (evt.data.length == 3) {
      const cmd = evt.data[0] >> 4;
      const noteNum = evt.data[1];
      const velocity = evt.data[2] / 127; // divide so velocity is in [0,1]
      if (cmd == 8 || // note off
	  (cmd == 9 && velocity == 0)) { // note on with vel 0 (i.e. off)
	//console.log({ note: 'off', num: noteNum });
	midiNotesHeld.delete(''+noteNum);
	if (midiNote2osc[noteNum] && !midiSustainOn)
	  midiNote2osc[noteNum].release(ctx.currentTime);
      } else if (cmd == 9) { // note on
	//console.log({ note: 'on', num: noteNum, vel: velocity });
	midiNotesHeld.add(''+noteNum);
	if (midiNote2osc[noteNum])
	  midiNote2osc[noteNum].end();
	midiNote2osc[noteNum] = new PlayingNote(noteNum, velocity);
      } else if (cmd == 0xb && noteNum == 0x40) { // sustain pedal
        //console.log({ sustain: velocity });
        if (velocity) { // on
	  midiSustainOn = true;
	} else { // off
	  midiSustainOn = false;
	  for (const noteNum in midiNote2osc)
	    if (!midiNotesHeld.has(noteNum))
	      midiNote2osc[noteNum].release(ctx.currentTime);
	}
      }
    }
  } catch (e) {
    console.error(e);
  }
}

let midiInputs = undefined;
let selectedMIDIInput = undefined;

/* exported changeMIDIInput */
function changeMIDIInput(evt) {
  if (selectedMIDIInput)
    selectedMIDIInput.removeEventListener('midimessage', handleMIDIMessage);
  selectedMIDIInput = midiInputs.get(evt.target.value);
  if (selectedMIDIInput)
    selectedMIDIInput.addEventListener('midimessage', handleMIDIMessage);
}

function initWebMIDI() {
  if ('function' != typeof navigator.requestMIDIAccess) {
    console.log('Web MIDI API not supported in this browser.');
    document.getElementById('web-midi-status').classList.replace('unknown', 'unsupported');
    return;
  }
  navigator.requestMIDIAccess({ sysex: false, software: false }).
  then(midiAccess => {
    // get the MIDI input ports and use them to populate the select
    const midiInputSelect = document.getElementById('midi-input');
    let firstInput = undefined;
    let firstNonThroughInput = undefined;
    midiInputs = midiAccess.inputs;
    for (const [key, inputPort] of midiInputs) {
      const option = document.createElement('option');
      option.value = key;
      option.innerText = inputPort.name;
      midiInputSelect.appendChild(option);
      if (!firstInput)
	firstInput = inputPort;
      if (!firstNonThroughInput && !/through/i.test(inputPort.name))
	firstNonThroughInput = inputPort;
    }
    // try to pick the first suitable input port
    selectedMIDIInput = firstNonThroughInput || firstInput;
    if (!selectedMIDIInput) {
      console.log('no MIDI input ports found.');
      return;
    }
    midiInputSelect.value = selectedMIDIInput.id;
    selectedMIDIInput.addEventListener('midimessage', handleMIDIMessage);
    document.getElementById('midi-controls').style.display = '';
    document.getElementById('web-midi-status').classList.replace('unknown', 'supported');
  });
}

document.getElementById('start').addEventListener('click', evt => {
  evt.currentTarget.remove();
  initWebAudio();
  initWebMIDI();
  initTouchboard();
});

/*
 * Tree UI
 */

/* exported addChild */
function addChild(select) {
  const typeName = select.value;
  select.value = 'add child';
  const parentSubtree = select.parentNode;
  const children = parentSubtree.querySelector('.children');
  const data = makeChild(typeName);
  tree[data.subtree.id] = data;
  tree[parentSubtree.id].children.push(data);
  children.appendChild(data.subtree);
  updateSubtree(parentSubtree, true);
}

function makeChild(typeName) {
  let newChild;
  const data = {
    type: typeName,
    label: '',
    fields: {},
    params: {},
    children: []
  };
  if (['reference', 'microphone'].includes(typeName)) {
    newChild = cloneNewID(document.getElementById(`${typeName}-template`));
  } else if (['if','elif','else'].includes(typeName)) {
    newChild = cloneNewID(document.getElementById('audio-node-template'));
    newChild.firstChild.innerHTML = typeName;
    const input = newChild.getElementsByClassName('label')[0];
    if (typeName == 'else') {
      input.parentNode.removeChild(input);
    } else {
      data.value = 'false';
      data.valueFn = () => false;
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
    const grandkids = newChild.getElementsByClassName('children')[0];
    // AnalyserNode output data
    if (typeName == 'AnalyserNode') {
      const freqSubtree = cloneNoID(document.getElementById('AnalyserNode-data-template'));
      freqSubtree.firstChild.innerHTML = 'Uint8Array frequencyData';
      grandkids.appendChild(freqSubtree);
      const timeSubtree = cloneNoID(document.getElementById('AnalyserNode-data-template'));
      timeSubtree.firstChild.innerHTML = 'Uint8Array timeDomainData';
      grandkids.appendChild(timeSubtree);
    }
    // non-AudioParam fields
    const fields = nodeTypes[typeName].fields;
    // start()/end() calls for scheduled nodes (as fake fields)
    if (nodeTypes[typeName].isScheduled) {
      data.fields.startWhen = {
	type: 'number',
	value: 'o',
	valueFn: ({ o }) => o,
	set: 'start',
	subtree: cloneNoID(document.getElementById('start-template'))
      };
      grandkids.appendChild(data.fields.startWhen.subtree);
      // TODO? add offset arg for AudioBufferSourceNode
      data.fields.stopWhen = {
	type: 'number',
	value: 'r',
	valueFn: ({ r }) => r,
	set: 'stop',
	subtree: cloneNoID(document.getElementById('stop-template'))
      };
      grandkids.appendChild(data.fields.stopWhen.subtree);
    }
    const fieldNames = Object.keys(fields).sort();
    for (const name of fieldNames) {
      const type = fields[name].type;
      const fieldTemplate = document.getElementById(`${type}-field-template`);
      const field = cloneNewID(fieldTemplate);
      data.fields[name] = {
	type: type,
	value: nodeTypes[typeName].fields[name].defaultValue,
	valueFn: function() { return this.value; },
	subtree: field
      };
      if ('set' in nodeTypes[typeName].fields[name])
	data.fields[name].set = nodeTypes[typeName].fields[name].set;
      if (type != 'PeriodicWave')
	field.querySelector('span.node').innerHTML = `${type} ${name} = `;
      switch (type) {
	case 'boolean': {
	  const input = field.querySelector('input');
	  input.name = name;
	  if (fields[name].defaultValue)
	    input.setAttribute('checked', 'checked');
	  break;
	}
	case 'number': {
	  const input = field.querySelector('input');
	  input.name = name;
	  input.value = fields[name].defaultValue;
	  break;
	}
        case 'enum': {
	  const select = field.querySelector('select.enum');
	  select.name = name;
	  for (const v of fields[name].values) {
	    const option = document.createElement('option');
	    if (v == fields[name].defaultValue)
	      option.setAttribute('selected', 'selected');
	    if (typeName == 'OscillatorNode' &&
	        name == 'type' && v == 'custom')
	      // not allowed to directly set OscillatorNode#type='custom'; must
	      // setPeriodicWave instead
	      option.setAttribute('disabled', 'disabled');
	    option.innerHTML = v;
	    select.appendChild(option);
	  }
	  break;
	}
	case 'PeriodicWave':
	  field.querySelector('.PeriodicWave-row').remove();
	  break;
	case 'Float32Array': {
	  const input = field.querySelector('input');
	  input.name = name;
	  break;
	}
	case 'AudioBuffer':
	  // nothing?
	  break;
      }
      grandkids.appendChild(field);
    }
    // AudioParams
    const params = nodeTypes[typeName].params;
    const paramTemplate = document.getElementById('audio-param-template');
    // sort parameter names k-rate before a-rate, and then alphabetically
    const paramNames = Object.keys(params).sort((a,b) => {
      if (params[a].automationRate == 'k-rate' &&
	  params[b].automationRate == 'a-rate')
	return -1;
      else if (params[a].automationRate == 'a-rate' &&
	       params[b].automationRate == 'k-rate')
	return 1;
      else if (a < b)
	return -1;
      else if (a > b)
	return 1;
      else
	return 0;
    });
    for (const name of paramNames) {
      const param = cloneNewID(paramTemplate);
      const paramData = {
	type: 'AudioParam',
	value: params[name].defaultValue,
	valueFn: function() { return this.value; },
	automation: [],
	children: [],
	subtree: param
      };
      tree[param.id] = paramData;
      data.params[name] = paramData;
      param.firstChild.innerHTML = `AudioParam ${name} = `;
      param.classList.add(params[name].automationRate);
      param.getElementsByClassName('value')[0].value =
        params[name].defaultValue;
      grandkids.appendChild(param);
    }
  } else {
    console.error(`bogus add-child value ${typeName}`);
    return;
  }
  data.subtree = newChild;
  return data;
}

function getDescendantLabels(nodeData, labels) {
  if (!labels)
    labels = [];
  if (nodeData.type != 'reference' && nodeData.label != '')
    labels.push(nodeData.label);
  for (const name in nodeData.params)
    for (const child of nodeData.params[name].children)
      getDescendantLabels(child, labels);
  for (const child of nodeData.children)
    getDescendantLabels(child, labels);
  return labels;
}

function isDescendant(ancestorID, descendantID) {
  if (ancestorID == descendantID) {
    return true;
  } else if (descendantID == 'destination') { // root
    return false;
  } else {
    const parentID =
      document.getElementById(descendantID).parentNode.parentNode.id;
    return isDescendant(ancestorID, parentID);
  }
}

// move descendants of the given node out from under it if they are referenced
// elsewhere, in preparation for removing the node
function moveReferencedDescendants(nodeData) {
  const labels = getDescendantLabels(nodeData);
  console.log(`descendant labels: ${labels.join(', ')}`);
  for (const id in tree) {
    const refNodeData = tree[id];
    if (refNodeData.type == 'reference') {
      console.log(`reference ${id} has label ${refNodeData.label}`);
      const labelIndex = labels.indexOf(refNodeData.label);
      console.log(`labelIndex = ${labelIndex}`);
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
  if ('children' in nodeData)
    nodeData.children.forEach(deleteSubtree);
  if ('params' in nodeData)
    for (const name in nodeData.params)
      deleteSubtree(nodeData.params[name]);
  if ('automation' in nodeData)
    nodeData.automation.forEach(deleteSubtree);
  if ('subtree' in nodeData)
    delete tree[nodeData.subtree.id];
  if (nodeData.type != 'reference' &&
      nodeData.label != '')
    delete tree[nodeData.label];
}

/* exported deleteChild */
function deleteChild(childSubtree) {
  let removeFromList;
  if (childSubtree.matches('.audio-node'))
    removeFromList = 'children';
  else if (childSubtree.matches('.automation'))
    removeFromList = 'automation';
  if (childSubtree.id && (childSubtree.id in tree)) {
    const childData = tree[childSubtree.id];
    if (removeFromList == 'children') // automation can't have descendants
      moveReferencedDescendants(childData);
    deleteSubtree(childData);
    if (removeFromList) {
      const parentData = tree[childSubtree.parentNode.parentNode.id];
      const i = parentData[removeFromList].indexOf(childData);
      if (i >= 0)
	parentData[removeFromList].splice(i, 1);
    }
  }
  childSubtree.remove();
}

/* exported addAutomation */
function addAutomation(select) {
  const fnName = select.value;
  select.value = 'add automation';
  const children = select.parentNode.getElementsByClassName('children')[0];
  const newChild = cloneNewID(document.getElementById(`${fnName}-template`));
  children.appendChild(newChild);
  const numArgs = newChild.getElementsByTagName('input').length;
  const childData = {
    fn: fnName,
    args: new Array(numArgs),
    argFns: new Array(numArgs),
    subtree: newChild
  };
  tree[newChild.id] = childData;
  tree[select.parentNode.id].automation.push(childData);
}

/* exported moveAutomation */
function moveAutomation(button) {
  const li = button.parentNode;
  const dir = button.innerText;
  const data = tree[li.id];
  const parentData = tree[li.parentNode.parentNode.id];
  const i = parentData.automation.indexOf(data);
  if (dir == '↑') {
    const prev = li.previousElementSibling;
    if (prev)
      li.parentNode.insertBefore(li, prev);
    if (i > 0) {
      const tmp = parentData.automation[i];
      parentData.automation[i] = parentData.automation[i-1];
      parentData.automation[i-1] = tmp;
    }
  } else { // ↓
    const next = li.nextElementSibling;
    if (next) {
      const nextNext = next.nextElementSibling;
      li.parentNode.insertBefore(li, nextNext);
    }
    if (i >= 0 && i < parentData.automation.length - 1) {
      const tmp = parentData.automation[i];
      parentData.automation[i] = parentData.automation[i+1];
      parentData.automation[i+1] = tmp;
    }
  }
}

function updatePeriodicWave(table) {
  const subtree = table.parentNode.parentNode.parentNode.parentNode;
  const data = tree[subtree.id];
  const valueExprs = [];
  // NodeList, y u no have map?
  for (const input of table.querySelectorAll('input'))
    valueExprs.push(input.value);
  const select = subtree.querySelector("select[name='type']");
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
    data.fields.PeriodicWave.valueFn = function() { return this.value; };
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

/* exported changePeriodicWaveValue */
function changePeriodicWaveValue(input) {
  const table = input.parentNode.parentNode.parentNode;
  try {
    updatePeriodicWave(table);
  } catch (ex) {
    console.error(ex);
    alert(`invalid PeriodicWave value: ${ex.message}`);
    // set the input value back to what it was
    const subtree = table.parentNode.parentNode.parentNode.parentNode;
    const data = tree[subtree.id];
    const i = table.querySelectorAll('input').findIndex(inp => (inp === input));
    if (i >= 0)
      input.value = data.fields.PeriodicWave.value[i];
  }
}

/* exported addPeriodicWaveRow */
function addPeriodicWaveRow(button) {
  const buttonRow = button.parentNode.parentNode;
  const table = buttonRow.parentNode;
  const rowTemplate = document.getElementById('PeriodicWave-row-template');
  const newRow = cloneNoID(rowTemplate);
  newRow.children[0].innerHTML = table.children.length - 2;
  table.insertBefore(newRow, buttonRow);
  try {
    updatePeriodicWave(table);
  } catch (ex) {
    console.error(ex);
    alert(`something went wrong adding a PeriodicWave row: ${ex.message}`);
  }
}

/* exported removePeriodicWaveRow */
function removePeriodicWaveRow(button) {
  const buttonRow = button.parentNode.parentNode;
  const table = buttonRow.parentNode;
  const rowToRemove = buttonRow.previousElementSibling;
  if (rowToRemove) {
    rowToRemove.remove();
    try {
      updatePeriodicWave(table);
    } catch (ex) {
      console.error(ex);
      alert(`something went wrong removing a PeriodicWave row: ${ex.message}`);
    }
  }
}

function makeValueFn(valueExpr, expectedType) {
  if (!expectedType)
    expectedType = 'value';
  let jsValueExpr;
  switch (expectedType) {
    // case 'AudioBuffer': // TODO?
    case 'PeriodicWave': {
      // in this case, valueExpr is an array of expressions in the order they
      // appear as input fields in the document
      if (valueExpr.length % 2 != 0)
	throw new Error('expected even number of PeriodicWave elements');
      const real = [];
      const imag = [];
      for (let i = 0; i < valueExpr.length; i += 2) {
	real.push(ValueParser.parse(''+valueExpr[i], {startRule: 'value'}));
	imag.push(ValueParser.parse(''+valueExpr[i+1], {startRule: 'value'}));
      }
      jsValueExpr =
        'ctx.createPeriodicWave(' +
	  `new Float32Array([${real.join(', ')}]), ` +
	  `new Float32Array([${imag.join(', ')}])` +
	')';
      break;
    }
    case 'value': // fall through
    case 'array':
    case 'condition':
      jsValueExpr = ValueParser.parse(''+valueExpr, {startRule: expectedType});
      break;
    default:
      throw new Error(`unknown expression type: ${expectedType}`);
  }
  return eval(
    '(function({ n, f, v, o, r }) {\n' +
    `  return (${jsValueExpr});\n` +
    '})\n'
  );
}

function changeLabel(input) {
  const subtree = input.parentNode;
  const data = tree[subtree.id];
  const oldLabel = data.label;
  if (subtree.matches('.reference')) { // ... on a reference
    // ensure that the new label actually refers to an existing node
    if (!(input.value in tree)) {
      alert(`there is nothing labeled "${input.value}" to refer to`);
      input.value = oldLabel;
      return;
    }
  } else { // setting a label field on a non-reference
    // ensure that we can look up the data by its (nonempty) label in tree,
    // and that any references to this node continue to reference this node
    const references = [];
    if (oldLabel && oldLabel != '')
      for (const id in tree)
	if (tree[id].type == 'reference' && tree[id].label == oldLabel)
	  references.push(tree[id]);
    if (input.value == '') {
      if (references.length > 0) {
	alert('node is still referenced, cannot remove its label');
	input.value = oldLabel;
	return;
      }
    } else {
      if (input.value in tree) {
	alert(`there is already something labeled "${input.value}"`);
	input.value = oldLabel;
	return;
      }
      tree[input.value] = data;
    }
    if (oldLabel && oldLabel != '') {
      for (const r of references)
	r.label = input.value;
      delete tree[oldLabel];
    }
  }
  data[input.name] = input.value;
}

function changeCondition(input) {
  const subtree = input.parentNode;
  const data = tree[subtree.id];
  try {
    data.valueFn = makeValueFn(input.value, 'condition');
    data.value = input.value;
  } catch (ex) {
    alert(`invalid condition: ${ex.message}`);
    input.value = data.value;
  }
}

function changeFieldValue(input) {
  const subtree = input.parentNode.parentNode.parentNode;
  const field = tree[subtree.id].fields[input.name];
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
    alert(`invalid field value: ${ex.message}`);
    input.value = field.value;
  }
}

function changeParamValue(input) {
  const subtree = input.parentNode;
  try {
    tree[subtree.id].valueFn = makeValueFn(input.value);
    tree[subtree.id][input.name] = input.value;
  } catch (ex) {
    alert(`invalid parameter value: ${ex.message}`);
    input.value = tree[subtree.id][input.name];
  }
}

function changeArg(input) {
  let i = 0;
  let sib = input.previousElementSibling;
  while (sib) {
    if (sib.tagName == 'INPUT')
      i++;
    sib = sib.previousElementSibling;
  }
  try {
    tree[input.parentNode.id].argFns[i] = makeValueFn(input.value);
    tree[input.parentNode.id].args[i] = input.value;
  } catch (ex) {
    alert(`invalid argument value: ${ex.message}`);
    input.value = tree[input.parentNode.id].args[i];
  }
}

function moveHere(referenceSubtree) {
  // variables here are named for the old state
  const reference = tree[referenceSubtree.id];
  const referent = tree[reference.label];
  const referenceUL = referenceSubtree.parentNode;
  const referentUL = referent.subtree.parentNode;
  const referenceParent = tree[referenceUL.parentNode.id];
  const referentParent = tree[referentUL.parentNode.id];
  const referenceIndex = referenceParent.children.indexOf(reference);
  const referentIndex = referentParent.children.indexOf(referent);
  const referenceNext = referenceSubtree.nextElementSibling;
  const referentNext = referent.subtree.nextElementSibling;
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
  const isRoot = (idmap === undefined);
  if (isRoot) idmap = {};
  if (nodeData.subtree.id in idmap) { // already copied/referenced
    return tree[idmap[nodeData.subtree.id]];
  } else if ((!isRoot) &&
	     ('label' in nodeData) && nodeData.label != '') { // reference
    const json = {
      type: 'reference',
      label: nodeData.label,
      fields: {},
      params: {},
      children: []
    };
    const reference = nodeFromJSON(json);
    tree[reference.subtree.id] = reference;
    idmap[nodeData.subtree.id] = reference.subtree.id;
    return reference;
  } else { // copy
    const json = nodeToJSON(nodeData);
    if (isRoot && ('label' in json)) json.label = '';
    const copy = nodeFromJSON(json);
    if ('params' in copy) {
      for (const param in copy.params) {
	const paramData = copy.params[param];
	paramData.children = paramData.children.map(oldID => {
	  const childCopy = copyNode(tree[oldID], idmap);
	  return childCopy.subtree.id;
	});
      }
    }
    if ('children' in copy) {
      copy.children = copy.children.map(oldID => {
	const childCopy = copyNode(tree[oldID], idmap);
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
  const reference = tree[referenceSubtree.id];
  const referent = tree[reference.label];
  const referenceUL = referenceSubtree.parentNode;
  const referenceParent = tree[referenceUL.parentNode.id];
  const referenceIndex = referenceParent.children.indexOf(reference);
  // make the copy
  const copy = copyNode(referent);
  buildLoadedTree(copy);
  // replace the reference with the copy
  referenceUL.replaceChild(copy.subtree, referenceSubtree);
  referenceParent.children[referenceIndex] = copy;
  delete tree[referenceSubtree.id];
  // make node collapsible
  updateSubtree(copy.subtree, true);
}

let inputStream;
let inputSource;
let recorderNode;

function startInputSource() {
  if (inputSource) {
    return Promise.resolve(inputSource);
  } else {
    return navigator.mediaDevices.
      getUserMedia({ audio: { channelCount: { exact: 2 } } }).
      then(stream => {
	inputStream = stream;
	inputSource = ctx.createMediaStreamSource(stream);
	return inputSource;
      });
  }
}

function stopInputSource() {
  inputStream.getTracks()[0].stop(); // stop recording audio
  inputStream = null;
  inputSource.disconnect();
  inputSource = null;
}

function recordBuffer(button) {
  button.innerHTML = '■';
  button.className = 'stop';
  button.setAttribute('onclick', 'stopRecordingBuffer(this)');
  // TODO? push some of this into RecorderNode
  startInputSource().then(source => {
    let sampleRate = inputStream.getTracks()[0].getSettings().sampleRate;
    if (!('number' == typeof sampleRate))
      sampleRate = ctx.sampleRate;
    recorderNode = new RecorderNode(ctx, sampleRate);
    recorderNode.connectFrom(inputSource);
    recorderNode.connect(ctx.destination);
  });
}

function stopRecordingBuffer(button) {
  const audioBufferLI = button.parentNode;
  const canvas = audioBufferLI.querySelector('.waveform');
  const nodeData = tree[audioBufferLI.parentNode.parentNode.id];
  button.innerHTML = '●';
  button.className = 'record';
  button.setAttribute('onclick', 'recordBuffer(this)');
  stopInputSource();
  recorderNode.disconnect();
  recorderNode.getBuffer().then(buffer => {
    nodeData.fields.buffer.value = buffer;
    drawBuffer(canvas, buffer);
    recorderNode = null;
  }).catch(err => {
    console.log('error getting recording buffer:');
    console.error(err);
  });
}

// show the first 10 seconds of the buffer as kind of a waveform on the canvas,
// with each column of pixels forming a histogram of the sample values it
// represents
function drawBuffer(canvas, buffer) {
  const gctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  // clear canvas to black
  gctx.fillStyle = 'black';
  gctx.fillRect(0, 0, w, h);
  const numSamplesPerChannelColumn = Math.floor(buffer.sampleRate * 10 / w);
  const numSamplesPerColumn =
    buffer.numberOfChannels * numSamplesPerChannelColumn;
  const columnSamples = new Float32Array(numSamplesPerColumn);
  const columnHistogram = new Uint32Array(h);
  const columnImageData = gctx.createImageData(1, h);
  const columnPixels = columnImageData.data;
  // set 100% opacity for all pixels
  for (let y = 0; y < h; y++)
    columnPixels[4*y+3] = 255;
  const waveformWidth =
    Math.min(w, Math.floor(buffer.length / numSamplesPerChannelColumn));
  // find the range of sample values for the whole buffer
  let minSample = 1;
  let maxSample = -1;
  for (let x = 0; x < waveformWidth; x++) {
    const startInChannel = numSamplesPerChannelColumn * x;
    // get all samples from all channels for this column into columnSamples
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const start = numSamplesPerChannelColumn * c;
      const end = start + numSamplesPerChannelColumn;
      const channelSamples = columnSamples.subarray(start, end);
      buffer.copyFromChannel(channelSamples, c, startInChannel);
    }
    for (let s = 0; s < numSamplesPerColumn; s++) {
      if (minSample > columnSamples[s]) minSample = columnSamples[s];
      if (maxSample < columnSamples[s]) maxSample = columnSamples[s];
    }
  }
  const sampleRange = maxSample - minSample;
  for (let x = 0; x < waveformWidth; x++) {
    const startInChannel = numSamplesPerChannelColumn * x;
    // get all samples from all channels for this column into columnSamples
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const start = numSamplesPerChannelColumn * c;
      const end = start + numSamplesPerChannelColumn;
      const channelSamples = columnSamples.subarray(start, end);
      buffer.copyFromChannel(channelSamples, c, startInChannel);
    }
    // make a histogram of sample values with one bin per pixel, using the
    // sample value range we found earlier
    columnHistogram.fill(0);
    for (let s = 0; s < numSamplesPerColumn; s++) {
      const bin =
	Math.floor((columnSamples[s] - minSample) * h / sampleRange);
      columnHistogram[bin]++;
    }
    // find the maximum count for any histogram bin in this column
    let maxThisColumn = 0;
    for (let y = 0; y < h; y++)
      if (columnHistogram[y] > maxThisColumn)
	maxThisColumn = columnHistogram[y];
    // turn the histogram bins into green pixels of corresponding intensity
    for (let y = 0; y < h; y++) {
      columnPixels[4*y+1] = columnHistogram[y] * 255 / maxThisColumn;
      // mark the full range of the wave in less intense blue
      columnPixels[4*y+2] = ((columnHistogram[y] > 0) ? 64 : 0);
    }
    // put the pixels on the canvas
    gctx.putImageData(columnImageData, x, 0);
  }
}

function loadBuffer(audioBufferLI, arrayBuffer, fieldData) {
  const canvas = audioBufferLI.querySelector('.waveform');
  if (fieldData === undefined) {
				    // ul.children li ABSN    id
    const nodeData = tree[audioBufferLI.parentNode.parentNode.id];
    fieldData = nodeData.fields.buffer;
  }
  return ctx.decodeAudioData(arrayBuffer).
    then(buffer => {
      fieldData.value = buffer;
      drawBuffer(canvas, buffer);
    });
}

function loadBufferFromFile(input) {
		     // input label      li buffer
  const audioBufferLI = input.parentNode.parentNode;
  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = evt => {
    loadBuffer(audioBufferLI, evt.target.result).
    catch(err => {
      console.error('failed to decode audio data:');
      console.error(err);
      console.error(err.stack);
    });
  };
  reader.readAsArrayBuffer(file);
}

function loadBufferFromURL(button) {
  const input = button.previousElementSibling;
  const audioBufferLI = button.parentNode;
  fetch(input.value).then(response =>
    response.arrayBuffer().
      then(arrayBuffer => {
	loadBuffer(audioBufferLI, arrayBuffer);
      })
  ).catch(err => {
    console.error(err);
    alert(`error fetching file: ${err}`);
  });
}

// encode AudioBuffer data as a wav file in a Uint8Array
// see http://www-mmsp.ece.mcgill.ca/Documents/AudioFormats/WAVE/WAVE.html
function encodeWav(audioBuffer) {
  const numDataBytes = 2 * audioBuffer.numberOfChannels * audioBuffer.length;
  const wavHeader = "RIFF    WAVEfmt                     data    ";
  const wavBytes = new Uint8Array(wavHeader.length + numDataBytes);
  for (const i in wavHeader)
    wavBytes[i] = wavHeader.charCodeAt(i);
  const wavView = new DataView(wavBytes.buffer);
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
  let i = 44;
  const sample = new Float32Array(1);
  for (let s = 0; s < audioBuffer.length; s++) {
    for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
      audioBuffer.copyFromChannel(sample, c, s);
      wavView.setInt16(i, Math.round(sample[0] * 32767), true);
      i += 2;
    }
  }
  return wavBytes;
}

function saveBlob(blob, filename) {
  const blobURL = URL.createObjectURL(blob);
  const link = document.getElementById('file-output');
  link.href = blobURL;
  link.download = filename;
  link.innerHTML = filename;
  link.click();
}

function saveBuffer(button) {
  const audioBufferLI = button.parentNode;
  const bufferSourceLI = audioBufferLI.parentNode.parentNode;
  const nodeData = tree[bufferSourceLI.id];
  const filename =
    ((nodeData.label == '') ? bufferSourceLI.id : nodeData.label) + '.wav';
  const audioBuffer = nodeData.fields.buffer.value;
  const wavBytes = encodeWav(audioBuffer);
  const wavBlob = new Blob([wavBytes], { type: 'audio/wav' });
  saveBlob(wavBlob, filename);
}

/*
 * Save/Load
 */

function nodeToJSON(nodeData) {
  const json = { type: nodeData.type };
  if ('label' in nodeData)
    json.label = nodeData.label;
  if ('fields' in nodeData) { // and params
    json.fields = {};
    for (const field in nodeData.fields) {
      const fieldData = nodeData.fields[field];
      switch (fieldData.type) {
	case 'AudioBuffer': {
	  const wavBytes = encodeWav(fieldData.value);
	  json.fields[field] = base64js.fromByteArray(wavBytes);
	  break;
	}
	default:
	  json.fields[field] = fieldData.value;
      }
    }
    json.params = {};
    for (const param in nodeData.params) {
      json.params[param] = {
	value: nodeData.params[param].value,
	automation: nodeData.params[param].automation.map(autoData => ({
	  fn: autoData.fn,
	  args: autoData.args
	})),
	children: nodeData.params[param].children.
		  map(childData => childData.subtree.id)
      };
    }
  }
  if ('children' in nodeData)
    json.children = nodeData.children.map(childData => childData.subtree.id);
  if ('value' in nodeData) // conditional
    json.value = nodeData.value;
  return json;
}

function nodeFromJSON(json) {
  // make full nodeData, including subtree with fields and params, except don't
  // add subtree to its parent yet, and keep children as just ID strings
  const nodeData =
    (json.type == 'AudioDestinationNode' ?
      tree.destination : makeChild(json.type));
  if ('label' in json) {
    nodeData.label = json.label;
    nodeData.subtree.getElementsByClassName('label')[0].value = json.label;
  }
  if ('fields' in json) { // and params
    for (const field in json.fields) {
      if (!(field in nodeData.fields)) {
	console.warn(`missing ${json.type}#${field} field; skipping`);
	continue;
      }
      const fieldData = nodeData.fields[field];
      let val = json.fields[field];
      try {
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
	      const buttonRow =
		fieldData.subtree.
		getElementsByClassName('PeriodicWave-buttons')[0].
		parentNode;
	      const table = buttonRow.parentNode;
	      const rowTemplate =
		document.getElementById('PeriodicWave-row-template');
	      for (let i = 0; i < val.length; i += 2) {
		const newRow = cloneNoID(rowTemplate);
		newRow.children[0].innerHTML = i/2;
		table.insertBefore(newRow, buttonRow);
		const inputs = newRow.getElementsByTagName('input');
		inputs[0].value = val[i];
		inputs[1].value = val[i+1];
	      }
	      const select =
		nodeData.subtree.querySelector("select[name='type']");
	      select.disabled = true;
	    }
	    break;
	  case 'AudioBuffer': {
	    const arrayBuffer =
	      Uint8Array.from(base64js.toByteArray(val)).buffer;
	    loadBuffer(fieldData.subtree, arrayBuffer, fieldData);
	    val = fieldData.value;
	    break;
	  }
	}
	fieldData.value = val;
      } catch (ex) {
	console.warn(`invalid field value ${JSON.stringify(val)}, using default:`);
	console.warn(ex);
      }
    }
    for (const param in json.params) {
      if (!(param in nodeData.params)) {
	console.warn(`missing ${json.type}#${param} param; skipping`);
	continue;
      }
      const paramData = nodeData.params[param];
      const val = json.params[param].value;
      try {
	paramData.valueFn = makeValueFn(val);
	paramData.value = val;
	paramData.subtree.getElementsByClassName('value')[0].value = val;
      } catch (ex) {
	console.warn(`invalid parameter value ${JSON.stringify(val)}, using default`);
	console.warn(ex);
      }
      for (const a of json.params[param].automation) {
	addAutomation({ value: a.fn, parentNode: paramData.subtree });
	const autoData = paramData.automation[paramData.automation.length - 1];
	const argInputs = autoData.subtree.getElementsByClassName('value');
	if (argInputs.length != a.args.length)
	  console.warn(`wrong number of arguments for automation ${a.fn}; expected ${argInputs.length}, but got ${a.args.length}`);
	for (let i = 0; i < argInputs.length && i < a.args.length; i++) {
	  const val = a.args[i];
	  try {
	    autoData.argFns[i] = makeValueFn(val);
	    autoData.args[i] = val;
	    argInputs[i].value = val;
	  } catch (ex) {
	    console.warn(`invalid argument value ${JSON.stringify(val)}:`);
	    console.warn(ex);
	  }
	}
      }
      // for now; buildLoadedTree will finish
      nodeData.params[param].children = json.params[param].children;
    }
  }
  if ('children' in json)
    nodeData.children = json.children; // for now; buildLoadedTree will finish
  if ('value' in json) { // conditional
    const val = json.value;
    try {
      nodeData.valueFn = makeValueFn(val, 'condition');
      nodeData.value = val;
    } catch (ex) {
      console.warn(`invalid condition ${JSON.stringify(val)}:`);
      console.warn(ex);
    }
  }
  return nodeData;
}

function buildLoadedTree(nodeData) {
  // recurse on params
  for (const param in nodeData.params)
    buildLoadedTree(nodeData.params[param]);
  // replace child IDs with actual child tree data
  nodeData.children = nodeData.children.map(id => tree[id]);
  // add child subtrees to this subtree's children, and recurse
  const ul = nodeData.subtree.querySelector('.children');
  for (const childData of nodeData.children) {
    ul.appendChild(childData.subtree);
    buildLoadedTree(childData);
  }
}

function saveTree() {
  const json = {};
  for (const label in tree) {
    // skip AudioParams, automation, and extra labels
    if ((!('type' in tree[label])) || tree[label].type == 'AudioParam' ||
        (tree[label].label == label && label != 'destination'))
      continue;
    json[label] = nodeToJSON(tree[label]);
  }
  const jsonStr = JSON.stringify(json, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  saveBlob(blob, 'untitled.json'); // TODO use loaded filename if possible
}

function loadTree(jsonStr) {
  try {
    const json = JSON.parse(jsonStr);
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
    };
    document.querySelector('#destination > .children').innerHTML = '';
    // make sure new IDs don't interfere with loaded ones
    // FIXME ID inflation
    nextID = 0;
    for (const id in json) {
      if (/^wat-node-\d+$/.test(id)) {
	const idNum = parseInt(id.substring(9));
	if (nextID <= idNum)
	  nextID = idNum + 1;
      }
    }
    // fill tree nodes from JSON
    for (const id in json) {
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
    alert(`error loading file: ${ex.message}`);
  }
}

function loadTreeFromFile(input) {
  const file = input.files[0];
  const reader = new FileReader();
  reader.addEventListener('load', evt => {
    loadTree(reader.result);
  });
  reader.readAsText(file);
}

function loadTreeFromURL(button) {
  const input = button.previousElementSibling;
  fetch(input.value).then(response => response.text().then(loadTree)).
  catch(err => {
    console.error(err);
    alert(`error fetching file: ${err}`);
  });
}

/*
 * Playing note
 */

class PlayingNote extends EventTarget {
  constructor(noteNum, velocity, onset) {
    super();
    //console.log('playing note ' + noteNum);
    if (velocity === undefined)
      velocity = 1;
    if (onset === undefined)
      onset = ctx.currentTime;
    // TODO make octave changeable
    const fractionOfA440 = Math.pow(2.0, (noteNum - 69) / 12) * 2;
    const frequency = fractionOfA440 * 440;
    // NOTE: no release (r) const yet
    this.vars = { n: noteNum, f: frequency, v: velocity, o: onset };
    this.audioNodes = {}; // by label
    this.scheduledNodes = []; // [audioNode, nodeData] pairs
    this.referenceTasks = []; // functions to be called to connect references
    this.releaseTasks = []; // functions to be called when we know release time
    this.isEnded = false;
    this.topNodes = [];
    // instantiate and connect each child of the destination node (their
    // children in turn might get instantiated in promises)
    for (const c of tree.destination.children) {
      this.instantiateNode(c).then(n => {
	if (!this.isEnded) {
	  this.topNodes.push(n);
	  n.connect(ctx.destination);
	}
      });
    }
    // wait for everything to be instantiated before connecting references and
    // starting sources
    setTimeout(() => {
      for (const fn of this.referenceTasks)
	fn();
      this.start();
    }, 0);
  }

  instantiateNode(nodeData) {
    if (nodeData.type == 'reference') {
      return Promise.resolve({
	connect: toNode => {
	  this.referenceTasks.push(() => {
	    this.audioNodes[nodeData.label].connect(toNode);
	  });
	},
	disconnect: () => {
	  this.audioNodes[nodeData.label].disconnect();
	}
      });
    } else if (nodeData.type == 'microphone') {
      // FIXME this breaks for polyphony
      if (inputSource) {
	return Promise.resolve(inputSource);
      } else {
	return startInputSource().
	  then(s => {
	    // FIXME this conflates release and end; if the note continues after release, this will still stop the mic at release
	    if (this.isEnded) { // stopped before we got a chance to start
	      stopInputSource();
	    } else {
	      this.releaseTasks.push(stopInputSource);
	    }
	    return s;
	  });
      }
    } else if (['if', 'elif', 'else'].includes(nodeData.type)) { // conditional
      // make a GainNode to represent this conditional node
      const audioNode = ctx.createGain();
      audioNode.gain.value = 1; // just in case the spec changes
      // find out whether we should instantiate the children
      let val = false;
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
	const oldIsPrevCondTrue = window.isPrevCondTrue;
	window.isPrevCondTrue = false; // no previous conds among children
	for (const c of nodeData.children)
	  this.instantiateNode(c).then(n => { n.connect(audioNode); });
	// restore old isPrevCondTrue
	window.isPrevCondTrue = oldIsPrevCondTrue;
      }
      return Promise.resolve(audioNode);
    } else { // ordinary AudioNode
      const typeData = nodeTypes[nodeData.type];
      const audioNode = ctx[typeData.create]();
      if (nodeData.label != '')
	this.audioNodes[nodeData.label] = audioNode;
      if (typeData.isScheduled)
	this.scheduledNodes.push([audioNode, nodeData]);
      if (nodeData.type == 'AnalyserNode') {
	const grandkids = nodeData.subtree.getElementsByClassName('children')[0];
	const freqCanvas =
	  grandkids.children[0].getElementsByTagName('canvas')[0];
	const timeCanvas =
	  grandkids.children[1].getElementsByTagName('canvas')[0];
	requestAnimationFrame(
	  this.drawAnalysis.bind(this, freqCanvas, timeCanvas, audioNode)
	);
      }
      // save isPrevCondTrue (so nested conditions don't leak out)
      const oldIsPrevCondTrue = window.isPrevCondTrue;
      for (const fieldName in nodeData.fields)
	// don't set schedule here, and don't set type when a PeriodicWave has
	// already been set (spec says that's an error)
	if (!(/^st(art|op)When$/.test(fieldName) ||
	      (fieldName == 'type' && ('PeriodicWave' in nodeData.fields) &&
	       nodeData.fields.PeriodicWave.value)))
	  this.instantiateField(audioNode, fieldName, nodeData);
      for (const paramName in nodeData.params)
	this.instantiateParam(audioNode, paramName, nodeData);
      window.isPrevCondTrue = false; // no previous conds among children
      for (const c of nodeData.children)
	this.instantiateNode(c).then(n => { n.connect(audioNode); });
      // restore old isPrevCondTrue
      window.isPrevCondTrue = oldIsPrevCondTrue;
      return Promise.resolve(audioNode);
    }
  }

  instantiateField(audioNode, fieldName, nodeData) {
    const field = nodeData.fields[fieldName];
    if (field.value != '') {
      window.isPrevCondTrue = false;
      const val = field.valueFn(this.vars);
      if ('set' in field) {
	if (val !== null)
	  audioNode[field.set](val);
      } else {
	audioNode[fieldName] = val;
      }
    }
  }

  instantiateParam(audioNode, paramName, nodeData) {
    const paramData = nodeData.params[paramName];
    const audioParam = audioNode[paramName];
    if (paramData.value != '') {
      window.isPrevCondTrue = false;
      audioParam.value = paramData.valueFn(this.vars);
    }
    for (const a of paramData.automation) {
      // push anything that needs r onto releaseTasks; schedule everything else
      // immediately
      // TODO? only schedule events that happen at onset immediately; do later events in setTimeout(fn,0) to avoid delaying calls to .start() (not sure how much this matters; probably happens internal to these automation methods anyway)
      if (a.args.some(arg => /\br\b/.test(arg))) {
	this.releaseTasks.push(() => {
	  this.instantiateAutomation(audioParam, a);
	});
      } else {
	this.instantiateAutomation(audioParam, a);
      }
    }
    window.isPrevCondTrue = false;
    for (const c of paramData.children)
      this.instantiateNode(c).then(n => { n.connect(audioParam); });
  }

  instantiateAutomation(audioParam, autoData) {
    audioParam[autoData.fn].apply(audioParam,
      autoData.argFns.map(fn => {
	window.isPrevCondTrue = false;
	return fn(this.vars);
      })
    );
  }

  start() {
    for (const pair of this.scheduledNodes) {
      const [audioNode, nodeData] = pair;
      // remove this pair from the list when the audioNode ends
      audioNode.addEventListener('ended', () => {
	const i = this.scheduledNodes.indexOf(pair);
	if (i >= 0)
	  this.scheduledNodes.splice(i, 1);
	// if we just removed the last scheduled node, end the whole note
	if (this.scheduledNodes.length == 0)
	  this.end();
      });
      // start the audioNode according to startWhen "field"
      if (/\br\b/.test(nodeData.fields.startWhen.value)) {
	this.releaseTasks.push(() => {
	  this.instantiateField(audioNode, 'startWhen', nodeData);
	});
      } else {
	this.instantiateField(audioNode, 'startWhen', nodeData);
      }
      // stop it according to stopWhen
      if (/\br\b/.test(nodeData.fields.stopWhen.value)) {
	this.releaseTasks.push(() => {
	  this.instantiateField(audioNode, 'stopWhen', nodeData);
	});
      } else {
	this.instantiateField(audioNode, 'stopWhen', nodeData);
      }
    }
  }

  release(releaseTime) {
    //console.log('releasing note ' + this.vars.n);
    this.vars.r = releaseTime;
    for (const fn of this.releaseTasks)
      fn();
    if (this.scheduledNodes.length == 0 && !this.isEnded) {
      // we have no scheduled nodes to call end() from their 'ended' events,
      // and end() hasn't been called yet, so we must call end() ourselves
      this.end();
    }
  }

  end() {
    //console.log('ending note ' + this.vars.n);
    this.isEnded = true;
    // try to stop any stragglers
    for (const [n/*, d*/] of this.scheduledNodes) {
      try {
	n.stop();
      } catch (err) {
	console.error('failed to stop scheduled node:');
	console.error(n);
	console.error(err);
      }
    }
    // disconnect everything from the top
    for (const n of this.topNodes)
      n.disconnect();
    this.dispatchEvent(new Event('ended'));
  }

  drawFreqAnalysis(canvas, data) {
    const gctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    // clear canvas to black
    gctx.fillStyle = 'black';
    gctx.fillRect(0, 0, w, h);
    const binsPerCol = Math.max(1, Math.floor(data.length / w));
    gctx.fillStyle = 'lime';
    for (let x = 0, i = 0; x < w && i < data.length; x++, i += binsPerCol) {
      let sum = 0;
      for (let j = 0; j < binsPerCol; j++)
	sum += data[i+j];
      const y = Math.floor(sum / binsPerCol);
      gctx.fillRect(x, h - y, 1, y);
    }
  }

  drawTimeAnalysis(canvas, data) {
    const gctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    // clear canvas to black
    gctx.fillStyle = 'black';
    gctx.fillRect(0, 0, w, h);
    // trigger on positive 0-crossing (128-crossing?)
    let pzc;
    let prev = data[0];
    for (pzc = 1; pzc < data.length; pzc++) {
      if (prev < 128 && data[pzc] >= 128)
	break;
      prev = data[pzc];
    }
    // snap back to 0 if there is no such crossing
    if (pzc == data.length)
      pzc = 0;
    gctx.fillStyle = 'lime';
    for (let x = 0, i = pzc; x < w && i < data.length; x++, i++) {
      const y = data[i];
      let y1 = Math.floor((data[i > 0 ? i-1 : i] + y) / 2);
      let y2 = Math.floor((data[i < data.length - 1 ? i+1 : i] + y) / 2);
      if (y2 < y1) {
	let tmp = y1;
	y1 = y2;
	y2 = tmp;
      }
      gctx.fillRect(x, h - 1 - y2, 1, y2 - y1 + 1);
    }
  }

  drawAnalysis(freqCanvas, timeCanvas, analyserNode) {
    const freqData = new Uint8Array(analyserNode.frequencyBinCount);
    analyserNode.getByteFrequencyData(freqData);
    this.drawFreqAnalysis(freqCanvas, freqData);
    const timeData = new Uint8Array(analyserNode.fftSize);
    analyserNode.getByteTimeDomainData(timeData);
    this.drawTimeAnalysis(timeCanvas, timeData);
    if (!this.isEnded) {
      requestAnimationFrame(
	this.drawAnalysis.bind(this, freqCanvas, timeCanvas, analyserNode)
      );
    }
  }
}

/*
 * Keyboard
 * (largely borrowed from music-cad)
 */

const keyboard = document.getElementById('keyboard');
const touchboard = document.getElementById('touchboard');

document.getElementById('board-select').addEventListener('change', evt => {
  if (evt.currentTarget.value == 'keyboard') {
    keyboard.style.display = null;
    touchboard.style.display = 'none';
  } else { // touchboard
    keyboard.style.display = 'none';
    touchboard.style.display = null;
  }
});

function isAsciiKeyCode(code) {
  return ((code >= 48 && code <= 59) || (code >= 65 && code <= 90));
}

document.querySelectorAll('table#keyboard td.w, table#keyboard td.b').
forEach((td, i) => {
  const content = td.innerHTML;
  if (content.length == 1) {
    const code = content.toUpperCase().charCodeAt(0);
    if (isAsciiKeyCode(code))
      td.setAttribute('id', `key_${code}`);
    else if (content == ',')
      td.setAttribute('id', 'key_188');
    else if (content == '.')
      td.setAttribute('id', 'key_190');
    else if (content == '/')
      td.setAttribute('id', 'key_191');
  }
});

const kc2osc = {};

function standardKeyCode(evt) {
  let code = evt.keyCode;
  if (code == 186) { // Firefox and Chrome can't agree on ";"
    code = 59;
  }
  return code;
}

// activated by the actual keyboard

document.body.addEventListener('keydown', evt => {
  if (document.activeElement.tagName != 'INPUT') {
    const code = standardKeyCode(evt);
    const td = document.getElementById(`key_${code}`);
    if (td) {
      //console.log('keydown ' + code);
      if (!kc2osc[code]) {
	const noteNum = td.className.slice(0,2);
	if (/\d\d/.test(noteNum))
	  kc2osc[code] = new PlayingNote(noteNum);
	setTimeout(() => { td.classList.add('keydown'); }, 0);
      }
      evt.preventDefault();
    }
  }
});

document.body.addEventListener('keyup', evt => {
  const code = standardKeyCode(evt);
  const td = document.getElementById(`key_${code}`);
  if (td) {
    //console.log('keyup ' + code);
    const oscillator = kc2osc[code];
    if (oscillator) {
      oscillator.release(ctx.currentTime);
      kc2osc[code] = null;
    }
    setTimeout(() => { td.classList.remove('keydown'); }, 0);
    evt.preventDefault();
  }
});

// activated by clicking on the on-screen keyboard

let mouseOscillator;
let mouseButtonIsDown;

keyboard.addEventListener('mousedown', evt => {
  mouseButtonIsDown = true;
  const td = evt.target;
  if (td.matches('.b, .w')) {
    const noteNum = evt.target.className.slice(0,2);
    mouseOscillator = new PlayingNote(noteNum);
    mouseOscillator.addEventListener('ended', () => {
      td.classList.remove('keydown');
    });
    setTimeout(() => { td.classList.add("keydown"); }, 0);
  }
  evt.preventDefault();
});

keyboard.addEventListener('mouseup', evt => {
  mouseButtonIsDown = false;
  mouseOscillator.release(ctx.currentTime);
  mouseOscillator = null;
  evt.preventDefault();
});

for (const td of document.querySelectorAll('#keyboard td')) {
  td.addEventListener('mouseenter', evt => {
    if (mouseButtonIsDown) {
      if (td.matches('.b, .w')) {
	const noteNum = td.className.slice(0,2);
	mouseOscillator = new PlayingNote(noteNum);
	//console.log("enter " + mouseOscillator.vars.f);
	mouseOscillator.addEventListener('ended', () => {
	  td.classList.remove('keydown');
	});
	setTimeout(() => { td.classList.add('keydown'); }, 0);
      }
    }
    evt.preventDefault();
  });
  td.addEventListener('mouseleave', evt => {
    if (mouseOscillator) {
      //console.log("leave " + mouseOscillator.vars.f);
      mouseOscillator.release(ctx.currentTime);
      mouseOscillator = null;
    }
    evt.preventDefault();
  });
}

// activated by touching the touchboard

function initTouchboard() {
  const octaveTemplate = document.getElementById('octave-template');
  const labelTemplate = octaveTemplate.children[0];
  for (let oct = 0; oct < 10; oct++) {
    const label = labelTemplate.cloneNode();
    label.setAttribute('x', oct * 70);
    label.appendChild(document.createTextNode(`C${oct}`));
    touchboard.appendChild(label);
    for (let k = 1; k <= 12; k++) {
      const keyTemplate = octaveTemplate.children[k];
      const key = keyTemplate.cloneNode();
      const oldNoteNum = key.classList.item(0);
      const newNoteNum = parseInt(oldNoteNum) + oct * 12;
      key.classList.replace(oldNoteNum, newNoteNum);
      key.setAttribute('x', oct * 70 + parseFloat(key.getAttribute('x')));
      touchboard.appendChild(key);
    }
  }
}

// map touch identifier to touched element
const touch2touched = {};
// map MIDI note number to playing note started by touch
const touchNote2osc = {};

touchboard.addEventListener('touchstart', evt => {
  evt.preventDefault();
  const touches = evt.changedTouches;
  for (let i = 0; i < touches.length; i++) {
    const touch = touches[i];
    const touched = document.elementFromPoint(touch.clientX, touch.clientY);
    touch2touched[touch.identifier] = touched;
    if (touched.matches('.b, .w') && !touched.matches('.keydown')) {
      const noteNum = touched.classList.item(0);
      const oldOsc = touchNote2osc[noteNum];
      if (oldOsc)
	oldOsc.end();
      touchNote2osc[noteNum] = new PlayingNote(noteNum);
      touchNote2osc[noteNum].addEventListener('ended', () => {
	touched.classList.remove('keydown');
      });
      setTimeout(() => { touched.classList.add('keydown'); }, 0);
    }
  }
});

touchboard.addEventListener('touchmove', evt => {
  evt.preventDefault();
  const touches = evt.changedTouches;
  for (let i = 0; i < touches.length; i++) {
    const touch = touches[i];
    const oldTouched = touch2touched[touch.identifier];
    const newTouched = document.elementFromPoint(touch.clientX, touch.clientY);
    // TODO pan/zoom if two touches on non-key area
    if (newTouched === oldTouched) continue; // no real change
    touch2touched[touch.identifier] = newTouched;
    // stop old touched note if any
    // TODO? check if any other touches are still holding it down
    if (oldTouched) {
      const oldNoteNum = oldTouched.classList.item(0);
      setTimeout(() => {
	const oldOsc = touchNote2osc[oldNoteNum];
	if (oldOsc) {
	  oldOsc.release(ctx.currentTime);
	  delete touchNote2osc[oldNoteNum];
	}
      }, 0);
    }
    // start new touched note
    if (newTouched &&
	newTouched.matches('.b, .w') && !newTouched.matches('.keydown')) {
      const newNoteNum = newTouched.classList.item(0);
      const oldOsc = touchNote2osc[newNoteNum];
      if (oldOsc)
	oldOsc.end();
      const newOsc = new PlayingNote(newNoteNum);
      touchNote2osc[newNoteNum] = newOsc;
      newOsc.addEventListener('ended', () => {
	newTouched.classList.remove('keydown');
      });
      setTimeout(() => { newTouched.classList.add('keydown'); }, 0);
    }
  }
});

function handleTouchEnd(evt) {
  evt.preventDefault();
  const touches = evt.changedTouches;
  for (let i = 0; i < touches.length; i++) {
    const touch = touches[i];
    const touched = touch2touched[touch.identifier];
    // TODO? check if any other touches are still holding it down
    if (touched) {
      const noteNum = touched.classList.item(0);
      setTimeout(() => {
	if (noteNum in touchNote2osc) {
	  touchNote2osc[noteNum].release(ctx.currentTime);
	  delete touchNote2osc[noteNum];
	}
      }, 0);
    }
  }
}

touchboard.addEventListener('touchend', handleTouchEnd);
touchboard.addEventListener('touchcancel', handleTouchEnd);
