// exports.js

//@@BEGIN-NODE-JS-ONLY@@
var url = require('url');

// bwipjs.request(req, res [, overrides])
//
// Returns a PNG image from the query args of a node.js http request object.
//
// This function is asynchronous.
//
// Node.js usage only.
function Request(req, res, extra) {
	var opts = url.parse(req.url, true).query;

	// Convert boolean empty parameters to true
	for (var id in opts) {
		if (opts[id] === '') {
			opts[id] = true;
		}
	}

	// Add in server options/overrides
	if (extra) {
		for (var id in extra) {
			opts[id] = extra[id];
		}
	}

	ToBuffer(opts, function(err, png) {
		if (err) {
			res.writeHead(400, { 'Content-Type':'text/plain' });
			res.end('' + (err.stack || err), 'utf-8');
		} else {
			res.writeHead(200, { 'Content-Type':'image/png' });
			res.end(png, 'binary');
		}
	});
}

// bwipjs.toBuffer(options[, callback])
//
// Uses the built-in graphics drawing and zlib PNG encoding to return a
// barcode image in a node.js Buffer.
//
// `options` are a bwip-js/BWIPP options object.
// `callback` is an optional callback handler with prototype:
//
// 		function callback(err, png)
//
// 		`err` is an Error object or string.  If `err` is set, `png` is null.
// 		`png` is a node Buffer containing the PNG image.
//
// If `callback` is not provided, a Promise is returned.
//
// Node.js usage only.
function ToBuffer(opts, callback) {
	try {
		FixupOptions(opts);
		return Render(opts, DrawingZlibPng(opts, callback));
	} catch (e) {
		if (callback) {
			callback(e);
		} else {
			return new Promise(function(resolve, reject) {
				reject(e);
			});
		}
	}
}
//@@ENDOF-NODE-JS-ONLY@@

//@@BEGIN-BROWSER-ONLY@@

// bwipjs.toCanvas(canvas, options)
// bwipjs.toCanvas(options, canvas)
//
// Uses the built-in canvas drawing.  Identical rendering as toBuffer().
//
// `canvas` can be an HTMLCanvasElement or an ID string or unique selector string.
// `options` are a bwip-js/BWIPP options object.
//
// This function is synchronous and throws on error.
//
// Returns the HTMLCanvasElement.
//
// Browser usage only.
function ToCanvas(opts, canvas) {
	if (typeof canvas == 'string') {
		canvas = document.getElementById(canvas) || document.querySelector(canvas);
	} else if (typeof opts == 'string') {
		opts = document.getElementById(opts) || document.querySelector(opts);
	}
	if (opts instanceof HTMLCanvasElement) {
		var tmp = opts;
		opts = canvas;
		canvas = tmp;
	} else if (!(canvas instanceof HTMLCanvasElement)) {
		throw 'bwipjs: Not a canvas';
	}
	FixupOptions(opts);
	Render(opts, DrawingCanvas(opts, canvas));

	return canvas;
}

//@@ENDOF-BROWSER-ONLY@@

// bwipjs.fixupOptions(options)
//
// Call this before passing your options object to a drawing constructor.
function FixupOptions(opts) {
	var scale	= opts.scale || 2;
	var scaleX	= +opts.scaleX || scale;
	var scaleY	= +opts.scaleY || scaleX;

	// Fix up padding.
	opts.paddingleft = padding(opts.paddingleft, opts.paddingwidth, opts.padding, scaleX);
	opts.paddingright = padding(opts.paddingright, opts.paddingwidth, opts.padding, scaleX);
	opts.paddingtop = padding(opts.paddingtop, opts.paddingheight, opts.padding, scaleY);
	opts.paddingbottom = padding(opts.paddingbottom, opts.paddingheight, opts.padding, scaleY);

	// We override BWIPP's background color functionality.  If in CMYK, convert to RGB so
	// the drawing interface is consistent.
	if (/^[0-9a-fA-F]{8}$/.test(''+opts.backgroundcolor)) {
		var cmyk = opts.backgroundcolor;
		var c = parseInt(cmyk.substr(0,2), 16) / 255;
		var m = parseInt(cmyk.substr(2,2), 16) / 255;
		var y = parseInt(cmyk.substr(4,2), 16) / 255;
		var k = parseInt(cmyk.substr(6,2), 16) / 255;
		var r = Math.floor((1-c) * (1-k) * 255).toString(16);
		var g = Math.floor((1-m) * (1-k) * 255).toString(16);
		var b = Math.floor((1-y) * (1-k) * 255).toString(16);
		opts.backgroundcolor = (r.length == 1 ? '0' : '') + r +
							   (g.length == 1 ? '0' : '') + g +
							   (b.length == 1 ? '0' : '') + b;
	}

	return opts;

	function padding(a, b, c, s) {
		if (a != null) {
			return a*s;
		}
		if (b != null) {
			return b*s;
		}
		return c*s || 0;
	}
}

