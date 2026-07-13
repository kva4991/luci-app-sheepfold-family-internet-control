'use strict';

'require baseclass';
'require request as Request';

var catalog = null;
var installedLang = null;

function normalizeApplicationLanguage(value) {
	var lang = String(value || '').trim();

	if (lang === 'en')
		return 'en';
	if (lang === 'zh_Hans')
		return 'zh_Hans';

	return 'ru';
}

function translate(key) {
	if (installedLang === 'en' || !catalog)
		return key;

	return catalog[key] || key;
}

return baseclass.extend({
	normalizeApplicationLanguage: normalizeApplicationLanguage,

	installApplicationTranslator: function (lang) {
		lang = normalizeApplicationLanguage(lang);

		if (lang === installedLang)
			return Promise.resolve(lang);

		if (lang === 'en') {
			catalog = null;
			installedLang = 'en';
			window._ = translate;
			return Promise.resolve(lang);
		}

		return Request.get(L.resource('sheepfold/i18n/' + lang + '.json'), {
			cache: true
		}).then(function (response) {
			var nextCatalog = {};

			if (response.ok) {
				try {
					nextCatalog = response.json() || {};
				} catch (e) {
					nextCatalog = {};
				}
			}

			catalog = nextCatalog;
			installedLang = lang;
			window._ = translate;
			return lang;
		}).catch(function () {
			catalog = null;
			installedLang = lang;
			window._ = translate;
			return lang;
		});
	}
});