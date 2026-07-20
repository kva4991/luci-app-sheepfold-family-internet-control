'use strict';
'require baseclass';

/* §frontmod
 * Один владелец browser-download нужен журналу и резервным копиям. Так обе
 * области одинаково освобождают object URL после запуска загрузки.
 */
function textFile(filename, text) {
	var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
	var url = window.URL.createObjectURL(blob);
	var link = document.createElement('a');

	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);

	window.setTimeout(function () {
		window.URL.revokeObjectURL(url);
	}, 0);
}

return baseclass.extend({
	textFile: textFile
});
