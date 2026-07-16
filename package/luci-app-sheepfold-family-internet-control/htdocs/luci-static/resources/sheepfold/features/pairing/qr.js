'use strict';
'require baseclass';

function gfMultiply(x, y) {
	var z = 0;

	while (y !== 0) {
		if ((y & 1) !== 0)
			z ^= x;

		x <<= 1;
		if ((x & 0x100) !== 0)
			x ^= 0x11d;

		y >>>= 1;
	}

	return z;
}

function gfPow2(power) {
	var value = 1;

	while (power-- > 0)
		value = gfMultiply(value, 2);

	return value;
}

function reedSolomonGenerator(degree) {
	var poly = [1];

	for (var i = 0; i < degree; i++) {
		var next = Array(poly.length + 1).fill(0);
		var root = gfPow2(i);

		for (var j = 0; j < poly.length; j++) {
			next[j] ^= poly[j];
			next[j + 1] ^= gfMultiply(poly[j], root);
		}

		poly = next;
	}

	return poly;
}

function reedSolomonRemainder(data, degree) {
	var generator = reedSolomonGenerator(degree);
	var message = data.concat(Array(degree).fill(0));

	for (var i = 0; i < data.length; i++) {
		var factor = message[i];

		if (factor === 0)
			continue;

		for (var j = 0; j < generator.length; j++)
			message[i + j] ^= gfMultiply(generator[j], factor);
	}

	return message.slice(data.length);
}

function appendBits(bits, value, length) {
	for (var i = length - 1; i >= 0; i--)
		bits.push((value >>> i) & 1);
}

function utf8Bytes(text) {
	if (window.TextEncoder)
		return Array.prototype.slice.call(new TextEncoder().encode(text));

	return unescape(encodeURIComponent(text)).split('').map(function (char) {
		return char.charCodeAt(0) & 0xff;
	});
}

function makeQrCodewords(text) {
	var dataCodewords = 108;
	var errorCorrectionCodewords = 26;
	var bits = [];
	var bytes = utf8Bytes(text);
	var codewords = [];

	appendBits(bits, 0x4, 4);
	appendBits(bits, bytes.length, 8);

	bytes.forEach(function (value) {
		appendBits(bits, value, 8);
	});

	if (bits.length > dataCodewords * 8)
		throw new Error('QR payload is too long');

	appendBits(bits, 0, Math.min(4, dataCodewords * 8 - bits.length));

	while (bits.length % 8 !== 0)
		bits.push(0);

	for (var i = 0; i < bits.length; i += 8) {
		var value = 0;

		for (var j = 0; j < 8; j++)
			value = (value << 1) | bits[i + j];

		codewords.push(value);
	}

	for (var pad = 0; codewords.length < dataCodewords; pad++)
		codewords.push(pad % 2 === 0 ? 0xec : 0x11);

	return codewords.concat(reedSolomonRemainder(codewords, errorCorrectionCodewords));
}

function createQrMatrix(text) {
	var version = 5;
	var size = version * 4 + 17;
	var matrix = Array.from({ length: size }, function () { return Array(size).fill(false); });
	var reserved = Array.from({ length: size }, function () { return Array(size).fill(false); });

	function setModule(x, y, value, isReserved) {
		if (x < 0 || y < 0 || x >= size || y >= size)
			return;

		matrix[y][x] = value;
		if (isReserved)
			reserved[y][x] = true;
	}

	function addFinder(x, y) {
		for (var dy = -1; dy <= 7; dy++) {
			for (var dx = -1; dx <= 7; dx++) {
				var xx = x + dx;
				var yy = y + dy;
				var on = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6 &&
					(dx === 0 || dx === 6 || dy === 0 || dy === 6 ||
					(dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));

				setModule(xx, yy, on, true);
			}
		}
	}

	function addAlignment(cx, cy) {
		for (var dy = -2; dy <= 2; dy++) {
			for (var dx = -2; dx <= 2; dx++) {
				var distance = Math.max(Math.abs(dx), Math.abs(dy));
				setModule(cx + dx, cy + dy, distance !== 1, true);
			}
		}
	}

	addFinder(0, 0);
	addFinder(size - 7, 0);
	addFinder(0, size - 7);
	addAlignment(30, 30);

	for (var i = 0; i < size; i++) {
		if (!reserved[6][i])
			setModule(i, 6, i % 2 === 0, true);
		if (!reserved[i][6])
			setModule(6, i, i % 2 === 0, true);
	}

	setModule(8, version * 4 + 9, true, true);

	var formatBits = 0x77c4;
	for (i = 0; i <= 5; i++)
		setModule(8, i, ((formatBits >>> i) & 1) !== 0, true);
	setModule(8, 7, ((formatBits >>> 6) & 1) !== 0, true);
	setModule(8, 8, ((formatBits >>> 7) & 1) !== 0, true);
	setModule(7, 8, ((formatBits >>> 8) & 1) !== 0, true);
	for (i = 9; i < 15; i++)
		setModule(14 - i, 8, ((formatBits >>> i) & 1) !== 0, true);
	for (i = 0; i < 8; i++)
		setModule(size - 1 - i, 8, ((formatBits >>> i) & 1) !== 0, true);
	for (i = 8; i < 15; i++)
		setModule(8, size - 15 + i, ((formatBits >>> i) & 1) !== 0, true);

	var codewords = makeQrCodewords(text);
	var bitIndex = 0;
	var upward = true;

	for (var right = size - 1; right >= 1; right -= 2) {
		if (right === 6)
			right--;

		for (var vert = 0; vert < size; vert++) {
			var y = upward ? size - 1 - vert : vert;

			for (var col = 0; col < 2; col++) {
				var x = right - col;

				if (reserved[y][x])
					continue;

				var bit = false;
				if (bitIndex < codewords.length * 8)
					bit = ((codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) !== 0;

				if ((x + y) % 2 === 0)
					bit = !bit;

				setModule(x, y, bit, false);
				bitIndex++;
			}
		}

		upward = !upward;
	}

	return matrix;
}

function render(text, options) {
	var matrix;
	var labels = options || {};

	try {
		matrix = createQrMatrix(text);
	} catch (error) {
		return E('div', { 'class': 'sf-qr-error' }, (labels.errorLabel || 'QR payload') + ': ' + error.message);
	}

	return E('div', {
		'class': 'sf-qr',
		'aria-label': labels.ariaLabel || 'Pairing',
		'style': 'grid-template-columns: repeat(' + matrix.length + ', 1fr);'
	}, matrix.reduce(function (nodes, row) {
		row.forEach(function (on) {
			nodes.push(E('span', { 'class': on ? 'on' : '' }));
		});
		return nodes;
	}, []));
}

return baseclass.extend({
	render: render
});
