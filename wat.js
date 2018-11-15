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
  ctx = new AudioContext();

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
	    create: v,
	    isScheduled: (example instanceof AudioScheduledSourceNode),
	    numberOfInputs: example.numberOfInputs,
	    numberOfOutputs: example.numberOfOutputs,
	    params: {}
	  };
	  // fill params
	  for (var param in example) {
	    if (example[param] instanceof AudioParam) {
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
	    } // TODO handle other non-param, non-function attributes
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
}

function addChild(select) {
  var typeName = select.value;
  select.value = 'add child';
  var parentSubtree = select.parentNode
  var children = parentSubtree.querySelector('.children');
  var newChild;
  var data = {
    type: typeName,
    params: {},
    children: []
  };
  if (typeName == 'reference') {
    newChild = cloneNewID(document.getElementById('reference-template'));
    data.label = '';
  } else if (typeName in nodeTypes) {
    newChild = cloneNewID(document.getElementById('audio-node-template'));
    newChild.firstChild.innerHTML = typeName;
    if (nodeTypes[typeName].numberOfInputs == 0) { // can't add children
      newChild.getElementsByClassName('add-child')[0].remove();
      newChild.classList.add('source');
    }
    var grandkids = newChild.getElementsByClassName('children')[0];
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
  var childData = { fn: fnName, args: new Array(numArgs) };
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
    console.log(prev);
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
      if (nextNext) {
	li.parentNode.insertBefore(li, nextNext);
      } else {
	li.parentNode.appendChild(li);
      }
      if (i >= 0 && i < parentData.automation.length - 1) {
	var tmp = parentData.automation[i];
	parentData.automation[i] = parentData.automation[i+1];
	parentData.automation[i+1] = tmp;
      }
    }
  }
}

function changeData(input) {
  tree[input.parentNode.id][input.name] = input.value;
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
  tree[input.parentNode.id].args[i] = input.value; // TODO? parse arithmetic expression involving variables v, o, r (note velocity, note onset time, note release time)
}

document.getElementById('start').onclick = function(evt) {
  evt.currentTarget.remove();
  initWebAudio();
}
