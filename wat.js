initTrees();

const nodeTypes = {
  AudioDestinationNode: {
    create: null,
    numberOfInputs: 1,
    numberOfOutputs: 0
  }
};

var ctx;

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
	      nodeTypes[typeName].params[param] = {
		automationRate: (example[param].automationRate || 'k-rate'),
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
  if (typeName == 'reference') {
    newChild = cloneNoID(document.getElementById('reference-template'));
  } else if (typeName in nodeTypes) {
    newChild = cloneNoID(document.getElementById('audio-node-template'));
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
      var param = cloneNoID(paramTemplate);
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
  children.appendChild(newChild);
  updateSubtree(parentSubtree, true);
}

function deleteChild(childSubtree) {
  childSubtree.remove();
}

function addAutomation(select) {
  var fnName = select.value;
  select.value = 'add automation';
  // TODO
}

document.getElementById('start').onclick = function(evt) {
  evt.currentTarget.remove();
  initWebAudio();
}
