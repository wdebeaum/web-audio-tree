all: simple-tree/simple-tree.js doc

simple-tree/simple-tree.js:
	git submodule init
	git submodule update

doc: README.html

README.html: md2html.rb README.md
	./$+ >$@

midi-workaround: node_modules/websocket/index.js simple-tree/simple-tree.js
	( \
	sleep 1 && \
	echo && \
	echo -e " * Go to http://localhost:11235/wat.html and press Ctrl+Shift+K to open the web\n * console, then paste the following there and hit 'enter', then click 'start':" && \
	echo "var wms = document.createElement('script'); wms.src='web-midi-shim.js'; document.body.appendChild(wms);" \
	) & ./lighttpd.sh & node midi-server.js 

node_modules/%/index.js:
	npm install $*