var BWIPJS_OPTIONS = {
	bcid:1,
	text:1,
	scale:1,
	scaleX:1,
	scaleY:1,
	rotate:1,
	padding:1,
	paddingwidth:1,
	paddingheight:1,
	paddingtop:1,
	paddingleft:1,
	paddingright:1,
	paddingbottom:1,
	backgroundcolor:1,
};

// bwipjs.render(options, drawing)
//
// Renders a barcode using the provided drawing object.
//
// This function is synchronous and throws on error.
function Render(params, drawing) {
	// Set the bwip-js defaults
	var scale	= params.scale || 2;
	var scaleX	= +params.scaleX || scale;
	var scaleY	= +params.scaleY || scaleX;
	var rotate	= params.rotate || 'N';

	// The required parameters
	var bcid = params.bcid;
	var text = params.text;

	if (!text) {
		throw new ReferenceError('bwip-js: bar code text not specified.');
	}
	if (!bcid) {
		throw new ReferenceError('bwip-js: bar code type not specified.');
	}

	// Create a barcode writer object.  This is the interface between
	// the low-level BWIPP code, the bwip-js graphics context, and the
	// drawing interface.
	var bw = new BWIPJS(drawing);

	// Set the BWIPP options
	var opts = {};
	for (var id in params) {
		if (!BWIPJS_OPTIONS[id]) {
			opts[id] = params[id];
		}
	}

	// Fix a disconnect in the BWIPP rendering logic
	if (opts.alttext) {
		opts.includetext = true;
	}
	// We use mm rather than inches for height - except pharmacode2 height
	// which is already in mm.
	if (+opts.height && bcid != 'pharmacode2') {
		opts.height = opts.height / 25.4 || 0.5;
	}
	// Likewise, width
	if (+opts.width) {
		opts.width = opts.width / 25.4 || 0;
	}

	// Scale the image
	bw.scale(scaleX, scaleY);

	// Call into the BWIPP cross-compiled code and render the image.
	BWIPP()(bw, bcid, text, opts);
	return bw.render();		// Return whatever drawing.end() returns
}

// bwipjs.raw(options)
// bwipjs.raw(encoder, text, opts-string)
//
// Invokes the low level BWIPP code and returns the raw encoding data.
//
// This function is synchronous and throws on error.
function Raw(encoder, text, options) {
	if (arguments.length == 1) {
		options = encoder;
		encoder = options.bcid;
		text = options.text;
	}

	// The drawing interface is just needed for the pre-init() calls.
	var bw = new BWIPJS(DrawingBuiltin({}));
	var stack = BWIPP()(bw, encoder, text, options, true);

	// bwip-js uses Maps to emulate PostScript dictionary objects; but Maps
	// are not a typical/expected return value.  Convert to plain-old-objects.
	var ids = { pixs:1, pixx:1, pixy:1, sbs:1, bbs:1, bhs:1, width:1, height:1 };
	for (var i = 0; i < stack.length; i++) {
		var elt = stack[i];
		if (elt instanceof Map) {
			var obj = {};
			// Could they make Maps any harder to iterate over???
			for (var keys = elt.keys(), size = elt.size, k = 0; k < size; k++) {
				var id = keys.next().value;
				if (ids[id]) {
					var val = elt.get(id);
					if (val instanceof Array) {
						// The postscript arrays have extra named properties
						// to emulate array views.  Return cleaned up arrays.
						obj[id] = val.b.slice(val.o, val.o + val.length);
					} else {
						obj[id] = val;
					}
				}
			}
			stack[i] = obj;
		} else {
			// This should never exec...
			stack.splice(i--, 1);
		}
	}
	return stack;
}
