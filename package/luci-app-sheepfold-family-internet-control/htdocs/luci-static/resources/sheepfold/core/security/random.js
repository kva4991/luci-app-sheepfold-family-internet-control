'use strict';
'require baseclass';

function randomInteger(max) {
	var values;

	if (!window.crypto || !window.crypto.getRandomValues)
		throw new Error('Secure random generator is unavailable');

	values = new Uint32Array(1);
	window.crypto.getRandomValues(values);
	return values[0] % max;
}

function shuffle(chars) {
	for (var i = chars.length - 1; i > 0; i--) {
		var target = randomInteger(i + 1);
		var current = chars[i];

		chars[i] = chars[target];
		chars[target] = current;
	}

	return chars;
}

function pairingCode() {
	var lower = 'abcdefghkmnpqrstuvwxyz';
	var upper = 'ABCDEFGHKMNPQRSTUVWXYZ';
	var digits = '2456789';
	var specials = '+-*()[]{}<>?@#$%^&:;.,';
	var alnum = lower + upper + digits;
	var all = alnum + specials;
	var chars = [
		lower[randomInteger(lower.length)],
		upper[randomInteger(upper.length)],
		digits[randomInteger(digits.length)]
	];
	var specialCount = randomInteger(4);

	for (var index = 0; index < specialCount; index++)
		chars.push(specials[randomInteger(specials.length)]);

	while (chars.length < 10) {
		var pool = specialCount >= 3 ? alnum : all;
		var next = pool[randomInteger(pool.length)];

		if (specials.indexOf(next) !== -1)
			specialCount++;
		chars.push(next);
	}

	return shuffle(chars).join('');
}

function urlToken(length) {
	var alphabet = 'abcdefghkmnpqrstuvwxyzABCDEFGHKMNPQRSTUVWXYZ2456789';
	var token = [];

	for (var index = 0; index < length; index++)
		token.push(alphabet[randomInteger(alphabet.length)]);

	return token.join('');
}

return baseclass.extend({
	pairingCode: pairingCode,
	urlToken: urlToken
});
