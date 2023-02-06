all: simple-tree/simple-tree.js value-parser.js base64js.min.js doc

simple-tree/simple-tree.js:
	git submodule init
	git submodule update

value-parser.js: value.pegjs node_modules/pegjs/package.json
	node_modules/pegjs/bin/pegjs \
	  --format globals --export-var ValueParser \
	  --allowed-start-rules condition,value,array \
	  -o $@ $<

base64js.min.js: node_modules/base64-js/package.json
	cp node_modules/base64-js/$@ ./

doc: README.html

README.html: md2html.sh README.md
	if ./$+ >$@ ; \
	then true ; \
	else \
	  rm -f $@ ; \
	  echo ; \
	  echo "Making README.html failed, but that's OK, everything else will still work. If you really want README.html, make sure you have commonmarker installed." ; \
	fi

midi-workaround: node_modules/websocket/package.json simple-tree/simple-tree.js
	( \
	sleep 1 && \
	echo && \
	echo -e " * Go to http://localhost:11235/wat.html and press Ctrl+Shift+K to open the web\n * console, then paste the following there and hit 'enter', then click 'start':" && \
	echo "var wms = document.createElement('script'); wms.src='web-midi-shim.js'; document.body.appendChild(wms);" \
	) & ./lighttpd.sh & node midi-server.js 

lint: node_modules/eslint/package.json
	./node_modules/eslint/bin/eslint.js ./

node_modules/%/package.json:
	npm install $*

clean:
	rm -f value-parser.js base64js.min.js README.html
